const pool        = require('../config/db');
const { ok, fail } = require('../utils/response');
const { runOverdueJob } = require('../jobs/overdueJob');

// ── GET /api/invoices  (landlord - all) ───────────────────────
const list = async (req, res) => {
  const propId = await resolvePropertyId(req.user);
  const { billing_month, status } = req.query;
  try {
    const { rows } = await pool.query(
      `SELECT i.*,
              u.full_name  AS tenant_name,
              un.unit_number,
              COALESCE(
                (SELECT SUM(p.amount_paid) FROM payments p WHERE p.invoice_id = i.id),
                0
              ) AS total_paid,
              GREATEST(
                i.total_amount - COALESCE(
                  (SELECT SUM(p.amount_paid) FROM payments p WHERE p.invoice_id = i.id),
                  0
                ), 0
              ) AS balance_remaining
         FROM invoices i
         JOIN tenants  t  ON t.id  = i.tenant_id
         JOIN users    u  ON u.id  = t.user_id
         JOIN units    un ON un.id = t.unit_id
        WHERE ($1::uuid IS NULL OR i.property_id = $1)
          AND ($2::date IS NULL OR i.billing_month = $2::date)
          AND ($3::text IS NULL OR i.status = $3)
        ORDER BY i.billing_month DESC, u.full_name`,
      [propId, billing_month || null, status || null]
    );
    return ok(res, rows);
  } catch (err) {
    console.error('invoice list:', err);
    return fail(res, 'Failed to fetch invoices.', 500);
  }
};

// ── GET /api/invoices/my  (tenant) ────────────────────────────
const myInvoices = async (req, res) => {
  const tenantId = req.user.tenant_id;
  if (!tenantId) return fail(res, 'No tenant profile found.', 400);
  try {
    const { rows } = await pool.query(
      `SELECT i.*,
              COALESCE(
                (SELECT SUM(p.amount_paid) FROM payments p WHERE p.invoice_id = i.id),
                0
              ) AS total_paid,
              GREATEST(
                i.total_amount - COALESCE(
                  (SELECT SUM(p.amount_paid) FROM payments p WHERE p.invoice_id = i.id),
                  0
                ), 0
              ) AS balance_remaining
         FROM invoices i
        WHERE i.tenant_id = $1
        ORDER BY i.billing_month DESC`,
      [tenantId]
    );
    return ok(res, rows);
  } catch (err) {
    console.error('myInvoices:', err);
    return fail(res, 'Failed to fetch invoices.', 500);
  }
};

// ── POST /api/invoices/generate  (landlord) ───────────────────
const generate = async (req, res) => {
  const { billing_month } = req.body;
  if (!billing_month) return fail(res, 'billing_month is required (YYYY-MM-DD).', 400);

  const propId = await resolvePropertyId(req.user);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Fetch all active tenants for the property
    const { rows: tenants } = await client.query(
      `SELECT t.id AS tenant_id, t.unit_id, t.property_id,
              un.monthly_rent
         FROM tenants t
         JOIN units un ON un.id = t.unit_id
        WHERE t.is_active = TRUE
          AND ($1::uuid IS NULL OR t.property_id = $1)`,
      [propId]
    );

    // Fetch utility readings for this month (per unit)
    const { rows: utilities } = await client.query(
      `SELECT unit_id, utility_type, total_bill
         FROM utility_readings
        WHERE billing_month = $1::date
          AND unit_id = ANY($2::uuid[])`,
      [billing_month, tenants.map(t => t.unit_id)]
    );

    const utilMap = {};
    utilities.forEach(u => {
      if (!utilMap[u.unit_id]) utilMap[u.unit_id] = {};
      utilMap[u.unit_id][u.utility_type] = parseFloat(u.total_bill);
    });

    const DUE_DAYS  = 5;  // due on the 5th of each month
    const dueDate   = new Date(billing_month);
    dueDate.setDate(DUE_DAYS);

    let count = 0;
    for (const t of tenants) {
      const utils   = utilMap[t.unit_id] || {};
      const rent    = parseFloat(t.monthly_rent);
      const water   = utils.water       || 0;
      const elec    = utils.electricity || 0;
      const garbage = utils.garbage     || 0;
      const penalty = 0;  // Penalties can be added manually or via a separate job
      const total   = rent + water + elec + garbage + penalty;

      // Upsert: skip if already generated for this tenant + month
      await client.query(
        `INSERT INTO invoices
           (tenant_id, property_id, billing_month, due_date,
            rent_amount, water_bill, electricity_bill, garbage_bill,
            penalty_amount, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending')
         ON CONFLICT (tenant_id, billing_month) DO NOTHING`,
        [t.tenant_id, t.property_id, billing_month, dueDate,
         rent, water, elec, garbage, penalty]
      );
      count++;
    }

    await client.query('COMMIT');
    return ok(res, { count }, `${count} invoices generated.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('generate invoices:', err);
    return fail(res, 'Failed to generate invoices.', 500);
  } finally {
    client.release();
  }
};


// Helper: resolve property_id for a landlord user reliably
const resolvePropertyId = async (user) => {
  if (user.property_id) return user.property_id;
  // Fallback: look up from landlord_properties table
  const { rows } = await pool.query(
    `SELECT property_id FROM landlord_properties WHERE landlord_id = $1 LIMIT 1`,
    [user.id]
  );
  return rows[0]?.property_id || null;
};


// ── GET /api/invoices/summary  (landlord) ────────────────────
// Returns accurate financial summary computed entirely in SQL
const summary = async (req, res) => {
  try {
    const propId = await resolvePropertyId(req.user);
    const { rows } = await pool.query(
      `SELECT
         -- Collected this calendar month (actual payments received this month)
         COALESCE((
           SELECT SUM(p.amount_paid)
             FROM payments p
             JOIN invoices i ON i.id = p.invoice_id
            WHERE DATE_TRUNC('month', p.payment_date) = DATE_TRUNC('month', CURRENT_DATE)
              AND ($1::uuid IS NULL OR i.property_id = $1)
         ), 0) AS collected_this_month,

         -- Total outstanding balance remaining across all unpaid invoices
         COALESCE((
           SELECT SUM(
             i.total_amount - COALESCE((
               SELECT SUM(p2.amount_paid) FROM payments p2 WHERE p2.invoice_id = i.id
             ), 0)
           )
           FROM invoices i
           WHERE i.status IN ('pending', 'overdue', 'partial')
             AND ($1::uuid IS NULL OR i.property_id = $1)
         ), 0) AS total_outstanding,

         -- Total collected all time
         COALESCE((
           SELECT SUM(p.amount_paid)
             FROM payments p
             JOIN invoices i ON i.id = p.invoice_id
            WHERE ($1::uuid IS NULL OR i.property_id = $1)
         ), 0) AS total_collected,

         -- Count of overdue invoices
         (SELECT COUNT(*) FROM invoices i
           WHERE i.status = 'overdue'
             AND ($1::uuid IS NULL OR i.property_id = $1))::int AS overdue_count`,
      [propId]
    );
    return ok(res, rows[0]);
  } catch (err) {
    console.error('invoice summary:', err);
    return fail(res, 'Failed to fetch invoice summary.', 500);
  }
};

// ── GET /api/invoices/penalty-settings  (landlord) ───────────
const getPenaltySettings = async (req, res) => {
  try {
    const propId = await resolvePropertyId(req.user);
    if (!propId) return fail(res, 'No property assigned to this landlord.', 400);
    const { rows } = await pool.query(
      `SELECT penalty_enabled, penalty_rate, penalty_type FROM properties WHERE id=$1`,
      [propId]
    );
    return ok(res, rows[0] || { penalty_enabled: false, penalty_rate: 0, penalty_type: 'flat' });
  } catch (err) {
    console.error('getPenaltySettings:', err);
    return fail(res, 'Failed to fetch penalty settings.', 500);
  }
};

// ── POST /api/invoices/penalty-settings  (landlord) ──────────
const savePenaltySettings = async (req, res) => {
  try {
    const propId = await resolvePropertyId(req.user);
    if (!propId) return fail(res, 'No property assigned to this landlord.', 400);
    const { penalty_enabled, penalty_rate, penalty_type } = req.body;
    const result = await pool.query(
      `UPDATE properties
          SET penalty_enabled = $1,
              penalty_rate    = $2,
              penalty_type    = $3,
              updated_at      = NOW()
        WHERE id = $4`,
      [!!penalty_enabled,
       parseFloat(penalty_rate) || 0,
       penalty_type === 'percentage' ? 'percentage' : 'flat',
       propId]
    );
    console.log('savePenaltySettings rowCount:', result.rowCount, 'propId:', propId);
    if (result.rowCount === 0)
      return fail(res, 'Property not found. Ensure the migration has been run.', 404);
    return ok(res, null, 'Penalty settings saved.');
  } catch (err) {
    console.error('savePenaltySettings:', err.message);
    return fail(res, `Failed to save penalty settings: ${err.message}`, 500);
  }
};

// ── POST /api/invoices/run-overdue  (landlord - manual trigger) ─
const runOverdueManual = async (req, res) => {
  try {
    const result = await runOverdueJob();
    return ok(res, result, `${result.markedOverdue} invoices marked overdue, ${result.penaltiesApplied} penalties applied.`);
  } catch (err) {
    console.error('runOverdueManual:', err.message);
    return fail(res, `Overdue job failed: ${err.message}`, 500);
  }
};

module.exports = { list, myInvoices, generate, summary, getPenaltySettings, savePenaltySettings, runOverdueManual };