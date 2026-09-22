import type { ReactNode } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { PasswordPage } from './pages/PasswordPage';
import { PassengerPortal } from './pages/PassengerPortal';
import { FinancePortal } from './pages/FinancePortal';
import { AdminPortal } from './pages/AdminPortal';
import { DriverPortal } from './pages/DriverPortal';
import { MarshalPortal } from './pages/MarshalPortal';
import { DispatchPortal } from './pages/DispatchPortal';
import { PosPortal } from './pages/PosPortal';
import { rolePath } from './services/api';
import type { UserRole } from './types/user';
function Protected({ role, children }: { role: UserRole | readonly UserRole[]; children: ReactNode }) {
  const { user, loading } = useAuth(); const location = useLocation();
  if (loading) return <main className="auth-main"><p role="status">Checking your session…</p></main>;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  const allowed = Array.isArray(role) ? (role as readonly UserRole[]).includes(user.role) : user.role === role;
  if (!allowed) return <Navigate to={rolePath[user.role]} replace />;
  return children;
}
export function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <a className="skip-link" href="#main-content">Skip to content</a>
          <div id="main-content">
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/forgot-password" element={<PasswordPage />} />
              <Route path="/reset-password" element={<PasswordPage reset />} />
              <Route path="/client" element={<Protected role="passenger"><PassengerPortal /></Protected>} />
              <Route path="/finance" element={<Protected role={['finance', 'admin'] as const}><FinancePortal /></Protected>} />
              <Route path="/admin" element={<Protected role="admin"><AdminPortal /></Protected>} />
              <Route path="/driver" element={<Protected role={['driver', 'admin'] as const}><DriverPortal /></Protected>} />
              <Route path="/marshal" element={<Protected role={['marshal', 'admin'] as const}><MarshalPortal /></Protected>} />
              <Route path="/dispatch" element={<Protected role={['dispatch', 'admin'] as const}><DispatchPortal /></Protected>} />
              <Route path="/pos" element={<Protected role={['pos', 'admin'] as const}><PosPortal /></Protected>} />
              <Route path="*" element={<main className="auth-main"><section className="panel"><h1>Page not found</h1><Link to="/">Return to trip search</Link></section></main>} />
            </Routes>
          </div>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
export default App;
