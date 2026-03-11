import { useState, useEffect, useMemo, useRef } from 'react';
import Sidebar from '../../components/common/Sidebar';
import TopBar from '../../components/common/TopBar';
import Modal from '../../components/common/Modal';
import EmptyState from '../../components/common/EmptyState';
import api from '../../api/axios';
import {
  formatKES, formatDate, formatMonth, statusBadge, apiError, toBillingMonth,
} from '../../utils/helpers';
import { FileText, CreditCard, Plus, Loader2, RefreshCw, Printer, Filter, X, CheckCircle2, XCircle, Clock, AlertTriangle, Settings, ShieldAlert } from 'lucide-react';
import toast from 'react-hot-toast';

const METHODS     = ['mpesa', 'bank', 'cash'];
const STATUSES    = ['pending', 'paid', 'overdue', 'partial'];
const now         = new Date();

// Build month options from available data
const monthLabel  = (iso) => {
  if (!iso) return '—';
  // Parse directly from string to avoid timezone shifting
  const parts = String(iso).substring(0, 7).split('-');
  if (parts.length < 2) return '—';
  // Use local Date constructor with explicit year/month (no timezone conversion)
  return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, 1)
    .toLocaleString('default', { month: 'short', year: 'numeric' });
};

export default function LandlordBilling() {
  const [invoices,  setInvoices]  = useState([]);
  const [payments,  setPayments]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [tab,       setTab]       = useState('invoices');
  const [submissions, setSubmissions] = useState([]);
  const [rejectModal, setRejectModal] = useState(false);
  const [rejectSub,   setRejectSub]   = useState(null);
  const [rejectReason,setRejectReason]= useState('');
  const [confirming,  setConfirming]  = useState(null); // id being confirmed
  const [genModal,  setGenModal]  = useState(false);
  const [saving,    setSaving]    = useState(false);
  const printRef = useRef(null);

  // ── Filters ──────────────────────────────────────────────
  const [invFilter,  setInvFilter]  = useState({ month: '', status: '' });
  const [payFilter,  setPayFilter]  = useState({ month: '', method: '' });

  const [genForm, setGenForm] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });

  const [penaltyModal,    setPenaltyModal]    = useState(false);
  const [penaltySettings, setPenaltySettings] = useState({ penalty_enabled: false, penalty_rate: 0, penalty_type: 'flat' });
  const [penaltySaving,   setPenaltySaving]   = useState(false);
  const [runningOverdue,  setRunningOverdue]  = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([api.get('/invoices'), api.get('/payments'), api.get('/payments/submissions'), api.get('/invoices/penalty-settings')])
      .then(([inv, pay, sub, pen]) => {
        setInvoices(inv.data.data   || []);
        setPayments(pay.data.data   || []);
        setSubmissions(sub.data.data || []);
        if (pen.data.data) setPenaltySettings(pen.data.data);
      })
      .catch(e => toast.error(apiError(e)))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  // ── Unique month lists for filter dropdowns ───────────────
  // Parse date strings directly to avoid ANY timezone conversion.
  // "2026-01-01" -> "2026-01"  regardless of browser locale.
  const toMonthKey = (iso) => {
    if (!iso) return '';
    // Handles both "2026-01-01" and "2026-01-01T00:00:00.000Z"
    return String(iso).substring(0, 7);
  };

  const invMonths = useMemo(() =>
    [...new Set(invoices.map(i => toMonthKey(i.billing_month)))].sort().reverse(),
    [invoices]
  );
  const payMonths = useMemo(() =>
    [...new Set(payments.map(p => toMonthKey(p.payment_date)))].sort().reverse(),
    [payments]
  );

  // ── Filtered lists ────────────────────────────────────────
  const filteredInvoices = useMemo(() => invoices.filter(i => {
    if (invFilter.month  && toMonthKey(i.billing_month) !== invFilter.month)  return false;
    if (invFilter.status && i.status !== invFilter.status)                   return false;
    return true;
  }), [invoices, invFilter]);

  const filteredPayments = useMemo(() => payments.filter(p => {
    if (payFilter.month  && toMonthKey(p.payment_date) !== payFilter.month)   return false;
    if (payFilter.method && p.payment_method !== payFilter.method)           return false;
    return true;
  }), [payments, payFilter]);

  // ── Totals ────────────────────────────────────────────────
  const thisMonthKey = toMonthKey(new Date().toISOString());

  const invTotals = useMemo(() => ({
    total: filteredInvoices.reduce((s, i) => s + Number(i.total_amount || 0), 0),

    // Collected this month = actual payments received on invoices billing_month = current month
    collectedThisMonth: invoices
      .filter(i => toMonthKey(i.billing_month) === thisMonthKey)
      .reduce((s, i) => s + Number(i.total_paid || 0), 0),

    // Collected this period = actual payments received on invoices in current filter
    paid: filteredInvoices.reduce((s, i) => s + Number(i.total_paid || 0), 0),

    // Outstanding = sum of balance remaining (unpaid portion) on all unpaid invoices
    pending: filteredInvoices
      .filter(i => i.status !== 'paid')
      .reduce((s, i) => s + Number(i.balance_remaining || 0), 0),
  }), [filteredInvoices, invoices, thisMonthKey]);

  const payTotal = useMemo(() =>
    filteredPayments.reduce((s, p) => s + Number(p.amount_paid || 0), 0),
    [filteredPayments]
  );

  // ── Actions ───────────────────────────────────────────────
  const handleGenerate = async () => {
    setSaving(true);
    try {
      const r = await api.post('/invoices/generate', {
        billing_month: toBillingMonth(genForm.year, genForm.month),
      });
      toast.success(`${r.data.data?.count || 0} invoices generated!`);
      setGenModal(false);
      load();
    } catch (e) { toast.error(apiError(e)); }
    finally { setSaving(false); }
  };



  // ── Print — only the table inside printRef, no actions col ─
  const handlePrint = () => {
    const content = printRef.current?.innerHTML;
    if (!content) return;
    const w = window.open('', '_blank');
    w.document.write(`
      <!DOCTYPE html><html><head>
      <title>${tab === 'invoices' ? 'Invoices' : 'Payments'} Report</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: Arial, sans-serif; font-size: 12px; }
        body { padding: 24px; color: #111; }
        h2 { font-size: 16px; font-weight: 700; margin-bottom: 4px; }
        .meta { color: #555; font-size: 11px; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #f1f5f9; text-align: left; padding: 7px 10px; font-weight: 600; border-bottom: 2px solid #cbd5e1; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
        td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; vertical-align: middle; }
        tr:last-child td { border-bottom: none; }
        .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 10px; font-weight: 600; }
        .badge-green { background: #dcfce7; color: #166534; }
        .badge-yellow { background: #fef9c3; color: #854d0e; }
        .badge-red { background: #fee2e2; color: #991b1b; }
        .badge-blue { background: #dbeafe; color: #1e40af; }
        .totals { margin-top: 16px; text-align: right; font-size: 12px; color: #333; }
        .totals strong { font-size: 13px; }
        @media print { @page { margin: 1.5cm; } }
      </style>
      </head><body>
      ${content}
      </body></html>
    `);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); w.close(); }, 300);
  };

  const handleConfirm = async (subId) => {
    setConfirming(subId);
    try {
      await api.post(`/payments/submissions/${subId}/confirm`);
      toast.success('Payment confirmed! Invoice updated and tenant notified.');
      load();
    } catch (e) { toast.error(apiError(e)); }
    finally { setConfirming(null); }
  };

  const handleReject = async () => {
    if (!rejectSub) return;
    try {
      await api.post(`/payments/submissions/${rejectSub.id}/reject`, { reason: rejectReason });
      toast.success('Payment rejected. Warning sent to tenant.');
      setRejectModal(false);
      setRejectReason('');
      load();
    } catch (e) { toast.error(apiError(e)); }
  };

  const handleSavePenalty = async () => {
    setPenaltySaving(true);
    try {
      await api.post('/invoices/penalty-settings', penaltySettings);
      toast.success('Penalty settings saved.');
      setPenaltyModal(false);
    } catch (e) { toast.error(apiError(e)); }
    finally { setPenaltySaving(false); }
  };

  const handleRunOverdue = async () => {
    setRunningOverdue(true);
    try {
      const r = await api.post('/invoices/run-overdue');
      const d = r.data.data;
      toast.success(`${d.markedOverdue} invoices marked overdue, ${d.penaltiesApplied} penalties applied.`);
      load();
    } catch (e) { toast.error(apiError(e)); }
    finally { setRunningOverdue(false); }
  };

  const pendingCount = submissions.filter(s => s.status === 'pending').length;

  const activeFilters = tab === 'invoices'
    ? (invFilter.month ? 1 : 0) + (invFilter.status ? 1 : 0)
    : (payFilter.month ? 1 : 0) + (payFilter.method ? 1 : 0);

  return (
    <div className="page-wrapper">
      <Sidebar />
      <div className="page-content">
        <TopBar title="Billing" subtitle="Invoices and payment reconciliation" />
        <div className="page-inner space-y-5">

          {/* Tab + Actions */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
              {['invoices', 'payments', 'confirmations'].map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`px-4 py-1.5 rounded-md text-sm font-semibold capitalize transition-all flex items-center gap-1.5
                    ${tab === t
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
                  {t}
                  {t === 'confirmations' && pendingCount > 0 && (
                    <span className="bg-amber-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full leading-none">
                      {pendingCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button className="btn-secondary relative" onClick={handlePrint}>
                <Printer size={15} /> Print
              </button>
              <button className="btn-secondary" onClick={handleRunOverdue} disabled={runningOverdue}
                title="Check for overdue invoices and apply penalties now">
                {runningOverdue ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                {runningOverdue ? 'Checking…' : 'Check Overdue'}
              </button>
              <button className="btn-secondary" onClick={load}>
                <RefreshCw size={15} /> Refresh
              </button>
              <button className="btn-secondary" onClick={() => setPenaltyModal(true)}>
                <ShieldAlert size={15} /> Penalty Settings
              </button>
              <button className="btn-primary" onClick={() => setGenModal(true)}>
                <Plus size={15} /> Generate Invoices
              </button>
            </div>
          </div>

          {/* ── Filter Bar ─────────────────────────────────── */}
          <div className="card px-4 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">
                <Filter size={13} /> Filters
                {activeFilters > 0 && (
                  <span className="bg-brand-600 text-white rounded-full px-1.5 py-0.5 text-xs">
                    {activeFilters}
                  </span>
                )}
              </div>

              {tab === 'invoices' && (
                <>
                  <select className="input w-auto text-sm py-1.5"
                    value={invFilter.month}
                    onChange={e => setInvFilter(p => ({ ...p, month: e.target.value }))}>
                    <option value="">All Months</option>
                    {invMonths.map(m => (
                      <option key={m} value={m}>
                        {monthLabel(m + '-01')}
                      </option>
                    ))}
                  </select>
                  <select className="input w-auto text-sm py-1.5"
                    value={invFilter.status}
                    onChange={e => setInvFilter(p => ({ ...p, status: e.target.value }))}>
                    <option value="">All Statuses</option>
                    {STATUSES.map(s => (
                      <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                    ))}
                  </select>
                </>
              )}

              {tab === 'payments' && (
                <>
                  <select className="input w-auto text-sm py-1.5"
                    value={payFilter.month}
                    onChange={e => setPayFilter(p => ({ ...p, month: e.target.value }))}>
                    <option value="">All Months</option>
                    {payMonths.map(m => (
                      <option key={m} value={m}>
                        {monthLabel(m + '-01')}
                      </option>
                    ))}
                  </select>
                  <select className="input w-auto text-sm py-1.5"
                    value={payFilter.method}
                    onChange={e => setPayFilter(p => ({ ...p, method: e.target.value }))}>
                    <option value="">All Methods</option>
                    {METHODS.map(m => (
                      <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>
                    ))}
                  </select>
                </>
              )}

              {activeFilters > 0 && (
                <button className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-medium ml-auto"
                  onClick={() => tab === 'invoices'
                    ? setInvFilter({ month: '', status: '' })
                    : setPayFilter({ month: '', method: '' })}>
                  <X size={13} /> Clear filters
                </button>
              )}
            </div>

            {/* Summary row */}
            {tab === 'invoices' && filteredInvoices.length > 0 && (
              <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 text-xs text-slate-500">
                <span><strong className="text-slate-700 dark:text-slate-300">{filteredInvoices.length}</strong> invoices</span>
                <span>Total billed: <strong className="text-slate-700 dark:text-slate-300">{formatKES(invTotals.total)}</strong></span>
                {/* <span className="text-emerald-600">Collected this month: <strong>{formatKES(invTotals.collectedThisMonth)}</strong></span> */}
                <span className="text-amber-600">Outstanding: <strong>{formatKES(invTotals.pending)}</strong></span>
              </div>
            )}
            {tab === 'payments' && filteredPayments.length > 0 && (
              <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 text-xs text-slate-500">
                <span><strong className="text-slate-700 dark:text-slate-300">{filteredPayments.length}</strong> payments</span>
                <span>Total collected: <strong className="text-emerald-600">{formatKES(payTotal)}</strong></span>
              </div>
            )}
          </div>

          {/* ── Printable content ───────────────────────────── */}
          <div ref={printRef} style={{ display: 'none' }}>
            <h2>{tab === 'invoices' ? 'Invoices Report' : 'Payments Report'}</h2>
            <p className="meta">
              Generated: {new Date().toLocaleString()} &nbsp;|&nbsp;
              {tab === 'invoices'
                ? `${filteredInvoices.length} invoices${invFilter.month ? ` · ${monthLabel(invFilter.month + '-01')}` : ''}${invFilter.status ? ` · ${invFilter.status}` : ''}`
                : `${filteredPayments.length} payments${payFilter.month ? ` · ${monthLabel(payFilter.month + '-01')}` : ''}${payFilter.method ? ` · ${payFilter.method}` : ''}`
              }
            </p>

            {tab === 'invoices' ? (
              <table>
                <thead><tr>
                  <th>Tenant</th><th>Unit</th><th>Month</th>
                  <th>Rent</th><th>Water</th><th>Electricity</th>
                  <th>Garbage</th><th>Penalty</th><th>Total</th>
                  <th>Paid</th><th>Balance</th>
                  <th>Due Date</th><th>Status</th>
                </tr></thead>
                <tbody>
                  {filteredInvoices.map(inv => (
                    <tr key={inv.id}>
                      <td>{inv.tenant_name}</td>
                      <td>{inv.unit_number}</td>
                      <td>{formatMonth(inv.billing_month)}</td>
                      <td>{formatKES(inv.rent_amount)}</td>
                      <td>{formatKES(inv.water_bill)}</td>
                      <td>{formatKES(inv.electricity_bill)}</td>
                      <td>{formatKES(inv.garbage_bill)}</td>
                      <td>{formatKES(inv.penalty_amount)}</td>
                      <td><strong>{formatKES(inv.total_amount)}</strong></td>
                      <td>{formatKES(inv.total_paid || 0)}</td>
                      <td>{parseFloat(inv.balance_remaining || 0) > 0 ? formatKES(inv.balance_remaining) : '—'}</td>
                      <td>{formatDate(inv.due_date)}</td>
                      <td>
                        <span className={`badge ${
                          inv.status === 'paid'    ? 'badge-green'  :
                          inv.status === 'overdue' ? 'badge-red'    :
                          inv.status === 'partial' ? 'badge-blue'   : 'badge-yellow'
                        }`}>{inv.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table>
                <thead><tr>
                  <th>Date</th><th>Tenant</th><th>Unit</th>
                  <th>Amount</th><th>Method</th><th>Reference</th>
                  <th>Received By</th><th>Notes</th>
                </tr></thead>
                <tbody>
                  {filteredPayments.map(p => (
                    <tr key={p.id}>
                      <td>{formatDate(p.payment_date)}</td>
                      <td>{p.tenant_name}</td>
                      <td>{p.unit_number}</td>
                      <td><strong>{formatKES(p.amount_paid)}</strong></td>
                      <td style={{ textTransform: 'capitalize' }}>{p.payment_method}</td>
                      <td style={{ fontFamily: 'monospace' }}>{p.mpesa_code || p.bank_reference || '—'}</td>
                      <td>{p.received_by_name || '—'}</td>
                      <td>{p.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div className="totals">
              {tab === 'invoices'
                ? <>Collected: <strong>{formatKES(invTotals.paid)}</strong> &nbsp;|&nbsp; Outstanding: <strong>{formatKES(invTotals.pending)}</strong></>
                : <>Total Collected: <strong>{formatKES(payTotal)}</strong></>
              }
            </div>
          </div>

          {/* ── Invoices Tab ────────────────────────────────── */}
          {tab === 'invoices' && (
            <div className="card p-5">
              <h2 className="font-semibold text-slate-800 dark:text-white mb-4">
                Invoices
                {invFilter.month || invFilter.status
                  ? <span className="ml-2 text-sm text-brand-600 font-normal">
                      (filtered: {filteredInvoices.length} of {invoices.length})
                    </span>
                  : <span className="ml-2 text-sm text-slate-400 font-normal">({invoices.length})</span>
                }
              </h2>
              {loading ? (
                <div className="flex justify-center py-16"><Loader2 className="animate-spin text-brand-500" size={32} /></div>
              ) : filteredInvoices.length > 0 ? (
                <div className="table-wrap">
                  <table className="table-base">
                    <thead>
                      <tr>
                        <th className="th">Tenant</th>
                        <th className="th">Unit</th>
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
                        <th className="th no-print">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredInvoices.map(inv => (
                        <tr key={inv.id} className="tr-hover">
                          <td className="td font-medium">{inv.tenant_name}</td>
                          <td className="td">{inv.unit_number}</td>
                          <td className="td">{formatMonth(inv.billing_month)}</td>
                          <td className="td">{formatKES(inv.rent_amount)}</td>
                          <td className="td">{formatKES(inv.water_bill)}</td>
                          <td className="td">{formatKES(inv.electricity_bill)}</td>
                          <td className="td">{formatKES(inv.garbage_bill)}</td>
                          <td className="td">{formatKES(inv.penalty_amount)}</td>
                          <td className="td font-bold">{formatKES(inv.total_amount)}</td>
                          <td className="td text-emerald-600 dark:text-emerald-400">{formatKES(inv.total_paid || 0)}</td>
                          <td className="td font-semibold">
                            {parseFloat(inv.balance_remaining || 0) > 0
                              ? <span className="text-amber-600 dark:text-amber-400">{formatKES(inv.balance_remaining)}</span>
                              : <span className="text-slate-400">—</span>}
                          </td>
                          <td className="td">{formatDate(inv.due_date)}</td>
                          <td className="td">
                            <span className={`badge ${statusBadge(inv.status)}`}>{inv.status}</span>
                          </td>
                          <td className="td no-print">
                            {inv.status === 'paid' ? (
                              <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                                <CheckCircle2 size={13} /> Paid
                              </span>
                            ) : submissions.some(s => s.invoice_id === inv.id && s.status === 'pending') ? (
                              <button className="flex items-center gap-1 text-xs text-amber-600 font-medium
                                                 hover:underline"
                                onClick={() => setTab('confirmations')}>
                                <Clock size={13} /> Pending confirmation
                              </button>
                            ) : (
                              <span className="text-xs text-slate-400">No submission</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState icon={FileText} title="No invoices match filters"
                  description={invoices.length === 0 ? 'Generate invoices for the current month.' : 'Try adjusting the filters.'}
                  action={invoices.length === 0
                    ? <button className="btn-primary" onClick={() => setGenModal(true)}><Plus size={15} /> Generate Invoices</button>
                    : <button className="btn-secondary" onClick={() => setInvFilter({ month: '', status: '' })}><X size={13}/> Clear Filters</button>
                  } />
              )}
            </div>
          )}

          {/* ── Payments Tab ────────────────────────────────── */}
          {tab === 'payments' && (
            <div className="card p-5">
              <h2 className="font-semibold text-slate-800 dark:text-white mb-4">
                Payments
                {payFilter.month || payFilter.method
                  ? <span className="ml-2 text-sm text-brand-600 font-normal">
                      (filtered: {filteredPayments.length} of {payments.length})
                    </span>
                  : <span className="ml-2 text-sm text-slate-400 font-normal">({payments.length})</span>
                }
              </h2>
              {loading ? (
                <div className="flex justify-center py-16"><Loader2 className="animate-spin text-brand-500" size={32} /></div>
              ) : filteredPayments.length > 0 ? (
                <div className="table-wrap">
                  <table className="table-base">
                    <thead>
                      <tr>
                        <th className="th">Date</th>
                        <th className="th">Tenant</th>
                        <th className="th">Unit</th>
                        <th className="th">Amount</th>
                        <th className="th">Method</th>
                        <th className="th">Reference</th>
                        <th className="th">Received By</th>
                        <th className="th">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPayments.map(p => (
                        <tr key={p.id} className="tr-hover">
                          <td className="td">{formatDate(p.payment_date)}</td>
                          <td className="td font-medium">{p.tenant_name}</td>
                          <td className="td">{p.unit_number}</td>
                          <td className="td font-bold text-emerald-600 dark:text-emerald-400">
                            {formatKES(p.amount_paid)}
                          </td>
                          <td className="td capitalize">{p.payment_method}</td>
                          <td className="td font-mono text-xs">
                            {p.mpesa_code || p.bank_reference || '—'}
                          </td>
                          <td className="td">{p.received_by_name || '—'}</td>
                          <td className="td">{p.notes || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState icon={CreditCard} title="No payments match filters"
                  description={payments.length === 0 ? 'No payments recorded yet.' : 'Try adjusting the filters.'}
                  action={payFilter.month || payFilter.method
                    ? <button className="btn-secondary" onClick={() => setPayFilter({ month: '', method: '' })}><X size={13}/> Clear Filters</button>
                    : null
                  } />
              )}
            </div>
          )}
          {/* ── Confirmations Tab ─────────────────────────── */}
          {tab === 'confirmations' && (
            <div className="card p-5">
              <h2 className="font-semibold text-slate-800 dark:text-white mb-1">
                Payment Confirmations
                <span className="ml-2 text-sm font-normal text-slate-400">
                  ({submissions.length} total, {pendingCount} pending)
                </span>
              </h2>
              <p className="text-xs text-slate-400 mb-4">
                Review tenant payment submissions. Confirm to record the payment or reject to notify the tenant.
              </p>

              {submissions.length > 0 ? (
                <div className="table-wrap">
                  <table className="table-base">
                    <thead>
                      <tr>
                        <th className="th">Tenant</th>
                        <th className="th">Unit</th>
                        <th className="th">Month</th>
                        <th className="th">Amount</th>
                        <th className="th">Method</th>
                        <th className="th">Reference</th>
                        <th className="th">Submitted</th>
                        <th className="th">Status</th>
                        <th className="th">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {submissions.map(s => (
                        <tr key={s.id} className={`tr-hover ${s.status !== 'pending' ? 'opacity-60' : ''}`}>
                          <td className="td font-medium">{s.tenant_name}</td>
                          <td className="td">{s.unit_number}</td>
                          <td className="td">{formatMonth(s.billing_month)}</td>
                          <td className="td font-bold">{formatKES(s.amount_paid)}</td>
                          <td className="td capitalize">{s.payment_method}</td>
                          <td className="td font-mono text-xs">
                            {s.mpesa_code || s.bank_reference || (s.payment_method === 'cash' ? 'Cash' : '—')}
                          </td>
                          <td className="td text-xs">{formatDate(s.submitted_at)}</td>
                          <td className="td">
                            {s.status === 'pending' && (
                              <span className="badge badge-yellow flex items-center gap-1 w-fit">
                                <Clock size={11} /> Pending
                              </span>
                            )}
                            {s.status === 'confirmed' && (
                              <span className="badge badge-green flex items-center gap-1 w-fit">
                                <CheckCircle2 size={11} /> Confirmed
                              </span>
                            )}
                            {s.status === 'rejected' && (
                              <span className="badge badge-red flex items-center gap-1 w-fit">
                                <XCircle size={11} /> Rejected
                              </span>
                            )}
                          </td>
                          <td className="td">
                            {s.status === 'pending' && (
                              <div className="flex items-center gap-1.5">
                                <button
                                  className="btn-success text-xs px-2.5 py-1"
                                  onClick={() => handleConfirm(s.id)}
                                  disabled={confirming === s.id}>
                                  {confirming === s.id
                                    ? <Loader2 size={12} className="animate-spin" />
                                    : <><CheckCircle2 size={12} /> Confirm</>}
                                </button>
                                <button
                                  className="btn-ghost text-xs px-2.5 py-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                                  onClick={() => { setRejectSub(s); setRejectReason(''); setRejectModal(true); }}>
                                  <XCircle size={12} /> Reject
                                </button>
                              </div>
                            )}
                            {s.status === 'rejected' && s.rejection_reason && (
                              <p className="text-xs text-red-500 italic max-w-[140px] truncate" title={s.rejection_reason}>
                                {s.rejection_reason}
                              </p>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState icon={CreditCard} title="No payment submissions yet"
                  description="Tenant payment submissions will appear here for your review." />
              )}
            </div>
          )}

        </div>
      </div>

      {/* Reject Reason Modal */}
      <Modal open={rejectModal} onClose={() => setRejectModal(false)}
        title="Reject Payment Submission"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setRejectModal(false)}>Cancel</button>
            <button className="btn-danger text-xs px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold flex items-center gap-1.5"
              onClick={handleReject}>
              <XCircle size={14} /> Reject & Notify Tenant
            </button>
          </>
        }>
        {rejectSub && (
          <div className="space-y-4">
            <div className="rounded-lg bg-slate-50 dark:bg-slate-800 p-3 text-sm space-y-1">
              <p className="font-semibold text-slate-800 dark:text-white">
                {rejectSub.tenant_name} — Unit {rejectSub.unit_number}
              </p>
              <p className="text-slate-500">
                {formatKES(rejectSub.amount_paid)} via <span className="capitalize">{rejectSub.payment_method}</span>
                {(rejectSub.mpesa_code || rejectSub.bank_reference) && (
                  <span className="font-mono ml-1">({rejectSub.mpesa_code || rejectSub.bank_reference})</span>
                )}
              </p>
            </div>
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20
                            border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              A warning notification will be sent to the tenant asking them to verify and resubmit.
            </div>
            <div className="form-group">
              <label className="label">Reason for rejection (optional)</label>
              <textarea className="input min-h-[80px] resize-none text-sm"
                placeholder="e.g. M-Pesa code not found, amount mismatch…"
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)} />
            </div>
          </div>
        )}
      </Modal>

      {/* Generate Invoices Modal */}
      <Modal open={genModal} onClose={() => setGenModal(false)} title="Generate Monthly Invoices"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setGenModal(false)}>Cancel</button>
            <button className="btn-primary" onClick={handleGenerate} disabled={saving}>
              {saving ? <><Loader2 size={15} className="animate-spin" /> Generating…</> : 'Generate'}
            </button>
          </>
        }>
        <div className="space-y-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Generates invoices for all active tenants combining rent + utility bills.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="form-group">
              <label className="label">Year</label>
              <input className="input" type="number" value={genForm.year}
                onChange={e => setGenForm(p => ({ ...p, year: +e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="label">Month</label>
              <select className="input" value={genForm.month}
                onChange={e => setGenForm(p => ({ ...p, month: +e.target.value }))}>
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i+1} value={i+1}>
                    {new Date(2000, i).toLocaleString('default', { month: 'long' })}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </Modal>

      {/* Penalty Settings Modal */}
      <Modal open={penaltyModal} onClose={() => setPenaltyModal(false)}
        title="Late Payment Penalty Settings"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setPenaltyModal(false)}>Cancel</button>
            <button className="btn-primary" onClick={handleSavePenalty} disabled={penaltySaving}>
              {penaltySaving ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : 'Save Settings'}
            </button>
          </>
        }>
        <div className="space-y-5">

          {/* Enable toggle */}
          <div className="flex items-center justify-between p-3 rounded-xl
                          bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-white">Enable Late Penalty</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Automatically charge tenants when invoice is past due date
              </p>
            </div>
            <button
              onClick={() => setPenaltySettings(p => ({ ...p, penalty_enabled: !p.penalty_enabled }))}
              className={`relative w-11 h-6 rounded-full transition-colors
                ${penaltySettings.penalty_enabled ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-600'}`}>
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all
                ${penaltySettings.penalty_enabled ? 'left-5' : 'left-0.5'}`} />
            </button>
          </div>

          {penaltySettings.penalty_enabled && (
            <>
              {/* Penalty type */}
              <div className="form-group">
                <label className="label">Penalty Type</label>
                <div className="flex gap-2">
                  {[
                    { v: 'flat',       l: 'Flat Amount',  desc: 'Fixed KSH charge' },
                    { v: 'percentage', l: 'Percentage',   desc: '% of rent amount' },
                  ].map(opt => (
                    <button key={opt.v} type="button"
                      onClick={() => setPenaltySettings(p => ({ ...p, penalty_type: opt.v }))}
                      className={`flex-1 py-2.5 px-3 rounded-xl text-sm font-medium border transition-colors text-left
                        ${penaltySettings.penalty_type === opt.v
                          ? 'bg-brand-600 text-white border-brand-600'
                          : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600'}`}>
                      <p className="font-semibold">{opt.l}</p>
                      <p className={`text-xs mt-0.5 ${penaltySettings.penalty_type === opt.v ? 'text-brand-200' : 'text-slate-400'}`}>
                        {opt.desc}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Penalty rate */}
              <div className="form-group">
                <label className="label">
                  {penaltySettings.penalty_type === 'percentage' ? 'Penalty Rate (%)' : 'Penalty Amount (KSH)'}
                </label>
                <div className="relative">
                  <input className="input pr-16"
                    type="number" step="0.01" min="0"
                    placeholder={penaltySettings.penalty_type === 'percentage' ? 'e.g. 10' : 'e.g. 500'}
                    value={penaltySettings.penalty_rate}
                    onChange={e => setPenaltySettings(p => ({ ...p, penalty_rate: e.target.value }))} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-medium">
                    {penaltySettings.penalty_type === 'percentage' ? '% of rent' : 'KSH'}
                  </span>
                </div>
              </div>

              {/* Preview */}
              {parseFloat(penaltySettings.penalty_rate) > 0 && (
                <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200
                                dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-300">
                  <p className="font-semibold mb-1 flex items-center gap-1.5">
                    <AlertTriangle size={12} /> How it works
                  </p>
                  <p className="leading-relaxed">
                    {penaltySettings.penalty_type === 'percentage'
                      ? `When an invoice passes its due date, ${penaltySettings.penalty_rate}% of the tenant's rent is added as a penalty. E.g. for KSH 10,000 rent → KSH ${(10000 * parseFloat(penaltySettings.penalty_rate) / 100).toLocaleString()} penalty.`
                      : `A flat KSH ${parseFloat(penaltySettings.penalty_rate).toLocaleString()} penalty is added to any invoice that passes its due date.`
                    }
                    {' '}Penalties are applied once per invoice. The overdue check runs automatically every day at server startup.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </Modal>

    </div>
  );
}