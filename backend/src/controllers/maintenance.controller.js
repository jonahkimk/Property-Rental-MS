const pool = require('../config/db');
const { ok, fail } = require('../utils/response');

// ── GET /api/maintenance ──────────────────────────────────────
const list = async (req, res) => {
  const propId = req.user.property_id || null;
  try {
    const { rows } = await pool.query(
      `SELECT ms.*, u.unit_number
         FROM maintenance_schedules ms
         LEFT JOIN units u ON u.id = ms.unit_id
        WHERE ($1::uuid IS NULL OR ms.property_id=$1)
        ORDER BY
          CASE ms.status
            WHEN 'in_progress' THEN 1 WHEN 'scheduled' THEN 2 ELSE 3
          END,
          ms.scheduled_date DESC`,
      [propId]
    );
    return ok(res, rows);
  } catch (err) {
    console.error('maintenance list:', err);
    return fail(res, 'Failed to fetch maintenance jobs.', 500);
  }
};

// ── POST /api/maintenance ─────────────────────────────────────
const create = async (req, res) => {
  const { title, description, unit_id, scheduled_date,
          assigned_to, cost, maintenance_type } = req.body;
  if (!title || !scheduled_date)
    return fail(res, 'Title and scheduled_date are required.', 400);

  const propId = req.user.property_id || null;
  try {
    const { rows } = await pool.query(
      `INSERT INTO maintenance_schedules
         (property_id, unit_id, title, description, maintenance_type,
          scheduled_date, assigned_to, cost)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [propId,
       unit_id          || null,
       title,
       description      || null,
       maintenance_type || 'other',
       scheduled_date,
       assigned_to      || null,
       cost ? parseFloat(cost) : 0]
    );
    return ok(res, rows[0], 'Maintenance job scheduled.', 201);
  } catch (err) {
    console.error('maintenance create:', err);
    return fail(res, 'Failed to schedule maintenance job.', 500);
  }
};

// ── PUT /api/maintenance/:id ──────────────────────────────────
const update = async (req, res) => {
  const { title, description, unit_id, scheduled_date,
          assigned_to, cost, maintenance_type } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE maintenance_schedules
          SET title            = COALESCE($1, title),
              description      = COALESCE($2, description),
              unit_id          = COALESCE($3, unit_id),
              scheduled_date   = COALESCE($4, scheduled_date),
              assigned_to      = COALESCE($5, assigned_to),
              cost             = COALESCE($6, cost),
              maintenance_type = COALESCE($7, maintenance_type),
              updated_at       = NOW()
        WHERE id=$8 RETURNING *`,
      [title            || null,
       description      || null,
       unit_id          || null,
       scheduled_date   || null,
       assigned_to      || null,
       cost ? parseFloat(cost) : null,
       maintenance_type || null,
       req.params.id]
    );
    if (!rows.length) return fail(res, 'Job not found.', 404);
    return ok(res, rows[0], 'Job updated.');
  } catch (err) {
    console.error('maintenance update:', err);
    return fail(res, 'Failed to update job.', 500);
  }
};

// ── PATCH /api/maintenance/:id/status ────────────────────────
const updateStatus = async (req, res) => {
  const { status } = req.body;
  const VALID = ['scheduled','in_progress','completed','cancelled'];
  if (!VALID.includes(status))
    return fail(res, `Invalid status. Must be: ${VALID.join(', ')}`, 400);

  const completedDate = status === 'completed' ? new Date() : null;
  try {
    const { rows } = await pool.query(
      `UPDATE maintenance_schedules
          SET status         = $1,
              completed_date = COALESCE($2, completed_date),
              updated_at     = NOW()
        WHERE id=$3 RETURNING *`,
      [status, completedDate, req.params.id]
    );
    if (!rows.length) return fail(res, 'Job not found.', 404);
    return ok(res, rows[0], `Job marked as ${status}.`);
  } catch (err) {
    console.error('updateStatus:', err);
    return fail(res, 'Failed to update job status.', 500);
  }
};

module.exports = { list, create, update, updateStatus };