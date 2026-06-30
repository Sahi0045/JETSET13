import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';

// Routes where breadcrumbs add no value (home + auth/utility screens).
const HIDE_ON = new Set([
  '/',
  '/login',
  '/signup',
  '/supabase-login',
  '/supabase-signup',
  '/auth/callback',
  '/forgot-password',
  '/reset-password',
  '/complete-profile',
]);

// Overrides where auto title-casing isn't quite right.
const LABELS = {
  flight: 'Flights',
  flights: 'Flights',
  cruises: 'Cruises',
  faq: 'FAQs',
  faqs: 'FAQs',
  'my-trips': 'My Trips',
};

const prettify = (s) =>
  decodeURIComponent(s)
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

// Dynamic segments (ids / uuids) → a generic label rather than a raw id.
const isId = (s) =>
  /^\d+$/.test(s) ||
  /^[0-9a-f]{8,}$/i.test(s) ||
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s); // UUID

// The /visa/admin panel is shared by admins and agents, so the "admin" URL segment
// shouldn't read "Admin" for an agent. Reflect the logged-in panel role instead.
function storedPanelRole() {
  try {
    const raw =
      localStorage.getItem('visaAdminUser') ||
      localStorage.getItem('adminUser') ||
      localStorage.getItem('user');
    return raw ? JSON.parse(raw)?.role || null : null;
  } catch {
    return null;
  }
}

export default function Breadcrumbs() {
  const { pathname } = useLocation();
  if (HIDE_ON.has(pathname)) return null;

  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return null;

  // On the shared visa panel, relabel the "admin" crumb for agents.
  const isAgentOnVisaPanel =
    pathname.startsWith('/visa/admin') && storedPanelRole() === 'agent';

  let acc = '';
  const crumbs = segments.map((seg, i) => {
    acc += `/${seg}`;
    const key = seg.toLowerCase();
    let label = LABELS[key] || (isId(seg) ? 'Details' : prettify(seg));
    if (isAgentOnVisaPanel && key === 'admin') label = 'Agent';
    return { label, to: acc, last: i === segments.length - 1 };
  });

  return (
    <nav aria-label="Breadcrumb" className="w-full border-b border-gray-100 bg-white">
      <ol className="container mx-auto flex flex-wrap items-center gap-x-1.5 gap-y-1 px-4 py-2.5 text-sm">
        <li className="flex items-center">
          <Link to="/" className="flex items-center gap-1 text-gray-500 transition-colors hover:text-brand-teal">
            <Home className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Home</span>
          </Link>
        </li>
        {crumbs.map((c) => (
          <li key={c.to} className="flex items-center gap-1.5">
            <ChevronRight className="h-3.5 w-3.5 text-gray-300" aria-hidden="true" />
            {c.last ? (
              <span className="font-semibold text-ink" aria-current="page">
                {c.label}
              </span>
            ) : (
              <Link to={c.to} className="text-gray-500 transition-colors hover:text-brand-teal">
                {c.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
