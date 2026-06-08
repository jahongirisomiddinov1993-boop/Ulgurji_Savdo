import React from "react";
import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from 'react-i18next';
import { ClerkProvider } from '@clerk/clerk-react';
import './App.css';
import { AuthProvider, useAuth } from "./AuthContext";
import LanguageSwitcher from "./LanguageSwitcher";
import Login from "./Login";
import KopVaqtSoat from "./KopVaqtSoat";
import Mahsulotlar from "./Mahsulotlar";
import Klientlar from "./Klientlar";
import Pudratchilar from "./Pudratchilar";
import Kassa from "./Kassa";
import Sotuv from "./Sotuv";
import Xarid from "./Xarid";
import AktSverka from "./AktSverka";
import BoshlangichQoldiq from "./BoshlangichQoldiq";
import Dashboard from "./Dashboard";
import TelegramLinkButton from "./TelegramLinkButton";
import Sozlamalar from "./Sozlamalar";

// Inline SVG iconlar — kutubxonasiz
const Ico = ({ d, size = 17 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p} />) : <path d={d} />}
  </svg>
);

const NavIcons = {
  home:    () => <Ico d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10" />,
  sales:   () => <Ico d={["M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z","M3 6h18","M16 10a4 4 0 0 1-8 0"]} />,
  buys:    () => <Ico d={["M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z","M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"]} />,
  kassa:   () => <Ico d={["M2 9h20v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9z","M2 9V7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v2","M12 13v4M10 15h4"]} />,
  akt:     () => <Ico d={["M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z","M14 2v6h6","M16 13H8M16 17H8M10 9H8"]} />,
  products:() => <Ico d={["M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 2 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z","M3.27 6.96L12 12.01l8.73-5.05","M12 22.08V12"]} />,
  clients: () => <Ico d={["M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2","M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z","M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"]} />,
  suppliers:()=> <Ico d={["M1 3h15v13H1zM16 8h4l3 3v5h-7V8z","M5.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM18.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"]} />,
  balance: () => <Ico d={["M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"]} />,
  settings:() => (
    <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  Logout:  () => <Ico d={["M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4","M16 17l5-5-5-5M21 12H9"]} />,
};

// Nav item tarjima kalitlari (label key) bilan tarif qilinadi
const navItems = [
  { path: '/',            labelKey: 'nav.home',            Icon: NavIcons.home },
  { path: '/sotuv',       labelKey: 'nav.sales',           Icon: NavIcons.sales },
  { path: '/xarid',       labelKey: 'nav.purchases',       Icon: NavIcons.buys },
  { path: '/kassa',       labelKey: 'nav.kassa',           Icon: NavIcons.kassa },
  { path: '/akt-sverka',  labelKey: 'nav.akt_sverka',      Icon: NavIcons.akt },
  { path: '/mahsulotlar', labelKey: 'nav.products',        Icon: NavIcons.products },
  { path: '/klientlar',   labelKey: 'nav.clients',         Icon: NavIcons.clients },
  { path: '/pudratchilar',labelKey: 'nav.suppliers',       Icon: NavIcons.suppliers },
  { path: '/boshlangich-qoldiq', labelKey: 'nav.opening_balance', Icon: NavIcons.balance },
  { path: '/sozlamalar',         labelKey: 'nav.settings',         Icon: NavIcons.settings },
];

const roleBadgeClass = {
  admin:            'badge-role-admin',
  seller:           'badge-role-seller',
  supplier_agent:   'badge-role-agent',
  warehouse_keeper: 'badge-role-warehouse',
};

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <span className="loading-text">Tekshirilmoqda...</span>
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

function AppLayout() {
  const { user, business, logout } = useAuth();
  const { t } = useTranslation();
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const location = useLocation();

  const badgeLabel = user?.role ? t(`roles.${user.role}`, { defaultValue: user.role }) : '';
  const badgeClass = roleBadgeClass[user?.role] || '';

  const closeSidebar = () => setSidebarOpen(false);

  const currentPage = navItems.find(item =>
    item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path)
  );
  const pageTitle = currentPage ? t(currentPage.labelKey) : '';

  return (
    <div className="app">
      {/* Mobile overlay */}
      {sidebarOpen && <div className="sidebar-overlay" onClick={closeSidebar} />}

      {/* ── Sidebar ── */}
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        {/* Brand */}
        <div className="sidebar-brand">
          <span className="sidebar-logo">📦</span>
          <div className="sidebar-brand-text">
            <div className="sidebar-title">Ulgurji Savdo</div>
            {business && <div className="sidebar-business">{business.business_name}</div>}
          </div>
        </div>

        {/* User avatar block */}
        <div className="sidebar-user-block">
          <div className="sidebar-avatar">
            {(user?.full_name || user?.username || 'U').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase()}
          </div>
          <div className="sidebar-user-meta">
            <div className="sidebar-user-name">{user?.full_name || user?.username}</div>
            <span className={`sidebar-role-badge ${badgeClass}`}>{badgeLabel}</span>
          </div>
        </div>

        {/* Navigation */}
        <div className="sidebar-nav-label">NAVIGATION</div>
        <nav className="sidebar-nav">
          {navItems.map(({ path, labelKey, Icon }) => (
            <NavLink
              key={path}
              to={path}
              end={path === '/'}
              className={({ isActive }) => `sidebar-item${isActive ? ' sidebar-active' : ''}`}
              onClick={closeSidebar}
            >
              <span className="sidebar-icon"><Icon /></span>
              <span className="sidebar-label">{t(labelKey)}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button className="sidebar-logout-btn" onClick={logout}>
            <NavIcons.Logout />
            <span>{t('app.logout')}</span>
          </button>
        </div>
      </aside>

      {/* ── Main wrapper ── */}
      <div className="main-wrapper">
        {/* Top bar (clock + user on desktop, hamburger on mobile) */}
        <header className="top-bar no-print">
          <button className="hamburger" onClick={() => setSidebarOpen(s => !s)}>
            {sidebarOpen ? '✕' : '☰'}
          </button>
          {/* Page breadcrumb */}
          <div className="topbar-breadcrumb">
            <span className="topbar-breadcrumb-home">{t('app.title')}</span>
            {pageTitle && <>
              <span className="topbar-breadcrumb-sep">›</span>
              <span className="topbar-breadcrumb-page">{pageTitle}</span>
            </>}
          </div>

          <div className="topbar-right">
            <KopVaqtSoat />
            <div className="topbar-user">
              <span className="topbar-user-name">{user?.full_name || user?.username}</span>
              <span className={`user-role-badge ${badgeClass}`}>{badgeLabel}</span>
            </div>
            <LanguageSwitcher />
            <TelegramLinkButton />
            <button className="btn btn-logout" onClick={logout}>🚪 {t('app.logout')}</button>
          </div>
        </header>

        <main className="main-content">
          <Routes>
            <Route path="/"            element={<Dashboard />} />
            <Route path="/mahsulotlar" element={<Mahsulotlar />} />
            <Route path="/sotuv"       element={<Sotuv />} />
            <Route path="/xarid"       element={<Xarid />} />
            <Route path="/klientlar"   element={<Klientlar />} />
            <Route path="/pudratchilar"element={<Pudratchilar />} />
            <Route path="/kassa"       element={<Kassa />} />
            <Route path="/akt-sverka"  element={<AktSverka />} />
            <Route path="/boshlangich-qoldiq" element={<BoshlangichQoldiq />} />
            <Route path="/sozlamalar" element={<Sozlamalar />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

function ClerkWithRouter({ children }) {
  const navigate = useNavigate();
  const clerkPublishableKey = process.env.REACT_APP_CLERK_PUBLISHABLE_KEY;
  return (
    <ClerkProvider
      publishableKey={clerkPublishableKey}
      routerPush={(to) => navigate(to)}
      routerReplace={(to) => navigate(to, { replace: true })}
    >
      {children}
    </ClerkProvider>
  );
}

function App() {
  return (
    <BrowserRouter>
      <ClerkWithRouter>
        <AuthProvider>
          <Routes>
            {/* Login sahifasi — himoyalanmagan */}
            <Route path="/login" element={<LoginGuard />} />

            {/* Barcha boshqa sahifalar — himoyalangan */}
            <Route path="/*" element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            } />
          </Routes>
        </AuthProvider>
      </ClerkWithRouter>
    </BrowserRouter>
  );
}

/**
 * LoginGuard — agar foydalanuvchi allaqachon tizimda bo'lsa, bosh sahifaga yo'naltiradi
 */
function LoginGuard() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <span className="loading-text">Tekshirilmoqda...</span>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <Login />;
}

export default App;