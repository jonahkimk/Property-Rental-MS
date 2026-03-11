const pool = require('../config/db');
const { ok, fail } = require('../utils/response');

// ── GET /api/visitors ─────────────────────────────────────────
const list = async (req, res) => {
  const propId = req.user.property_id || null;
  const { date, unit_id } = req.query;
  try {
    const { rows } = await pool.query(
      `SELECT v.*,
              u.unit_number,
              usr.full_name AS tenant_name
         FROM visitor_logs v
         JOIN units   u   ON u.id   = v.unit_id
         LEFT JOIN tenants t   ON t.unit_id = u.id AND t.is_active = TRUE
         LEFT JOIN users   usr ON usr.id    = t.user_id
        WHERE ($1::uuid IS NULL OR v.property_id = $1)
          AND ($2::date  IS NULL OR v.visit_date  = $2::date)
          AND ($3::uuid  IS NULL OR v.unit_id     = $3::uuid)
        ORDER BY v.visit_date DESC, v.check_in_time DESC`,
      [propId, date || null, unit_id || null]
    );
    return ok(res, rows);
  } catch (err) {
    console.error('visitor list:', err);
    return fail(res, 'Failed to fetch visitor log.', 500);
  }
};

// ── POST /api/visitors ────────────────────────────────────────
const create = async (req, res) => {
  const {
    visitor_name, visitor_id_number, visitor_phone,
    purpose, unit_id, host_name,
    vehicle_reg, visit_date, check_in_time,
  } = req.body;

  if (!visitor_name || !unit_id)
    return fail(res, 'Visitor name and unit are required.', 400);

  const propId = req.user.property_id || null;
  try {
    const { rows } = await pool.query(
      `INSERT INTO visitor_logs
         (property_id, unit_id, visitor_name, visitor_id_number,
          visitor_phone, purpose, host_name, vehicle_reg,
          visit_date, check_in_time, logged_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,
               COALESCE($9::date, CURRENT_DATE),
               COALESCE($10::time, CURRENT_TIME),
               $11)
       RETURNING *`,
      [propId, unit_id,
       visitor_name, visitor_id_number || null,
       visitor_phone || null, purpose || null,
       host_name || null, vehicle_reg || null,
       visit_date || null, check_in_time || null,
       req.user.id]
    );
    return ok(res, rows[0], 'Visitor logged.', 201);
  } catch (err) {
    console.error('visitor create:', err);
    return fail(res, 'Failed to log visitor.', 500);
  }
};

// ── PATCH /api/visitors/:id/checkout ─────────────────────────
const checkout = async (req, res) => {
  const { check_out_time } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE visitor_logs
          SET check_out_time = COALESCE($1::time, CURRENT_TIME),
              updated_at     = NOW()
        WHERE id = $2
        RETURNING *`,
      [check_out_time || null, req.params.id]
    );
    if (!rows.length) return fail(res, 'Visitor record not found.', 404);
    return ok(res, rows[0], 'Check-out recorded.');
  } catch (err) {
    console.error('visitor checkout:', err);
    return fail(res, 'Failed to record check-out.', 500);
  }
};

// ── DELETE /api/visitors/:id ──────────────────────────────────
const remove = async (req, res) => {
  try {
    const { rows } = await pool.query(
      'DELETE FROM visitor_logs WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (!rows.length) return fail(res, 'Visitor record not found.', 404);
    return ok(res, null, 'Record deleted.');
  } catch (err) {
    console.error('visitor delete:', err);
    return fail(res, 'Failed to delete record.', 500);
  }
};

module.exports = { list, create, checkout, remove };