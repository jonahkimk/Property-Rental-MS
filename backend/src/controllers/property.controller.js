const pool = require('../config/db');
const { ok, fail } = require('../utils/response');

// ── GET /api/properties ───────────────────────────────────────
const list = async (req, res) => {
  const { include_units } = req.query;
  const userId = req.user.id;
  const role   = req.user.role;

  try {
    const { rows: props } = await pool.query(
      `SELECT p.id, p.name, p.address, p.city, p.county,
              p.description, p.is_active, p.created_at,
              COUNT(DISTINCT u.id)                                    AS total_units,
              COUNT(DISTINCT CASE WHEN u.is_occupied THEN u.id END)  AS occupied_units,
              COUNT(DISTINCT t.id)                                    AS active_tenants
         FROM properties p
         LEFT JOIN units   u ON u.property_id = p.id
         LEFT JOIN tenants t ON t.unit_id     = u.id AND t.is_active = TRUE
        WHERE ($1 = 'manager'
               OR p.id IN (
                 SELECT property_id FROM landlord_properties WHERE landlord_id = $2
               ))
        GROUP BY p.id
        ORDER BY p.name`,
      [role, userId]
    );

    if (!include_units) return ok(res, props);

    // Attach units to each property
    const { rows: units } = await pool.query(
      `SELECT u.*, t.id AS tenant_id, usr.full_name AS tenant_name
         FROM units u
         LEFT JOIN tenants t   ON t.unit_id = u.id AND t.is_active = TRUE
         LEFT JOIN users   usr ON usr.id    = t.user_id
        ORDER BY u.unit_number`
    );

    const result = props.map(p => ({
      ...p,
      units: units.filter(u => u.property_id === p.id),
    }));

    return ok(res, result);
  } catch (err) {
    console.error('property list:', err);
    return fail(res, 'Failed to fetch properties.', 500);
  }
};

// ── POST /api/properties ──────────────────────────────────────
const create = async (req, res) => {
  const { name, address, city, county, description } = req.body;
  if (!name || !address) return fail(res, 'Property name and address are required.', 400);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO properties (name, address, city, county, description)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [name, address, city || null, county || null, description || null]
    );
    const prop = rows[0];

    // Auto-link manager who created it
    if (req.user.role === 'manager') {
      await client.query(
        `INSERT INTO landlord_properties (landlord_id, property_id)
         VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [req.user.id, prop.id]
      );
    }

    await client.query('COMMIT');
    return ok(res, prop, 'Property registered.', 201);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('property create:', err);
    return fail(res, 'Failed to register property.', 500);
  } finally {
    client.release();
  }
};

// ── PUT /api/properties/:id ───────────────────────────────────
const update = async (req, res) => {
  const { name, address, city, county, description } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE properties
          SET name        = COALESCE($1, name),
              address     = COALESCE($2, address),
              city        = COALESCE($3, city),
              county      = COALESCE($4, county),
              description = COALESCE($5, description),
              updated_at  = NOW()
        WHERE id = $6
        RETURNING *`,
      [name||null, address||null, city||null, county||null, description||null, req.params.id]
    );
    if (!rows.length) return fail(res, 'Property not found.', 404);
    return ok(res, rows[0], 'Property updated.');
  } catch (err) {
    console.error('property update:', err);
    return fail(res, 'Failed to update property.', 500);
  }
};

module.exports = { list, create, update };