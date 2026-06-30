import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LuLayoutDashboard, LuMessageSquare, LuBriefcase, LuTag,
  LuCreditCard, LuRefreshCw, LuUsers, LuCloudUpload, LuFilePen,
  LuChartColumn, LuTimer, LuListChecks, LuFlag, LuSettings2, LuLogOut
} from 'react-icons/lu';

// Role visibility: ADMINS = admin + super admin; SUPER = super admin only;
// STAFF = everyone in the panel; AGENT = agents only.
const ADMINS = ['admin', 'superadmin'];
const SUPER = ['superadmin'];
const STAFF = ['admin', 'superadmin', 'agent'];
const AGENT = ['agent'];

const NAV_GROUPS = [
  {
    title: 'Overview',
    items: [
      { to: '/agent', icon: LuLayoutDashboard, label: 'My Portal', roles: AGENT },
      { to: '/admin', end: true, icon: LuLayoutDashboard, label: 'Dashboard', roles: ADMINS },
      { to: '/admin/sla', icon: LuTimer, label: 'SLA Monitor', roles: ADMINS },
      { to: '/admin/reports', icon: LuChartColumn, label: 'Analytics', roles: ADMINS },
    ],
  },
  {
    title: 'Sales',
    items: [
      { to: '/admin/inquiries', icon: LuMessageSquare, label: 'Inquiries', roles: ADMINS },
      { to: '/admin/bookings', icon: LuBriefcase, label: 'Bookings', roles: ADMINS },
      { to: '/admin/customers', icon: LuUsers, label: 'Customers', roles: ADMINS },
      { to: '/admin/coupons', icon: LuTag, label: 'Coupons', roles: ADMINS },
    ],
  },
  {
    title: 'Payments',
    items: [
      { to: '/admin/payment-links', icon: LuCreditCard, label: 'Payment Links', roles: STAFF },
      { to: '/admin/subscriptions', icon: LuRefreshCw, label: 'Subscriptions', roles: ADMINS },
    ],
  },
  {
    title: 'Operations',
    items: [
      { to: '/admin/agents', icon: LuUsers, label: 'Agents', roles: SUPER },
      { to: '/admin/bulk', icon: LuListChecks, label: 'Bulk Actions', roles: ADMINS },
      { to: '/admin/bulk-upload', icon: LuCloudUpload, label: 'Bulk Upload', roles: ADMINS },
      { to: '/admin/templates', icon: LuFilePen, label: 'Templates', roles: ADMINS },
    ],
  },
  {
    title: 'Settings',
    items: [
      { to: '/admin/feature-flags', icon: LuFlag, label: 'Feature Flags', roles: SUPER },
      { to: '/admin/price-settings', icon: LuSettings2, label: 'Price Settings', roles: SUPER },
    ],
  },
];

// The viewer's effective role for nav visibility: 'agent' | 'superadmin' | 'admin'.
function viewerRole() {
  try {
    const u = JSON.parse(localStorage.getItem('adminUser') || localStorage.getItem('user') || 'null');
    if (u?.role === 'agent') return 'agent';
    if (localStorage.getItem('isSuperAdmin') === 'true') return 'superadmin';
    return 'admin';
  } catch {
    return 'admin';
  }
}

function AdminSidebar({ collapsed, mobileOpen, onCloseMobile, onLogout }) {
  const role = viewerRole();
  const groups = NAV_GROUPS
    .map((g) => ({ ...g, items: g.items.filter((it) => it.roles.includes(role)) }))
    .filter((g) => g.items.length > 0);

  return (
    <>
      <aside className={`aps-sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'open' : ''}`}>
        <NavLink to={role === 'agent' ? '/agent' : '/admin'} end className="aps-brand">
          <span className="aps-brand-logo">J</span>
          <span className="aps-brand-text">
            {role === 'agent' ? 'Jetsetters Agent' : role === 'superadmin' ? 'Jetsetters · Super Admin' : 'Jetsetters Admin'}
          </span>
        </NavLink>

        <nav className="aps-nav" aria-label="Admin navigation">
          {groups.map((group) => (
            <div className="aps-nav-group" key={group.title}>
              <div className="aps-nav-group-title">{group.title}</div>
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={onCloseMobile}
                    className={({ isActive }) => `aps-nav-item ${isActive ? 'active' : ''}`}
                    title={item.label}
                  >
                    <Icon className="aps-nav-icon" aria-hidden="true" />
                    <span className="aps-nav-label">{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="aps-sidebar-footer">
          <button type="button" className="aps-footer-btn" onClick={onLogout}>
            <LuLogOut /> <span className="aps-nav-label">Sign out</span>
          </button>
        </div>
      </aside>
      <div
        className={`aps-backdrop ${mobileOpen ? 'open' : ''}`}
        onClick={onCloseMobile}
        aria-hidden="true"
      />
    </>
  );
}

export default React.memo(AdminSidebar);
