const pool = require('../config/db');
const { ok, fail } = require('../utils/response');

// ── GET /api/tenant/dashboard ─────────────────────────────────
const tenantDashboard = async (req, res) => {
  const tenantId = req.user.tenant_id;
  const unitId   = req.user.unit_id;
  const propId   = req.user.property_id;

  if (!tenantId) return fail(res, 'No tenant profile found.', 400);

  try {
    const [invRes, payRes, tickRes, notifRes, unitRes, utilRes] = await Promise.all([
      pool.query(
        `SELECT i.*,
                COALESCE((SELECT SUM(p.amount_paid) FROM payments p WHERE p.invoice_id = i.id), 0) AS total_paid,
                GREATEST(i.total_amount - COALESCE((SELECT SUM(p.amount_paid) FROM payments p WHERE p.invoice_id = i.id), 0), 0) AS balance_remaining
           FROM invoices i WHERE i.tenant_id=$1 ORDER BY billing_month DESC LIMIT 1`,
        [tenantId]
      ),
      pool.query(
        `SELECT p.* FROM payments p
           JOIN invoices i ON i.id = p.invoice_id
          WHERE i.tenant_id=$1
          ORDER BY p.payment_date DESC LIMIT 5`,
        [tenantId]
      ),
      pool.query(
        `SELECT * FROM request_tickets WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 5`,
        [tenantId]
      ),
      pool.query(
        `SELECT n.*, u.full_name AS sender_name
           FROM notifications n
           JOIN users u ON u.id = n.sent_by
          WHERE (n.recipient_id=$1 OR (n.recipient_id IS NULL AND n.property_id=$2))
            AND n.created_at >= NOW() - INTERVAL '14 days'
          ORDER BY n.created_at DESC LIMIT 10`,
        [req.user.id, propId]
      ),
      pool.query(
        `SELECT un.unit_number, p.name AS property_name
           FROM units un
           JOIN properties p ON p.id = un.property_id
          WHERE un.id=$1`,
        [unitId]
      ),
      // Latest reading per utility type for this unit (most recent billing_month)
      pool.query(
        `SELECT DISTINCT ON (um.utility_type)
                um.utility_type,
                ur.billing_month,
                ur.consumption_units,
                ur.rate_per_unit,
                ur.total_bill
           FROM utility_readings ur
           JOIN utility_meters um ON um.id = ur.meter_id
          WHERE ur.unit_id = $1
            AND ur.is_submitted = TRUE
          ORDER BY um.utility_type, ur.billing_month DESC`,
        [unitId]
      ),
    ]);

    // Build utility summary: per-type latest bill + grand total
    const utilRows    = utilRes.rows;
    const utilTotal   = utilRows.reduce((s, r) => s + Number(r.total_bill || 0), 0);

    return ok(res, {
      unit_number:      unitRes.rows[0]?.unit_number,
      property_name:    unitRes.rows[0]?.property_name,
      current_invoice:  invRes.rows[0] || null,
      recent_payments:  payRes.rows,
      recent_tickets:   tickRes.rows,
      notifications:    notifRes.rows,
      open_tickets:     tickRes.rows.filter(t => t.status === 'open').length,
      utility_summary:  { breakdown: utilRows, total: utilTotal },
    });
  } catch (err) {
    console.error('tenantDashboard:', err);
    return fail(res, 'Failed to load dashboard.', 500);
  }
};

// ── GET /api/landlord/dashboard ───────────────────────────────
const landlordDashboard = async (req, res) => {
  const propId = req.user.property_id || null;

  try {
    const [statsRes, invRes, payRes, tickRes] = await Promise.all([
      pool.query(
        `SELECT
           (SELECT COUNT(*) FROM tenants t
             WHERE t.is_active=TRUE
               AND ($1::uuid IS NULL OR t.property_id=$1))           AS total_tenants,
           (SELECT COUNT(*) FROM units u
             WHERE u.is_occupied=TRUE
               AND ($1::uuid IS NULL OR u.property_id=$1))           AS occupied_units,
           (SELECT COUNT(*) FROM invoices i
             WHERE i.status='overdue'
               AND ($1::uuid IS NULL OR i.property_id=$1))           AS overdue_invoices,
           (SELECT COUNT(*) FROM request_tickets rt
             WHERE rt.status IN ('open','in_progress')
               AND ($1::uuid IS NULL OR rt.property_id=$1))          AS open_tickets,
           (SELECT COALESCE(SUM(p.amount_paid),0)
              FROM payments p
              JOIN invoices i ON i.id=p.invoice_id
             WHERE ($1::uuid IS NULL OR i.property_id=$1)
               AND DATE_TRUNC('month',i.billing_month)=DATE_TRUNC('month',NOW()))
                                                                      AS collected_this_month,
           (SELECT COALESCE(SUM(
                i.total_amount - COALESCE((
                  SELECT SUM(p.amount_paid) FROM payments p WHERE p.invoice_id = i.id
                ), 0)
              ), 0)
              FROM invoices i
             WHERE i.status IN ('pending','overdue','partial')
               AND ($1::uuid IS NULL OR i.property_id=$1))           AS outstanding,
           (SELECT COUNT(*) FROM maintenance_schedules ms
             WHERE ms.status='scheduled'
               AND ($1::uuid IS NULL OR ms.property_id=$1))          AS scheduled_maintenance`,
        [propId]
      ),
      pool.query(
        `SELECT i.id, i.total_amount, i.status, i.billing_month,
                u.full_name AS tenant_name, un.unit_number
           FROM invoices i
           JOIN tenants  t  ON t.id  = i.tenant_id
           JOIN users    u  ON u.id  = t.user_id
           JOIN units    un ON un.id = i.unit_id
          WHERE ($1::uuid IS NULL OR i.property_id=$1)
          ORDER BY i.generated_at DESC LIMIT 8`,
        [propId]
      ),
      pool.query(
        `SELECT p.amount_paid, p.payment_method, p.payment_date,
                u.full_name AS tenant_name, un.unit_number
           FROM payments p
           JOIN invoices i  ON i.id  = p.invoice_id
           JOIN tenants  t  ON t.id  = i.tenant_id
           JOIN users    u  ON u.id  = t.user_id
           JOIN units    un ON un.id = i.unit_id
          WHERE ($1::uuid IS NULL OR i.property_id=$1)
          ORDER BY p.payment_date DESC LIMIT 6`,
        [propId]
      ),
      pool.query(
        `SELECT rt.id, rt.subject, rt.priority, rt.status, rt.created_at,
                rt.tenant_name, rt.unit_number
           FROM request_tickets rt
          WHERE ($1::uuid IS NULL OR rt.property_id=$1)
          ORDER BY rt.created_at DESC LIMIT 6`,
        [propId]
      ),
    ]);

    return ok(res, {
      stats:           statsRes.rows[0],
      recent_invoices: invRes.rows,
      recent_payments: payRes.rows,
      recent_tickets:  tickRes.rows,
    });
  } catch (err) {
    console.error('landlordDashboard:', err);
    return fail(res, 'Failed to load dashboard.', 500);
  }
};

// ── GET /api/manager/dashboard ────────────────────────────────
const managerDashboard = async (req, res) => {
  try {
    const year = new Date().getFullYear();
    const [portfolioRes, monthlyRes, propertiesRes] = await Promise.all([
      pool.query(
        `SELECT
           (SELECT COUNT(*) FROM properties)                    AS total_properties,
           (SELECT COUNT(*) FROM units)                         AS total_units,
           (SELECT COUNT(*) FROM tenants WHERE is_active=TRUE)  AS active_tenants,
           (SELECT COUNT(*) FROM units WHERE is_occupied=TRUE)  AS occupied_units,
           -- Match Finance report semantics: collections are attributed to the invoice billing_month
           (SELECT COALESCE(SUM(p.amount_paid),0)
              FROM payments p
              JOIN invoices i ON i.id = p.invoice_id
             WHERE DATE_TRUNC('month', i.billing_month) = DATE_TRUNC('month', NOW()))
                                                               AS revenue_this_month,
           (SELECT COALESCE(SUM(p.amount_paid),0)
              FROM payments p
              JOIN invoices i ON i.id = p.invoice_id
             WHERE EXTRACT(YEAR FROM i.billing_month) = $1)
                                                               AS total_revenue_collected,
           (SELECT COALESCE(SUM(
                i.total_amount - COALESCE((
                  SELECT SUM(p.amount_paid) FROM payments p WHERE p.invoice_id = i.id
                ), 0)
              ), 0)
              FROM invoices i
             WHERE i.status IN ('pending','overdue','partial'))   AS outstanding,
           (SELECT COUNT(*) FROM invoices WHERE status='overdue') AS overdue_invoices`
        ,
        [year]
      ),
      pool.query(
        `SELECT TO_CHAR(i.billing_month,'Mon YY')        AS month,
                EXTRACT(MONTH FROM i.billing_month)::int  AS month_num,
                COALESCE(SUM(i.total_amount),0)           AS expected,
                COALESCE(SUM(p.amount_paid),0)            AS collected
           FROM invoices i
           LEFT JOIN (
             SELECT invoice_id, SUM(amount_paid) AS amount_paid
               FROM payments GROUP BY invoice_id
           ) p ON p.invoice_id = i.id
          WHERE i.billing_month >= NOW() - INTERVAL '12 months'
          GROUP BY month, month_num, i.billing_month
          ORDER BY i.billing_month`
      ),
      pool.query(
        `SELECT pr.id, pr.name, pr.address, pr.city,
                COUNT(DISTINCT u.id)                        AS total_units,
                COUNT(DISTINCT CASE WHEN u.is_occupied THEN u.id END) AS occupied_units,
                COUNT(DISTINCT t.id)                        AS active_tenants,
                (SELECT COALESCE(SUM(p2.amount_paid), 0)
                   FROM payments p2
                   JOIN invoices i2 ON i2.id = p2.invoice_id
                  WHERE i2.property_id = pr.id
                    AND DATE_TRUNC('month', i2.billing_month) = DATE_TRUNC('month', NOW())
                )                                           AS collected_this_month,
                (SELECT COALESCE(SUM(
                          CASE WHEN i3.status IN ('pending','overdue','partial')
                            THEN i3.total_amount - COALESCE(p3.amount_paid, 0)
                            ELSE 0 END
                        ), 0)
                   FROM invoices i3
                   LEFT JOIN (
                     SELECT invoice_id, SUM(amount_paid) AS amount_paid
                       FROM payments
                      GROUP BY invoice_id
                   ) p3 ON p3.invoice_id = i3.id
                  WHERE i3.property_id = pr.id
                )                                           AS outstanding
           FROM properties pr
           LEFT JOIN units    u  ON u.property_id = pr.id
           LEFT JOIN tenants  t  ON t.unit_id     = u.id AND t.is_active=TRUE
          GROUP BY pr.id
          ORDER BY pr.name`
      ),
    ]);

    const raw = portfolioRes.rows[0];
    const occ = parseInt(raw.occupied_units);
    const tot = parseInt(raw.total_units);

    return ok(res, {
      portfolio_stats: {
        ...raw,
        occupancy_rate: tot > 0 ? Math.round((occ / tot) * 100) : 0,
      },
      monthly_revenue: monthlyRes.rows,
      properties:      propertiesRes.rows,
    });
  } catch (err) {
    console.error('managerDashboard:', err);
    return fail(res, 'Failed to load dashboard.', 500);
  }
};

module.exports = { tenantDashboard, landlordDashboard, managerDashboard };