const bcrypt = require('bcryptjs');
const pool   = require('../config/db');
const { ok, fail } = require('../utils/response');

// ── GET /api/users?role=landlord ──────────────────────────────
const listUsers = async (req, res) => {
  const { role } = req.query;
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.full_name, u.username, u.role, u.email,
              u.phone, u.is_active, u.created_at,
              p.id   AS property_id,
              p.name AS property_name
         FROM users u
         LEFT JOIN landlord_properties lp ON lp.landlord_id  = u.id
         LEFT JOIN properties           p  ON p.id            = lp.property_id
        WHERE ($1::text IS NULL OR u.role = $1)
          AND u.role <> 'manager'
        ORDER BY u.created_at DESC`,
      [role || null]
    );
    return ok(res, rows);
  } catch (err) {
    console.error('listUsers:', err);
    return fail(res, 'Failed to fetch users.', 500);
  }
};

// ── PUT /api/users/me ─────────────────────────────────────────
const updateMe = async (req, res) => {
  const { full_name, email, phone } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE users
          SET full_name  = COALESCE($1, full_name),
              email      = COALESCE($2, email),
              phone      = COALESCE($3, phone),
              updated_at = NOW()
        WHERE id = $4
        RETURNING id, full_name, email, phone`,
      [full_name||null, email||null, phone||null, req.user.id]
    );
    return ok(res, rows[0], 'Profile updated.');
  } catch (err) {
    console.error('updateMe:', err);
    return fail(res, 'Failed to update profile.', 500);
  }
};

// ── POST /api/users/landlord ──────────────────────────────────
const createLandlord = async (req, res) => {
  const { full_name, username, password, email, phone, property_id } = req.body;
  if (!full_name || !username || !password)
    return fail(res, 'Full name, username, and password are required.', 400);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const dup = await client.query(
      'SELECT id FROM users WHERE username = $1', [username]
    );
    if (dup.rows.length) return fail(res, 'Username already taken.', 409);

    const hash = await bcrypt.hash(password, parseInt(process.env.BCRYPT_ROUNDS) || 12);
    const { rows } = await client.query(
      `INSERT INTO users (full_name, username, password_hash, role, email, phone)
       VALUES ($1,$2,$3,'landlord',$4,$5)
       RETURNING id, full_name, username, role, email, phone`,
      [full_name, username, hash, email||null, phone||null]
    );
    const newUser = rows[0];

    if (property_id) {
      await client.query(
        `INSERT INTO landlord_properties (landlord_id, property_id)
         VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [newUser.id, property_id]
      );
    }

    await client.query('COMMIT');
    return ok(res, newUser, 'Landlord account created.', 201);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('createLandlord:', err);
    return fail(res, 'Failed to create landlord account.', 500);
  } finally {
    client.release();
  }
};

// ── PUT /api/users/:id ────────────────────────────────────────
const updateUser = async (req, res) => {
  const { full_name, email, phone, username, password, property_id } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (password) {
      const hash = await bcrypt.hash(password, parseInt(process.env.BCRYPT_ROUNDS) || 12);
      await client.query(
        `UPDATE users SET full_name=COALESCE($1,full_name), email=COALESCE($2,email),
                          phone=COALESCE($3,phone), username=COALESCE($4,username),
                          password_hash=$5, updated_at=NOW()
          WHERE id=$6`,
        [full_name||null, email||null, phone||null, username||null, hash, req.params.id]
      );
    } else {
      await client.query(
        `UPDATE users SET full_name=COALESCE($1,full_name), email=COALESCE($2,email),
                          phone=COALESCE($3,phone), username=COALESCE($4,username),
                          updated_at=NOW()
          WHERE id=$5`,
        [full_name||null, email||null, phone||null, username||null, req.params.id]
      );
    }

    if (property_id !== undefined) {
      await client.query(
        'DELETE FROM landlord_properties WHERE landlord_id = $1', [req.params.id]
      );
      if (property_id) {
        await client.query(
          'INSERT INTO landlord_properties (landlord_id, property_id) VALUES ($1,$2)',
          [req.params.id, property_id]
        );
      }
    }

    await client.query('COMMIT');
    return ok(res, null, 'User updated.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('updateUser:', err);
    return fail(res, 'Failed to update user.', 500);
  } finally {
    client.release();
  }
};

// ── PATCH /api/users/:id/reset-password ──────────────────────
const resetPassword = async (req, res) => {
  const { new_password } = req.body;
  if (!new_password || new_password.length < 6)
    return fail(res, 'Password must be at least 6 characters.', 400);
  try {
    const hash = await bcrypt.hash(new_password, parseInt(process.env.BCRYPT_ROUNDS) || 12);
    await pool.query(
      'UPDATE users SET password_hash=$1, updated_at=NOW() WHERE id=$2',
      [hash, req.params.id]
    );
    return ok(res, null, 'Password reset successfully.');
  } catch (err) {
    console.error('resetPassword:', err);
    return fail(res, 'Failed to reset password.', 500);
  }
};

const setActive = (active) => async (req, res) => {
  try {
    await pool.query(
      'UPDATE users SET is_active=$1, updated_at=NOW() WHERE id=$2',
      [active, req.params.id]
    );
    return ok(res, null, `User ${active ? 'activated' : 'deactivated'}.`);
  } catch (err) {
    console.error('setActive:', err);
    return fail(res, 'Failed to update user status.', 500);
  }
};

module.exports = {
  listUsers, updateMe, createLandlord,
  updateUser, resetPassword,
  activateUser:   setActive(true),
  deactivateUser: setActive(false),
};