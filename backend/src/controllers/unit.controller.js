const pool = require('../config/db');
const { ok, fail } = require('../utils/response');

// ── GET /api/units ─────────────────────────────────────────────
const list = async (req, res) => {
  const { property_id } = req.query;
  const propId = property_id || req.user.property_id || null;

  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.property_id, u.unit_number, u.unit_type,
              u.floor, u.monthly_rent, u.is_occupied,
              u.created_at, u.updated_at,
              p.name          AS property_name,
              t.id            AS tenant_id,
              usr.full_name   AS tenant_name,
              usr.phone       AS tenant_phone
         FROM units u
         JOIN properties p ON p.id = u.property_id
         LEFT JOIN tenants t   ON t.unit_id = u.id AND t.is_active = TRUE
         LEFT JOIN users   usr ON usr.id    = t.user_id
        WHERE ($1::uuid IS NULL OR u.property_id = $1)
        ORDER BY u.unit_number`,
      [propId]
    );
    return ok(res, rows);
  } catch (err) {
    console.error('unit list:', err);
    return fail(res, 'Failed to fetch units.', 500);
  }
};

// ── GET /api/units/vacant ──────────────────────────────────────
const listVacant = async (req, res) => {
  const { property_id } = req.query;
  const propId = property_id || req.user.property_id || null;

  try {
    const { rows } = await pool.query(
      `SELECT u.*, p.name AS property_name
         FROM units u
         JOIN properties p ON p.id = u.property_id
        WHERE u.is_occupied = FALSE
          AND ($1::uuid IS NULL OR u.property_id = $1)
        ORDER BY u.unit_number`,
      [propId]
    );
    return ok(res, rows);
  } catch (err) {
    console.error('listVacant:', err);
    return fail(res, 'Failed to fetch vacant units.', 500);
  }
};

// ── POST /api/units ────────────────────────────────────────────
const create = async (req, res) => {
  const { property_id, unit_number, unit_type, floor, monthly_rent } = req.body;
  if (!unit_number || !monthly_rent)
    return fail(res, 'Unit number and monthly rent are required.', 400);

  const propId = property_id || req.user.property_id;
  if (!propId) return fail(res, 'Property ID is required.', 400);

  try {
    const { rows } = await pool.query(
      `INSERT INTO units (property_id, unit_number, unit_type, floor, monthly_rent)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [propId, unit_number, unit_type || null, floor || null,
       parseFloat(monthly_rent)]
    );
    return ok(res, rows[0], 'Unit created.', 201);
  } catch (err) {
    if (err.code === '23505')
      return fail(res, 'Unit number already exists in this property.', 409);
    console.error('unit create:', err);
    return fail(res, 'Failed to create unit.', 500);
  }
};

// ── PUT /api/units/:id ─────────────────────────────────────────
const update = async (req, res) => {
  const { unit_number, unit_type, floor, monthly_rent } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE units
          SET unit_number  = COALESCE($1, unit_number),
              unit_type    = COALESCE($2, unit_type),
              floor        = COALESCE($3, floor),
              monthly_rent = COALESCE($4, monthly_rent),
              updated_at   = NOW()
        WHERE id = $5
        RETURNING *`,
      [unit_number || null,
       unit_type   || null,
       floor       || null,
       monthly_rent ? parseFloat(monthly_rent) : null,
       req.params.id]
    );
    if (!rows.length) return fail(res, 'Unit not found.', 404);
    return ok(res, rows[0], 'Unit updated.');
  } catch (err) {
    console.error('unit update:', err);
    return fail(res, 'Failed to update unit.', 500);
  }
};

module.exports = { list, listVacant, create, update };