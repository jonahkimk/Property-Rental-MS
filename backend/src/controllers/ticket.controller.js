const pool = require('../config/db');
const { ok, fail } = require('../utils/response');

// ── GET /api/tickets  (landlord) ─────────────────────────────
const list = async (req, res) => {
  const propId = req.user.property_id || null;
  try {
    const { rows } = await pool.query(
      `SELECT rt.*
         FROM request_tickets rt
        WHERE ($1::uuid IS NULL OR rt.property_id=$1)
        ORDER BY
          CASE rt.priority
            WHEN 'urgent' THEN 1 WHEN 'high' THEN 2
            WHEN 'normal' THEN 3 ELSE 4
          END,
          rt.created_at DESC`,
      [propId]
    );
    return ok(res, rows);
  } catch (err) {
    console.error('ticket list:', err);
    return fail(res, 'Failed to fetch tickets.', 500);
  }
};

// ── GET /api/tickets/my  (tenant) ────────────────────────────
const myTickets = async (req, res) => {
  const tenantId = req.user.tenant_id;
  if (!tenantId) return fail(res, 'No tenant profile found.', 400);
  try {
    const { rows } = await pool.query(
      `SELECT * FROM request_tickets WHERE tenant_id=$1 ORDER BY created_at DESC`,
      [tenantId]
    );
    return ok(res, rows);
  } catch (err) {
    console.error('myTickets:', err);
    return fail(res, 'Failed to fetch tickets.', 500);
  }
};

// ── POST /api/tickets  (tenant) ──────────────────────────────
const create = async (req, res) => {
  const { subject, description, category, priority } = req.body;
  const tenantId = req.user.tenant_id;
  if (!tenantId)           return fail(res, 'No tenant profile found.', 400);
  if (!subject || !description) return fail(res, 'Subject and description are required.', 400);

  try {
    const { rows: tRows } = await pool.query(
      `SELECT t.property_id, t.unit_id, u.unit_number, usr.full_name
         FROM tenants t
         JOIN units un ON un.id = t.unit_id
         JOIN users usr ON usr.id = t.user_id
        WHERE t.id=$1`,
      [tenantId]
    );
    if (!tRows.length) return fail(res, 'Tenant not found.', 404);
    const { property_id, unit_id, unit_number, full_name } = tRows[0];

    const { rows } = await pool.query(
      `INSERT INTO request_tickets
         (tenant_id, tenant_name, unit_number, property_id, unit_id,
          subject, description, category, priority)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [tenantId, full_name, unit_number, property_id, unit_id,
       subject, description,
       category || 'general',
       priority || 'normal']
    );
    return ok(res, rows[0], 'Ticket submitted.', 201);
  } catch (err) {
    console.error('ticket create:', err);
    return fail(res, 'Failed to submit ticket.', 500);
  }
};

// ── PATCH /api/tickets/:id/status ────────────────────────────
const updateStatus = async (req, res) => {
  const { status } = req.body;
  const VALID = ['open','in_progress','resolved','closed'];
  if (!VALID.includes(status))
    return fail(res, `Invalid status. Must be one of: ${VALID.join(', ')}`, 400);
  try {
    const { rows } = await pool.query(
      `UPDATE request_tickets SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
      [status, req.params.id]
    );
    if (!rows.length) return fail(res, 'Ticket not found.', 404);
    return ok(res, rows[0], `Ticket marked as ${status}.`);
  } catch (err) {
    console.error('updateStatus:', err);
    return fail(res, 'Failed to update ticket status.', 500);
  }
};

// ── GET /api/tickets/:id/replies ─────────────────────────────
const getReplies = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT tr.*, tr.sender_name, u.role AS sender_role
         FROM ticket_replies tr
         JOIN users u ON u.id = tr.sender_id
        WHERE tr.ticket_id=$1
        ORDER BY tr.created_at ASC`,
      [req.params.id]
    );
    return ok(res, rows);
  } catch (err) {
    console.error('getReplies:', err);
    return fail(res, 'Failed to fetch replies.', 500);
  }
};

// ── POST /api/tickets/:id/replies ────────────────────────────
const addReply = async (req, res) => {
  const { message } = req.body;
  if (!message?.trim()) return fail(res, 'Message is required.', 400);
  try {
    const { rows: tRows } = await pool.query(
      'SELECT id, status FROM request_tickets WHERE id=$1', [req.params.id]
    );
    if (!tRows.length)              return fail(res, 'Ticket not found.', 404);
    if (tRows[0].status === 'closed') return fail(res, 'Ticket is closed.', 409);

    // Auto-update to in_progress when landlord replies
    if (req.user.role === 'landlord' && tRows[0].status === 'open') {
      await pool.query(
        "UPDATE request_tickets SET status='in_progress', updated_at=NOW() WHERE id=$1",
        [req.params.id]
      );
    }

    const { rows } = await pool.query(
      `INSERT INTO ticket_replies (ticket_id, sender_id, sender_name, message)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.params.id, req.user.id, req.user.full_name, message.trim()]
    );
    return ok(res, rows[0], 'Reply added.', 201);
  } catch (err) {
    console.error('addReply:', err);
    return fail(res, 'Failed to add reply.', 500);
  }
};

module.exports = { list, myTickets, create, updateStatus, getReplies, addReply };