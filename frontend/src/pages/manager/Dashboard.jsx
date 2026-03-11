import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Sidebar from '../../components/common/Sidebar';
import TopBar from '../../components/common/TopBar';
import StatCard from '../../components/common/StatCard';
import EmptyState from '../../components/common/EmptyState';
import api from '../../api/axios';
import { formatKES, apiError } from '../../utils/helpers';
import {
  Building2, Users, CreditCard, TrendingUp,
  AlertCircle, BarChart3, Loader2,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, LineChart, Line,
  CartesianGrid, Legend,
} from 'recharts';
import toast from 'react-hot-toast';

export default function ManagerDashboard() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/manager/dashboard')
      .then(r => setData(r.data.data))
      .catch(e => toast.error(apiError(e)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="page-wrapper">
      <Sidebar />
      <div className="page-content flex items-center justify-center">
        <Loader2 className="animate-spin text-brand-500" size={36} />
      </div>
    </div>
  );

  const stats      = data?.portfolio_stats   || {};
  const monthly    = data?.monthly_revenue   || [];
  const properties = data?.properties        || [];

  return (
    <div className="page-wrapper">
      <Sidebar />
      <div className="page-content">
        <TopBar title="Manager Dashboard" subtitle="Portfolio-wide overview" />
        <div className="page-inner space-y-6">

          {/* Portfolio stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Total Properties" value={stats.total_properties ?? 0}  icon={Building2}   color="blue"   />
            <StatCard label="Total Units"       value={stats.total_units      ?? 0}  icon={BarChart3}   color="purple" />
            <StatCard label="Active Tenants"    value={stats.active_tenants   ?? 0}  icon={Users}       color="green"  />
            <StatCard label="Occupancy Rate"
              value={`${stats.occupancy_rate ?? 0}%`}
              icon={TrendingUp}
              color={stats.occupancy_rate >= 80 ? 'green' : stats.occupancy_rate >= 50 ? 'amber' : 'red'}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Revenue This Month"
              value={formatKES(stats.revenue_this_month ?? 0)}
              icon={CreditCard}
              color="green"
            />
            <StatCard
              label="Total Revenue Collected"
              value={formatKES(stats.total_revenue_collected ?? 0)}
              icon={CreditCard}
              color="blue"
            />
            <StatCard
              label="Outstanding Rent"
              value={formatKES(stats.outstanding ?? 0)}
              icon={AlertCircle}
              color="amber"
            />
            <StatCard
              label="Overdue Invoices"
              value={stats.overdue_invoices ?? 0}
              icon={AlertCircle}
              color="red"
            />
          </div>

          {/* Revenue chart */}
          {monthly.length > 0 && (
            <div className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-slate-800 dark:text-white">
                  Monthly Revenue — Last 12 Months
                </h2>
                <Link to="/manager/finance" className="text-xs text-brand-600 hover:underline">
                  Full report →
                </Link>
              </div>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={monthly} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }}
                    tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={v => formatKES(v)} />
                  <Legend />
                  <Line type="monotone" dataKey="collected"  stroke="#10b981" strokeWidth={2}
                    dot={{ r: 3 }} name="Collected" />
                  <Line type="monotone" dataKey="expected"   stroke="#94a3b8" strokeWidth={2}
                    strokeDasharray="4 2" dot={false} name="Expected" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Properties table */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-slate-800 dark:text-white">Properties</h2>
              <Link to="/manager/properties" className="text-xs text-brand-600 hover:underline">
                Manage →
              </Link>
            </div>
            {properties.length > 0 ? (
              <div className="table-wrap">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th className="th">Property</th>
                      <th className="th">Location</th>
                      <th className="th">Units</th>
                      <th className="th">Occupied</th>
                      <th className="th">Tenants</th>
                      <th className="th">Collected</th>
                      <th className="th">Outstanding</th>
                    </tr>
                  </thead>
                  <tbody>
                    {properties.map(p => (
                      <tr key={p.id} className="tr-hover">
                        <td className="td font-semibold">{p.name}</td>
                        <td className="td text-slate-500">{p.location || '—'}</td>
                        <td className="td">{p.total_units}</td>
                        <td className="td">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-emerald-500 rounded-full"
                                style={{ width: `${p.total_units ? (p.occupied_units / p.total_units) * 100 : 0}%` }}
                              />
                            </div>
                            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                              {p.occupied_units}/{p.total_units}
                            </span>
                          </div>
                        </td>
                        <td className="td">{p.active_tenants}</td>
                        <td className="td font-medium text-emerald-600 dark:text-emerald-400">
                          {formatKES(p.collected_this_month ?? 0)}
                        </td>
                        <td className="td font-medium text-amber-600 dark:text-amber-400">
                          {formatKES(p.outstanding ?? 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState icon={Building2} title="No properties yet"
                description="Register your first property to get started."
                action={
                  <Link to="/manager/properties" className="btn-primary">
                    <Building2 size={15} /> Add Property
                  </Link>
                }
              />
            )}
          </div>

        </div>
      </div>
    </div>
  );
}