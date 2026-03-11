import { useState, useEffect, useMemo } from 'react';
import Sidebar from '../../components/common/Sidebar';
import TopBar from '../../components/common/TopBar';
import Modal from '../../components/common/Modal';
import EmptyState from '../../components/common/EmptyState';
import api from '../../api/axios';
import { formatDate, apiError } from '../../utils/helpers';
import {
  UserCheck, Plus, Loader2, LogOut, Printer,
  Filter, X, Search, Trash2, Car, Phone, Hash,
} from 'lucide-react';
import toast from 'react-hot-toast';

const BLANK = {
  visitor_name: '', visitor_id_number: '', visitor_phone: '',
  host_name: '', purpose: '', vehicle_reg: '',
  unit_id: '', visit_date: '', check_in_time: '',
};

const todayISO = () => new Date().toISOString().split('T')[0];
const nowTime  = () => new Date().toTimeString().slice(0, 5);

export default function VisitorLog() {
  const [visitors, setVisitors] = useState([]);
  const [units,    setUnits]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [modal,    setModal]    = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [form,     setForm]     = useState({ ...BLANK, visit_date: todayISO(), check_in_time: nowTime() });

  // Filters
  const [search,     setSearch]     = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [filterUnit, setFilterUnit] = useState('');
  const [filterStatus, setFilterStatus] = useState(''); // 'in' | 'out' | ''

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get('/visitors'),
      api.get('/units'),
    ]).then(([v, u]) => {
      setVisitors(v.data.data || []);
      setUnits(u.data.data || []);
    }).catch(e => toast.error(apiError(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // ── Filtered list ─────────────────────────────────────────
  const filtered = useMemo(() => visitors.filter(v => {
    if (search && ![v.visitor_name, v.visitor_id_number, v.visitor_phone, v.host_name, v.vehicle_reg]
      .some(f => f?.toLowerCase().includes(search.toLowerCase()))) return false;
    if (filterDate   && v.visit_date?.slice(0, 10) !== filterDate)   return false;
    if (filterUnit   && v.unit_id !== filterUnit)                     return false;
    if (filterStatus === 'in'  && v.check_out_time)                   return false;
    if (filterStatus === 'out' && !v.check_out_time)                  return false;
    return true;
  }), [visitors, search, filterDate, filterUnit, filterStatus]);

  const activeFilters = [search, filterDate, filterUnit, filterStatus].filter(Boolean).length;

  const clearFilters = () => {
    setSearch(''); setFilterDate(''); setFilterUnit(''); setFilterStatus('');
  };

  // ── Stats ─────────────────────────────────────────────────
  const todayVisitors  = visitors.filter(v => v.visit_date?.slice(0,10) === todayISO());
  const currentlyIn    = visitors.filter(v => v.visit_date?.slice(0,10) === todayISO() && !v.check_out_time);

  // ── Log visitor ───────────────────────────────────────────
  const handleSubmit = async () => {
    if (!form.visitor_name.trim()) { toast.error('Visitor name is required.'); return; }
    if (!form.unit_id)             { toast.error('Please select a unit.'); return; }
    setSaving(true);
    try {
      await api.post('/visitors', form);
      toast.success('Visitor logged successfully.');
      setModal(false);
      setForm({ ...BLANK, visit_date: todayISO(), check_in_time: nowTime() });
      load();
    } catch (e) { toast.error(apiError(e)); }
    finally { setSaving(false); }
  };

  // ── Check-out ─────────────────────────────────────────────
  const handleCheckout = async (visitor) => {
    try {
      await api.patch(`/visitors/${visitor.id}/checkout`, {
        check_out_time: nowTime(),
      });
      toast.success(`${visitor.visitor_name} checked out.`);
      load();
    } catch (e) { toast.error(apiError(e)); }
  };

  // ── Delete ────────────────────────────────────────────────
  const handleDelete = async (id) => {
    if (!window.confirm('Delete this visitor record?')) return;
    try {
      await api.delete(`/visitors/${id}`);
      toast.success('Record deleted.');
      load();
    } catch (e) { toast.error(apiError(e)); }
  };

  // ── Print ─────────────────────────────────────────────────
  const handlePrint = () => {
    const rows = filtered.map(v => `
      <tr>
        <td>${v.visit_date?.slice(0,10) || '—'}</td>
        <td>${v.check_in_time || '—'}</td>
        <td>${v.check_out_time || '—'}</td>
        <td><strong>${v.visitor_name}</strong></td>
        <td>${v.visitor_id_number || '—'}</td>
        <td>${v.visitor_phone || '—'}</td>
        <td>${v.unit_number || '—'}</td>
        <td>${v.host_name || '—'}</td>
        <td>${v.purpose || '—'}</td>
        <td>${v.vehicle_reg || '—'}</td>
        <td><span style="padding:2px 8px;border-radius:999px;font-size:10px;font-weight:600;
          background:${v.check_out_time ? '#dcfce7' : '#fef9c3'};
          color:${v.check_out_time ? '#166534' : '#854d0e'}">
          ${v.check_out_time ? 'Checked Out' : 'On Premises'}
        </span></td>
      </tr>`).join('');

    const w = window.open('', '_blank');
    w.document.write(`<!DOCTYPE html><html><head>
      <title>Visitor Log Report</title>
      <style>
        *{box-sizing:border-box;margin:0;padding:0;font-family:Arial,sans-serif;font-size:11px}
        body{padding:24px;color:#111}
        h2{font-size:16px;font-weight:700;margin-bottom:4px}
        .meta{color:#555;font-size:11px;margin-bottom:16px}
        table{width:100%;border-collapse:collapse}
        th{background:#f1f5f9;text-align:left;padding:6px 8px;font-weight:600;
           border-bottom:2px solid #cbd5e1;font-size:10px;text-transform:uppercase;letter-spacing:.04em}
        td{padding:6px 8px;border-bottom:1px solid #e2e8f0;vertical-align:middle}
        @media print{@page{margin:1.5cm}}
      </style></head><body>
      <h2>Visitor Log</h2>
      <p class="meta">Generated: ${new Date().toLocaleString()} &nbsp;|&nbsp; ${filtered.length} records
        ${filterDate ? ` · Date: ${filterDate}` : ''}
        ${filterStatus === 'in' ? ' · Currently on premises' : filterStatus === 'out' ? ' · Checked out' : ''}
      </p>
      <table><thead><tr>
        <th>Date</th><th>Check In</th><th>Check Out</th><th>Visitor</th>
        <th>ID No.</th><th>Phone</th><th>Unit</th><th>Host</th>
        <th>Purpose</th><th>Vehicle</th><th>Status</th>
      </tr></thead><tbody>${rows}</tbody></table>
      </body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); w.close(); }, 300);
  };

  // ── Status badge ──────────────────────────────────────────
  const statusBadge = (v) => v.check_out_time
    ? <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
        Out {v.check_out_time}
      </span>
    : <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
        <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 inline-block animate-pulse" />
        On Premises
      </span>;

  return (
    <div className="page-wrapper">
      <Sidebar />
      <div className="page-content">
        <TopBar title="Visitor Log" subtitle="Track and manage property visitors" />
        <div className="page-inner space-y-5">

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {[
              { label: "Today's Visitors", value: todayVisitors.length,  color: 'text-brand-600' },
              { label: 'Currently on Premises', value: currentlyIn.length,   color: 'text-yellow-600' },
              { label: 'Total Records',    value: visitors.length,        color: 'text-slate-600' },
            ].map(s => (
              <div key={s.label} className="card p-4 flex flex-col gap-1">
                <span className={`text-2xl font-bold ${s.color}`}>{s.value}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400">{s.label}</span>
              </div>
            ))}
          </div>

          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[180px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className="input pl-8 text-sm py-1.5" placeholder="Search visitor, ID, phone…"
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <button className="btn-secondary" onClick={handlePrint}>
              <Printer size={15} /> Print
            </button>
            <button className="btn-primary" onClick={() => {
              setForm({ ...BLANK, visit_date: todayISO(), check_in_time: nowTime() });
              setModal(true);
            }}>
              <Plus size={15} /> Log Visitor
            </button>
          </div>

          {/* Filter bar */}
          <div className="card px-4 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">
                <Filter size={13} />
                Filters
                {activeFilters > 0 && (
                  <span className="bg-brand-600 text-white rounded-full px-1.5 py-0.5 text-xs">
                    {activeFilters}
                  </span>
                )}
              </div>

              <input type="date" className="input w-auto text-sm py-1.5"
                value={filterDate} onChange={e => setFilterDate(e.target.value)} />

              <select className="input w-auto text-sm py-1.5"
                value={filterUnit} onChange={e => setFilterUnit(e.target.value)}>
                <option value="">All Units</option>
                {units.map(u => (
                  <option key={u.id} value={u.id}>Unit {u.unit_number}</option>
                ))}
              </select>

              <select className="input w-auto text-sm py-1.5"
                value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                <option value="">All Status</option>
                <option value="in">On Premises</option>
                <option value="out">Checked Out</option>
              </select>

              {activeFilters > 0 && (
                <button className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-medium ml-auto"
                  onClick={clearFilters}>
                  <X size={13} /> Clear filters
                </button>
              )}
            </div>

            {filtered.length > 0 && (
              <p className="text-xs text-slate-400 mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
                Showing <strong className="text-slate-600 dark:text-slate-300">{filtered.length}</strong>
                {activeFilters > 0 && ` of ${visitors.length}`} records
              </p>
            )}
          </div>

          {/* Table */}
          <div className="card p-5">
            <h2 className="font-semibold text-slate-800 dark:text-white mb-4">Visitor Records</h2>
            {loading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="animate-spin text-brand-500" size={32} />
              </div>
            ) : filtered.length > 0 ? (
              <div className="table-wrap">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th className="th">Date</th>
                      <th className="th">Check In</th>
                      <th className="th">Visitor</th>
                      <th className="th">ID / Phone</th>
                      <th className="th">Unit</th>
                      <th className="th">Host</th>
                      <th className="th">Purpose</th>
                      <th className="th">Vehicle</th>
                      <th className="th">Status</th>
                      {/* <th className="th">Action</th> */}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(v => (
                      <tr key={v.id} className="tr-hover">
                        <td className="td text-xs">{v.visit_date?.slice(0,10)}</td>
                        <td className="td text-xs font-mono">{v.check_in_time || '—'}</td>
                        <td className="td">
                          <p className="font-semibold text-sm">{v.visitor_name}</p>
                        </td>
                        <td className="td text-xs text-slate-500 space-y-0.5">
                          {v.visitor_id_number && (
                            <div className="flex items-center gap-1"><Hash size={10}/>{v.visitor_id_number}</div>
                          )}
                          {v.visitor_phone && (
                            <div className="flex items-center gap-1"><Phone size={10}/>{v.visitor_phone}</div>
                          )}
                          {!v.visitor_id_number && !v.visitor_phone && '—'}
                        </td>
                        <td className="td font-medium">Unit {v.unit_number}</td>
                        <td className="td text-sm">{v.host_name || '—'}</td>
                        <td className="td text-sm text-slate-500">{v.purpose || '—'}</td>
                        <td className="td text-xs">
                          {v.vehicle_reg
                            ? <span className="flex items-center gap-1"><Car size={11}/>{v.vehicle_reg}</span>
                            : '—'}
                        </td>
                        <td className="td">{statusBadge(v)}</td>
                        <td className="td">
                          <div className="flex items-center gap-2">
                            {!v.check_out_time && (
                              <button className="btn-secondary text-xs px-2.5 py-1"
                                onClick={() => handleCheckout(v)}>
                                <LogOut size={12} /> Check Out
                              </button>
                            )}
                            {/* <button className="text-red-400 hover:text-red-600 p-1 rounded transition-colors"
                              onClick={() => handleDelete(v.id)} title="Delete">
                              <Trash2 size={14} />
                            </button> */}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState icon={UserCheck}
                title={activeFilters > 0 ? 'No records match filters' : 'No visitor records yet'}
                description={activeFilters > 0 ? 'Try adjusting the filters.' : 'Log your first visitor using the button above.'}
                action={activeFilters > 0
                  ? <button className="btn-secondary" onClick={clearFilters}><X size={13}/> Clear Filters</button>
                  : <button className="btn-primary" onClick={() => { setForm({ ...BLANK, visit_date: todayISO(), check_in_time: nowTime() }); setModal(true); }}><Plus size={15}/> Log Visitor</button>
                }
              />
            )}
          </div>
        </div>
      </div>

      {/* ── Log Visitor Modal ──────────────────────────────── */}
      <Modal open={modal} onClose={() => setModal(false)}
        title="Log New Visitor"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setModal(false)}>Cancel</button>
            <button className="btn-primary" onClick={handleSubmit} disabled={saving}>
              {saving ? <><Loader2 size={15} className="animate-spin"/> Saving…</> : <><UserCheck size={15}/> Log Visitor</>}
            </button>
          </>
        }>
        <div className="space-y-4">

          {/* Visitor name */}
          <div className="form-group">
            <label className="label">Visitor Name *</label>
            <input className="input" placeholder="Full name"
              value={form.visitor_name}
              onChange={e => setForm(p => ({ ...p, visitor_name: e.target.value }))} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="form-group">
              <label className="label">ID Number</label>
              <input className="input" placeholder="National ID / Passport"
                value={form.visitor_id_number}
                onChange={e => setForm(p => ({ ...p, visitor_id_number: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="label">Phone</label>
              <input className="input" placeholder="+254…"
                value={form.visitor_phone}
                onChange={e => setForm(p => ({ ...p, visitor_phone: e.target.value }))} />
            </div>
          </div>

          {/* Unit + Host */}
          <div className="grid grid-cols-2 gap-3">
            <div className="form-group">
              <label className="label">Visiting Unit *</label>
              <select className="input" value={form.unit_id}
                onChange={e => setForm(p => ({ ...p, unit_id: e.target.value }))}>
                <option value="">— Select unit —</option>
                {units.filter(u => u.is_occupied).map(u => (
                  <option key={u.id} value={u.id}>
                    Unit {u.unit_number}{u.tenant_name ? ` — ${u.tenant_name}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="label">Host Name</label>
              <input className="input" placeholder="Tenant being visited"
                value={form.host_name}
                onChange={e => setForm(p => ({ ...p, host_name: e.target.value }))} />
            </div>
          </div>

          {/* Purpose + Vehicle */}
          <div className="grid grid-cols-2 gap-3">
            <div className="form-group">
              <label className="label">Purpose of Visit</label>
              <input className="input" placeholder="e.g. Personal, Delivery…"
                value={form.purpose}
                onChange={e => setForm(p => ({ ...p, purpose: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="label">Vehicle Reg.</label>
              <input className="input placeholder:uppercase font-mono" placeholder="KXX 000X"
                value={form.vehicle_reg}
                onChange={e => setForm(p => ({ ...p, vehicle_reg: e.target.value.toUpperCase() }))} />
            </div>
          </div>

          {/* Date + Time */}
          <div className="grid grid-cols-2 gap-3">
            <div className="form-group">
              <label className="label">Visit Date</label>
              <input type="date" className="input"
                value={form.visit_date}
                onChange={e => setForm(p => ({ ...p, visit_date: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="label">Check-in Time</label>
              <input type="time" className="input"
                value={form.check_in_time}
                onChange={e => setForm(p => ({ ...p, check_in_time: e.target.value }))} />
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}