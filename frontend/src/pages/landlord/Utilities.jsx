import { useState, useEffect } from 'react';
import Sidebar from '../../components/common/Sidebar';
import TopBar from '../../components/common/TopBar';
import EmptyState from '../../components/common/EmptyState';
import api from '../../api/axios';
import { formatKES, formatMonth, apiError, toBillingMonth } from '../../utils/helpers';
import { Droplets, Zap, Trash2, Loader2, Save, Settings } from 'lucide-react';
import toast from 'react-hot-toast';

const TYPES = [
  { key: 'water',       label: 'Water',       icon: Droplets, color: 'text-brand-500'   },
  { key: 'electricity', label: 'Electricity', icon: Zap,      color: 'text-amber-500'   },
  { key: 'garbage',     label: 'Garbage',     icon: Trash2,   color: 'text-emerald-500' },
];
const now = new Date();

export default function LandlordUtilities() {
  const [tab,           setTab]       = useState('water');
  const [units,         setUnits]     = useState([]);
  const [rates,         setRates]     = useState({});   // { water: 175, electricity: 20, garbage: 500 }
  const [readings,      setReadings]  = useState({});   // unitId -> { reading_end, notes, garbage_amount }
  const [prevReadings,  setPrev]      = useState({});   // unitId -> prev closing reading (number)
  const [loading,       setLoading]   = useState(true);
  const [saving,        setSaving]    = useState(false);
  const [rateModal,     setRateModal] = useState(false);
  const [newRate,       setNewRate]   = useState('');
  const [billingPeriod, setPeriod]    = useState({
    year: now.getFullYear(), month: now.getMonth() + 1,
  });

  const billingMonth = toBillingMonth(billingPeriod.year, billingPeriod.month);
  const isGarbage    = tab === 'garbage';

  const load = async () => {
    setLoading(true);
    try {
      const requests = [
        api.get('/units'),
        api.get('/utilities/rates'),
      ];
      // Prev readings only needed for water/electricity
      if (!isGarbage) {
        requests.push(
          api.get(`/utilities/prev-readings?utility_type=${tab}&billing_month=${billingMonth}`)
        );
      }

      const results = await Promise.all(requests);
      const unitList = results[0].data.data || [];
      const rateRows = results[1].data.data || [];

      setUnits(unitList);

      // Convert rates array -> object keyed by utility_type
      const rateMap = {};
      rateRows.forEach(r => { rateMap[r.utility_type] = r.rate_per_unit; });
      setRates(rateMap);

      // Prev readings: backend returns { unit_id, prev_reading } — fix field name
      if (!isGarbage) {
        const prevData = results[2]?.data.data || [];
        const prevMap  = {};
        prevData.forEach(p => { prevMap[p.unit_id] = p.prev_reading; });
        setPrev(prevMap);
      } else {
        setPrev({});
      }

      // Init blank readings for each unit
      const init = {};
      unitList.forEach(unit => {
        init[unit.id] = { reading_end: '', notes: '', garbage_amount: '' };
      });
      setReadings(init);

    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setLoading(false);
    }
  };

  // Reload when tab or billing month changes
  useEffect(() => { load(); }, [tab, billingMonth]);

  const handleChange = (unitId, field, val) => {
    setReadings(p => ({ ...p, [unitId]: { ...p[unitId], [field]: val } }));
  };

  const handleSubmit = async () => {
    const currentRate = rates[tab];

    if (isGarbage) {
      // Garbage: just save amount per unit (no meter readings)
      const payload = units
        .filter(u => readings[u.id]?.garbage_amount !== '' && readings[u.id]?.garbage_amount != null)
        .map(u => ({
          unit_id:        u.id,
          utility_type:   'garbage',
          billing_month:  billingMonth,
          reading_start:  null,
          reading_end:    null,
          rate_per_unit:  0,
          total_bill:     parseFloat(readings[u.id].garbage_amount),
          notes:          readings[u.id].notes || undefined,
          override_total: true,
        }));

      if (payload.length === 0) { toast.error('Enter the garbage charge for at least one unit.'); return; }
      setSaving(true);
      try {
        await api.post('/utilities/readings/bulk', { readings: payload });
        toast.success(`Garbage charges saved for ${payload.length} unit${payload.length > 1 ? 's' : ''}!`);
        load();
      } catch (e) {
        toast.error(apiError(e));
      } finally {
        setSaving(false);
      }
      return;
    }

    // Water / Electricity: need a rate
    if (!currentRate) {
      toast.error(`No rate set for ${tab}. Please set a rate first.`);
      return;
    }

    const payload = units
      .filter(u => readings[u.id]?.reading_end !== '')
      .map(u => ({
        unit_id:       u.id,
        utility_type:  tab,
        billing_month: billingMonth,
        reading_start: prevReadings[u.id] != null ? parseFloat(prevReadings[u.id]) : null,
        reading_end:   parseFloat(readings[u.id].reading_end),
        rate_per_unit: parseFloat(currentRate),
        notes:         readings[u.id].notes || undefined,
      }));

    if (payload.length === 0) { toast.error('Enter at least one meter reading.'); return; }

    setSaving(true);
    try {
      await api.post('/utilities/readings/bulk', { readings: payload });
      toast.success(`${payload.length} ${tab} readings saved!`);
      load();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const handleSetRate = async () => {
    if (!newRate || isNaN(newRate)) { toast.error('Enter a valid rate.'); return; }
    try {
      await api.post('/utilities/rates', {
        utility_type:   tab,
        rate_per_unit:  parseFloat(newRate),
        effective_from: billingMonth,
      });
      toast.success(`${tab.charAt(0).toUpperCase() + tab.slice(1)} rate set to KSH ${newRate}/unit`);
      setRateModal(false);
      setNewRate('');
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const TypeMeta = TYPES.find(t => t.key === tab);

  return (
    <div className="page-wrapper">
      <Sidebar />
      <div className="page-content">
        <TopBar title="Utility Capture" subtitle="Enter monthly meter readings for all units" />
        <div className="page-inner space-y-5">

          {/* Type tabs */}
          <div className="flex flex-wrap gap-2">
            {TYPES.map(({ key, label, icon: Icon, color }) => (
              <button key={key} onClick={() => setTab(key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold
                            capitalize transition-all border
                            ${tab === key
                              ? `bg-slate-100 dark:bg-slate-800 ${color} border-current`
                              : 'bg-white dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                            }`}>
                <Icon size={15} /> {label}
              </button>
            ))}
          </div>

          {/* Period + Rate controls */}
          <div className="card p-4 flex flex-wrap items-center gap-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
              <div className="form-group mb-0">
                <label className="label">Year</label>
                <input className="input w-full sm:w-24" type="number" value={billingPeriod.year}
                  onChange={e => setPeriod(p => ({ ...p, year: +e.target.value }))} />
              </div>
              <div className="form-group mb-0">
                <label className="label">Month</label>
                <select className="input w-full sm:w-36" value={billingPeriod.month}
                  onChange={e => setPeriod(p => ({ ...p, month: +e.target.value }))}>
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i+1} value={i+1}>
                      {new Date(2000, i).toLocaleString('default', { month: 'long' })}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="w-full sm:w-auto sm:ml-auto flex flex-wrap items-center gap-3">
              {!isGarbage && (
                <div className="text-sm text-slate-600 dark:text-slate-400">
                  Current rate:{' '}
                  <strong className="text-slate-900 dark:text-white">
                    {rates[tab] ? `KSH ${rates[tab]}/unit` : 'Not set'}
                  </strong>
                  {rates[tab] && (
                    <span className="text-xs text-slate-400 ml-1">(persists until changed)</span>
                  )}
                </div>
              )}
              {isGarbage && (
                <div className="text-sm text-slate-500 dark:text-slate-400">
                  Enter flat charge per unit below
                </div>
              )}
              {!isGarbage && (
                <button className="btn-secondary" onClick={() => {
                  setNewRate(rates[tab] ? String(rates[tab]) : '');
                  setRateModal(true);
                }}>
                  <Settings size={14} /> {rates[tab] ? 'Update Rate' : 'Set Rate'}
                </button>
              )}
            </div>
          </div>

          {/* Readings Table */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-slate-800 dark:text-white capitalize">
                {tab} {isGarbage ? 'Charges' : 'Readings'} — {formatMonth(billingMonth)}
              </h2>
              <button className="btn-primary" onClick={handleSubmit} disabled={saving || loading}>
                {saving
                  ? <><Loader2 size={15} className="animate-spin" /> Saving…</>
                  : <><Save size={15} /> Save {isGarbage ? 'Charges' : 'Readings'}</>}
              </button>
            </div>

            {loading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="animate-spin text-brand-500" size={32} />
              </div>
            ) : units.length > 0 ? (
              <div className="table-wrap">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th className="th">Unit</th>
                      <th className="th">Tenant</th>
                      {isGarbage ? (
                        <th className="th">Charge (KSH)</th>
                      ) : (
                        <>
                          <th className="th">
                            Opening Reading
                            <span className="block font-normal normal-case text-slate-400 text-xs">
                              (auto from prev month)
                            </span>
                          </th>
                          <th className="th">Closing Reading</th>
                          <th className="th">Units Used</th>
                          <th className="th">Bill (KSH)</th>
                        </>
                      )}
                      <th className="th">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {units.map(unit => {
                      const rate     = parseFloat(rates[tab] || 0);
                      const endVal   = readings[unit.id]?.reading_end     || '';
                      const garbageAmt = readings[unit.id]?.garbage_amount || '';

                      // Water / electricity calculations
                      const start    = prevReadings[unit.id];
                      const hasStart = start != null;
                      const consumed = hasStart && endVal !== ''
                        ? Math.max(0, parseFloat(endVal) - parseFloat(start))
                        : null;
                      const bill = consumed !== null ? consumed * rate : null;

                      return (
                        <tr key={unit.id} className="tr-hover">
                          <td className="td font-bold">{unit.unit_number}</td>
                          <td className="td">
                            {unit.tenant_name || <span className="text-slate-400 text-xs">Vacant</span>}
                          </td>

                          {isGarbage ? (
                            <td className="td">
                              <input
                                type="number"
                                step="0.01"
                                className="input w-32 text-center font-mono"
                                placeholder="0.00"
                                value={garbageAmt}
                                onChange={e => handleChange(unit.id, 'garbage_amount', e.target.value)}
                              />
                            </td>
                          ) : (
                            <>
                              <td className="td font-mono">
                                {hasStart
                                  ? <span className="text-slate-500">{parseFloat(start).toFixed(3)}</span>
                                  : <span className="text-amber-500 text-xs italic">No prev reading</span>
                                }
                              </td>
                              <td className="td">
                                <input
                                  type="number"
                                  step="0.001"
                                  className="input w-28 text-center font-mono"
                                  placeholder="0.000"
                                  value={endVal}
                                  onChange={e => handleChange(unit.id, 'reading_end', e.target.value)}
                                />
                              </td>
                              <td className="td font-semibold">
                                {consumed !== null ? consumed.toFixed(3) : '—'}
                              </td>
                              <td className="td font-semibold text-brand-600 dark:text-brand-400">
                                {bill !== null ? formatKES(bill) : '—'}
                              </td>
                            </>
                          )}

                          <td className="td">
                            <input
                              className="input w-32 text-xs"
                              placeholder="Notes…"
                              value={readings[unit.id]?.notes || ''}
                              onChange={e => handleChange(unit.id, 'notes', e.target.value)}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState icon={TypeMeta?.icon || Droplets} title="No units found" />
            )}
          </div>
        </div>
      </div>

      {/* Set Rate Modal */}
      {rateModal && (
        <div className="modal-overlay" onClick={() => setRateModal(false)}>
          <div className="modal-box max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white capitalize">
                {rates[tab] ? 'Update' : 'Set'} {tab} Rate
              </h3>
            </div>
            <div className="modal-body space-y-3">
              {rates[tab] && (
                <div className="text-xs text-slate-500 bg-slate-50 dark:bg-slate-800 rounded-lg p-3">
                  Current rate: <strong>KSH {rates[tab]}/unit</strong> — this rate has been
                  persisting automatically each month until changed.
                </div>
              )}
              <p className="text-sm text-slate-500">
                New rate per unit in KSH. Will apply from {formatMonth(billingMonth)} onwards.
              </p>
              <div className="form-group">
                <label className="label">Rate per unit (KSH)</label>
                <input className="input" type="number" step="0.01" placeholder="e.g. 175"
                  value={newRate}
                  onChange={e => setNewRate(e.target.value)}
                  autoFocus />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setRateModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleSetRate}>Save Rate</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}