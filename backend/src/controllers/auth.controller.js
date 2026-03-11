const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const pool   = require('../config/db');
const { ok, fail } = require('../utils/response');
const auditLog = require('../utils/auditLog');

const loginOk = (res, token, user) =>
  res.json({ success: true, message: 'Login successful', token, user });

// ── POST /api/auth/login ──────────────────────────────────────
const loginHandler = async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return fail(res, 'Username and password are required.', 400);

  const uname = username.trim();
  const ip = req.ip;
  const userAgent = req.get('user-agent') || null;

  try {
    // Step 1: fetch user + tenant info
    const { rows } = await pool.query(
      `SELECT u.id, u.full_name, u.username, u.role,
              u.password_hash, u.is_active,
              t.id          AS tenant_id,
              t.unit_id,
              t.property_id AS tenant_property_id,
              un.unit_number
         FROM users u
         LEFT JOIN tenants t  ON t.user_id = u.id AND t.is_active=TRUE
         LEFT JOIN units   un ON un.id     = t.unit_id
        WHERE u.username = $1
        LIMIT 1`,
      [uname]
    );

    if (!rows.length) {
      await auditLog({
        userId: null,
        action: 'login_failed',
        tableName: 'auth',
        recordId: uname,
        oldValues: null,
        newValues: { reason: 'user_not_found', ip, userAgent },
      });
      return fail(res, 'Invalid username or password.', 401);
    }

    const user = rows[0];
    if (!user.is_active)
      return fail(res, 'Account is deactivated. Contact your administrator.', 403);

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      await auditLog({
        userId: user.id,
        action: 'login_failed',
        tableName: 'auth',
        recordId: user.id,
        oldValues: null,
        newValues: { reason: 'bad_password', ip, userAgent },
      });
      return fail(res, 'Invalid username or password.', 401);
    }

    // Step 2: resolve property_id by role
    let property_id = null;

    if (user.role === 'tenant') {
      property_id = user.tenant_property_id || null;
    }

    if (user.role === 'landlord') {
      // landlord_properties uses landlord_id (not user_id)
      const lpRes = await pool.query(
        `SELECT property_id FROM landlord_properties WHERE landlord_id = $1 LIMIT 1`,
        [user.id]
      );
      property_id = lpRes.rows[0]?.property_id || null;
    }

    // Step 3: build JWT
    const payload = {
      id:        user.id,
      username:  user.username,
      full_name: user.full_name,
      role:      user.role,
      ...(property_id      && { property_id }),
      ...(user.unit_id     && { unit_id:     user.unit_id }),
      ...(user.unit_number && { unit_number: user.unit_number }),
      ...(user.tenant_id   && { tenant_id:   user.tenant_id }),
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRY || '8h',
    });

    await auditLog({
      userId: user.id,
      action: 'login_success',
      tableName: 'auth',
      recordId: user.id,
      oldValues: null,
      newValues: { ip, userAgent, role: user.role },
    });

    return loginOk(res, token, {
      id:          user.id,
      full_name:   user.full_name,
      username:    user.username,
      role:        user.role,
      property_id: property_id      || null,
      unit_id:     user.unit_id     || null,
      unit_number: user.unit_number || null,
    });

  } catch (err) {
    console.error('login error:', err);
    return fail(res, 'Login failed. Please try again.', 500);
  }
};

// ── GET /api/auth/me ──────────────────────────────────────────
const getMe = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, full_name, username, role, email, phone, is_active, created_at
         FROM users WHERE id=$1`,
      [req.user.id]
    );
    if (!rows.length) return fail(res, 'User not found.', 404);
    return ok(res, rows[0]);
  } catch (err) {
    console.error('getMe error:', err);
    return fail(res, 'Failed to fetch profile.', 500);
  }
};

// ── PUT /api/auth/change-password ─────────────────────────────
const changePassword = async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password)
    return fail(res, 'Both current and new passwords are required.', 400);
  if (new_password.length < 6)
    return fail(res, 'New password must be at least 6 characters.', 400);
  try {
    const { rows } = await pool.query(
      'SELECT password_hash FROM users WHERE id=$1', [req.user.id]
    );
    const match = await bcrypt.compare(current_password, rows[0].password_hash);
    if (!match) return fail(res, 'Current password is incorrect.', 401);

    const hash = await bcrypt.hash(new_password, parseInt(process.env.BCRYPT_ROUNDS) || 12);
    await pool.query(
      'UPDATE users SET password_hash=$1, updated_at=NOW() WHERE id=$2',
      [hash, req.user.id]
    );
    return ok(res, null, 'Password changed successfully.');
  } catch (err) {
    console.error('changePassword error:', err);
    return fail(res, 'Failed to change password.', 500);
  }
};

module.exports = { login: loginHandler, getMe, changePassword };

// ── POST /api/auth/impersonate/landlord  (manager) ─────────────
// Allows a manager to "view as landlord" for supervision.
// Requires re-entering the manager's password (master password confirmation).
const impersonateLandlord = async (req, res) => {
  const { property_id, landlord_id, manager_password } = req.body;
  if (!manager_password) return fail(res, 'manager_password is required.', 400);

  const ip = req.ip;
  const userAgent = req.get('user-agent') || null;

  const client = await pool.connect();
  try {
    // 1) Verify manager password
    const { rows: mgrRows } = await client.query(
      `SELECT id, full_name, username, role, password_hash, is_active
         FROM users
        WHERE id = $1
        LIMIT 1`,
      [req.user.id]
    );
    const mgr = mgrRows[0];
    if (!mgr) return fail(res, 'Manager account not found.', 404);
    if (mgr.role !== 'manager') return fail(res, 'Only managers can impersonate.', 403);
    if (!mgr.is_active) return fail(res, 'Account is deactivated.', 403);

    const okPwd = await bcrypt.compare(manager_password, mgr.password_hash);
    if (!okPwd) return fail(res, 'Incorrect manager password.', 401);

    // 2) Pick landlord to impersonate
    let landlord = null;

    if (landlord_id) {
      const { rows } = await client.query(
        `SELECT u.id, u.full_name, u.username, u.role, u.is_active,
                lp.property_id
           FROM users u
           JOIN landlord_properties lp ON lp.landlord_id = u.id
          WHERE u.id = $1
            AND u.role = 'landlord'
            AND ($2::uuid IS NULL OR lp.property_id = $2)
          LIMIT 1`,
        [landlord_id, property_id || null]
      );
      landlord = rows[0] || null;
    } else {
      const { rows } = await client.query(
        `SELECT u.id, u.full_name, u.username, u.role, u.is_active,
                lp.property_id
           FROM landlord_properties lp
           JOIN users u ON u.id = lp.landlord_id
          WHERE ($1::uuid IS NULL OR lp.property_id = $1)
            AND u.role = 'landlord'
          ORDER BY u.created_at ASC
          LIMIT 1`,
        [property_id || null]
      );
      landlord = rows[0] || null;
    }

    if (!landlord) {
      return fail(
        res,
        property_id
          ? 'No landlord is assigned to this property yet.'
          : 'No landlord found to impersonate.',
        404
      );
    }
    if (!landlord.is_active) return fail(res, 'Landlord account is inactive.', 403);

    const propId = property_id || landlord.property_id || null;

    // 3) Issue landlord JWT
    const payload = {
      id:        landlord.id,
      username:  landlord.username,
      full_name: landlord.full_name,
      role:      'landlord',
      ...(propId && { property_id: propId }),
      impersonated_by: req.user.id,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRY || '8h',
    });

    await auditLog({
      userId: req.user.id,
      action: 'impersonation_start',
      tableName: 'auth',
      recordId: landlord.id,
      oldValues: null,
      newValues: { landlord_id: landlord.id, property_id: propId, ip, userAgent },
    });

    return res.json({
      success: true,
      message: 'Impersonation started.',
      token,
      user: {
        id:          landlord.id,
        full_name:   landlord.full_name,
        username:    landlord.username,
        role:        'landlord',
        property_id: propId,
      },
    });
  } catch (err) {
    console.error('impersonateLandlord error:', err);
    return fail(res, 'Failed to impersonate landlord.', 500);
  } finally {
    client.release();
  }
};

module.exports.impersonateLandlord = impersonateLandlord;