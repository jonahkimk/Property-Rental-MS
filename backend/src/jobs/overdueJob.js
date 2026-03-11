const pool = require('../config/db');

async function runOverdueJob() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Step 1: mark all unpaid past-due invoices as overdue (no JOIN needed)
    const { rows: updated } = await client.query(
      `UPDATE invoices
          SET status     = 'overdue',
              updated_at = NOW()
        WHERE due_date::date < CURRENT_DATE
          AND status NOT IN ('paid', 'overdue')
       RETURNING id, tenant_id, property_id, rent_amount,
                 COALESCE(penalty_applied, FALSE) AS penalty_applied`
    );
    console.log(`[OverdueJob] Marked ${updated.length} invoices overdue`);

    // Step 2: also grab already-overdue invoices that haven't had penalty applied
    const { rows: needPenalty } = await client.query(
      `SELECT i.id, i.tenant_id, i.property_id, i.rent_amount,
              COALESCE(i.penalty_applied, FALSE) AS penalty_applied
         FROM invoices i
        WHERE i.status = 'overdue'
          AND COALESCE(i.penalty_applied, FALSE) = FALSE`
    );
    console.log(`[OverdueJob] ${needPenalty.length} overdue invoices need penalty check`);

    // Step 3: for each, look up property penalty settings and apply if enabled
    let penaltiesApplied = 0;
    const allToCheck = [
      ...updated,
      ...needPenalty.filter(n => !updated.find(u => u.id === n.id))
    ];

    for (const inv of allToCheck) {
      // Look up penalty settings for this invoice's property
      const { rows: propRows } = await client.query(
        `SELECT penalty_enabled, penalty_rate, penalty_type
           FROM properties WHERE id = $1`,
        [inv.property_id]
      );
      const prop = propRows[0];
      if (!prop) continue;

      console.log(`[OverdueJob] Invoice ${inv.id}: penalty_enabled=${prop.penalty_enabled} rate=${prop.penalty_rate} applied=${inv.penalty_applied}`);

      if (!prop.penalty_enabled || inv.penalty_applied || parseFloat(prop.penalty_rate || 0) <= 0) continue;

      const penaltyAmount = prop.penalty_type === 'percentage'
        ? Math.round(parseFloat(inv.rent_amount) * parseFloat(prop.penalty_rate) / 100 * 100) / 100
        : parseFloat(prop.penalty_rate);

      await client.query(
        `UPDATE invoices
            SET penalty_amount  = penalty_amount + $1,
                penalty_reason  = $2,
                penalty_applied = TRUE,
                updated_at      = NOW()
          WHERE id = $3`,
        [penaltyAmount,
         prop.penalty_type === 'percentage'
           ? `Late payment penalty (${prop.penalty_rate}% of rent)`
           : `Late payment penalty (KSH ${prop.penalty_rate} flat fee)`,
         inv.id]
      );
      console.log(`[OverdueJob] Applied penalty KSH ${penaltyAmount} to invoice ${inv.id}`);
      penaltiesApplied++;
    }

    await client.query('COMMIT');
    console.log(`[OverdueJob] Done: ${updated.length} marked overdue, ${penaltiesApplied} penalties applied`);
    return { markedOverdue: updated.length, penaltiesApplied };

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[OverdueJob] FAILED:', err.message);
    console.error(err.stack);
    throw err;
  } finally {
    client.release();
  }
}

function scheduleOverdueJob() {
  runOverdueJob().catch(err => console.error('[OverdueJob] Startup run failed:', err.message));
  setInterval(() => runOverdueJob().catch(err => console.error('[OverdueJob] Scheduled run failed:', err.message)), 24 * 60 * 60 * 1000);
}

module.exports = { runOverdueJob, scheduleOverdueJob };