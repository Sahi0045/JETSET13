import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LuLayoutDashboard, LuMessageSquare, LuBriefcase, LuTag,
  LuCreditCard, LuRefreshCw, LuUsers, LuCloudUpload, LuFilePen,
  LuChartColumn, LuTimer, LuListChecks, LuFlag, LuSettings2, LuLogOut
} from 'react-icons/lu';

const NAV_GROUPS = [
  {
    title: 'Overview',
    items: [
      { to: '/admin', end: true, icon: LuLayoutDashboard, label: 'Dashboard' },
      { to: '/admin/sla', icon: LuTimer, label: 'SLA Monitor' },
      { to: '/admin/reports', icon: LuChartColumn, label: 'Analytics' },
    ],
  },
  {
    title: 'Sales',
    items: [
      { to: '/admin/inquiries', icon: LuMessageSquare, label: 'Inquiries' },
      { to: '/admin/bookings', icon: LuBriefcase, label: 'Bookings' },
      { to: '/admin/coupons', icon: LuTag, label: 'Coupons' },
    ],
  },
  {
    title: 'Payments',
    items: [
      { to: '/admin/payment-links', icon: LuCreditCard, label: 'Payment Links' },
      { to: '/admin/subscriptions', icon: LuRefreshCw, label: 'Subscriptions' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { to: '/admin/agents', icon: LuUsers, label: 'Agents' },
      { to: '/admin/bulk', icon: LuListChecks, label: 'Bulk Actions' },
      { to: '/admin/bulk-upload', icon: LuCloudUpload, label: 'Bulk Upload' },
      { to: '/admin/templates', icon: LuFilePen, label: 'Templates' },
    ],
  },
  {
    title: 'Settings',
    items: [
      { to: '/admin/feature-flags', icon: LuFlag, label: 'Feature Flags' },
      { to: '/admin/price-settings', icon: LuSettings2, label: 'Price Settings' },
    ],
  },
];

function AdminSidebar({ collapsed, mobileOpen, onCloseMobile, onLogout }) {
  return (
    <>
      <aside className={`aps-sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'open' : ''}`}>
        <NavLink to="/admin" end className="aps-brand">
          <span className="aps-brand-logo">J</span>
          <span className="aps-brand-text">Jetsetters Admin</span>
        </NavLink>

        <nav className="aps-nav" aria-label="Admin navigation">
          {NAV_GROUPS.map((group) => (
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
