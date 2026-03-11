import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Sidebar from '../../components/common/Sidebar';
import TopBar from '../../components/common/TopBar';
import StatCard from '../../components/common/StatCard';
import EmptyState from '../../components/common/EmptyState';
import api from '../../api/axios';
import { formatKES, formatDate, statusBadge, apiError } from '../../utils/helpers';
import {
  Users, CreditCard, AlertCircle, CheckCircle2,
  Ticket, Wrench, FileText, TrendingUp,
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function LandlordDashboard() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/landlord/dashboard')
      .then(r => setData(r.data.data))
      .catch(e => toast.error(apiError(e)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="page-wrapper">
      <Sidebar />
      <div className="page-content flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    </div>
  );

  const stats    = data?.stats    || {};
  const invoices = data?.recent_invoices || [];
  const tickets  = data?.recent_tickets  || [];
  const payments = data?.recent_payments || [];

  return (
    <div className="page-wrapper">
      <Sidebar />
      <div className="page-content">
        <TopBar
          title="Landlord Dashboard"
          subtitle={data?.property_name || 'Property Overview'}
        />
        <div className="page-inner space-y-6">

          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Total Tenants"    value={stats.total_tenants    ?? 0} icon={Users}         color="blue"   />
            <StatCard label="Occupied Units"   value={stats.occupied_units   ?? 0} icon={CheckCircle2}  color="green"  />
            <StatCard label="Overdue Invoices" value={stats.overdue_invoices ?? 0} icon={AlertCircle}   color="red"    />
            <StatCard label="Open Tickets"     value={stats.open_tickets     ?? 0} icon={Ticket}        color="amber"  />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard
              label="Collected This Month"
              value={formatKES(stats.collected_this_month ?? 0)}
              icon={CreditCard}
              color="green"
            />
            <StatCard
              label="Outstanding"
              value={formatKES(stats.outstanding ?? 0)}
              icon={TrendingUp}
              color="amber"
            />
            <StatCard
              label="Scheduled Maintenance"
              value={stats.scheduled_maintenance ?? 0}
              icon={Wrench}
              color="purple"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Recent Invoices */}
            <div className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-slate-800 dark:text-white">Recent Invoices</h2>
                <Link to="/landlord/billing" className="text-xs text-brand-600 hover:underline">
                  View all
                </Link>
              </div>
              {invoices.length > 0 ? (
                <div className="table-wrap">
                  <table className="table-base">
                    <thead>
                      <tr>
                        <th className="th">Tenant</th>
                        <th className="th">Unit</th>
                        <th className="th">Total</th>
                        <th className="th">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map(inv => (
                        <tr key={inv.id} className="tr-hover">
                          <td className="td font-medium">{inv.tenant_name}</td>
                          <td className="td">{inv.unit_number}</td>
                          <td className="td font-semibold">{formatKES(inv.total_amount)}</td>
                          <td className="td">
                            <span className={`badge ${statusBadge(inv.status)}`}>{inv.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState icon={FileText} title="No invoices yet" />
              )}
            </div>

            {/* Recent Payments */}
            <div className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-slate-800 dark:text-white">Recent Payments</h2>
                <Link to="/landlord/billing" className="text-xs text-brand-600 hover:underline">
                  View all
                </Link>
              </div>
              {payments.length > 0 ? (
                <div className="space-y-2">
                  {payments.map(p => (
                    <div key={p.id}
                      className="flex items-center justify-between py-2 border-b
                                 border-slate-100 dark:border-slate-800 last:border-0">
                      <div>
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                          {p.tenant_name}
                          <span className="ml-1.5 text-xs text-slate-400">· Unit {p.unit_number}</span>
                        </p>
                        <p className="text-xs text-slate-400 capitalize">
                          {p.payment_method} · {formatDate(p.payment_date)}
                        </p>
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
          </div>

          {/* Recent Tickets */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-slate-800 dark:text-white">Recent Tickets</h2>
              <Link to="/landlord/requests" className="text-xs text-brand-600 hover:underline">
                View all
              </Link>
            </div>
            {tickets.length > 0 ? (
              <div className="table-wrap">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th className="th">Tenant</th>
                      <th className="th">Unit</th>
                      <th className="th">Subject</th>
                      <th className="th">Priority</th>
                      <th className="th">Status</th>
                      <th className="th">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tickets.map(t => (
                      <tr key={t.id} className="tr-hover">
                        <td className="td font-medium">{t.tenant_name}</td>
                        <td className="td">{t.unit_number}</td>
                        <td className="td max-w-[180px] truncate">{t.subject}</td>
                        <td className="td">
                          <span className={`badge ${
                            t.priority === 'urgent' ? 'badge-red' :
                            t.priority === 'high'   ? 'badge-yellow' : 'badge-gray'
                          }`}>{t.priority}</span>
                        </td>
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
              <EmptyState icon={Ticket} title="No tickets yet" />
            )}
          </div>

        </div>
      </div>
    </div>
  );
}