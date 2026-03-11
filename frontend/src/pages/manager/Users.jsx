import { useState, useEffect } from 'react';
import Sidebar from '../../components/common/Sidebar';
import TopBar from '../../components/common/TopBar';
import Modal from '../../components/common/Modal';
import EmptyState from '../../components/common/EmptyState';
import api from '../../api/axios';
import { formatDate, apiError } from '../../utils/helpers';
import { Users, Plus, Loader2, Pencil, ShieldCheck, KeyRound } from 'lucide-react';
import toast from 'react-hot-toast';

const BLANK = { full_name: '', username: '', password: '', email: '', phone: '', property_id: '' };

export default function ManagerUsers() {
  const [users, setUsers]         = useState([]);
  const [properties, setProperties] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [modal, setModal]         = useState(false);
  const [isEdit, setIsEdit]       = useState(false);
  const [selected, setSelected]   = useState(null);
  const [form, setForm]           = useState(BLANK);
  const [saving, setSaving]       = useState(false);
  const [resetModal, setResetModal] = useState(false);
  const [newPwd, setNewPwd]       = useState('');

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get('/users?role=landlord'),
      api.get('/properties'),
    ]).then(([u, p]) => {
      setUsers(u.data.data      || []);
      setProperties(p.data.data || []);
    }).catch(e => toast.error(apiError(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => {
    setIsEdit(false);
    setForm(BLANK);
    setModal(true);
  };

  const openEdit = (u) => {
    setIsEdit(true);
    setSelected(u);
    setForm({
      full_name:   u.full_name   || '',
      username:    u.username    || '',
      password:    '',
      email:       u.email       || '',
      phone:       u.phone       || '',
      property_id: u.property_id || '',
    });
    setModal(true);
  };

  const handleSave = async () => {
    if (!form.full_name || !form.username || (!isEdit && !form.password)) {
      toast.error('Full name, username, and password are required.');
      return;
    }
    setSaving(true);
    try {
      if (isEdit) {
        await api.put(`/users/${selected.id}`, form);
        toast.success('Landlord account updated!');
      } else {
        await api.post('/users/landlord', { ...form, role: 'landlord' });
        toast.success('Landlord account created!');
      }
      setModal(false);
      load();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const handleResetPassword = async () => {
    if (!newPwd || newPwd.length < 6) {
      toast.error('Password must be at least 6 characters.');
      return;
    }
    try {
      await api.patch(`/users/${selected.id}/reset-password`, { new_password: newPwd });
      toast.success('Password reset successfully!');
      setResetModal(false);
      setNewPwd('');
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const handleToggleActive = async (user) => {
    const action = user.is_active ? 'deactivate' : 'activate';
    if (!window.confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} ${user.full_name}?`)) return;
    try {
      await api.patch(`/users/${user.id}/${action}`);
      toast.success(`User ${action}d!`);
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  return (
    <div className="page-wrapper">
      <Sidebar />
      <div className="page-content">
        <TopBar title="User Management" subtitle="Create and manage landlord accounts" />
        <div className="page-inner space-y-5">

          <div className="flex justify-end">
            <button className="btn-primary" onClick={openAdd}>
              <Plus size={15} /> Create Landlord
            </button>
          </div>

          <div className="card p-5">
            <h2 className="font-semibold text-slate-800 dark:text-white mb-4">
              Landlord Accounts
            </h2>
            {loading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="animate-spin text-brand-500" size={32} />
              </div>
            ) : users.length > 0 ? (
              <div className="table-wrap">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th className="th">Name</th>
                      <th className="th">Username</th>
                      <th className="th">Email</th>
                      <th className="th">Phone</th>
                      <th className="th">Property</th>
                      <th className="th">Created</th>
                      <th className="th">Status</th>
                      <th className="th">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(u => (
                      <tr key={u.id} className="tr-hover">
                        <td className="td">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-brand-100 dark:bg-brand-900/30
                                            flex items-center justify-center shrink-0">
                              <span className="text-xs font-bold text-brand-700 dark:text-brand-400">
                                {u.full_name.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <span className="font-medium">{u.full_name}</span>
                          </div>
                        </td>
                        <td className="td font-mono text-xs">{u.username}</td>
                        <td className="td">{u.email || '—'}</td>
                        <td className="td">{u.phone || '—'}</td>
                        <td className="td">{u.property_name || '—'}</td>
                        <td className="td">{formatDate(u.created_at)}</td>
                        <td className="td">
                          <span className={`badge ${u.is_active ? 'badge-green' : 'badge-gray'}`}>
                            {u.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="td">
                          <div className="flex items-center gap-1.5">
                            <button className="btn-ghost px-2 py-1 text-xs" onClick={() => openEdit(u)}>
                              <Pencil size={12} />
                            </button>
                            <button className="btn-ghost px-2 py-1 text-xs"
                              onClick={() => { setSelected(u); setNewPwd(''); setResetModal(true); }}>
                              <KeyRound size={12} />
                            </button>
                            <button
                              className={`btn-ghost px-2 py-1 text-xs ${
                                u.is_active ? 'text-red-500' : 'text-emerald-500'
                              }`}
                              onClick={() => handleToggleActive(u)}>
                              <ShieldCheck size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState icon={Users} title="No landlord accounts yet"
                description="Create a landlord account to assign them a property."
                action={<button className="btn-primary" onClick={openAdd}><Plus size={15} /> Create Landlord</button>} />
            )}
          </div>
        </div>
      </div>

      {/* Add / Edit Modal */}
      <Modal open={modal} onClose={() => setModal(false)}
        title={isEdit ? 'Edit Landlord' : 'Create Landlord Account'}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setModal(false)}>Cancel</button>
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving
                ? <><Loader2 size={15} className="animate-spin" /> Saving…</>
                : isEdit ? 'Save Changes' : 'Create Account'
              }
            </button>
          </>
        }>
        <div className="grid grid-cols-2 gap-4">
          <div className="form-group col-span-2">
            <label className="label">Full Name *</label>
            <input className="input" placeholder="John Kamau"
              value={form.full_name}
              onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="label">Username *</label>
            <input className="input" placeholder="e.g. admin"
              value={form.username}
              onChange={e => setForm(p => ({ ...p, username: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="label">{isEdit ? 'New Password (blank = no change)' : 'Password *'}</label>
            <input className="input" type="password" placeholder="••••••••"
              value={form.password}
              onChange={e => setForm(p => ({ ...p, password: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="label">Email</label>
            <input className="input" type="email" placeholder="landlord@email.com"
              value={form.email}
              onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="label">Phone</label>
            <input className="input" placeholder="+254 7XX XXX XXX"
              value={form.phone}
              onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
          </div>
          <div className="form-group col-span-2">
            <label className="label">Assign Property</label>
            <select className="input" value={form.property_id}
              onChange={e => setForm(p => ({ ...p, property_id: e.target.value }))}>
              <option value="">— Select property —</option>
              {properties.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>
      </Modal>

      {/* Reset Password Modal */}
      <Modal open={resetModal} onClose={() => setResetModal(false)}
        title={`Reset Password — ${selected?.full_name}`}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setResetModal(false)}>Cancel</button>
            <button className="btn-danger" onClick={handleResetPassword}>
              <KeyRound size={14} /> Reset Password
            </button>
          </>
        }>
        <div className="space-y-3">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Enter a new password for <strong>{selected?.full_name}</strong>.
            They should change it on next login.
          </p>
          <div className="form-group">
            <label className="label">New Password</label>
            <input className="input" type="password" placeholder="Min. 6 characters"
              value={newPwd}
              onChange={e => setNewPwd(e.target.value)}
              autoFocus />
          </div>
        </div>
      </Modal>
    </div>
  );
}