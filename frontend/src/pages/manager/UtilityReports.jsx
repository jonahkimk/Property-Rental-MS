import { useState, useEffect, useRef } from 'react';
import Sidebar from '../../components/common/Sidebar';
import TopBar from '../../components/common/TopBar';
import EmptyState from '../../components/common/EmptyState';
import api from '../../api/axios';
import { formatKES, formatMonth, apiError } from '../../utils/helpers';
import { Droplets, Zap, Trash2, Loader2, Printer, FileDown } from 'lucide-react';
import {
  XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend,
  LineChart, Line,
} from 'recharts';
import toast from 'react-hot-toast';

const TYPES = [
  { key: 'water',       label: 'Water',       icon: Droplets, color: '#0ea5e9' },
  { key: 'electricity', label: 'Electricity', icon: Zap,      color: '#f59e0b' },
  { key: 'garbage',     label: 'Garbage',     icon: Trash2,   color: '#10b981' },
];
const now = new Date();

export default function ManagerUtilityReports() {
  const [report, setReport]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState('water');
  const [propId, setPropId]   = useState('');
  const [properties, setProperties] = useState([]);
  const printRef = useRef(null);
  const [period, setPeriod]   = useState({
    year: now.getFullYear(), month: now.getMonth() + 1,
  });

  const billingMonth = `${period.year}-${String(period.month).padStart(2, '0')}-01`;

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams({
      utility_type:  tab,
      billing_month: billingMonth,
      ...(propId && { property_id: propId }),
    });
    api.get(`/reports/utility?${params}`)
      .then(r => setReport(r.data.data))
      .catch(e => toast.error(apiError(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    api.get('/properties')
      .then(r => setProperties(r.data.data || []))
      .catch(() => {});
  }, []);

  useEffect(() => { load(); }, [tab, billingMonth, propId]);

  const rows      = report?.readings    || [];
  const summary   = report?.summary     || {};
  const chartData = (report?.trend || []).map(r => ({
    ...r,
    consumption: Number(r.consumption || 0),
    bill:        Number(r.bill        || 0),
  }));

  const handlePrint = () => {
    const content = printRef.current?.innerHTML;
    if (!content) return;

    const typeLabel = TypeMeta?.label || tab;
    const propLabel = propId
      ? (properties.find(p => p.id === propId)?.name || 'Selected Property')
      : 'All Properties';

    const w = window.open('', '_blank');
    w.document.write(`
      <!DOCTYPE html><html><head>
      <title>${typeLabel} Utility Report</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: Arial, sans-serif; }
        body { padding: 24px; color: #111; }
        h2 { font-size: 16px; font-weight: 700; margin-bottom: 4px; text-transform: capitalize; }
        .meta { color: #555; font-size: 11px; margin-bottom: 14px; }
        .card { border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; }
        .grid { display: grid; gap: 10px; }
        .grid-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #64748b; }
        .value { font-size: 18px; font-weight: 700; margin-top: 6px; }
        .section { margin-top: 14px; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th { background: #f1f5f9; text-align: left; padding: 7px 10px; font-weight: 700; border-bottom: 2px solid #cbd5e1; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
        td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; vertical-align: middle; font-size: 12px; }
        tfoot td { font-weight: 700; background: #f8fafc; }
        .amount { font-weight: 700; }
        .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
        .table-wrap { overflow: visible !important; }
        @media print {
          @page { margin: 1.5cm; }
          .no-print { display: none !important; }
        }
      </style>
      </head><body>
        <h2>${typeLabel} Report — ${formatMonth(billingMonth)}</h2>
        <p class="meta">
          Property: ${propLabel} &nbsp;|&nbsp; Generated: ${new Date().toLocaleString()}
        </p>
        ${content}
      </body></html>
    `);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); w.close(); }, 300);
  };

  const TypeMeta = TYPES.find(t => t.key === tab);

  return (
    <div className="page-wrapper">
      <Sidebar />
      <div className="page-content">
        <TopBar title="Utility Reports" subtitle="Monthly usage reports across all properties" />
        <div className="page-inner space-y-5">

          {/* Controls */}
          <div className="flex flex-wrap gap-3 items-end">
            {/* Utility tabs */}
            <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
              {TYPES.map(({ key, label, icon: Icon }) => (
                <button key={key} onClick={() => setTab(key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold
                              capitalize transition-all
                              ${tab === key
                                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                              }`}>
                  <Icon size={13} /> {label}
                </button>
              ))}
            </div>

            {/* Period */}
            <div className="flex flex-col sm:flex-row items-end gap-2 w-full sm:w-auto">
              <div className="form-group mb-0">
                <label className="label">Year</label>
                <select className="input w-full sm:w-24" value={period.year}
                  onChange={e => setPeriod(p => ({ ...p, year: +e.target.value }))}>
                  {[2023, 2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div className="form-group mb-0">
                <label className="label">Month</label>
                <select className="input w-full sm:w-36" value={period.month}
                  onChange={e => setPeriod(p => ({ ...p, month: +e.target.value }))}>
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i+1} value={i+1}>
                      {new Date(2000, i).toLocaleString('default', { month: 'long' })}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Property filter */}
            {properties.length > 1 && (
              <div className="form-group mb-0">
                <label className="label">Property</label>
                <select className="input w-full sm:w-44" value={propId}
                  onChange={e => setPropId(e.target.value)}>
                  <option value="">All Properties</option>
                  {properties.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            )}

            <button className="btn-secondary w-full sm:w-auto sm:ml-auto" onClick={handlePrint}>
              <Printer size={14} /> Print Report
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="animate-spin text-brand-500" size={32} />
            </div>
          ) : (
            <>
              <div ref={printRef}>
                {/* Summary Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { label: 'Total Units',       val: summary.total_units       ?? 0 },
                    /* { label: 'Units with Readings', val: summary.units_with_readings ?? 0 }, */
                    { label: 'Total Consumption', val: `${summary.total_consumption ?? 0} units` },
                    { label: 'Total Bill',         val: formatKES(summary.total_bill ?? 0) },
                  ].map(({ label, val }) => (
                    <div key={label} className="card p-4">
                      <p className="label">{label}</p>
                      <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">{val}</p>
                    </div>
                  ))}
                </div>

                {/* Trend chart (screen only) */}
                {chartData.length > 1 && (
                  <div className="card p-5 no-print">
                    <h2 className="font-semibold text-slate-800 dark:text-white mb-4 capitalize">
                      {tab} — 6-Month Trend
                    </h2>
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={chartData} margin={{ left: 10, right: 10, top: 8, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                        <YAxis
                          yAxisId="left"
                          tick={{ fontSize: 11 }}
                          tickFormatter={(v) => `${v}`}
                        />
                        <YAxis
                          yAxisId="right"
                          orientation="right"
                          tick={{ fontSize: 11 }}
                          tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                        />
                        <Tooltip
                          formatter={(v, n) => (n === 'Bill' ? formatKES(v) : `${v} units`)}
                        />
                        <Legend />
                        <Line
                          yAxisId="left"
                          type="monotone"
                          dataKey="consumption"
                          name="Units Used"
                          stroke={TypeMeta?.color || '#0ea5e9'}
                          strokeWidth={2}
                          dot={{ r: 3 }}
                        />
                        <Line
                          yAxisId="right"
                          type="monotone"
                          dataKey="bill"
                          name="Bill"
                          stroke="#94a3b8"
                          strokeWidth={2}
                          dot={false}
                          strokeDasharray="4 2"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Detail table — matches the water bill PDF layout */}
                <div className="card p-5 section">

                  {rows.length > 0 ? (
                    <div className="table-wrap">
                      <table className="table-base">
                        <thead>
                          <tr>
                            <th className="th">Unit</th>
                            <th className="th">Tenant</th>
                            <th className="th">Opening</th>
                            <th className="th">Closing</th>
                            <th className="th">Units Used</th>
                            <th className="th">Total Bill</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map(r => (
                            <tr key={r.id} className="tr-hover">
                              <td className="td font-bold">{r.unit_number}</td>
                              <td className="td">{r.tenant_name || '—'}</td>
                              <td className="td font-mono">{r.reading_start ?? '—'}</td>
                              <td className="td font-mono">{r.reading_end}</td>
                              <td className="td font-semibold">{r.consumption_units}</td>
                              <td className="td font-bold text-brand-600 dark:text-brand-400">
                                {formatKES(r.total_bill)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        {/* Totals row */}
                        <tfoot>
                          <tr className="bg-slate-50 dark:bg-slate-800">
                            <td className="td font-bold" colSpan={4}>TOTAL</td>
                            <td className="td font-bold text-brand-600 dark:text-brand-400">{summary.total_consumption}</td>
                            <td className="td font-bold text-brand-600 dark:text-brand-400">
                              {formatKES(summary.total_bill)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  ) : (
                    <EmptyState icon={TypeMeta?.icon || Droplets}
                      title={`No ${tab} readings for ${formatMonth(billingMonth)}`}
                      description="Utility readings for this period have not been entered yet." />
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}