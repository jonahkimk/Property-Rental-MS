const bcrypt = require('bcryptjs');
const pool   = require('../config/db');
const { ok, fail } = require('../utils/response');

// ── GET /api/tenants ──────────────────────────────────────────
const list = async (req, res) => {
  const propId = req.user.property_id || null;
  try {
    const { rows } = await pool.query(
      `SELECT t.id AS tenant_id, t.user_id, t.unit_id, t.property_id,
              t.lease_start, t.lease_end, t.deposit_amount, t.is_active,
              t.emergency_contact_name, t.emergency_contact_phone,
              u.full_name, u.username, u.email, u.phone,
              un.unit_number,
              p.name AS property_name
         FROM tenants t
         JOIN users      u  ON u.id  = t.user_id
         JOIN units      un ON un.id = t.unit_id
         JOIN properties p  ON p.id  = t.property_id
        WHERE ($1::uuid IS NULL OR t.property_id = $1)
        ORDER BY u.full_name`,
      [propId]
    );
    return ok(res, rows);
  } catch (err) {
    console.error('tenant list:', err);
    return fail(res, 'Failed to fetch tenants.', 500);
  }
};

// ── POST /api/tenants ─────────────────────────────────────────
const create = async (req, res) => {
  const {
    full_name, username, password, email, phone,
    unit_id, lease_start, lease_end, deposit_amount,
    emergency_contact_name, emergency_contact_phone,
  } = req.body;

  if (!full_name || !username || !password || !unit_id || !lease_start)
    return fail(res, 'full_name, username, password, unit_id, and lease_start are required.', 400);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check username uniqueness
    const dup = await client.query('SELECT id FROM users WHERE username = $1', [username]);
    if (dup.rows.length) return fail(res, 'Username already taken.', 409);

    // Resolve property from unit
    const unitRow = await client.query(
      'SELECT property_id, is_occupied FROM units WHERE id = $1', [unit_id]
    );
    if (!unitRow.rows.length) return fail(res, 'Unit not found.', 404);
    if (unitRow.rows[0].is_occupied) return fail(res, 'Unit is already occupied.', 409);

    const property_id = unitRow.rows[0].property_id;

    // Create user account
    const hash = await bcrypt.hash(password, parseInt(process.env.BCRYPT_ROUNDS) || 12);
    const { rows: uRows } = await client.query(
      `INSERT INTO users (full_name, username, password_hash, role, email, phone)
       VALUES ($1,$2,$3,'tenant',$4,$5) RETURNING id`,
      [full_name, username, hash, email || null, phone || null]
    );
    const userId = uRows[0].id;

    // Create tenant record
    const { rows: tRows } = await client.query(
      `INSERT INTO tenants
         (user_id, unit_id, property_id, lease_start, lease_end,
          deposit_amount, emergency_contact_name, emergency_contact_phone)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [userId, unit_id, property_id, lease_start,
       lease_end || null,
       deposit_amount ? parseFloat(deposit_amount) : null,
       emergency_contact_name  || null,
       emergency_contact_phone || null]
    );

    // Mark unit as occupied
    await client.query(
      'UPDATE units SET is_occupied = TRUE WHERE id = $1', [unit_id]
    );

    await client.query('COMMIT');
    return ok(res, { tenant_id: tRows[0].id, user_id: userId }, 'Tenant added.', 201);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('tenant create:', err);
    return fail(res, 'Failed to add tenant.', 500);
  } finally {
    client.release();
  }
};

// ── PUT /api/tenants/:id ──────────────────────────────────────
const update = async (req, res) => {
  const {
    full_name, email, phone, username, password,
    unit_id, lease_start, lease_end, deposit_amount,
    emergency_contact_name, emergency_contact_phone,
  } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get tenant's user_id
    const { rows } = await client.query(
      'SELECT user_id FROM tenants WHERE id = $1', [req.params.id]
    );
    if (!rows.length) return fail(res, 'Tenant not found.', 404);
    const userId = rows[0].user_id;

    // Update user table
    if (password) {
      const hash = await bcrypt.hash(password, parseInt(process.env.BCRYPT_ROUNDS) || 12);
      await client.query(
        `UPDATE users SET full_name = COALESCE($1,full_name), email = COALESCE($2,email),
                          phone = COALESCE($3,phone), username = COALESCE($4,username),
                          password_hash = $5, updated_at = NOW()
          WHERE id = $6`,
        [full_name||null, email||null, phone||null, username||null, hash, userId]
      );
    } else {
      await client.query(
        `UPDATE users SET full_name = COALESCE($1,full_name), email = COALESCE($2,email),
                          phone = COALESCE($3,phone), username = COALESCE($4,username),
                          updated_at = NOW()
          WHERE id = $5`,
        [full_name||null, email||null, phone||null, username||null, userId]
      );
    }

    // Update tenant record
    await client.query(
      `UPDATE tenants
          SET lease_start               = COALESCE($1, lease_start),
              lease_end                 = COALESCE($2, lease_end),
              deposit_amount            = COALESCE($3, deposit_amount),
              emergency_contact_name    = COALESCE($4, emergency_contact_name),
              emergency_contact_phone   = COALESCE($5, emergency_contact_phone),
              updated_at                = NOW()
        WHERE id = $6`,
      [lease_start||null, lease_end||null,
       deposit_amount ? parseFloat(deposit_amount) : null,
       emergency_contact_name||null, emergency_contact_phone||null,
       req.params.id]
    );

    await client.query('COMMIT');
    return ok(res, null, 'Tenant updated.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('tenant update:', err);
    return fail(res, 'Failed to update tenant.', 500);
  } finally {
    client.release();
  }
};

// ── PATCH /api/tenants/:id/deactivate ────────────────────────
const deactivate = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      'SELECT user_id, unit_id FROM tenants WHERE id = $1', [req.params.id]
    );
    if (!rows.length) return fail(res, 'Tenant not found.', 404);
    const { user_id, unit_id } = rows[0];

    await client.query(
      'UPDATE tenants SET is_active = FALSE, updated_at = NOW() WHERE id = $1', [req.params.id]
    );
    await client.query(
      'UPDATE users SET is_active = FALSE, updated_at = NOW() WHERE id = $1', [user_id]
    );
    await client.query(
      'UPDATE units SET is_occupied = FALSE, updated_at = NOW() WHERE id = $1', [unit_id]
    );

    await client.query('COMMIT');
    return ok(res, null, 'Tenant deactivated and unit marked vacant.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('tenant deactivate:', err);
    return fail(res, 'Failed to deactivate tenant.', 500);
  } finally {
    client.release();
  }
};

module.exports = { list, create, update, deactivate };