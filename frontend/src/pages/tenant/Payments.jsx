import { useState, useEffect } from 'react';
import Sidebar from '../../components/common/Sidebar';
import TopBar from '../../components/common/TopBar';
import Modal from '../../components/common/Modal';
import EmptyState from '../../components/common/EmptyState';
import api from '../../api/axios';
import { formatKES, formatDate, formatMonth, statusBadge, apiError } from '../../utils/helpers';
import { CreditCard, Loader2, Receipt, Clock, CheckCircle2, XCircle, Send } from 'lucide-react';
import toast from 'react-hot-toast';

const METHODS = ['mpesa', 'bank', 'cash'];

const subStatusBadge = (s) =>
  s === 'confirmed' ? 'badge-green' : s === 'rejected' ? 'badge-red' : 'badge-yellow';

export default function TenantPayments() {
  const [invoices,    setInvoices]    = useState([]);
  const [payments,    setPayments]    = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [modal,       setModal]       = useState(false);
  const [selected,    setSelected]    = useState(null);
  const [fAmount,     setFAmount]     = useState('');
  const [saving,      setSaving]      = useState(false);

  // Flat form state — no object to avoid re-render bug
  const [fMethod,  setFMethod]  = useState('mpesa');
  const [fMpesa,   setFMpesa]   = useState('');
  const [fBank,    setFBank]    = useState('');
  const [fNotes,   setFNotes]   = useState('');

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get('/invoices/my'),
      api.get('/payments/my'),
      api.get('/payments/my-submissions'),
    ]).then(([inv, pay, sub]) => {
      setInvoices(inv.data.data    || []);
      setPayments(pay.data.data    || []);
      setSubmissions(sub.data.data || []);
    }).catch(e => toast.error(apiError(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openPayModal = (invoice) => {
    setSelected(invoice);
    setFAmount(parseFloat(invoice.balance_remaining || invoice.total_amount).toFixed(2));
    setFMethod('mpesa'); setFMpesa(''); setFBank(''); setFNotes('');
    setModal(true);
  };

  const hasPendingSub = (invoiceId) =>
    submissions.some(s => s.invoice_id === invoiceId && s.status === 'pending');

  const handleSubmit = async () => {
    if (!fMethod) return;
    if (fMethod === 'mpesa' && !fMpesa.trim()) {
      toast.error('M-Pesa transaction code is required.'); return;
    }
    if (fMethod === 'bank' && !fBank.trim()) {
      toast.error('Bank reference is required.'); return;
    }
    setSaving(true);
    try {
      await api.post('/payments/submit', {
        invoice_id:     selected.id,
        payment_method: fMethod,
        amount_paid:    parseFloat(fAmount),
        mpesa_code:     fMpesa   || undefined,
        bank_reference: fBank    || undefined,
        notes:          fNotes   || undefined,
      });
      toast.success('Payment submitted! Awaiting landlord confirmation.');
      setModal(false);
      load();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const pendingCount = submissions.filter(s => s.status === 'pending').length;

  return (
    <div className="page-wrapper">
      <Sidebar />
      <div className="page-content">
        <TopBar title="Payments" subtitle="Your invoices and payment history" />
        <div className="page-inner space-y-6">

          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="animate-spin text-brand-500" size={32} />
            </div>
          ) : (
            <>
              {/* Pending submission banner */}
              {pendingCount > 0 && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl
                                bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800
                                text-amber-800 dark:text-amber-300 text-sm">
                  <Clock size={16} className="shrink-0" />
                  <span>
                    You have <strong>{pendingCount}</strong> payment{pendingCount > 1 ? 's' : ''} awaiting
                    landlord confirmation. You will be notified once reviewed.
                  </span>
                </div>
              )}

              {/* Invoices */}
              <div className="card p-5">
                <h2 className="font-semibold text-slate-800 dark:text-white mb-4">Invoices</h2>
                {invoices.length > 0 ? (
                  <div className="table-wrap">
                    <table className="table-base">
                      <thead>
                        <tr>
                          <th className="th">Month</th>
                          <th className="th">Rent</th>
                          <th className="th">Water</th>
                          <th className="th">Electricity</th>
                          <th className="th">Garbage</th>
                          <th className="th">Penalty</th>
                          <th className="th">Total</th>
                          <th className="th">Paid</th>
                          <th className="th">Balance</th>
                          <th className="th">Due</th>
                          <th className="th">Status</th>
                          <th className="th">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoices.map(inv => {
                          const pending = hasPendingSub(inv.id);
                          return (
                            <tr key={inv.id} className="tr-hover">
                              <td className="td font-medium">{formatMonth(inv.billing_month)}</td>
                              <td className="td">{formatKES(inv.rent_amount)}</td>
                              <td className="td">{formatKES(inv.water_bill)}</td>
                              <td className="td">{formatKES(inv.electricity_bill)}</td>
                              <td className="td">{formatKES(inv.garbage_bill)}</td>
                              <td className="td">{formatKES(inv.penalty_amount)}</td>
                              <td className="td font-bold">{formatKES(inv.total_amount)}</td>
                              <td className="td text-emerald-600 dark:text-emerald-400">{formatKES(inv.total_paid || 0)}</td>
                              <td className="td font-semibold text-amber-600 dark:text-amber-400">
                                {parseFloat(inv.balance_remaining || 0) > 0 ? formatKES(inv.balance_remaining) : '—'}
                              </td>
                              <td className="td">{formatDate(inv.due_date)}</td>
                              <td className="td">
                                <span className={`badge ${statusBadge(inv.status)}`}>{inv.status}</span>
                              </td>
                              <td className="td">
                                {inv.status === 'paid' ? (
                                  <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                                    <CheckCircle2 size={13} /> Paid in Full
                                  </span>
                                ) : pending ? (
                                  <span className="flex items-center gap-1 text-xs text-amber-600 font-medium">
                                    <Clock size={13} /> Awaiting confirmation
                                  </span>
                                ) : (
                                  <button onClick={() => openPayModal(inv)}
                                    className="btn-primary text-xs px-3 py-1.5">
                                    <Send size={12} /> Submit Payment
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState icon={Receipt} title="No invoices yet" />
                )}
              </div>

              {/* Payment submissions */}
              {submissions.length > 0 && (
                <div className="card p-5">
                  <h2 className="font-semibold text-slate-800 dark:text-white mb-4">
                    Payment Submissions
                  </h2>
                  <div className="table-wrap">
                    <table className="table-base">
                      <thead>
                        <tr>
                          <th className="th">Month</th>
                          <th className="th">Amount</th>
                          <th className="th">Method</th>
                          <th className="th">Reference</th>
                          <th className="th">Submitted</th>
                          <th className="th">Status</th>
                          <th className="th">Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {submissions.map(s => (
                          <tr key={s.id} className="tr-hover">
                            <td className="td">{formatMonth(s.billing_month)}</td>
                            <td className="td font-semibold">{formatKES(s.amount_paid)}</td>
                            <td className="td capitalize">{s.payment_method}</td>
                            <td className="td font-mono text-xs">
                              {s.mpesa_code || s.bank_reference || '—'}
                            </td>
                            <td className="td text-xs">{formatDate(s.submitted_at)}</td>
                            <td className="td">
                              <span className={`badge ${subStatusBadge(s.status)} flex items-center gap-1 w-fit`}>
                                {s.status === 'confirmed' && <CheckCircle2 size={11} />}
                                {s.status === 'rejected'  && <XCircle size={11} />}
                                {s.status === 'pending'   && <Clock size={11} />}
                                {s.status}
                              </span>
                            </td>
                            <td className="td text-xs text-red-500">
                              {s.rejection_reason || '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Confirmed payments */}
              <div className="card p-5">
                <h2 className="font-semibold text-slate-800 dark:text-white mb-4">Payment History</h2>
                {payments.length > 0 ? (
                  <div className="table-wrap">
                    <table className="table-base">
                      <thead>
                        <tr>
                          <th className="th">Date</th>
                          <th className="th">Amount</th>
                          <th className="th">Method</th>
                          <th className="th">Reference</th>
                          <th className="th">Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payments.map(p => (
                          <tr key={p.id} className="tr-hover">
                            <td className="td">{formatDate(p.payment_date)}</td>
                            <td className="td font-semibold text-emerald-600 dark:text-emerald-400">
                              {formatKES(p.amount_paid)}
                            </td>
                            <td className="td capitalize">{p.payment_method}</td>
                            <td className="td font-mono text-xs">
                              {p.mpesa_code || p.bank_reference || '—'}
                            </td>
                            <td className="td">{p.notes || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState icon={CreditCard} title="No confirmed payments yet"
                    description="Payments appear here once confirmed by your landlord." />
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Submit Payment Modal */}
      <Modal open={modal} onClose={() => setModal(false)}
        title={`Submit Payment — ${selected ? formatMonth(selected.billing_month) : ''}`}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setModal(false)}>Cancel</button>
            <button className="btn-primary" onClick={handleSubmit} disabled={saving}>
              {saving
                ? <><Loader2 size={15} className="animate-spin" /> Submitting…</>
                : <><Send size={15} /> Submit for Confirmation</>}
            </button>
          </>
        }>
        <div className="space-y-4">
          {/* Info box */}
          <div className="rounded-lg bg-brand-50 dark:bg-brand-900/20 border border-brand-200 dark:border-brand-800 p-3 text-sm text-brand-800 dark:text-brand-300">
            <p className="font-semibold mb-1">How this works</p>
            <p className="text-xs leading-relaxed">
              Submit your payment details below. Your landlord will verify and confirm.
              You'll receive a notification once reviewed. Your invoice status updates automatically on confirmation.
            </p>
          </div>

          <div className="rounded-lg bg-slate-50 dark:bg-slate-800 p-3 text-sm space-y-1.5">
            <div className="flex justify-between">
              <span className="text-slate-500">Invoice total:</span>
              <span className="font-semibold">{formatKES(selected?.total_amount)}</span>
            </div>
            {parseFloat(selected?.total_paid || 0) > 0 && (
              <div className="flex justify-between">
                <span className="text-slate-500">Already paid:</span>
                <span className="font-semibold text-emerald-600">{formatKES(selected?.total_paid)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-1.5">
              <span className="text-slate-700 dark:text-slate-300 font-semibold">Balance remaining:</span>
              <span className="font-bold text-amber-600">{formatKES(selected?.balance_remaining || selected?.total_amount)}</span>
            </div>
          </div>

          <div className="form-group">
            <label className="label">Amount You Are Paying (KSH) *</label>
            <input className="input font-mono text-lg" type="number" step="0.01" min="1"
              value={fAmount}
              onChange={e => setFAmount(e.target.value)}
              placeholder="Enter amount" />
            {parseFloat(fAmount) < parseFloat(selected?.balance_remaining || selected?.total_amount || 0) && parseFloat(fAmount) > 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                ⚠ This is a partial payment. The remaining balance will still be owed.
              </p>
            )}
          </div>

          <div className="form-group">
            <label className="label">Payment Method *</label>
            <select className="input" value={fMethod} onChange={e => setFMethod(e.target.value)}>
              {METHODS.map(m => (
                <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>
              ))}
            </select>
          </div>

          {fMethod === 'mpesa' && (
            <div className="form-group">
              <label className="label">M-Pesa Transaction Code *</label>
              <input className="input font-mono" placeholder="e.g. QHX4K7PLMN"
                value={fMpesa}
                onChange={e => setFMpesa(e.target.value.toUpperCase())} />
            </div>
          )}

          {fMethod === 'bank' && (
            <div className="form-group">
              <label className="label">Bank Reference / Slip Number *</label>
              <input className="input" placeholder="Bank transaction reference"
                value={fBank}
                onChange={e => setFBank(e.target.value)} />
            </div>
          )}

          {fMethod === 'cash' && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-300">
              Cash payments will be confirmed by your landlord after physical verification.
            </div>
          )}

          <div className="form-group">
            <label className="label">Notes (optional)</label>
            <input className="input" placeholder="Any additional notes"
              value={fNotes}
              onChange={e => setFNotes(e.target.value)} />
          </div>
        </div>
      </Modal>
    </div>
  );
}