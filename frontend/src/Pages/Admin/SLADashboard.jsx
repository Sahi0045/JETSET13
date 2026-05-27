import React, { useState, useEffect, useCallback } from 'react';
import supabase from '../../lib/supabase';
import { useRegisterRefresh } from './shell/RefreshContext';

const API_BASE = '/api';

// ─── Status badge helper ──────────────────────────────────────
const SLABadge = ({ pct, isBreached, isWarning }) => {
  const color = isBreached ? '#ef4444' : isWarning ? '#f59e0b' : '#10b981';
  const bg    = isBreached ? 'rgba(239,68,68,0.12)' : isWarning ? 'rgba(245,158,11,0.12)' : 'rgba(16,185,129,0.12)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.5s' }} />
      </div>
      <span style={{ fontSize: '0.72rem', color, background: bg, padding: '2px 8px', borderRadius: 20, fontWeight: 600, whiteSpace: 'nowrap' }}>
        {isBreached ? 'BREACHED' : isWarning ? 'AT RISK' : 'ON TRACK'}
      </span>
    </div>
  );
};

export default function SLADashboard() {
  const [data,     setData]     = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [filter,   setFilter]   = useState('all'); // all|breached|at_risk|on_track
  const [sortBy,   setSortBy]   = useState('hours_elapsed'); // hours_elapsed|sla_pct|inquiry_type

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${API_BASE}/analytics/sla`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message);
      setData(json.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useRegisterRefresh(load, [load]);

  const inquiries = data?.inquiries || [];
  const summary   = data?.summary   || {};

  const filtered = inquiries
    .filter(i => {
      if (filter === 'breached') return i.is_breached;
      if (filter === 'at_risk')  return i.is_warning;
      if (filter === 'on_track') return !i.is_breached && !i.is_warning;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'sla_pct')        return b.sla_pct - a.sla_pct;
      if (sortBy === 'inquiry_type')   return a.inquiry_type.localeCompare(b.inquiry_type);
      return parseFloat(b.hours_elapsed) - parseFloat(a.hours_elapsed);
    });

  const statCards = [
    { label: 'Active',    value: summary.total_active || 0, color: '#6366f1', icon: '📋' },
    { label: 'Breached',  value: summary.breached    || 0, color: '#ef4444', icon: '🚨' },
    { label: 'At Risk',   value: summary.at_risk     || 0, color: '#f59e0b', icon: '⚠️' },
    { label: 'On Track',  value: summary.on_track    || 0, color: '#10b981', icon: '✅' },
  ];

  return (
    <div style={{ padding: '24px', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: '#f1f5f9' }}>SLA Tracking</h2>
          <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: '0.875rem' }}>
            Service Level Agreement monitoring — live view
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          id="sla-refresh-btn"
          style={{
            padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)',
            background: 'rgba(255,255,255,0.05)', color: '#cbd5e1', cursor: 'pointer', fontSize: '0.875rem',
          }}
        >
          {loading ? '⟳ Refreshing…' : '⟳ Refresh'}
        </button>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16, marginBottom: 28 }}>
        {statCards.map(c => (
          <div
            key={c.label}
            onClick={() => setFilter(c.label.toLowerCase().replace(' ', '_'))}
            style={{
              background:   'rgba(255,255,255,0.04)',
              border:       `1px solid ${c.color}30`,
              borderRadius: 12, padding: '16px 20px', cursor: 'pointer',
              transition:   'border-color 0.2s, transform 0.2s',
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = c.color}
            onMouseLeave={e => e.currentTarget.style.borderColor = `${c.color}30`}
          >
            <div style={{ fontSize: '1.5rem', marginBottom: 6 }}>{c.icon}</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 700, color: c.color }}>{c.value}</div>
            <div style={{ color: '#94a3b8', fontSize: '0.8rem' }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {['all', 'breached', 'at_risk', 'on_track'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding:    '6px 14px',
              borderRadius: 20,
              border:     'none',
              background: filter === f ? '#6366f1' : 'rgba(255,255,255,0.06)',
              color:      filter === f ? '#fff' : '#94a3b8',
              cursor:     'pointer', fontSize: '0.8rem', fontWeight: 500,
            }}
          >
            {f.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
          </button>
        ))}
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value)}
          style={{
            marginLeft: 'auto', padding: '6px 12px', borderRadius: 8,
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
            color: '#cbd5e1', fontSize: '0.8rem', cursor: 'pointer',
          }}
        >
          <option value="hours_elapsed">Sort: Time Elapsed</option>
          <option value="sla_pct">Sort: SLA %</option>
          <option value="inquiry_type">Sort: Type</option>
        </select>
      </div>

      {/* Table */}
      {loading && (
        <div style={{ textAlign: 'center', color: '#94a3b8', padding: 40 }}>Loading SLA data…</div>
      )}
      {error && (
        <div style={{ textAlign: 'center', color: '#f87171', padding: 40 }}>Error: {error}</div>
      )}
      {!loading && !error && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                {['Customer', 'Type', 'Status', 'Elapsed', 'SLA Target', 'Progress'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', color: '#64748b', fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>No inquiries match this filter</td></tr>
              ) : filtered.map(inq => (
                <tr
                  key={inq.id}
                  style={{
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    background: inq.is_breached ? 'rgba(239,68,68,0.04)' : inq.is_warning ? 'rgba(245,158,11,0.04)' : 'transparent',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                  onMouseLeave={e => e.currentTarget.style.background = inq.is_breached ? 'rgba(239,68,68,0.04)' : inq.is_warning ? 'rgba(245,158,11,0.04)' : 'transparent'}
                >
                  <td style={{ padding: '12px 16px', color: '#e2e8f0', fontWeight: 500 }}>{inq.customer_name}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{
                      padding: '3px 10px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 600,
                      background: 'rgba(99,102,241,0.15)', color: '#818cf8',
                    }}>{inq.inquiry_type}</span>
                  </td>
                  <td style={{ padding: '12px 16px', color: '#94a3b8' }}>{inq.status}</td>
                  <td style={{ padding: '12px 16px', color: inq.is_breached ? '#ef4444' : '#cbd5e1', fontWeight: inq.is_breached ? 700 : 400 }}>
                    {inq.hours_elapsed}h
                  </td>
                  <td style={{ padding: '12px 16px', color: '#64748b' }}>{inq.sla_hours}h</td>
                  <td style={{ padding: '12px 16px', minWidth: 160 }}>
                    <SLABadge pct={inq.sla_pct} isBreached={inq.is_breached} isWarning={inq.is_warning} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
