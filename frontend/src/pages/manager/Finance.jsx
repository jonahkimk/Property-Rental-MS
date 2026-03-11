import { useState, useEffect } from 'react';
import Sidebar from '../../components/common/Sidebar';
import TopBar from '../../components/common/TopBar';
import EmptyState from '../../components/common/EmptyState';
import api from '../../api/axios';
import { formatKES, formatMonth, apiError } from '../../utils/helpers';
import { BarChart3, Loader2, TrendingUp, TrendingDown } from 'lucide-react';
import {
  XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, LineChart, Line, PieChart, Pie, Cell,
} from 'recharts';
import toast from 'react-hot-toast';

const COLORS = ['#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

export default function ManagerFinance() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [year, setYear]       = useState(new Date().getFullYear());

  const load = () => {
    setLoading(true);
    api.get(`/reports/finance?year=${year}`)
      .then(r => setData(r.data.data))
      .catch(e => toast.error(apiError(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [year]);

  const monthly    = data?.monthly_summary    || [];
  const byProperty = (data?.by_property || []).map(p => ({
    ...p,
    expected:    Number(p.expected    || 0),
    collected:   Number(p.collected   || 0),
    outstanding: Number(p.outstanding || 0),
  }));
  const totals     = data?.totals             || {};
  const projection = data?.annual_projection  ?? 0;

  const trend = monthly.length >= 2
    ? monthly[monthly.length - 1]?.collected - monthly[monthly.length - 2]?.collected
    : null;

  return (
    <div className="page-wrapper">
      <Sidebar />
      <div className="page-content">
        <TopBar title="Financial Reports" subtitle="Revenue, collections and projections" />
        <div className="page-inner space-y-6">

          {/* Year selector */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
            <label className="label mb-0">Year</label>
            <select className="input w-full sm:w-28" value={year}
              onChange={e => setYear(+e.target.value)}>
              {[2023, 2024, 2025, 2026].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="animate-spin text-brand-500" size={32} />
            </div>
          ) : (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: 'Total Collected',  val: formatKES(totals.total_collected  ?? 0), color: 'text-emerald-600 dark:text-emerald-400' },
                  { label: 'Total Expected',   val: formatKES(totals.total_expected   ?? 0), color: 'text-brand-600 dark:text-brand-400'    },
                  { label: 'Total Outstanding',val: formatKES(totals.total_outstanding ?? 0), color: 'text-amber-600 dark:text-amber-400'    },
                  { label: 'Annual Projection',val: formatKES(projection),                   color: 'text-purple-600 dark:text-purple-400'  },
                ].map(({ label, val, color }) => (
                  <div key={label} className="card p-5">
                    <p className="label">{label}</p>
                    <p className={`text-2xl font-bold mt-1 ${color}`}>{val}</p>
                    {label === 'Total Collected' && trend !== null && (
                      <div className={`flex items-center gap-1 mt-1 text-xs font-medium
                                        ${trend >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                        {trend >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                        {trend >= 0 ? '+' : ''}{formatKES(trend)} vs prev month
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Monthly line chart */}
              {monthly.length > 0 && (
                <div className="card p-5">
                  <h2 className="font-semibold text-slate-800 dark:text-white mb-4">
                    Monthly Collections vs Expected — {year}
                  </h2>
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={monthly} margin={{ left: 10, right: 10, top: 8, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                      <Tooltip formatter={v => formatKES(v)} />
                      <Legend />
                      <Line type="monotone" dataKey="collected" name="Collected" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="expected"  name="Expected"  stroke="#94a3b8" strokeWidth={2} strokeDasharray="4 2" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* Revenue by property pie */}
                {byProperty.length > 0 && (
                  <div className="card p-5">
                    <h2 className="font-semibold text-slate-800 dark:text-white mb-4">
                      Revenue by Property
                    </h2>
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie data={byProperty} dataKey="collected"
                          nameKey="property_name" cx="50%" cy="50%"
                          outerRadius={80}
                          label={({ payload, percent }) =>
                            `${payload?.property_name} ${(percent * 100).toFixed(0)}%`
                          }
                          labelLine={false}>
                          {byProperty.map((_, i) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={v => formatKES(v)} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* By-property table */}
                {byProperty.length > 0 && (
                  <div className="card p-5">
                    <h2 className="font-semibold text-slate-800 dark:text-white mb-4">
                      Per-Property Summary
                    </h2>
                    <div className="table-wrap">
                      <table className="table-base">
                        <thead>
                          <tr>
                            <th className="th">Property</th>
                            <th className="th">Expected</th>
                            <th className="th">Collected</th>
                            <th className="th">Outstanding</th>
                          </tr>
                        </thead>
                        <tbody>
                          {byProperty.map((p, i) => (
                            <tr key={p.property_id} className="tr-hover">
                              <td className="td">
                                <div className="flex items-center gap-2">
                                  <div className="w-2.5 h-2.5 rounded-full shrink-0"
                                    style={{ background: COLORS[i % COLORS.length] }} />
                                  {p.property_name}
                                </div>
                              </td>
                              <td className="td">{formatKES(p.expected)}</td>
                              <td className="td font-semibold text-emerald-600 dark:text-emerald-400">
                                {formatKES(p.collected)}
                              </td>
                              <td className="td font-semibold text-amber-600 dark:text-amber-400">
                                {formatKES(p.outstanding)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* Monthly detail table */}
              {monthly.length > 0 && (
                <div className="card p-5">
                  <h2 className="font-semibold text-slate-800 dark:text-white mb-4">
                    Monthly Breakdown — {year}
                  </h2>
                  <div className="table-wrap">
                    <table className="table-base">
                      <thead>
                        <tr>
                          <th className="th">Month</th>
                          <th className="th">Expected</th>
                          <th className="th">Collected</th>
                          <th className="th">Outstanding</th>
                          <th className="th">Collection Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {monthly.map(m => {
                          const rate = m.expected > 0
                            ? ((m.collected / m.expected) * 100).toFixed(1)
                            : 0;
                          return (
                            <tr key={m.month} className="tr-hover">
                              <td className="td font-medium">{m.month}</td>
                              <td className="td">{formatKES(m.expected)}</td>
                              <td className="td font-semibold text-emerald-600 dark:text-emerald-400">
                                {formatKES(m.collected)}
                              </td>
                              <td className="td text-amber-600 dark:text-amber-400">
                                {formatKES(m.outstanding)}
                              </td>
                              <td className="td">
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full">
                                    <div className="h-full bg-emerald-500 rounded-full"
                                      style={{ width: `${Math.min(100, rate)}%` }} />
                                  </div>
                                  <span className="text-xs font-medium">{rate}%</span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {monthly.length === 0 && byProperty.length === 0 && (
                <div className="card p-10">
                  <EmptyState icon={BarChart3} title="No financial data"
                    description={`No payment data found for ${year}.`} />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}