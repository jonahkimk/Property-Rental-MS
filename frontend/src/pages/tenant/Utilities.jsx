import { useState, useEffect } from 'react';
import Sidebar from '../../components/common/Sidebar';
import TopBar from '../../components/common/TopBar';
import EmptyState from '../../components/common/EmptyState';
import api from '../../api/axios';
import { formatKES, formatMonth, apiError } from '../../utils/helpers';
import { Droplets, Zap, Trash2, Loader2, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Legend, CartesianGrid,
} from 'recharts';
import toast from 'react-hot-toast';

const TABS = [
  { key: 'water',       label: 'Water',       Icon: Droplets, color: '#0ea5e9', bg: 'bg-sky-50 dark:bg-sky-900/20',     text: 'text-sky-600 dark:text-sky-400',     border: 'border-sky-400'     },
  { key: 'electricity', label: 'Electricity', Icon: Zap,      color: '#f59e0b', bg: 'bg-amber-50 dark:bg-amber-900/20', text: 'text-amber-600 dark:text-amber-400', border: 'border-amber-400' },
  { key: 'garbage',     label: 'Garbage',     Icon: Trash2,   color: '#10b981', bg: 'bg-emerald-50 dark:bg-emerald-900/20', text: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-400' },
];

const fmt = (n) => Number(n || 0).toLocaleString();

export default function TenantUtilities() {
  const [data,    setData]    = useState({});
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState('water');

  useEffect(() => {
    api.get('/utilities/my-readings')
      .then(r => setData(r.data.data || {}))
      .catch(e => toast.error(apiError(e)))
      .finally(() => setLoading(false));
  }, []);

  const tabMeta    = TABS.find(t => t.key === tab);
  const typeData   = data[tab] || { readings: [], avg_units: 0, avg_bill: 0, count: 0 };
  const rows       = typeData.readings || [];
  const latest     = rows[0];
  const prev       = rows[1];
  const isGarbage  = tab === 'garbage';

  // Trend vs previous month
  const trendUnits = latest && prev && !isGarbage
    ? Number(latest.consumption_units) - Number(prev.consumption_units)
    : null;
  const trendBill  = latest && prev
    ? Number(latest.total_bill) - Number(prev.total_bill)
    : null;

  // Chart — last 6 months ascending
  const chartData = [...rows].reverse().slice(-6).map(r => ({
    month: formatMonth(r.billing_month).replace(' ', '\n'),
    Units: isGarbage ? undefined : Number(r.consumption_units),
    Bill:  Number(r.total_bill),
  }));

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 shadow-lg text-xs">
        <p className="font-semibold text-slate-700 dark:text-slate-300 mb-1">{label?.replace('\n', ' ')}</p>
        {payload.map(p => (
          <p key={p.dataKey} style={{ color: p.color }}>
            {p.dataKey === 'Bill' ? formatKES(p.value) : `${fmt(p.value)} units`}
          </p>
        ))}
      </div>
    );
  };

  return (
    <div className="page-wrapper">
      <Sidebar />
      <div className="page-content">
        <TopBar title="Utilities" subtitle="Your usage history and billing breakdown" />
        <div className="page-inner space-y-6">

          {/* Tabs */}
          <div className="flex gap-2 flex-wrap">
            {TABS.map(({ key, label, Icon, bg, text, border }) => (
              <button key={key} onClick={() => setTab(key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold
                            capitalize transition-all border
                            ${tab === key
                              ? `${bg} ${text} ${border}`
                              : 'bg-white dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
                            }`}>
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="animate-spin text-brand-500" size={32} />
            </div>
          ) : rows.length === 0 ? (
            <EmptyState icon={tabMeta.Icon}
              title={`No ${tab} readings yet`}
              description="Your landlord hasn't entered any readings for this utility." />
          ) : (
            <>
              {/* ── Summary stat cards ─────────────────────── */}
              <div className={`grid gap-4 ${isGarbage ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-4'}`}>

                {/* Latest month bill */}
                <div className="card p-5">
                  <p className="label">This Month's Bill</p>
                  <p className={`text-2xl font-bold ${tabMeta.text}`}>
                    {formatKES(latest.total_bill)}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">{formatMonth(latest.billing_month)}</p>
                </div>

                {/* Units used (water & electricity only) */}
                {!isGarbage && (
                  <div className="card p-5">
                    <p className="label">Units Used</p>
                    <p className="text-2xl font-bold text-slate-800 dark:text-white">
                      {fmt(latest.consumption_units)}
                      <span className="text-sm font-normal text-slate-400 ml-1">units</span>
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      @ {formatKES(latest.rate_per_unit)}/unit
                    </p>
                  </div>
                )}

                {/* Average bill */}
                <div className="card p-5">
                  <p className="label">Average Bill</p>
                  <p className="text-2xl font-bold text-slate-800 dark:text-white">
                    {formatKES(typeData.avg_bill)}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Over {typeData.count} month{typeData.count !== 1 ? 's' : ''}
                  </p>
                </div>

                {/* Average units (water & electricity only) */}
                {!isGarbage && (
                  <div className="card p-5">
                    <p className="label">Average Units</p>
                    <p className="text-2xl font-bold text-slate-800 dark:text-white">
                      {fmt(typeData.avg_units)}
                      <span className="text-sm font-normal text-slate-400 ml-1">units/mo</span>
                    </p>
                    <p className="text-xs text-slate-400 mt-1">Monthly average</p>
                  </div>
                )}

                {/* Garbage: show previous month for comparison */}
                {isGarbage && prev && (
                  <div className="card p-5">
                    <p className="label">vs Previous Month</p>
                    <div className="flex items-center gap-2 mt-1">
                      {trendBill > 0
                        ? <TrendingUp  size={18} className="text-red-500 shrink-0" />
                        : trendBill < 0
                          ? <TrendingDown size={18} className="text-emerald-500 shrink-0" />
                          : <Minus size={18} className="text-slate-400 shrink-0" />
                      }
                      <p className={`text-xl font-bold ${trendBill > 0 ? 'text-red-500' : trendBill < 0 ? 'text-emerald-500' : 'text-slate-400'}`}>
                        {trendBill > 0 ? '+' : ''}{formatKES(trendBill)}
                      </p>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{formatMonth(prev.billing_month)}</p>
                  </div>
                )}
              </div>

              {/* ── Trend badge (water & electricity) ──────── */}
              {!isGarbage && prev && (
                <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm
                  ${trendUnits > 0
                    ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
                    : trendUnits < 0
                      ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
                      : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500'
                  }`}>
                  {trendUnits > 0
                    ? <TrendingUp size={16} className="shrink-0" />
                    : trendUnits < 0
                      ? <TrendingDown size={16} className="shrink-0" />
                      : <Minus size={16} className="shrink-0" />
                  }
                  <span>
                    {trendUnits === 0
                      ? 'Usage unchanged from last month.'
                      : <>
                          Your usage is <strong>{Math.abs(trendUnits)} units {trendUnits > 0 ? 'higher' : 'lower'}</strong> than
                          last month ({formatMonth(prev.billing_month)}).
                          {trendBill !== null && <> Bill {trendBill > 0 ? 'increased' : 'decreased'} by <strong>{formatKES(Math.abs(trendBill))}</strong>.</>}
                        </>
                    }
                  </span>
                </div>
              )}

              {/* ── Line chart ─────────────────────────────── */}
              {chartData.length > 1 && (
                <div className="card p-5">
                  <h2 className="font-semibold text-slate-800 dark:text-white mb-1 capitalize">
                    {tabMeta.label} — Last 6 Months Trend
                  </h2>
                  <p className="text-xs text-slate-400 mb-4">
                    {isGarbage ? 'Charge amount over time' : 'Units consumed and billed amount over time'}
                  </p>
                  <ResponsiveContainer width="100%" height={230}>
                    <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis yAxisId="bill"  orientation="right" tick={{ fontSize: 11 }}
                        tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                      {!isGarbage && (
                        <YAxis yAxisId="units" orientation="left" tick={{ fontSize: 11 }} />
                      )}
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />
                      {!isGarbage && (
                        <Line yAxisId="units" type="monotone" dataKey="Units"
                          stroke={tabMeta.color} strokeWidth={2} dot={{ r: 4 }}
                          activeDot={{ r: 6 }} />
                      )}
                      <Line yAxisId="bill" type="monotone" dataKey="Bill"
                        stroke="#10b981" strokeWidth={2} dot={{ r: 4 }}
                        activeDot={{ r: 6 }} strokeDasharray={isGarbage ? '' : '5 3'} />
                    </LineChart>
                  </ResponsiveContainer>
                  {!isGarbage && (
                    <p className="text-xs text-slate-400 mt-2 text-center">
                      Left axis = units &nbsp;|&nbsp; Right axis = bill amount
                    </p>
                  )}
                </div>
              )}

              {/* ── History table ───────────────────────────── */}
              <div className="card p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-slate-800 dark:text-white capitalize">
                    {tabMeta.label} History
                  </h2>
                  <span className="text-xs text-slate-400">{rows.length} record{rows.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="table-wrap">
                  <table className="table-base">
                    <thead>
                      <tr>
                        <th className="th">Month</th>
                        {!isGarbage && <th className="th">Opening</th>}
                        {!isGarbage && <th className="th">Closing</th>}
                        {!isGarbage && <th className="th">Units Used</th>}
                        <th className="th">Rate/Unit</th>
                        <th className="th">Bill</th>
                        {!isGarbage && (
                          <th className="th">vs Avg</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(r => {
                        const units   = Number(r.consumption_units || 0);
                        const diff    = isGarbage ? null : +(units - typeData.avg_units).toFixed(2);
                        const abovAvg = diff > 0;
                        return (
                          <tr key={r.id} className="tr-hover">
                            <td className="td font-medium">{formatMonth(r.billing_month)}</td>
                            {!isGarbage && <td className="td font-mono text-slate-500">{fmt(r.reading_start)}</td>}
                            {!isGarbage && <td className="td font-mono text-slate-500">{fmt(r.reading_end)}</td>}
                            {!isGarbage && (
                              <td className="td font-semibold">{fmt(units)} <span className="text-xs text-slate-400">units</span></td>
                            )}
                            <td className="td text-slate-500">{formatKES(r.rate_per_unit)}</td>
                            <td className={`td font-semibold ${tabMeta.text}`}>{formatKES(r.total_bill)}</td>
                            {!isGarbage && (
                              <td className="td">
                                {diff === null ? '—' : (
                                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full
                                    ${abovAvg
                                      ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                      : diff < 0
                                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                        : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                                    }`}>
                                    {diff > 0 ? '+' : ''}{diff}
                                  </span>
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>

                    {/* Averages footer row */}
                    <tfoot>
                      <tr className="border-t-2 border-slate-200 dark:border-slate-600">
                        <td className="td font-semibold text-slate-600 dark:text-slate-400">Average</td>
                        {!isGarbage && <td className="td">—</td>}
                        {!isGarbage && <td className="td">—</td>}
                        {!isGarbage && (
                          <td className="td font-semibold text-slate-700 dark:text-slate-300">
                            {fmt(typeData.avg_units)} <span className="text-xs text-slate-400">units</span>
                          </td>
                        )}
                        <td className="td">—</td>
                        <td className="td font-semibold text-slate-700 dark:text-slate-300">
                          {formatKES(typeData.avg_bill)}
                        </td>
                        {!isGarbage && <td className="td">—</td>}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
}