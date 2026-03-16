import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/axios';
import { apiError } from '../../utils/helpers';
import { Home, Eye, EyeOff, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

const roleRedirect = {
  manager:  '/manager/dashboard',
  landlord: '/landlord/dashboard',
  tenant:   '/tenant/dashboard',
};

export default function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();

  const [form, setForm]       = useState({ username: '', password: '' });
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  // If already logged in, redirect immediately
  if (user) return <Navigate to={roleRedirect[user.role] || '/'} replace />;

  const handleChange = (e) => {
    setForm(p => ({ ...p, [e.target.name]: e.target.value }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.username.trim() || !form.password.trim()) {
      setError('Please enter your username and password.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/auth/login', form);
      login(data.token, data.user);          // sets user in context + localStorage
      toast.success(`Welcome back, ${data.user.full_name}!`);
      navigate(roleRedirect[data.user.role] || '/', { replace: true });
    } catch (err) {
      const status = err?.response?.status;
      if (status === 401) {
        setError('Invalid username or password.');
      } else if (status === 403) {
        setError(apiError(err));
      } else {
        setError(apiError(err));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-brand-950 to-slate-900
                    flex items-center justify-center p-4">

      {/* Subtle background pattern */}
      <div className="absolute inset-0 opacity-5"
           style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '32px 32px' }} />

      <div className="relative w-full max-w-md animate-slide-up">

        {/* Card */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl
                        border border-slate-200 dark:border-slate-700 overflow-hidden">

          {/* Header band */}
          <div className="bg-brand-600 px-8 py-7">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <Home size={20} className="text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Rental MS</h1>
                <p className="text-brand-200 text-xs mt-0.5">Property Management System</p>
              </div>
            </div>
            <p className="text-white/70 text-sm mt-4">
              Sign in to your account to continue.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="px-8 py-7 space-y-5">

            {/* Error banner */}
            {error && (
              <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200
                              dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400
                              animate-fade-in">
                {error}
              </div>
            )}

            {/* Username */}
            <div className="form-group">
              <label className="label">Username / Unit Number</label>
              <input
                name="username"
                value={form.username}
                onChange={handleChange}
                placeholder="e.g. manager, admin, or 1A"
                className={`input ${error ? 'input-error' : ''}`}
                autoComplete="username"
                autoFocus
              />
            </div>

            {/* Password */}
            <div className="form-group">
              <label className="label">Password</label>
              <div className="relative">
                <input
                  name="password"
                  type={showPwd ? 'text' : 'password'}
                  value={form.password}
                  onChange={handleChange}
                  placeholder="Enter your password"
                  className={`input pr-10 ${error ? 'input-error' : ''}`}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2
                             text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                  tabIndex={-1}
                >
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-2.5 text-base mt-2"
            >
              {loading
                ? <><Loader2 size={18} className="animate-spin" /> Signing in…</>
                : 'Sign In'
              }
            </button>

            {/* Hint */}
            <div class="mt-6 p-4 bg-white-50 border border-blue-100 rounded-lg">
              <p class="text-md text-slate-600 dark:text-slate-800 pt-1">Demo Credentials:</p>
              <div class="text-xs text-slate-600 dark:text-slate-800 pt-2">
                <p><strong>Tenant: 1A/B1 = tenant123</strong> </p>
                <p><strong>Landlord : admin/landlord2 = admin123</strong></p>
                <p><strong>Manager: manager = manager123</strong></p>
              </div>
            </div>
            <p className="text-center text-xs text-slate-400 dark:text-slate-500 pt-1">
              Tenants: use your unit number as username (e.g.{' '}
              <span className="font-mono font-semibold">1A</span>)
            </p> 
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-500 mt-6">
          Rental Management System &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
