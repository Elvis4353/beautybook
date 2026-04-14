// src/App.jsx
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { useAuthStore, useTenantStore } from './lib/store';
import BookingPage from './pages/BookingPage';
import Dashboard from './pages/admin/Dashboard';
import BrandingSettings from './pages/admin/BrandingSettings';
import { useState } from 'react';

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 30000, retry: 1 } } });

function ProtectedRoute({ children }) {
  const token = useAuthStore(s => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

function AdminLayout({ children }) {
  const { user, logout } = useAuthStore();
  const tenant = useTenantStore(s => s.tenant);
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const nav = [
    { path: '/admin', label: 'Pārskats', icon: '▦' },
    { path: '/admin/appointments', label: 'Pieraksti', icon: '📅' },
    { path: '/admin/clients', label: 'Klienti', icon: '👤' },
    { path: '/admin/services', label: 'Pakalpojumi', icon: '✦' },
    { path: '/admin/whatsapp', label: 'WhatsApp', icon: '💬' },
    { path: '/admin/campaigns', label: 'E-pasta kampaņas', icon: '📧' },
    { path: '/admin/credits', label: 'Kredīti', icon: '💰' },
    { path: '/admin/branding', label: 'Dizains', icon: '🎨' },
    { path: '/admin/settings', label: 'Iestatījumi', icon: '⚙' },
  ];

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--color-background-tertiary)' }}>
      {/* Sidebar */}
      <div style={{ width: collapsed ? 52 : 200, background: 'var(--color-background-primary)', borderRight: '0.5px solid var(--color-border-tertiary)', display: 'flex', flexDirection: 'column', transition: 'width 0.2s', flexShrink: 0 }}>
        <div style={{ padding: collapsed ? '16px 14px' : '16px', borderBottom: '0.5px solid var(--color-border-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {!collapsed && (
            tenant?.logo_url
              ? <img src={tenant.logo_url} alt={tenant?.name} style={{ maxHeight: 28, maxWidth: 120 }} />
              : <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)', overflow: 'hidden', whiteSpace: 'nowrap' }}>{tenant?.name || 'BeautyBook'}</span>
          )}
          <button onClick={() => setCollapsed(c => !c)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', fontSize: 16, padding: 0 }}>
            {collapsed ? '→' : '←'}
          </button>
        </div>

        <nav style={{ flex: 1, padding: '8px 0' }}>
          {nav.map(item => {
            const active = location.pathname === item.path;
            return (
              <Link key={item.path} to={item.path}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: collapsed ? '8px 14px' : '8px 16px', textDecoration: 'none', fontSize: 13, color: active ? 'var(--color-text-info)' : 'var(--color-text-secondary)', background: active ? 'var(--color-background-info)' : 'transparent', fontWeight: active ? 500 : 400, whiteSpace: 'nowrap', overflow: 'hidden' }}>
                <span style={{ fontSize: 14, flexShrink: 0 }}>{item.icon}</span>
                {!collapsed && item.label}
              </Link>
            );
          })}
        </nav>

        <div style={{ padding: collapsed ? '12px 14px' : 12, borderTop: '0.5px solid var(--color-border-tertiary)' }}>
          {!collapsed && <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 4, overflow: 'hidden', whiteSpace: 'nowrap' }}>{user?.full_name}</div>}
          <button onClick={logout} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', fontSize: 12, padding: 0 }}>
            {collapsed ? '↩' : 'Iziet'}
          </button>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ background: 'var(--color-background-primary)', borderBottom: '0.5px solid var(--color-border-tertiary)', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
            {nav.find(n => n.path === location.pathname)?.label || 'Admin'}
          </div>
          <a href={`https://${tenant?.slug}.beautybook.lv`} target="_blank" rel="noreferrer"
            style={{ fontSize: 12, color: 'var(--color-text-info)', textDecoration: 'none', padding: '5px 12px', border: '0.5px solid var(--color-border-info)', borderRadius: 6 }}>
            Skatīt rezervāciju lapu ↗
          </a>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function LoginPage() {
  const setAuth = useAuthStore(s => s.setAuth);
  const token = useAuthStore(s => s.token);
  const [form, setForm] = useState({ email: '', password: '', tenantSlug: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (token) return <Navigate to="/admin" replace />;

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { default: { login } } = await import('./lib/api');
      const data = await login(form);
      setAuth(data.user, data.token, form.tenantSlug);
    } catch (err) {
      setError(err.response?.data?.error || 'Kļūda pieslēdzoties');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-background-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: 'var(--color-background-primary)', borderRadius: 16, padding: 40, width: '100%', maxWidth: 360, border: '0.5px solid var(--color-border-tertiary)' }}>
        <h1 style={{ fontSize: 22, fontWeight: 500, marginBottom: 8 }}>BeautyBook</h1>
        <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: 28 }}>Pieslēdzieties admin panelim</p>

        <form onSubmit={handleLogin}>
          {[['Salona kods (slug)', 'tenantSlug', 'text', 'mana-salonija'], ['E-pasts', 'email', 'email', 'info@...'], ['Parole', 'password', 'password', '••••••••']].map(([label, key, type, ph]) => (
            <div key={key} style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 5 }}>{label}</label>
              <input type={type} value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                placeholder={ph} required
                style={{ width: '100%', padding: '10px 12px', border: '0.5px solid var(--color-border-secondary)', borderRadius: 8, fontSize: 14, background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', outline: 'none' }} />
            </div>
          ))}
          {error && <p style={{ color: 'var(--color-text-danger)', fontSize: 13, marginBottom: 12 }}>{error}</p>}
          <button type="submit" disabled={loading}
            style={{ width: '100%', padding: 12, background: '#534AB7', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
            {loading ? 'Pieslēdzas...' : 'Pieslēgties'}
          </button>
        </form>
      </div>
    </div>
  );
}

// Lazy-loaded admin pages (in real project use React.lazy)
const PlaceholderPage = ({ title }) => (
  <div>
    <h1 style={{ fontSize: 20, fontWeight: 500, marginBottom: 12 }}>{title}</h1>
    <p style={{ color: 'var(--color-text-secondary)' }}>Šī sadaļa ir pieejama pilnajā projektā.</p>
  </div>
);

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Toaster position="top-right" />
        <Routes>
          {/* Public booking page */}
          <Route path="/book/:slug" element={<BookingPage />} />
          <Route path="/book" element={<BookingPage />} />

          {/* Auth */}
          <Route path="/login" element={<LoginPage />} />

          {/* Admin */}
          <Route path="/admin/*" element={
            <ProtectedRoute>
              <AdminLayout>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/branding" element={<BrandingSettings />} />
                  <Route path="/appointments" element={<PlaceholderPage title="Pieraksti" />} />
                  <Route path="/clients" element={<PlaceholderPage title="Klienti" />} />
                  <Route path="/services" element={<PlaceholderPage title="Pakalpojumi" />} />
                  <Route path="/whatsapp" element={<PlaceholderPage title="WhatsApp automātika" />} />
                  <Route path="/campaigns" element={<PlaceholderPage title="E-pasta kampaņas" />} />
                  <Route path="/credits" element={<PlaceholderPage title="Kredīti" />} />
                  <Route path="/settings" element={<PlaceholderPage title="Iestatījumi" />} />
                </Routes>
              </AdminLayout>
            </ProtectedRoute>
          } />

          <Route path="/" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
