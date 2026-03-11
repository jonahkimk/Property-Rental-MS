const pool = require('../config/db');
const { ok, fail } = require('../utils/response');

// ── GET /api/messages/my  ─────────────────────────────────────
// Returns root threads with latest reply preview, unread count, type/priority/status
const myMessages = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT m.*,
              COALESCE(
                (SELECT body        FROM messages r WHERE r.thread_id = m.id ORDER BY r.created_at DESC LIMIT 1), m.body
              ) AS latest_body,
              COALESCE(
                (SELECT sender_name FROM messages r WHERE r.thread_id = m.id ORDER BY r.created_at DESC LIMIT 1), m.sender_name
              ) AS latest_sender,
              COALESCE(
                (SELECT created_at  FROM messages r WHERE r.thread_id = m.id ORDER BY r.created_at DESC LIMIT 1), m.created_at
              ) AS latest_at,
              (SELECT COUNT(*) FROM messages r WHERE r.thread_id = m.id)::int AS reply_count,
              (SELECT COUNT(*) FROM messages r
                WHERE r.thread_id = m.id AND r.is_read = FALSE
                  AND r.recipient_id = $1)::int AS unread_replies
         FROM messages m
        WHERE m.thread_id IS NULL
          AND (m.sender_id = $1 OR m.recipient_id = $1)
        ORDER BY latest_at DESC`,
      [req.user.id]
    );
    return ok(res, rows);
  } catch (err) {
    console.error('myMessages:', err);
    return fail(res, 'Failed to fetch messages.', 500);
  }
};

// ── GET /api/messages/:id/thread  ────────────────────────────
const getThread = async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query(
      `UPDATE messages SET is_read = TRUE
        WHERE (id = $1 OR thread_id = $1)
          AND recipient_id = $2 AND is_read = FALSE`,
      [id, req.user.id]
    );
    const { rows } = await pool.query(
      `SELECT * FROM messages WHERE id = $1 OR thread_id = $1 ORDER BY created_at ASC`, [id]
    );
    return ok(res, rows);
  } catch (err) {
    console.error('getThread:', err);
    return fail(res, 'Failed to fetch thread.', 500);
  }
};

// ── POST /api/messages  ───────────────────────────────────────
// New top-level message or request
const send = async (req, res) => {
  const { subject, body, recipient_id, message_type, priority, category } = req.body;
  if (!body?.trim()) return fail(res, 'Message body is required.', 400);

  const senderName      = req.user.full_name || 'Unknown';
  let resolvedRecipient = recipient_id || null;
  let recipientName     = null;
  let propId            = req.user.property_id || null;

  try {
    if (req.user.role === 'tenant' && !resolvedRecipient) {
      const { rows } = await pool.query(
        `SELECT lp.landlord_id, lp.property_id, u.full_name
           FROM tenants t
           JOIN landlord_properties lp ON lp.property_id = t.property_id
           JOIN users               u  ON u.id           = lp.landlord_id
          WHERE t.user_id = $1 LIMIT 1`,
        [req.user.id]
      );
      if (rows.length) {
        resolvedRecipient = rows[0].landlord_id;
        recipientName     = rows[0].full_name;
        propId            = rows[0].property_id;
      }
    }

    if (resolvedRecipient && !recipientName) {
      const { rows } = await pool.query('SELECT full_name FROM users WHERE id=$1', [resolvedRecipient]);
      recipientName = rows[0]?.full_name || null;
    }

    if (!propId) return fail(res, 'Could not resolve property for this message.', 400);

    const mType    = message_type || 'message';
    const mPrio    = priority     || 'normal';
    const mCat     = category     || 'general';
    const mStatus  = 'open';

    const { rows } = await pool.query(
      `INSERT INTO messages
         (property_id, sender_id, sender_name, recipient_id, recipient_name,
          subject, body, thread_id, message_type, priority, category, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NULL,$8,$9,$10,$11) RETURNING *`,
      [propId, req.user.id, senderName, resolvedRecipient, recipientName,
       subject || null, body.trim(), mType, mPrio, mCat, mStatus]
    );
    return ok(res, rows[0], 'Message sent.', 201);
  } catch (err) {
    console.error('send message:', err);
    return fail(res, 'Failed to send message.', 500);
  }
};

// ── POST /api/messages/:id/reply  ────────────────────────────
const reply = async (req, res) => {
  const { id } = req.params;
  const { body } = req.body;
  if (!body?.trim()) return fail(res, 'Reply body is required.', 400);

  try {
    const root = await pool.query(
      'SELECT * FROM messages WHERE id=$1 AND thread_id IS NULL', [id]
    );
    if (!root.rows.length) return fail(res, 'Thread not found.', 404);
    const rootMsg = root.rows[0];

    const recipientId   = rootMsg.sender_id === req.user.id ? rootMsg.recipient_id : rootMsg.sender_id;
    const recipientName = rootMsg.sender_id === req.user.id ? rootMsg.recipient_name : rootMsg.sender_name;

    const { rows } = await pool.query(
      `INSERT INTO messages
         (property_id, sender_id, sender_name, recipient_id, recipient_name,
          subject, body, thread_id, message_type, priority, category, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [rootMsg.property_id, req.user.id, req.user.full_name || 'Unknown',
       recipientId, recipientName,
       rootMsg.subject, body.trim(), id,
       rootMsg.message_type, rootMsg.priority, rootMsg.category, rootMsg.status]
    );

    // Update parent updated_at so threads sort by latest activity
    await pool.query(`UPDATE messages SET updated_at = NOW() WHERE id = $1`, [id]);

    return ok(res, rows[0], 'Reply sent.', 201);
  } catch (err) {
    console.error('reply:', err);
    return fail(res, 'Failed to send reply.', 500);
  }
};

// ── PATCH /api/messages/:id/status  (landlord) ───────────────
const updateStatus = async (req, res) => {
  const { status } = req.body;
  const validStatuses = ['open', 'in_progress', 'resolved', 'closed'];
  if (!validStatuses.includes(status)) return fail(res, 'Invalid status.', 400);
  try {
    await pool.query(
      `UPDATE messages SET status=$1, updated_at=NOW() WHERE id=$2 AND thread_id IS NULL`,
      [status, req.params.id]
    );
    return ok(res, null, `Status updated to ${status}.`);
  } catch (err) {
    console.error('updateStatus:', err);
    return fail(res, 'Failed to update status.', 500);
  }
};

// ── PATCH /api/messages/:id/read  ────────────────────────────
const markRead = async (req, res) => {
  try {
    await pool.query(
      'UPDATE messages SET is_read=TRUE WHERE id=$1 AND recipient_id=$2',
      [req.params.id, req.user.id]
    );
    return ok(res, null, 'Marked as read.');
  } catch (err) {
    return fail(res, 'Failed to mark as read.', 500);
  }
};


// ── GET /api/messages/unread-count  ──────────────────────────
const unreadCount = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS count
         FROM messages
        WHERE recipient_id = $1 AND is_read = FALSE`,
      [req.user.id]
    );
    return ok(res, { count: rows[0].count });
  } catch (err) {
    return fail(res, 'Failed to get unread count.', 500);
  }
};

// Re-export with unreadCount
module.exports = { myMessages, getThread, send, reply, updateStatus, markRead, unreadCount };