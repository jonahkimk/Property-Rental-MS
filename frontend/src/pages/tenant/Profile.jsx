import { useState, useEffect } from 'react';
import Sidebar from '../../components/common/Sidebar';
import TopBar from '../../components/common/TopBar';
import api from '../../api/axios';
import { apiError } from '../../utils/helpers';
import { Loader2, Save, KeyRound, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';

export default function TenantProfile() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [form, setForm]       = useState({ full_name: '', email: '', phone: '' });
  const [pwd, setPwd]         = useState({ current_password: '', new_password: '', confirm: '' });
  const [showPwd, setShowPwd] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);

  useEffect(() => {
    api.get('/auth/me')
      .then(r => {
        const u = r.data.data || r.data.user || {};
        setProfile(u);
        setForm({ full_name: u.full_name || '', email: u.email || '', phone: u.phone || '' });
      })
      .catch(e => toast.error(apiError(e)))
      .finally(() => setLoading(false));
  }, []);

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      await api.put('/users/me', form);
      toast.success('Profile updated!');
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (pwd.new_password !== pwd.confirm) {
      toast.error('New passwords do not match.');
      return;
    }
    if (pwd.new_password.length < 6) {
      toast.error('New password must be at least 6 characters.');
      return;
    }
    setSavingPwd(true);
    try {
      await api.put('/auth/change-password', {
        current_password: pwd.current_password,
        new_password:     pwd.new_password,
      });
      toast.success('Password changed successfully!');
      setPwd({ current_password: '', new_password: '', confirm: '' });
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSavingPwd(false);
    }
  };

  if (loading) return (
    <div className="page-wrapper">
      <Sidebar />
      <div className="page-content flex items-center justify-center">
        <Loader2 className="animate-spin text-brand-500" size={32} />
      </div>
    </div>
  );

  return (
    <div className="page-wrapper">
      <Sidebar />
      <div className="page-content">
        <TopBar title="My Profile" subtitle="Manage your personal information" />
        <div className="page-inner max-w-2xl space-y-6">

          {/* Unit Info */}
          <div className="card p-5">
            <h2 className="font-semibold text-slate-800 dark:text-white mb-4">Account Details</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              {[
                { label: 'Username',  val: profile?.username },
                { label: 'Role',      val: profile?.role },
                { label: 'Member Since', val: profile?.created_at?.slice(0, 10) },
              ].map(({ label, val }) => (
                <div key={label}>
                  <p className="label">{label}</p>
                  <p className="font-medium text-slate-800 dark:text-slate-200">{val || '—'}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Edit Profile */}
          <div className="card p-5">
            <h2 className="font-semibold text-slate-800 dark:text-white mb-4">Personal Information</h2>
            <div className="space-y-4">
              <div className="form-group">
                <label className="label">Full Name</label>
                <input className="input" value={form.full_name}
                  onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="label">Email Address</label>
                <input className="input" type="email" value={form.email}
                  onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="label">Phone Number</label>
                <input className="input" type="tel" value={form.phone}
                  placeholder="+254 7XX XXX XXX"
                  onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
              </div>
              <div className="flex justify-end">
                <button className="btn-primary" onClick={handleSaveProfile} disabled={saving}>
                  {saving
                    ? <><Loader2 size={15} className="animate-spin" /> Saving…</>
                    : <><Save size={15} /> Save Changes</>
                  }
                </button>
              </div>
            </div>
          </div>

          {/* Change Password */}
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
              <KeyRound size={17} className="text-slate-500" />
              <h2 className="font-semibold text-slate-800 dark:text-white">Change Password</h2>
            </div>
            <div className="space-y-4">
              {['current_password', 'new_password', 'confirm'].map((field) => (
                <div key={field} className="form-group">
                  <label className="label">
                    {field === 'current_password' ? 'Current Password'
                      : field === 'new_password'  ? 'New Password'
                      : 'Confirm New Password'}
                  </label>
                  <div className="relative">
                    <input
                      className="input pr-10"
                      type={showPwd ? 'text' : 'password'}
                      value={pwd[field]}
                      onChange={e => setPwd(p => ({ ...p, [field]: e.target.value }))}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd(p => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                      tabIndex={-1}
                    >
                      {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
              ))}
              <div className="flex justify-end">
                <button className="btn-primary" onClick={handleChangePassword} disabled={savingPwd}>
                  {savingPwd
                    ? <><Loader2 size={15} className="animate-spin" /> Updating…</>
                    : <><KeyRound size={15} /> Update Password</>
                  }
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
