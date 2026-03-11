import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Sidebar from '../../components/common/Sidebar';
import TopBar from '../../components/common/TopBar';
import StatCard from '../../components/common/StatCard';
import EmptyState from '../../components/common/EmptyState';
import api from '../../api/axios';
import { formatKES, formatDate, formatMonth, statusBadge, apiError } from '../../utils/helpers';
import {
  CreditCard, Droplets, Zap, Trash2, Ticket, Bell,
  AlertCircle, CheckCircle2, Clock, FileText,
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function TenantDashboard() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/tenant/dashboard')
      .then(r => setData(r.data.data))
      .catch(e => toast.error(apiError(e)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="page-wrapper">
      <Sidebar />
      <div className="page-content">
        <div className="flex items-center justify-center flex-1 h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
        </div>
      </div>
    </div>
  );

  const invoice        = data?.current_invoice;
  const payments       = data?.recent_payments    || [];
  const tickets        = data?.recent_tickets     || [];
  const notices        = data?.notifications      || [];
  const utilSummary    = data?.utility_summary    || { breakdown: [], total: 0 };
  const utilBreakdown  = utilSummary.breakdown    || [];
  const utilTotal      = utilSummary.total        || 0;

  return (
    <div className="page-wrapper">
      <Sidebar />
      <div className="page-content">
        <TopBar
          title="My Dashboard"
          subtitle={`Unit ${data?.unit_number || '—'} · ${data?.property_name || ''}`}
        />
        <div className="page-inner space-y-6">

          {/* Stat row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Balance Due"
              value={formatKES(invoice?.status === 'paid' ? 0 : (invoice?.balance_remaining ?? invoice?.total_amount ?? 0))}
              icon={CreditCard}
              color={invoice?.status === 'overdue' ? 'red' : invoice?.status === 'paid' ? 'green' : 'amber'}
              sub={invoice ? formatMonth(invoice.billing_month) : 'No invoice'}
            />
            <StatCard
              label="Invoice Status"
              value={invoice?.status ? invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1) : 'None'}
              icon={invoice?.status === 'paid' ? CheckCircle2 : AlertCircle}
              color={invoice?.status === 'paid' ? 'green' : invoice?.status === 'overdue' ? 'red' : 'amber'}
            />
            <StatCard
              label="Open Tickets"
              value={data?.open_tickets ?? 0}
              icon={Ticket}
              color="blue"
            />
            <StatCard
              label="Notifications"
              value={notices.length}
              icon={Bell}
              color="purple"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Current Invoice */}
            <div className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-slate-800 dark:text-white">Current Invoice</h2>
                <Link to="/tenant/payments" className="text-xs text-brand-600 hover:underline">
                  View all
                </Link>
              </div>
              {invoice ? (
                <div className="space-y-2.5">
                  {[
                    { label: 'Rent',        val: invoice.rent_amount },
                    { label: 'Water',       val: invoice.water_bill },
                    { label: 'Electricity', val: invoice.electricity_bill },
                    { label: 'Garbage',     val: invoice.garbage_bill },
                    { label: 'Penalty',     val: invoice.penalty_amount },
                  ].map(({ label, val }) => (
                    <div key={label} className="flex justify-between items-center
                                                text-sm text-slate-600 dark:text-slate-400">
                      <span>{label}</span>
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {formatKES(val)}
                      </span>
                    </div>
                  ))}
                  <div className="border-t border-slate-200 dark:border-slate-700 pt-2.5
                                  flex justify-between items-center">
                    <span className="font-semibold text-slate-800 dark:text-white text-sm">Total</span>
                    <span className="font-bold text-lg text-slate-900 dark:text-white">
                      {formatKES(invoice.total_amount)}
                    </span>
                  </div>
                  {parseFloat(invoice.total_paid || 0) > 0 && (
                    <>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-slate-500">Paid</span>
                        <span className="font-medium text-emerald-600 dark:text-emerald-400">
                          − {formatKES(invoice.total_paid)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-sm border-t border-slate-200 dark:border-slate-700 pt-1">
                        <span className="font-semibold text-slate-700 dark:text-slate-300">Balance Remaining</span>
                        <span className="font-bold text-amber-600 dark:text-amber-400">
                          {formatKES(invoice.balance_remaining)}
                        </span>
                      </div>
                    </>
                  )}
                  <div className="flex items-center justify-between pt-1">
                    <span className={`badge ${statusBadge(invoice.status)}`}>
                      {invoice.status}
                    </span>
                    <span className="text-xs text-slate-400">
                      Due {formatDate(invoice.due_date)}
                    </span>
                  </div>
                </div>
              ) : (
                <EmptyState icon={FileText} title="No invoice this month" />
              )}
            </div>

            {/* Recent Payments */}
            <div className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-slate-800 dark:text-white">Recent Payments</h2>
                <Link to="/tenant/payments" className="text-xs text-brand-600 hover:underline">
                  View all
                </Link>
              </div>
              {payments.length > 0 ? (
                <div className="space-y-2">
                  {payments.map(p => (
                    <div key={p.id} className="flex items-center justify-between
                                               py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
                      <div>
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200 capitalize">
                          {p.payment_method}
                        </p>
                        <p className="text-xs text-slate-400">{formatDate(p.payment_date)}</p>
                      </div>
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400 text-sm">
                        {formatKES(p.amount_paid)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState icon={CreditCard} title="No payments yet" />
              )}
            </div>

            {/* Utilities */}
            <div className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-slate-800 dark:text-white">Utility Charges</h2>
                <Link to="/tenant/utilities" className="text-xs text-brand-600 hover:underline">
                  View details
                </Link>
              </div>
              {utilBreakdown.length > 0 ? (
                <div className="space-y-1">
                  {utilBreakdown.map(u => {
                    const Icon = u.utility_type === 'water' ? Droplets
                               : u.utility_type === 'electricity' ? Zap : Trash2;
                    const color = u.utility_type === 'water'       ? 'text-sky-500'
                                : u.utility_type === 'electricity' ? 'text-amber-500'
                                : 'text-emerald-500';
                    return (
                      <div key={u.utility_type}
                        className="flex items-center justify-between py-2
                                   border-b border-slate-100 dark:border-slate-800 last:border-0">
                        <div className="flex items-center gap-2">
                          <Icon size={15} className={color} />
                          <div>
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-300 capitalize">
                              {u.utility_type}
                            </p>
                            <p className="text-xs text-slate-400">{formatMonth(u.billing_month)}</p>
                          </div>
                        </div>
                        <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                          {formatKES(u.total_bill)}
                        </span>
                      </div>
                    );
                  })}
                  {/* Total utilities row */}
                  <div className="flex items-center justify-between pt-3 mt-1
                                  border-t-2 border-slate-200 dark:border-slate-700">
                    <span className="text-sm font-bold text-slate-800 dark:text-white">
                      Total Utilities
                    </span>
                    <span className="text-base font-bold text-brand-600 dark:text-brand-400">
                      {formatKES(utilTotal)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 text-right">
                    Included in your invoice total
                  </p>
                </div>
              ) : (
                <EmptyState icon={Droplets} title="No utility charges yet"
                  description="Utility readings will appear here once your landlord submits them." />
              )}
            </div>

            {/* Notifications */}
            <div className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-slate-800 dark:text-white">Notices</h2>
                <span className="text-xs text-slate-400">Last 14 days</span>
              </div>
              {notices.length > 0 ? (
                <div className="space-y-2">
                  {notices.map(n => (
                    <div key={n.id} className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50
                                               border border-slate-200 dark:border-slate-700">
                      <div className="flex items-start gap-2">
                        <Bell size={14} className="text-brand-500 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                            {n.title}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {n.message}
                          </p>
                          <p className="text-xs text-slate-400 mt-1">{formatDate(n.created_at)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState icon={Bell} title="No notices" />
              )}
            </div>

          </div>

          {/* Recent Tickets */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-slate-800 dark:text-white">My Tickets</h2>
              <Link to="/tenant/tickets" className="text-xs text-brand-600 hover:underline">
                View all
              </Link>
            </div>
            {tickets.length > 0 ? (
              <div className="table-wrap">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th className="th">Subject</th>
                      <th className="th">Category</th>
                      <th className="th">Priority</th>
                      <th className="th">Status</th>
                      <th className="th">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tickets.map(t => (
                      <tr key={t.id} className="tr-hover">
                        <td className="td font-medium">{t.subject}</td>
                        <td className="td capitalize">{t.category}</td>
                        <td className="td capitalize">{t.priority}</td>
                        <td className="td">
                          <span className={`badge ${statusBadge(t.status)}`}>{t.status}</span>
                        </td>
                        <td className="td">{formatDate(t.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState icon={Ticket} title="No tickets yet"
                description="Submit a ticket if you have any issues with your unit." />
            )}
          </div>

        </div>
      </div>
    </div>
  );
}