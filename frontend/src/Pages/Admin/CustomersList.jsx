import React, { useState, useEffect, useCallback } from 'react';
import { useRegisterRefresh } from './shell/RefreshContext';
import { getApiUrl } from '../../utils/apiHelper';
import { downloadCSV } from '../../utils/csv';
import './AdminPanel.css';

const getToken = () =>
  localStorage.getItem('adminToken') || localStorage.getItem('token') || localStorage.getItem('supabase_token');

const money = (n) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const CustomersList = () => {
  const [customers, setCustomers] = useState([]);
  const [summary, setSummary] = useState({ totalCustomers: 0, totalSpent: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');

  const fetchCustomers = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (query) params.append('search', query);
      const res = await fetch(getApiUrl(`flights/admin-customers?${params.toString()}`), {
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        setCustomers(data.data || []);
        setSummary(data.summary || { totalCustomers: data.count || 0, totalSpent: 0 });
      }
    } catch (e) {
      console.error('Error fetching customers:', e);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);
  useRegisterRefresh(useCallback(() => fetchCustomers(), [fetchCustomers]), [fetchCustomers]);

  const formatDate = (d) => (d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');

  return (
    <div className="customers-list">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <p style={{ color: '#6b7280', margin: 0, fontSize: '0.95rem' }}>Everyone who has booked or enquired, across all services.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={() => downloadCSV(`customers-${Date.now()}.csv`, customers, [
              { label: 'Name', key: 'name' }, { label: 'Email', key: 'email' }, { label: 'Phone', key: 'phone' },
              { label: 'Bookings', key: 'bookings' }, { label: 'Total Spent', key: 'spent' }, { label: 'Inquiries', key: 'inquiries' },
              { label: 'Last Activity', get: (c) => (c.lastActivity ? new Date(c.lastActivity).toISOString() : '') },
            ])}
            disabled={customers.length === 0}
            style={{ background: 'white', color: '#055B75', border: '1px solid #cbd5e1', padding: '9px 16px', borderRadius: 8, fontWeight: 600, cursor: 'pointer', opacity: customers.length === 0 ? 0.5 : 1 }}>
            ⬇ Export CSV
          </button>
          <form onSubmit={(e) => { e.preventDefault(); setQuery(search); }} style={{ display: 'flex', gap: 8 }}>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, phone…"
              style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14, minWidth: 220 }} />
            <button type="submit" style={{ background: '#055B75', color: 'white', border: 'none', padding: '9px 18px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>Search</button>
          </form>
        </div>
      </div>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 24, maxWidth: 460 }}>
        <div style={{ background: 'white', borderRadius: 12, padding: '16px 20px', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#3b82f6' }}>{summary.totalCustomers}</div>
          <div style={{ fontSize: 13, color: '#64748b' }}>Customers</div>
        </div>
        <div style={{ background: 'white', borderRadius: 12, padding: '16px 20px', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#10b981' }}>{money(summary.totalSpent)}</div>
          <div style={{ fontSize: 13, color: '#64748b' }}>Total spent (paid)</div>
        </div>
      </div>

      {loading ? (
        <div className="admin-dashboard"><div className="dashboard-loading"><div className="loading-spinner-large"><div className="spinner-ring"></div><div className="spinner-ring"></div><div className="spinner-ring"></div></div><h3>Loading customers…</h3></div></div>
      ) : customers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>👥</div>
          <h3>No customers found</h3>
          <p style={{ color: '#64748b' }}>{query ? 'Try a different search.' : 'Customers appear here once they book or enquire.'}</p>
        </div>
      ) : (
        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#94a3b8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.4px', borderBottom: '1px solid #f1f5f9' }}>
                  <th style={{ padding: '12px 16px' }}>Customer</th>
                  <th style={{ padding: '12px 8px' }}>Phone</th>
                  <th style={{ padding: '12px 8px', textAlign: 'center' }}>Bookings</th>
                  <th style={{ padding: '12px 8px', textAlign: 'right' }}>Spent</th>
                  <th style={{ padding: '12px 8px', textAlign: 'center' }}>Inquiries</th>
                  <th style={{ padding: '12px 16px' }}>Last activity</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.email} style={{ borderTop: '1px solid #f8fafc' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 600, color: '#1e293b' }}>{c.name || '—'}</div>
                      <div style={{ fontSize: 12, color: '#94a3b8' }}>{c.email}</div>
                    </td>
                    <td style={{ padding: '12px 8px', color: '#64748b' }}>{c.phone || '—'}</td>
                    <td style={{ padding: '12px 8px', textAlign: 'center', fontWeight: 600 }}>{c.bookings}</td>
                    <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: 700, color: '#10b981' }}>{money(c.spent)}</td>
                    <td style={{ padding: '12px 8px', textAlign: 'center', color: '#64748b' }}>{c.inquiries}</td>
                    <td style={{ padding: '12px 16px', color: '#94a3b8', fontSize: 13 }}>{formatDate(c.lastActivity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomersList;
