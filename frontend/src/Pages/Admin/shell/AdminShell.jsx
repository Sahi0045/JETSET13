import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { RefreshProvider } from './RefreshContext';
import AdminSidebar from './AdminSidebar';
import AdminHeader from './AdminHeader';
import './admin-shell.css';

const ROUTE_META = {
  '/admin': { title: 'Dashboard', crumb: 'Overview' },
  '/admin/sla': { title: 'SLA Monitor', crumb: 'Overview' },
  '/admin/reports': { title: 'Analytics', crumb: 'Overview' },
  '/admin/inquiries': { title: 'Inquiries', crumb: 'Sales' },
  '/admin/bookings': { title: 'Bookings', crumb: 'Sales' },
  '/admin/customers': { title: 'Customers', crumb: 'Sales' },
  '/admin/coupons': { title: 'Coupons', crumb: 'Sales' },
  '/admin/payment-links': { title: 'Payment Links', crumb: 'Payments' },
  '/admin/payment-links/create': { title: 'Create Payment Link', crumb: 'Payments' },
  '/admin/subscriptions': { title: 'Subscriptions', crumb: 'Payments' },
  '/admin/admins': { title: 'Admins', crumb: 'Operations' },
  '/admin/agents': { title: 'Agents', crumb: 'Operations' },
  '/admin/bulk': { title: 'Bulk Actions', crumb: 'Operations' },
  '/admin/bulk-upload': { title: 'Bulk Upload', crumb: 'Operations' },
  '/admin/templates': { title: 'Templates', crumb: 'Operations' },
  '/admin/feature-flags': { title: 'Feature Flags', crumb: 'Settings' },
  '/admin/price-settings': { title: 'Price Settings', crumb: 'Settings' },
};

function resolveMeta(pathname) {
  if (ROUTE_META[pathname]) return ROUTE_META[pathname];
  if (pathname.startsWith('/admin/inquiries/') && pathname.endsWith('/quote')) {
    return { title: 'Create Quote', crumb: 'Sales › Inquiries' };
  }
  if (pathname.startsWith('/admin/inquiries/')) {
    return { title: 'Inquiry Detail', crumb: 'Sales › Inquiries' };
  }
  if (pathname.startsWith('/admin/quotes/')) {
    return { title: 'Quote Detail', crumb: 'Sales › Quotes' };
  }
  return { title: 'Admin', crumb: '' };
}

function readAdminUser() {
  try {
    const raw = localStorage.getItem('adminUser');
    if (!raw) return { name: 'Admin', initial: 'A' };
    const u = JSON.parse(raw);
    const name = u.name || u.email || 'Admin';
    return { name, initial: (name[0] || 'A').toUpperCase() };
  } catch {
    return { name: 'Admin', initial: 'A' };
  }
}

export default function AdminShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('adminSidebarCollapsed') === '1'; } catch { return false; }
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  const meta = useMemo(() => resolveMeta(location.pathname), [location.pathname]);
  const user = useMemo(readAdminUser, []);

  // Separate endpoints: agents belong in the /agent portal, not the admin panel.
  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('adminUser') || localStorage.getItem('user') || 'null');
      if (u?.role === 'agent') navigate('/agent', { replace: true });
    } catch { /* ignore */ }
  }, [location.pathname, navigate]);

  const toggleSidebar = useCallback(() => {
    if (window.innerWidth <= 768) {
      setMobileOpen((v) => !v);
    } else {
      setCollapsed((v) => {
        const next = !v;
        try { localStorage.setItem('adminSidebarCollapsed', next ? '1' : '0'); } catch {}
        return next;
      });
    }
  }, []);

  const closeMobile = useCallback(() => setMobileOpen(false), []);

  const handleLogout = useCallback(() => {
    try {
      ['adminToken', 'adminUser', 'token', 'user', 'isAuthenticated', 'isSuperAdmin']
        .forEach((k) => localStorage.removeItem(k));
    } catch {}
    navigate('/admin/login', { replace: true });
  }, [navigate]);

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  return (
    <RefreshProvider>
      <div className="aps-shell">
        <AdminSidebar
          collapsed={collapsed}
          mobileOpen={mobileOpen}
          onCloseMobile={closeMobile}
          onLogout={handleLogout}
        />
        <div className="aps-main">
          <AdminHeader
            title={meta.title}
            breadcrumb={meta.crumb}
            onToggleSidebar={toggleSidebar}
            userInitial={user.initial}
            userName={user.name}
          />
          <main className="aps-content">
            <div className="aps-page">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </RefreshProvider>
  );
}
