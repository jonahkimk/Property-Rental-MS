import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { Loader2 } from 'lucide-react';

// Auth
import LoginPage from './pages/auth/LoginPage';

// Tenant
import TenantDashboard  from './pages/tenant/Dashboard';
import TenantPayments   from './pages/tenant/Payments';
import TenantUtilities  from './pages/tenant/Utilities';
import TenantInbox      from './pages/tenant/Inbox';
import TenantProfile    from './pages/tenant/Profile';

// Landlord
import LandlordDashboard      from './pages/landlord/Dashboard';
import LandlordTenants        from './pages/landlord/Tenants';
import LandlordBilling        from './pages/landlord/Billing';
import LandlordUtilities      from './pages/landlord/Utilities';
import LandlordNotifications  from './pages/landlord/Notifications';
import LandlordMaintenance    from './pages/landlord/Maintenance';
import LandlordInbox          from './pages/landlord/Inbox';
import LandlordVisitorLog     from './pages/landlord/VisitorLog';

// Manager
import ManagerDashboard       from './pages/manager/Dashboard';
import ManagerProperties      from './pages/manager/Properties';
import ManagerFinance         from './pages/manager/Finance';
import ManagerUtilityReports  from './pages/manager/UtilityReports';
import ManagerUsers           from './pages/manager/Users';

// ── Spinner ──────────────────────────────────────────────────
function FullPageSpinner() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-950">
      <Loader2 className="animate-spin text-brand-500" size={36} />
    </div>
  );
}

// ── Protected route ──────────────────────────────────────────
function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (!user)   return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/unauthorized" replace />;
  return children;
}

// ── Role redirect after login ────────────────────────────────
function RoleRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (!user)   return <Navigate to="/login" replace />;
  if (user.role === 'manager')  return <Navigate to="/manager/dashboard"  replace />;
  if (user.role === 'landlord') return <Navigate to="/landlord/dashboard" replace />;
  if (user.role === 'tenant')   return <Navigate to="/tenant/dashboard"   replace />;
  return <Navigate to="/login" replace />;
}

// ── Short-hand wrappers ──────────────────────────────────────
const T  = (C) => <ProtectedRoute roles={['tenant']}  ><C /></ProtectedRoute>;
const L  = (C) => <ProtectedRoute roles={['landlord']}><C /></ProtectedRoute>;
const M  = (C) => <ProtectedRoute roles={['manager']} ><C /></ProtectedRoute>;

function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/"      element={<RoleRedirect />} />

      <Route path="/unauthorized" element={
        <div className="flex items-center justify-center min-h-screen text-red-500 text-lg font-semibold">
          403 — You don't have permission to view this page.
        </div>
      } />

      {/* ── Tenant ─────────────────────────────────────── */}
      <Route path="/tenant/dashboard"  element={<ProtectedRoute roles={['tenant']}><TenantDashboard /></ProtectedRoute>} />
      <Route path="/tenant/payments"   element={<ProtectedRoute roles={['tenant']}><TenantPayments /></ProtectedRoute>} />
      <Route path="/tenant/utilities"  element={<ProtectedRoute roles={['tenant']}><TenantUtilities /></ProtectedRoute>} />
      <Route path="/tenant/inbox"     element={<ProtectedRoute roles={['tenant']}><TenantInbox /></ProtectedRoute>} />
      <Route path="/tenant/profile"    element={<ProtectedRoute roles={['tenant']}><TenantProfile /></ProtectedRoute>} />

      {/* ── Landlord ───────────────────────────────────── */}
      <Route path="/landlord/dashboard"      element={<ProtectedRoute roles={['landlord']}><LandlordDashboard /></ProtectedRoute>} />
      <Route path="/landlord/tenants"        element={<ProtectedRoute roles={['landlord']}><LandlordTenants /></ProtectedRoute>} />
      <Route path="/landlord/billing"        element={<ProtectedRoute roles={['landlord']}><LandlordBilling /></ProtectedRoute>} />
      <Route path="/landlord/utilities"      element={<ProtectedRoute roles={['landlord']}><LandlordUtilities /></ProtectedRoute>} />
      <Route path="/landlord/notifications"  element={<ProtectedRoute roles={['landlord']}><LandlordNotifications /></ProtectedRoute>} />
      <Route path="/landlord/maintenance"    element={<ProtectedRoute roles={['landlord']}><LandlordMaintenance /></ProtectedRoute>} />
      <Route path="/landlord/inbox"          element={<ProtectedRoute roles={['landlord']}><LandlordInbox /></ProtectedRoute>} />
      <Route path="/landlord/visitors"       element={<ProtectedRoute roles={['landlord']}><LandlordVisitorLog /></ProtectedRoute>} />

      {/* ── Manager ────────────────────────────────────── */}
      <Route path="/manager/dashboard"        element={<ProtectedRoute roles={['manager']}><ManagerDashboard /></ProtectedRoute>} />
      <Route path="/manager/properties"       element={<ProtectedRoute roles={['manager']}><ManagerProperties /></ProtectedRoute>} />
      <Route path="/manager/finance"          element={<ProtectedRoute roles={['manager']}><ManagerFinance /></ProtectedRoute>} />
      <Route path="/manager/utility-reports"  element={<ProtectedRoute roles={['manager']}><ManagerUtilityReports /></ProtectedRoute>} />
      <Route path="/manager/users"            element={<ProtectedRoute roles={['manager']}><ManagerUsers /></ProtectedRoute>} />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: { fontFamily: 'Outfit, sans-serif', fontSize: '14px' },
            }}
          />
          <AppRoutes />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}