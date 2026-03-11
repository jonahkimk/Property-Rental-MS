import { useState, useEffect } from 'react';
import Sidebar from '../../components/common/Sidebar';
import TopBar from '../../components/common/TopBar';
import Modal from '../../components/common/Modal';
import EmptyState from '../../components/common/EmptyState';
import api from '../../api/axios';
import { formatDateTime, apiError } from '../../utils/helpers';
import {
  Bell, Plus, Loader2, Send, Users, X,
  CheckSquare, Square, Settings, Clock, Trash2,
} from 'lucide-react';
import toast from 'react-hot-toast';

const BLANK_FORM      = { title: '', message: '', recipient_type: 'all', recipient_ids: [] };
const RETENTION_KEY   = 'rms_notif_retention_days'; // localStorage key
const DEFAULT_DAYS    = 30;
const PRESET_OPTIONS  = [7, 14, 30, 60, 90];

// ── helpers ──────────────────────────────────────────────────
const getSavedRetention = () => {
  const v = localStorage.getItem(RETENTION_KEY);
  return v ? parseInt(v, 10) : DEFAULT_DAYS;
};

const isExpired = (createdAt, days) => {
  if (!days || days === 0) return false;               // 0 = keep forever
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return new Date(createdAt) < cutoff;
};

const daysAgo = (createdAt) => {
  const diff = Date.now() - new Date(createdAt).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
};

export default function LandlordNotifications() {
  const [notices,       setNotices]       = useState([]);
  const [tenants,       setTenants]       = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [modal,         setModal]         = useState(false);
  const [settingsModal, setSettingsModal] = useState(false);
  const [saving,        setSaving]        = useState(false);
  const [form,          setForm]          = useState(BLANK_FORM);
  const [search,        setSearch]        = useState('');
  const [retentionDays, setRetentionDays] = useState(getSavedRetention);
  const [customDays,    setCustomDays]    = useState('');

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get('/notifications/sent'),
      api.get('/tenants'),
    ]).then(([n, t]) => {
      setNotices(n.data.data || []);
      setTenants(t.data.data || []);
    }).catch(e => toast.error(apiError(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // ── Retention ─────────────────────────────────────────────
  const saveRetention = (days) => {
    const d = parseInt(days, 10);
    if (isNaN(d) || d < 0) { toast.error('Please enter a valid number of days.'); return; }
    localStorage.setItem(RETENTION_KEY, d);
    setRetentionDays(d);
    setSettingsModal(false);
    setCustomDays('');
    toast.success(d === 0
      ? 'Notifications will be kept forever.'
      : `Notifications older than ${d} day${d !== 1 ? 's' : ''} will be hidden.`
    );
  };

  // ── Filtered + deduplicated display list ──────────────────
  const uniqueNotices = notices
    .filter((n, i, arr) =>
      arr.findIndex(x => x.title === n.title && x.created_at === n.created_at) === i
    )
    .filter(n => !isExpired(n.created_at, retentionDays));

  const hiddenCount = notices
    .filter((n, i, arr) =>
      arr.findIndex(x => x.title === n.title && x.created_at === n.created_at) === i
    )
    .filter(n => isExpired(n.created_at, retentionDays)).length;

  // ── Multi-select helpers ──────────────────────────────────
  const filteredTenants = tenants.filter(t =>
    `${t.full_name} ${t.unit_number}`.toLowerCase().includes(search.toLowerCase())
  );
  const toggleTenant  = (uid) =>
    setForm(p => ({
      ...p,
      recipient_ids: p.recipient_ids.includes(uid)
        ? p.recipient_ids.filter(id => id !== uid)
        : [...p.recipient_ids, uid],
    }));
  const allSelected = filteredTenants.length > 0 &&
    filteredTenants.every(t => form.recipient_ids.includes(t.user_id));
  const selectAll = () => setForm(p => ({ ...p, recipient_ids: filteredTenants.map(t => t.user_id) }));
  const clearAll  = () => setForm(p => ({ ...p, recipient_ids: [] }));

  const resetForm = () => { setForm(BLANK_FORM); setSearch(''); };

  // ── Send ──────────────────────────────────────────────────
  const handleSend = async () => {
    if (!form.title.trim() || !form.message.trim()) { toast.error('Title and message are required.'); return; }
    if (form.recipient_type === 'specific' && form.recipient_ids.length === 0) { toast.error('Please select at least one tenant.'); return; }
    setSaving(true);
    try {
      const res = await api.post('/notifications', {
        title:          form.title,
        message:        form.message,
        recipient_type: form.recipient_type,
        ...(form.recipient_type === 'specific' && { recipient_ids: form.recipient_ids }),
      });
      const sentTo = res.data.data?.sent_to ?? form.recipient_ids.length;
      toast.success(`Notification sent to ${sentTo} tenant${sentTo !== 1 ? 's' : ''}!`);
      setModal(false);
      resetForm();
      load();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  // ── Quick presets ─────────────────────────────────────────
  const quickSend = (preset) => {
    const p = {
      rent_due:    { title: 'Rent Due Reminder',     message: 'This is a reminder that rent is due by the 5th of this month. Please ensure timely payment to avoid penalties.' },
      water:       { title: 'Water Shortage Notice', message: 'We wish to inform you of a water shortage that may affect supply. Please store water accordingly.' },
      maintenance: { title: 'Scheduled Maintenance', message: 'Routine property maintenance will be carried out soon. Our team may need access to common areas.' },
      security:    { title: 'Security Advisory',     message: 'Please ensure you lock your doors and windows at all times. Report any suspicious activity to management.' },
    }[preset];
    setForm({ ...BLANK_FORM, ...p });
    setSearch('');
    setModal(true);
  };

  // ── Display helpers ───────────────────────────────────────
  const noticeColor = (t = '') => {
    const s = t.toLowerCase();
    if (s.includes('rent'))    return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
    if (s.includes('water'))   return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
    if (s.includes('maint') || s.includes('repair')) return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
    if (s.includes('secur') || s.includes('theft'))  return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    return 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300';
  };
  const noticeIcon = (t = '') => {
    const s = t.toLowerCase();
    if (s.includes('rent'))  return '💰';
    if (s.includes('water')) return '💧';
    if (s.includes('maint')) return '🔧';
    if (s.includes('secur')) return '🔒';
    return '📢';
  };

  // Age bar colour
  const ageColor = (createdAt) => {
    const d = daysAgo(createdAt);
    if (retentionDays === 0) return 'bg-slate-200 dark:bg-slate-700';
    const pct = d / retentionDays;
    if (pct < 0.5)  return 'bg-green-400';
    if (pct < 0.85) return 'bg-yellow-400';
    return 'bg-red-400';
  };
  const ageWidth = (createdAt) => {
    if (retentionDays === 0) return '100%';
    const pct = Math.min(daysAgo(createdAt) / retentionDays, 1);
    return `${Math.round(pct * 100)}%`;
  };

  return (
    <div className="page-wrapper">
      <Sidebar />
      <div className="page-content">
        <TopBar title="Notifications" subtitle="Send notices and reminders to tenants" />
        <div className="page-inner space-y-5">

          {/* Top bar */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Quick Send:</span>
            {[
              { key: 'rent_due',    label: '💰 Rent Reminder' },
              { key: 'water',       label: '💧 Water Shortage' },
              { key: 'maintenance', label: '🔧 Maintenance' },
              { key: 'security',    label: '🔒 Security Alert' },
            ].map(p => (
              <button key={p.key} className="btn-secondary text-xs" onClick={() => quickSend(p.key)}>
                {p.label}
              </button>
            ))}
            <div className="ml-auto flex gap-2">
              <button className="btn-secondary flex items-center gap-1.5"
                onClick={() => setSettingsModal(true)}
                title="Retention settings">
                <Settings size={15} />
                <span className="text-xs hidden sm:inline">
                  {retentionDays === 0 ? 'Keep forever' : `${retentionDays}d retention`}
                </span>
              </button>
              <button className="btn-primary" onClick={() => { resetForm(); setModal(true); }}>
                <Plus size={15} /> Custom Notice
              </button>
            </div>
          </div>

          {/* Retention info banner */}
          {retentionDays > 0 && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl
                            bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700
                            text-xs text-slate-500 dark:text-slate-400">
              <Clock size={14} className="shrink-0 text-brand-500" />
              <span>
                Showing notifications sent within the last <strong>{retentionDays} days</strong>.
                {hiddenCount > 0 && (
                  <span className="ml-1 text-slate-400">
                    ({hiddenCount} older notice{hiddenCount !== 1 ? 's' : ''} hidden)
                  </span>
                )}
              </span>
              <button className="ml-auto text-brand-600 hover:underline font-medium"
                onClick={() => setSettingsModal(true)}>
                Change
              </button>
            </div>
          )}

          {/* Sent list */}
          <div className="card p-5">
            <h2 className="font-semibold text-slate-800 dark:text-white mb-4">Sent Notifications</h2>
            {loading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="animate-spin text-brand-500" size={32} />
              </div>
            ) : uniqueNotices.length > 0 ? (
              <div className="space-y-3">
                {uniqueNotices.map((n, idx) => (
                  <div key={`${n.id}-${idx}`}
                    className="flex items-start gap-4 p-4 rounded-xl border
                               border-slate-200 dark:border-slate-700
                               hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <div className="w-9 h-9 rounded-full bg-brand-50 dark:bg-brand-900/20
                                    flex items-center justify-center shrink-0 text-base">
                      {noticeIcon(n.title)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-sm text-slate-800 dark:text-slate-200">{n.title}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed line-clamp-2">
                            {n.message}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${noticeColor(n.title)}`}>
                            Notice
                          </span>
                          <span className="text-xs text-slate-400 whitespace-nowrap">
                            {formatDateTime(n.created_at)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 mt-2">
                        <Users size={12} className="text-slate-400" />
                        <span className="text-xs text-slate-400">
                          To: {n.recipient_name || 'All Tenants'}
                        </span>
                      </div>

                      {/* Age progress bar */}
                      {retentionDays > 0 && (
                        <div className="mt-2.5">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-slate-400">
                              {daysAgo(n.created_at)}d ago
                            </span>
                            <span className="text-xs text-slate-400">
                              expires in {Math.max(0, retentionDays - daysAgo(n.created_at))}d
                            </span>
                          </div>
                          <div className="h-1 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${ageColor(n.created_at)}`}
                              style={{ width: ageWidth(n.created_at) }} />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={Bell} title="No notifications to show"
                description={
                  hiddenCount > 0
                    ? `${hiddenCount} notification${hiddenCount !== 1 ? 's' : ''} hidden by retention filter. Adjust the retention period to see older notices.`
                    : 'Use the quick presets or create a custom notice to notify tenants.'
                } />
            )}
          </div>
        </div>
      </div>

      {/* ── Retention Settings Modal ─────────────────────────── */}
      <Modal open={settingsModal} onClose={() => setSettingsModal(false)}
        title="Notification Retention" size="sm"
        footer={
          <button className="btn-secondary" onClick={() => setSettingsModal(false)}>Close</button>
        }>
        <div className="space-y-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Choose how long sent notifications remain visible in this list.
            Older notices are automatically hidden (not deleted from the database).
          </p>

          {/* Preset chips */}
          <div className="grid grid-cols-3 gap-2">
            {PRESET_OPTIONS.map(d => (
              <button key={d} type="button"
                onClick={() => saveRetention(d)}
                className={`py-2 px-3 rounded-xl text-sm font-medium border transition-colors
                  ${retentionDays === d
                    ? 'bg-brand-600 text-white border-brand-600'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:border-brand-400'
                  }`}>
                {d} days
              </button>
            ))}
            <button type="button"
              onClick={() => saveRetention(0)}
              className={`py-2 px-3 rounded-xl text-sm font-medium border transition-colors col-span-3
                ${retentionDays === 0
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:border-brand-400'
                }`}>
              Keep forever
            </button>
          </div>

          {/* Custom input */}
          <div>
            <label className="label">Custom (number of days)</label>
            <div className="flex gap-2">
              <input type="number" min="1" max="365" className="input flex-1"
                placeholder="e.g. 45"
                value={customDays}
                onChange={e => setCustomDays(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && customDays && saveRetention(customDays)} />
              <button className="btn-primary px-4" disabled={!customDays}
                onClick={() => saveRetention(customDays)}>
                Set
              </button>
            </div>
          </div>

          {retentionDays > 0 && hiddenCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg
                            bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800
                            text-xs text-amber-700 dark:text-amber-400">
              <Trash2 size={13} />
              {hiddenCount} notice{hiddenCount !== 1 ? 's are' : ' is'} currently hidden by this filter.
            </div>
          )}
        </div>
      </Modal>

      {/* ── Compose Modal ────────────────────────────────────── */}
      <Modal open={modal} onClose={() => { setModal(false); resetForm(); }}
        title="Send Notification"
        footer={
          <>
            <button className="btn-secondary" onClick={() => { setModal(false); resetForm(); }}>Cancel</button>
            <button className="btn-primary" onClick={handleSend} disabled={saving}>
              {saving ? <><Loader2 size={15} className="animate-spin" /> Sending…</> : <><Send size={15} /> Send</>}
            </button>
          </>
        }>
        <div className="space-y-4">
          <div className="form-group">
            <label className="label">Title *</label>
            <input className="input" placeholder="e.g. Rent Due Reminder"
              value={form.title}
              onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="label">Message *</label>
            <textarea className="input min-h-[100px] resize-none"
              placeholder="Write your notice here…"
              value={form.message}
              onChange={e => setForm(p => ({ ...p, message: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="label">Send To</label>
            <div className="flex gap-2">
              {[{ value:'all', label:'📢 All Tenants' }, { value:'specific', label:'👤 Select Tenants' }].map(opt => (
                <button key={opt.value} type="button"
                  onClick={() => setForm(p => ({ ...p, recipient_type: opt.value, recipient_ids: [] }))}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-colors
                    ${form.recipient_type === opt.value
                      ? 'bg-brand-600 text-white border-brand-600'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:border-brand-400'
                    }`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {form.recipient_type === 'specific' && (
            <div className="form-group">
              <div className="flex items-center justify-between mb-2">
                <label className="label mb-0">
                  Select Tenants
                  {form.recipient_ids.length > 0 && (
                    <span className="ml-2 text-xs bg-brand-100 text-brand-700 dark:bg-brand-900/30
                                     dark:text-brand-400 px-2 py-0.5 rounded-full font-semibold">
                      {form.recipient_ids.length} selected
                    </span>
                  )}
                </label>
                <button type="button"
                  onClick={allSelected ? clearAll : selectAll}
                  className="text-xs text-brand-600 hover:underline flex items-center gap-1">
                  {allSelected ? <><X size={11}/> Clear all</> : <><CheckSquare size={11}/> Select all</>}
                </button>
              </div>
              <input className="input mb-2 text-sm" placeholder="Search tenant or unit…"
                value={search} onChange={e => setSearch(e.target.value)} />
              <div className="border border-slate-200 dark:border-slate-700 rounded-xl
                              overflow-y-auto max-h-40 divide-y divide-slate-100 dark:divide-slate-700/60">
                {filteredTenants.length === 0
                  ? <p className="text-center text-xs text-slate-400 py-6">No tenants found.</p>
                  : filteredTenants.map(t => {
                    const selected = form.recipient_ids.includes(t.user_id);
                    return (
                      <button key={t.user_id || t.tenant_id} type="button"
                        onClick={() => toggleTenant(t.user_id)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors
                                    hover:bg-slate-50 dark:hover:bg-slate-800/50
                                    ${selected ? 'bg-brand-50 dark:bg-brand-900/20' : ''}`}>
                        <div className={`shrink-0 ${selected ? 'text-brand-600' : 'text-slate-300 dark:text-slate-600'}`}>
                          {selected ? <CheckSquare size={16}/> : <Square size={16}/>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium truncate ${selected ? 'text-brand-700 dark:text-brand-400' : 'text-slate-700 dark:text-slate-300'}`}>
                            {t.full_name}
                          </p>
                          <p className="text-xs text-slate-400">Unit {t.unit_number}</p>
                        </div>
                      </button>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}