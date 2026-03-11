import { useState, useEffect } from 'react';
import Sidebar from '../../components/common/Sidebar';
import TopBar from '../../components/common/TopBar';
import Modal from '../../components/common/Modal';
import EmptyState from '../../components/common/EmptyState';
import api from '../../api/axios';
import { formatDate, apiError } from '../../utils/helpers';
import { Users, Plus, Loader2, Pencil, Trash2, Eye, UserX } from 'lucide-react';
import toast from 'react-hot-toast';

const BLANK = {
  full_name: '', email: '', phone: '', username: '',
  password: '', unit_id: '', lease_start: '',
  lease_end: '', deposit_amount: '', emergency_contact_name: '',
  emergency_contact_phone: '',
};

export default function LandlordTenants() {
  const [tenants,   setTenants]   = useState([]);
  const [units,     setUnits]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [modal,     setModal]     = useState(false);
  const [viewModal, setViewModal] = useState(false);
  const [selected,  setSelected]  = useState(null);
  const [saving,    setSaving]    = useState(false);
  const [isEdit,    setIsEdit]    = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  // ── Flat form fields (no object — avoids re-render bug) ───
  const [fFullName,   setFFullName]   = useState('');
  const [fEmail,      setFEmail]      = useState('');
  const [fPhone,      setFPhone]      = useState('');
  const [fUsername,   setFUsername]   = useState('');
  const [fPassword,   setFPassword]   = useState('');
  const [fUnitId,     setFUnitId]     = useState('');
  const [fLeaseStart, setFLeaseStart] = useState('');
  const [fLeaseEnd,   setFLeaseEnd]   = useState('');
  const [fDeposit,    setFDeposit]    = useState('');
  const [fEcName,     setFEcName]     = useState('');
  const [fEcPhone,    setFEcPhone]    = useState('');

  const resetForm = () => {
    setFFullName(''); setFEmail(''); setFPhone(''); setFUsername('');
    setFPassword(''); setFUnitId(''); setFLeaseStart(''); setFLeaseEnd('');
    setFDeposit(''); setFEcName(''); setFEcPhone('');
  };

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get('/tenants'),
      api.get('/units/vacant'),
    ]).then(([t, u]) => {
      setTenants(t.data.data || []);
      setUnits(u.data.data   || []);
    }).catch(e => toast.error(apiError(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => {
    setIsEdit(false);
    resetForm();
    setModal(true);
  };

  const openEdit = (tenant) => {
    setIsEdit(true);
    setSelected(tenant);
    setFFullName(tenant.full_name || '');
    setFEmail(tenant.email || '');
    setFPhone(tenant.phone || '');
    setFUsername(tenant.username || '');
    setFPassword('');
    setFUnitId(tenant.unit_id || '');
    setFLeaseStart(tenant.lease_start?.slice(0, 10) || '');
    setFLeaseEnd(tenant.lease_end?.slice(0, 10) || '');
    setFDeposit(tenant.deposit_amount || '');
    setFEcName(tenant.emergency_contact_name || '');
    setFEcPhone(tenant.emergency_contact_phone || '');
    setModal(true);
  };

  const handleSave = async () => {
    if (!fFullName || !fUsername || (!isEdit && !fPassword) || !fUnitId || !fLeaseStart) {
      toast.error('Full name, username, password, unit, and lease start are required.');
      return;
    }
    setSaving(true);
    const payload = {
      full_name: fFullName, email: fEmail, phone: fPhone,
      username: fUsername, password: fPassword,
      unit_id: fUnitId, lease_start: fLeaseStart, lease_end: fLeaseEnd,
      deposit_amount: fDeposit,
      emergency_contact_name: fEcName, emergency_contact_phone: fEcPhone,
    };
    try {
      if (isEdit) {
        await api.put(`/tenants/${selected.tenant_id}`, payload);
        toast.success('Tenant updated!');
      } else {
        await api.post('/tenants', payload);
        toast.success('Tenant added successfully!');
      }
      setModal(false);
      load();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (tenant) => {
    if (!window.confirm(
      `Deactivate ${tenant.full_name}?\n\nThis will:\n• Mark the tenant as inactive\n• Declare Unit ${tenant.unit_number} as vacant\n• Exclude them from future billing`
    )) return;
    try {
      await api.patch(`/tenants/${tenant.tenant_id}/deactivate`);
      toast.success(`${tenant.full_name} deactivated. Unit ${tenant.unit_number} is now vacant.`);
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const visibleTenants = tenants.filter(t => showInactive ? true : t.is_active);
  const inactiveCount  = tenants.filter(t => !t.is_active).length;

  return (
    <div className="page-wrapper">
      <Sidebar />
      <div className="page-content">
        <TopBar title="Tenants" subtitle="Manage all tenants and their information" />
        <div className="page-inner space-y-5">

          <div className="flex items-center justify-between gap-3">
            {/* Inactive toggle */}
            {inactiveCount > 0 && (
              <button
                onClick={() => setShowInactive(p => !p)}
                className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors
                  ${showInactive
                    ? 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600'
                    : 'bg-white dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700 hover:bg-slate-50'}`}>
                <UserX size={13} />
                {showInactive ? 'Hide' : 'Show'} inactive ({inactiveCount})
              </button>
            )}
            <button className="btn-primary ml-auto" onClick={openAdd}>
              <Plus size={16} /> Add Tenant
            </button>
          </div>

          <div className="card p-5">
            {loading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="animate-spin text-brand-500" size={32} />
              </div>
            ) : visibleTenants.length > 0 ? (
              <div className="table-wrap">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th className="th">Name</th>
                      <th className="th">Unit</th>
                      <th className="th">Username</th>
                      <th className="th">Phone</th>
                      <th className="th">Lease Start</th>
                      <th className="th">Status</th>
                      <th className="th">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleTenants.map(t => (
                      <tr key={t.tenant_id} className={`tr-hover ${!t.is_active ? 'opacity-60' : ''}`}>
                        <td className="td font-medium">
                          <div className="flex items-center gap-2">
                            {t.full_name}
                            {!t.is_active && (
                              <span className="text-xs text-slate-400 italic">(inactive)</span>
                            )}
                          </div>
                        </td>
                        <td className="td">
                          <span className={`badge ${t.is_active ? 'badge-blue' : 'badge-gray'}`}>
                            {t.unit_number}
                          </span>
                        </td>
                        <td className="td font-mono text-xs">{t.username}</td>
                        <td className="td">{t.phone || '—'}</td>
                        <td className="td">{formatDate(t.lease_start)}</td>
                        <td className="td">
                          <span className={`badge ${t.is_active ? 'badge-green' : 'badge-gray'}`}>
                            {t.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="td">
                          <div className="flex items-center gap-1.5">
                            <button className="btn-ghost px-2 py-1 text-xs"
                              onClick={() => { setSelected(t); setViewModal(true); }}>
                              <Eye size={13} />
                            </button>
                            {t.is_active && (
                              <button className="btn-ghost px-2 py-1 text-xs"
                                onClick={() => openEdit(t)}>
                                <Pencil size={13} />
                              </button>
                            )}
                            {t.is_active && (
                              <button className="btn-ghost px-2 py-1 text-xs text-red-500
                                                 hover:bg-red-50 dark:hover:bg-red-900/20"
                                onClick={() => handleDeactivate(t)}>
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                icon={Users}
                title={showInactive ? 'No inactive tenants' : 'No tenants yet'}
                description={showInactive ? 'All tenants are currently active.' : 'Add your first tenant to get started.'}
                action={!showInactive && (
                  <button className="btn-primary" onClick={openAdd}><Plus size={15} /> Add Tenant</button>
                )}
              />
            )}
          </div>
        </div>
      </div>

      {/* ── Add / Edit Modal ── all inputs inline, no inner components ── */}
      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={isEdit ? 'Edit Tenant' : 'Add New Tenant'}
        size="lg"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setModal(false)}>Cancel</button>
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving
                ? <><Loader2 size={15} className="animate-spin" /> Saving…</>
                : isEdit ? 'Save Changes' : 'Add Tenant'}
            </button>
          </>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          <div className="form-group">
            <label className="label">Full Name *</label>
            <input className="input" placeholder="John Doe"
              value={fFullName} onChange={e => setFFullName(e.target.value)} />
          </div>

          <div className="form-group">
            <label className="label">Username *</label>
            <input className="input" placeholder="e.g. 1A"
              value={fUsername} onChange={e => setFUsername(e.target.value)} />
          </div>

          <div className="form-group">
            <label className="label">{isEdit ? 'New Password (leave blank to keep)' : 'Password *'}</label>
            <input className="input" type="password" placeholder="••••••"
              value={fPassword} onChange={e => setFPassword(e.target.value)} />
          </div>

          <div className="form-group">
            <label className="label">Email</label>
            <input className="input" type="email" placeholder="email@example.com"
              value={fEmail} onChange={e => setFEmail(e.target.value)} />
          </div>

          <div className="form-group">
            <label className="label">Phone</label>
            <input className="input" placeholder="+254 7XX XXX XXX"
              value={fPhone} onChange={e => setFPhone(e.target.value)} />
          </div>

          <div className="form-group">
            <label className="label">Unit *</label>
            <select className="input" value={fUnitId} onChange={e => setFUnitId(e.target.value)}>
              <option value="">— Select —</option>
              {units.map(u => (
                <option key={u.id} value={u.id}>
                  Unit {u.unit_number} — KSH {u.monthly_rent}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="label">Lease Start *</label>
            <input className="input" type="date"
              value={fLeaseStart} onChange={e => setFLeaseStart(e.target.value)} />
          </div>

          <div className="form-group">
            <label className="label">Lease End</label>
            <input className="input" type="date"
              value={fLeaseEnd} onChange={e => setFLeaseEnd(e.target.value)} />
          </div>

          <div className="form-group">
            <label className="label">Deposit (KSH)</label>
            <input className="input" type="number" placeholder="0"
              value={fDeposit} onChange={e => setFDeposit(e.target.value)} />
          </div>

          <div className="form-group">
            <label className="label">Emergency Contact Name</label>
            <input className="input" placeholder="Name"
              value={fEcName} onChange={e => setFEcName(e.target.value)} />
          </div>

          <div className="form-group sm:col-span-2">
            <label className="label">Emergency Contact Phone</label>
            <input className="input" placeholder="+254 7XX"
              value={fEcPhone} onChange={e => setFEcPhone(e.target.value)} />
          </div>

        </div>
      </Modal>

      {/* ── View Tenant Modal ── */}
      <Modal open={viewModal} onClose={() => setViewModal(false)} title="Tenant Details">
        {selected && (
          <div className="space-y-3 text-sm">
            {!selected.is_active && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg
                              bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800
                              text-amber-700 dark:text-amber-400 text-xs">
                <UserX size={13} />
                This tenant is inactive. Unit {selected.unit_number} is vacant and excluded from billing.
              </div>
            )}
            {[
              ['Full Name',   selected.full_name],
              ['Username',    selected.username],
              ['Unit',        selected.unit_number],
              ['Email',       selected.email || '—'],
              ['Phone',       selected.phone || '—'],
              ['Status',      selected.is_active ? 'Active' : 'Inactive'],
              ['Lease Start', formatDate(selected.lease_start)],
              ['Lease End',   selected.lease_end ? formatDate(selected.lease_end) : 'Open'],
              ['Deposit',     selected.deposit_amount ? `KSH ${selected.deposit_amount}` : '—'],
              ['Emergency',   selected.emergency_contact_name
                                ? `${selected.emergency_contact_name} (${selected.emergency_contact_phone})`
                                : '—'],
            ].map(([label, val]) => (
              <div key={label} className="flex gap-3">
                <span className="w-32 text-slate-400 shrink-0">{label}</span>
                <span className="font-medium text-slate-800 dark:text-slate-200">{val}</span>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}