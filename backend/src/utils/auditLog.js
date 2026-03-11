const pool = require('../config/db');

const auditLog = async ({ userId, action, tableName, recordId, oldValues, newValues }) => {
  try {
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, table_name, record_id, old_values, new_values)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        userId    || null,
        action,
        tableName || null,
        recordId  || null,
        oldValues ? JSON.stringify(oldValues) : null,
        newValues ? JSON.stringify(newValues) : null,
      ]
    );
  } catch (err) {
    // Audit failure must never crash the main request
    console.error('Audit log error:', err.message);
  }
};

module.exports = auditLog;