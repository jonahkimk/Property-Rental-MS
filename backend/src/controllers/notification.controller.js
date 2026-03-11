const pool = require('../config/db');
const { ok, fail } = require('../utils/response');

// ── GET /api/notifications/sent  (landlord) ──────────────────
const listSent = async (req, res) => {
  const propId = req.user.property_id || null;
  try {
    const { rows } = await pool.query(
      `SELECT n.*
         FROM notifications n
        WHERE n.sent_by=$1
          AND ($2::uuid IS NULL OR n.property_id=$2)
        ORDER BY n.created_at DESC
        LIMIT 200`,
      [req.user.id, propId]
    );
    return ok(res, rows);
  } catch (err) {
    console.error('listSent:', err);
    return fail(res, 'Failed to fetch notifications.', 500);
  }
};

// ── GET /api/notifications/my  (tenant) ──────────────────────
const myNotifications = async (req, res) => {
  const propId = req.user.property_id || null;
  try {
    const { rows } = await pool.query(
      `SELECT n.*
         FROM notifications n
        WHERE n.recipient_id=$1
           OR (n.recipient_id IS NULL AND n.property_id=$2)
        ORDER BY n.created_at DESC
        LIMIT 50`,
      [req.user.id, propId]
    );
    return ok(res, rows);
  } catch (err) {
    console.error('myNotifications:', err);
    return fail(res, 'Failed to fetch notifications.', 500);
  }
};

// ── POST /api/notifications  (landlord) ──────────────────────
// recipient_type: 'all' | 'specific'
// recipient_ids:  string[] (array of user UUIDs) — used when type = 'specific'
const send = async (req, res) => {
  const { title, message, recipient_type, recipient_ids } = req.body;
  if (!title || !message)
    return fail(res, 'Title and message are required.', 400);

  const propId     = req.user.property_id || null;
  const senderName = req.user.full_name   || 'Landlord';
  const client     = await pool.connect();

  try {
    await client.query('BEGIN');

    let targets = []; // [{ user_id, full_name }]

    if (recipient_type === 'specific' && Array.isArray(recipient_ids) && recipient_ids.length) {
      // Fetch names for selected recipients
      const { rows } = await client.query(
        `SELECT id AS user_id, full_name
           FROM users
          WHERE id = ANY($1::uuid[])`,
        [recipient_ids]
      );
      targets = rows;
    } else {
      // Broadcast — all active tenants in property
      const { rows } = await client.query(
        `SELECT t.user_id, u.full_name
           FROM tenants t
           JOIN users u ON u.id = t.user_id
          WHERE t.is_active = TRUE
            AND ($1::uuid IS NULL OR t.property_id = $1)`,
        [propId]
      );
      targets = rows;
    }

    if (!targets.length)
      return fail(res, 'No recipients found.', 400);

    for (const t of targets) {
      await client.query(
        `INSERT INTO notifications
           (property_id, sent_by, sender_name, recipient_id, recipient_name,
            title, message, channel)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'{in_app}')`,
        [propId, req.user.id, senderName,
         t.user_id, t.full_name, title, message]
      );
    }

    await client.query('COMMIT');
    return ok(res, { sent_to: targets.length }, `Notification sent to ${targets.length} tenant(s).`, 201);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('send notification:', err);
    return fail(res, 'Failed to send notification.', 500);
  } finally {
    client.release();
  }
};

module.exports = { listSent, myNotifications, send };