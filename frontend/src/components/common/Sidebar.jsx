import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useState, useEffect } from 'react';
import api from '../../api/axios';
import {
  LayoutDashboard, Users, FileText, Droplets,
  MessageSquare, Bell, Wrench, BarChart3, Building2,
  CreditCard, User, LogOut, Sun, Moon, Home, ClipboardList,
} from 'lucide-react';

const tenantLinks = [
  { to: '/tenant/dashboard',  label: 'Dashboard',   icon: LayoutDashboard },
  { to: '/tenant/payments',   label: 'Payments',    icon: CreditCard },
  { to: '/tenant/utilities',  label: 'Utilities',   icon: Droplets },
  { to: '/tenant/inbox',      label: 'Inbox',       icon: MessageSquare, badge: true },
  { to: '/tenant/profile',    label: 'Profile',     icon: User },
];

const landlordLinks = [
  { to: '/landlord/dashboard',      label: 'Dashboard',     icon: LayoutDashboard },
  { to: '/landlord/tenants',        label: 'Tenants',       icon: Users },
  { to: '/landlord/billing',        label: 'Billing',       icon: FileText },
  { to: '/landlord/utilities',      label: 'Utilities',     icon: Droplets },
  { to: '/landlord/inbox',          label: 'Inbox',         icon: MessageSquare, badge: true },
  { to: '/landlord/notifications',  label: 'Notifications', icon: Bell },
  { to: '/landlord/maintenance',    label: 'Maintenance',   icon: Wrench },
  { to: '/landlord/visitors',       label: 'Visitor Log',   icon: ClipboardList },
];

const managerLinks = [
  { to: '/manager/dashboard',         label: 'Dashboard',        icon: LayoutDashboard },
  { to: '/manager/properties',        label: 'Properties',       icon: Building2 },
  { to: '/manager/finance',           label: 'Finance',          icon: BarChart3 },
  { to: '/manager/utility-reports',   label: 'Utility Reports',  icon: Droplets },
  { to: '/manager/users',             label: 'Users',            icon: Users },
];

const roleLinks = { tenant: tenantLinks, landlord: landlordLinks, manager: managerLinks };
const roleMeta  = {
  tenant:   { label: 'Tenant Portal',   color: 'text-emerald-500' },
  landlord: { label: 'Landlord Portal', color: 'text-brand-500'   },
  manager:  { label: 'Manager Portal',  color: 'text-purple-500'  },
};

export default function Sidebar() {
  const { user, logout, login } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);

  const links = roleLinks[user?.role] || [];
  const meta  = roleMeta[user?.role]  || { label: 'Portal', color: 'text-slate-500' };

  const isDesktop = () => window.matchMedia?.('(min-width: 1024px)')?.matches;

  useEffect(() => {
    // Keep drawer closed on small screens, always open-ish on desktop (CSS makes it visible)
    const sync = () => setMobileOpen(false);
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, []);

  useEffect(() => {
    const onToggle = () => {
      if (isDesktop()) return; // desktop sidebar is always visible
      setMobileOpen(v => !v);
    };
    window.addEventListener('rms:toggleSidebar', onToggle);
    return () => window.removeEventListener('rms:toggleSidebar', onToggle);
  }, []);

  // Poll unread count every 30s for roles that have inbox
  useEffect(() => {
    if (!['tenant','landlord'].includes(user?.role)) return;
    const fetchCount = () => {
      api.get('/messages/unread-count')
        .then(r => setUnreadCount(r.data.data?.count || 0))
        .catch(() => {});
    };
    fetchCount();
    const interval = setInterval(fetchCount, 30000);
    return () => clearInterval(interval);
  }, [user?.role]);

  const handleLogout = () => { logout(); navigate('/login'); };

  const canReturnToManager =
    user?.role === 'landlord' &&
    !!localStorage.getItem('rms_impersonator_token') &&
    !!localStorage.getItem('rms_impersonator_user');

  const handleReturnToManager = () => {
    try {
      const token = localStorage.getItem('rms_impersonator_token');
      const userJson = localStorage.getItem('rms_impersonator_user');
      if (!token || !userJson) return;
      const originalUser = JSON.parse(userJson);

      // restore manager session
      localStorage.setItem('rms_token', token);
      localStorage.setItem('rms_user', JSON.stringify(originalUser));
      localStorage.removeItem('rms_impersonator_token');
      localStorage.removeItem('rms_impersonator_user');

      login(token, originalUser);
      navigate('/manager/dashboard');
    } catch {
      // fall back to logout to avoid getting stuck
      localStorage.removeItem('rms_impersonator_token');
      localStorage.removeItem('rms_impersonator_user');
      handleLogout();
    }
  };

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside className={`sidebar ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
      {/* Brand */}
      <div className="px-5 py-5 border-b border-slate-200 dark:border-slate-700/60">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center shrink-0">
            <Home size={16} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900 dark:text-white leading-none">RentalMS</p>
            <p className={`text-xs font-medium mt-0.5 ${meta.color}`}>{meta.label}</p>
          </div>
        </div>
      </div>

      {/* User info */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700/60">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-brand-700 dark:text-brand-400">
              {user?.full_name?.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">
              {user?.full_name}
            </p>
            {user?.unit_number && (
              <p className="text-xs text-slate-500 dark:text-slate-400">Unit {user.unit_number}</p>
            )}
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {links.map(({ to, label, icon: Icon, badge }) => (
          <NavLink key={to} to={to}
            onClick={() => { if (!isDesktop()) setMobileOpen(false); }}
            className={({ isActive }) => `nav-item ${isActive ? 'nav-item-active' : ''}`}>
            <Icon size={17} />
            <span className="flex-1">{label}</span>
            {badge && unreadCount > 0 && (
              <span className="ml-auto bg-brand-600 text-white text-xs font-bold
                               px-1.5 py-0.5 rounded-full leading-none min-w-[18px] text-center">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom controls */}
      <div className="px-3 py-4 border-t border-slate-200 dark:border-slate-700/60 space-y-1">
        {canReturnToManager && (
          <button onClick={handleReturnToManager} className="nav-item w-full">
            <User size={17} />
            <span>Return to Manager</span>
          </button>
        )}
        <button onClick={toggleTheme} className="nav-item w-full">
          {theme === 'dark'
            ? <><Sun size={17} /><span>Light Mode</span></>
            : <><Moon size={17} /><span>Dark Mode</span></>}
        </button>
        <button onClick={handleLogout}
          className="nav-item w-full text-red-500 dark:text-red-400
                     hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600">
          <LogOut size={17} />
          <span>Logout</span>
        </button>
      </div>
      </aside>
    </>
  );
}