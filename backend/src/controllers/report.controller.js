const pool = require('../config/db');
const { ok, fail } = require('../utils/response');

// ── GET /api/reports/finance?year=2026 ────────────────────────
const financeReport = async (req, res) => {
  const year   = parseInt(req.query.year) || new Date().getFullYear();
  const propId = req.user.property_id || null;

  try {
    const { rows: monthly } = await pool.query(
      `SELECT TO_CHAR(i.billing_month,'Mon YYYY')         AS month,
              EXTRACT(MONTH FROM i.billing_month)::int    AS month_num,
              COALESCE(SUM(i.total_amount),0)             AS expected,
              COALESCE(SUM(p.amount_paid),0)              AS collected,
              COALESCE(SUM(i.total_amount)-SUM(COALESCE(p.amount_paid,0)),0) AS outstanding
         FROM invoices i
         LEFT JOIN (
           SELECT invoice_id, SUM(amount_paid) AS amount_paid
             FROM payments GROUP BY invoice_id
         ) p ON p.invoice_id = i.id
        WHERE EXTRACT(YEAR FROM i.billing_month)=$1
          AND ($2::uuid IS NULL OR i.property_id=$2)
        GROUP BY month, month_num
        ORDER BY month_num`,
      [year, propId]
    );

    const { rows: byProperty } = await pool.query(
      `SELECT i.property_id,
              pr.name                                      AS property_name,
              COALESCE(SUM(i.total_amount),0)             AS expected,
              COALESCE(SUM(p.amount_paid),0)              AS collected,
              COALESCE(SUM(i.total_amount)-SUM(COALESCE(p.amount_paid,0)),0) AS outstanding
         FROM invoices i
         JOIN properties pr ON pr.id = i.property_id
         LEFT JOIN (
           SELECT invoice_id, SUM(amount_paid) AS amount_paid
             FROM payments GROUP BY invoice_id
         ) p ON p.invoice_id = i.id
        WHERE EXTRACT(YEAR FROM i.billing_month)=$1
          AND ($2::uuid IS NULL OR i.property_id=$2)
        GROUP BY i.property_id, pr.name
        ORDER BY pr.name`,
      [year, propId]
    );

    const totals = {
      total_expected:    monthly.reduce((a, r) => a + Number(r.expected),    0),
      total_collected:   monthly.reduce((a, r) => a + Number(r.collected),   0),
      total_outstanding: monthly.reduce((a, r) => a + Number(r.outstanding), 0),
    };
    // Projection should reflect expected revenue, not collections performance
    const avgMonthlyExpected = monthly.length ? totals.total_expected / monthly.length : 0;
    const annual_projection  = Math.round(avgMonthlyExpected * 12);

    return ok(res, { monthly_summary: monthly, by_property: byProperty, totals, annual_projection });
  } catch (err) {
    console.error('financeReport:', err);
    return fail(res, 'Failed to generate finance report.', 500);
  }
};

// ── GET /api/reports/utility ──────────────────────────────────
// utility_type is stored on utility_meters, NOT on utility_readings directly
const utilityReport = async (req, res) => {
  const { utility_type, billing_month, property_id } = req.query;
  if (!utility_type || !billing_month)
    return fail(res, 'utility_type and billing_month are required.', 400);

  const propId = property_id || req.user.property_id || null;

  try {
    // Readings — join through utility_meters to get utility_type
    const { rows: readings } = await pool.query(
      `SELECT ur.id, ur.billing_month, ur.reading_start, ur.reading_end,
              ur.consumption_units, ur.rate_per_unit, ur.total_bill,
              ur.is_submitted, ur.notes,
              um.utility_type,
              u.unit_number,
              usr.full_name AS tenant_name
         FROM utility_readings ur
         JOIN utility_meters um ON um.id       = ur.meter_id
         JOIN units          u  ON u.id        = ur.unit_id
         LEFT JOIN tenants   t  ON t.unit_id   = u.id AND t.is_active=TRUE
         LEFT JOIN users     usr ON usr.id     = t.user_id
        WHERE um.utility_type  = $1
          AND ur.billing_month = $2::date
          AND ($3::uuid IS NULL OR ur.property_id = $3)
        ORDER BY u.unit_number`,
      [utility_type, billing_month, propId]
    );

    const summary = {
      total_units:         readings.length,
      units_with_readings: readings.filter(r => r.reading_end != null).length,
      total_consumption:   readings.reduce((a, r) => a + Number(r.consumption_units || 0), 0),
      total_bill:          readings.reduce((a, r) => a + Number(r.total_bill         || 0), 0),
      rate_per_unit:       readings[0]?.rate_per_unit || null,
    };

    // 6-month trend — join through utility_meters
    const { rows: trend } = await pool.query(
      `SELECT TO_CHAR(ur.billing_month,'Mon YY') AS month,
              SUM(ur.consumption_units)           AS consumption,
              SUM(ur.total_bill)                  AS bill
         FROM utility_readings ur
         JOIN utility_meters um ON um.id = ur.meter_id
         JOIN units          u  ON u.id  = ur.unit_id
        WHERE um.utility_type  = $1
          AND ($2::uuid IS NULL OR ur.property_id = $2)
          AND ur.billing_month <= $3::date
        GROUP BY ur.billing_month
        ORDER BY ur.billing_month DESC
        LIMIT 6`,
      [utility_type, propId, billing_month]
    );

    return ok(res, { readings, summary, trend: trend.reverse() });
  } catch (err) {
    console.error('utilityReport:', err);
    return fail(res, 'Failed to generate utility report.', 500);
  }
};

module.exports = { financeReport, utilityReport };