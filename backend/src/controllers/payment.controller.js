const pool = require('../config/db');
const { ok, fail } = require('../utils/response');

// ── GET /api/payments  (landlord) ────────────────────────────
const list = async (req, res) => {
  const propId = req.user.property_id || null;
  try {
    const { rows } = await pool.query(
      `SELECT p.*,
              u.full_name    AS tenant_name,
              un.unit_number,
              recv.full_name AS received_by_name
         FROM payments p
         JOIN invoices i    ON i.id  = p.invoice_id
         JOIN tenants  t    ON t.id  = i.tenant_id
         JOIN users    u    ON u.id  = t.user_id
         JOIN units    un   ON un.id = i.unit_id
         LEFT JOIN users recv ON recv.id = p.received_by
        WHERE ($1::uuid IS NULL OR i.property_id = $1)
        ORDER BY p.payment_date DESC`,
      [propId]
    );
    return ok(res, rows);
  } catch (err) {
    console.error('payment list:', err);
    return fail(res, 'Failed to fetch payments.', 500);
  }
};

// ── GET /api/payments/my  (tenant) ───────────────────────────
const myPayments = async (req, res) => {
  const tenantId = req.user.tenant_id;
  if (!tenantId) return fail(res, 'No tenant profile found.', 400);
  try {
    const { rows } = await pool.query(
      `SELECT p.* FROM payments p WHERE p.tenant_id = $1 ORDER BY p.payment_date DESC`,
      [tenantId]
    );
    return ok(res, rows);
  } catch (err) {
    console.error('myPayments:', err);
    return fail(res, 'Failed to fetch payments.', 500);
  }
};

// ── GET /api/payments/submissions  (landlord - pending confirmations) ─
const listSubmissions = async (req, res) => {
  const propId  = req.user.property_id || null;
  const { status } = req.query;
  try {
    const { rows } = await pool.query(
      `SELECT ps.*,
              u.full_name    AS tenant_name,
              un.unit_number,
              i.billing_month, i.total_amount AS invoice_total
         FROM payment_submissions ps
         JOIN invoices i  ON i.id  = ps.invoice_id
         JOIN tenants  t  ON t.id  = ps.tenant_id
         JOIN users    u  ON u.id  = t.user_id
         JOIN units    un ON un.id = i.unit_id
        WHERE ($1::uuid IS NULL OR ps.property_id = $1)
          AND ($2::text  IS NULL OR ps.status = $2)
        ORDER BY ps.submitted_at DESC`,
      [propId, status || null]
    );
    return ok(res, rows);
  } catch (err) {
    console.error('listSubmissions:', err);
    return fail(res, 'Failed to fetch payment submissions.', 500);
  }
};

// ── GET /api/payments/my-submissions  (tenant) ───────────────
const mySubmissions = async (req, res) => {
  const tenantId = req.user.tenant_id;
  if (!tenantId) return fail(res, 'No tenant profile found.', 400);
  try {
    const { rows } = await pool.query(
      `SELECT ps.*, i.billing_month, i.total_amount AS invoice_total
         FROM payment_submissions ps
         JOIN invoices i ON i.id = ps.invoice_id
        WHERE ps.tenant_id = $1
        ORDER BY ps.submitted_at DESC`,
      [tenantId]
    );
    return ok(res, rows);
  } catch (err) {
    console.error('mySubmissions:', err);
    return fail(res, 'Failed to fetch your payment submissions.', 500);
  }
};

// ── POST /api/payments/submit  (tenant - submit payment claim) ─
const submit = async (req, res) => {
  const { invoice_id, payment_method, amount_paid, mpesa_code, bank_reference, notes } = req.body;
  if (!invoice_id || !payment_method || !amount_paid)
    return fail(res, 'invoice_id, payment_method, and amount_paid are required.', 400);

  const tenantId = req.user.tenant_id;
  if (!tenantId) return fail(res, 'No tenant profile found.', 400);

  try {
    // Check invoice belongs to this tenant
    const { rows: invRows } = await pool.query(
      `SELECT id, tenant_id, property_id, total_amount, status FROM invoices WHERE id=$1`,
      [invoice_id]
    );
    if (!invRows.length)              return fail(res, 'Invoice not found.', 404);
    if (invRows[0].tenant_id !== tenantId) return fail(res, 'Not authorised.', 403);
    if (invRows[0].status === 'paid') return fail(res, 'Invoice already fully paid.', 409);

    // Check no pending submission already exists for this invoice
    const { rows: existing } = await pool.query(
      `SELECT id FROM payment_submissions WHERE invoice_id=$1 AND status='pending'`,
      [invoice_id]
    );
    if (existing.length) return fail(res, 'A payment submission is already pending confirmation for this invoice.', 409);

    const { rows } = await pool.query(
      `INSERT INTO payment_submissions
         (invoice_id, tenant_id, property_id, amount_paid, payment_method,
          mpesa_code, bank_reference, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [invoice_id, tenantId, invRows[0].property_id,
       parseFloat(amount_paid), payment_method,
       mpesa_code || null, bank_reference || null, notes || null]
    );
    return ok(res, rows[0], 'Payment submitted for confirmation.', 201);
  } catch (err) {
    console.error('submit:', err);
    return fail(res, 'Failed to submit payment.', 500);
  }
};

// ── POST /api/payments/submissions/:id/confirm  (landlord) ───
const confirm = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Fetch submission
    const { rows: subRows } = await client.query(
      `SELECT * FROM payment_submissions WHERE id=$1`, [req.params.id]
    );
    if (!subRows.length)              return fail(res, 'Submission not found.', 404);
    if (subRows[0].status !== 'pending') return fail(res, 'Submission already reviewed.', 409);
    const sub = subRows[0];

    // Fetch invoice
    const { rows: invRows } = await client.query(
      `SELECT id, total_amount, status, tenant_id, property_id FROM invoices WHERE id=$1`,
      [sub.invoice_id]
    );
    if (!invRows.length) return fail(res, 'Invoice not found.', 404);
    const inv = invRows[0];

    // Record confirmed payment into payments table
    const { rows: payRows } = await client.query(
      `INSERT INTO payments
         (invoice_id, tenant_id, property_id, payment_method, amount_paid,
          mpesa_code, bank_reference, notes, received_by, payment_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, NOW()) RETURNING *`,
      [sub.invoice_id, sub.tenant_id, sub.property_id,
       sub.payment_method, sub.amount_paid,
       sub.mpesa_code, sub.bank_reference, sub.notes,
       req.user.id]
    );

    // Recalculate invoice status
    const { rows: sumRows } = await client.query(
      `SELECT COALESCE(SUM(amount_paid),0) AS total_paid FROM payments WHERE invoice_id=$1`,
      [sub.invoice_id]
    );
    const totalPaid = parseFloat(sumRows[0].total_paid);
    const newStatus = totalPaid >= parseFloat(inv.total_amount) ? 'paid'
                    : totalPaid  > 0                             ? 'partial'
                    :                                              'pending';

    await client.query(
      `UPDATE invoices SET status=$1, updated_at=NOW() WHERE id=$2`,
      [newStatus, sub.invoice_id]
    );

    // Mark submission as confirmed
    await client.query(
      `UPDATE payment_submissions
          SET status='confirmed', reviewed_at=NOW(), reviewed_by=$1, updated_at=NOW()
        WHERE id=$2`,
      [req.user.id, req.params.id]
    );

    // Send confirmation notification to tenant
    await client.query(
      `INSERT INTO notifications
         (property_id, sent_by, sender_name, recipient_id, title, message)
       VALUES ($1,$2,$3,
         (SELECT user_id FROM tenants WHERE id=$4),
         'Payment Confirmed ✓',
         $5)`,
      [sub.property_id, req.user.id, req.user.full_name || 'Landlord', sub.tenant_id,
       `Your payment of KSH ${Number(sub.amount_paid).toLocaleString()} has been confirmed. Invoice status: ${newStatus}.`]
    );

    await client.query('COMMIT');
    return ok(res, payRows[0], 'Payment confirmed and recorded.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('confirm payment:', err);
    return fail(res, 'Failed to confirm payment.', 500);
  } finally {
    client.release();
  }
};

// ── POST /api/payments/submissions/:id/reject  (landlord) ────
const reject = async (req, res) => {
  const { reason } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: subRows } = await client.query(
      `SELECT * FROM payment_submissions WHERE id=$1`, [req.params.id]
    );
    if (!subRows.length)                 return fail(res, 'Submission not found.', 404);
    if (subRows[0].status !== 'pending') return fail(res, 'Submission already reviewed.', 409);
    const sub = subRows[0];

    // Mark as rejected
    await client.query(
      `UPDATE payment_submissions
          SET status='rejected', rejection_reason=$1, reviewed_at=NOW(), reviewed_by=$2, updated_at=NOW()
        WHERE id=$3`,
      [reason || null, req.user.id, req.params.id]
    );

    // Send warning notification to tenant
    const msg = reason
      ? `Your payment submission of KSH ${Number(sub.amount_paid).toLocaleString()} could not be confirmed. Reason: ${reason}. Please verify your payment and resubmit.`
      : `Your payment submission of KSH ${Number(sub.amount_paid).toLocaleString()} could not be confirmed. Please verify your payment details and resubmit.`;

    await client.query(
      `INSERT INTO notifications
         (property_id, sent_by, sender_name, recipient_id, title, message)
       VALUES ($1,$2,$3,
         (SELECT user_id FROM tenants WHERE id=$4),
         'Payment Not Confirmed ⚠',
         $5)`,
      [sub.property_id, req.user.id, req.user.full_name || 'Landlord', sub.tenant_id, msg]
    );

    await client.query('COMMIT');
    return ok(res, null, 'Payment submission rejected. Tenant has been notified.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('reject payment:', err);
    return fail(res, 'Failed to reject submission.', 500);
  } finally {
    client.release();
  }
};

// ── POST /api/payments  (landlord direct - cash walk-in) ─────
const create = async (req, res) => {
  const { invoice_id, payment_method, amount_paid, mpesa_code, bank_reference, notes } = req.body;
  if (!invoice_id || !payment_method || !amount_paid)
    return fail(res, 'invoice_id, payment_method, and amount_paid are required.', 400);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: invRows } = await client.query(
      `SELECT id, total_amount, status, tenant_id, property_id FROM invoices WHERE id=$1`,
      [invoice_id]
    );
    if (!invRows.length)              return fail(res, 'Invoice not found.', 404);
    if (invRows[0].status === 'paid') return fail(res, 'Invoice already fully paid.', 409);
    const inv  = invRows[0];
    const paid = parseFloat(amount_paid);

    const { rows: payRows } = await client.query(
      `INSERT INTO payments
         (invoice_id, tenant_id, property_id, payment_method, amount_paid,
          mpesa_code, bank_reference, notes, received_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [invoice_id, inv.tenant_id, inv.property_id,
       payment_method, paid,
       mpesa_code || null, bank_reference || null, notes || null,
       req.user.id]
    );

    const { rows: sumRows } = await client.query(
      `SELECT COALESCE(SUM(amount_paid),0) AS total_paid FROM payments WHERE invoice_id=$1`,
      [invoice_id]
    );
    const totalPaid = parseFloat(sumRows[0].total_paid);
    const newStatus = totalPaid >= parseFloat(inv.total_amount) ? 'paid'
                    : totalPaid  > 0                             ? 'partial' : 'pending';

    await client.query(`UPDATE invoices SET status=$1, updated_at=NOW() WHERE id=$2`, [newStatus, invoice_id]);
    await client.query('COMMIT');
    return ok(res, payRows[0], 'Payment recorded.', 201);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('payment create:', err);
    return fail(res, 'Failed to record payment.', 500);
  } finally {
    client.release();
  }
};

module.exports = { list, myPayments, listSubmissions, mySubmissions, submit, confirm, reject, create };