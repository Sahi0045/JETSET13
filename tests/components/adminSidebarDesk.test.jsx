import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

const { default: AdminSidebar } = await import('../../frontend/src/Pages/Admin/shell/AdminSidebar.jsx');

/**
 * Reaching the support desk from the admin panel.
 *
 * The desk is its own page, because a support account cannot open the admin
 * panel - and the owner, looking for it in the panel, found nothing at all.
 * It is a plain link out of the panel: routed as a NavLink, the admin shell
 * would try to render a page it does not own.
 */

const renderSidebar = () => render(
  <MemoryRouter>
    <AdminSidebar collapsed={false} mobileOpen={false} onCloseMobile={() => {}} onLogout={() => {}} />
  </MemoryRouter>
);

afterEach(() => {
  try { localStorage.clear(); } catch { /* blocked storage */ }
});

describe('the admin sidebar', () => {
  it('offers the support desk to an admin, as a link out of the panel', () => {
    localStorage.setItem('adminUser', JSON.stringify({ role: 'admin' }));
    const { container } = renderSidebar();

    const link = [...container.querySelectorAll('a')].find((a) => /Support Desk/i.test(a.textContent));
    expect(link).toBeTruthy();
    expect(link.getAttribute('href')).toBe('/desk');
  });

  it('offers it to a super admin too', () => {
    localStorage.setItem('adminUser', JSON.stringify({ role: 'admin' }));
    localStorage.setItem('isSuperAdmin', 'true');
    const { container } = renderSidebar();

    expect([...container.querySelectorAll('a')].some((a) => /Support Desk/i.test(a.textContent))).toBe(true);
  });

  it('does not offer it to a travel agent', () => {
    localStorage.setItem('adminUser', JSON.stringify({ role: 'agent' }));
    const { container } = renderSidebar();

    expect([...container.querySelectorAll('a')].some((a) => /Support Desk/i.test(a.textContent))).toBe(false);
  });
});
