import React, { useState, useEffect, useCallback } from 'react';
import { useRegisterRefresh } from './shell/RefreshContext';
import { getApiUrl } from '../../utils/apiHelper';
import './AdminPanel.css';

const getToken = () =>
  localStorage.getItem('adminToken') || localStorage.getItem('token') || localStorage.getItem('supabase_token');

const ACTOR_TYPES = ['all', 'admin', 'agent', 'user', 'system'];
const TARGET_TYPES = ['all', 'inquiry', 'quote', 'booking', 'visa_application', 'application', 'agent', 'user', 'payment_link', 'payment'];

const ACTOR_BADGE = {
  admin: { bg: '#dbeafe', color: '#1d4ed8' },
  agent: { bg: '#ede9fe', color: '#6d28d9' },
  user: { bg: '#f1f5f9', color: '#475569' },
  system: { bg: '#fef3c7', color: '#92400e' },
};

const ActivityLog = () => {
  const [logs, setLogs] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [actorType, setActorType] = useState('all');
  const [targetType, setTargetType] = useState('all');
  const [action, setAction] = useState('');
  const [actionInput, setActionInput] = useState('');

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (actorType !== 'all') params.append('actorType', actorType);
      if (targetType !== 'all') params.append('targetType', targetType);
      if (action) params.append('action', action);
      params.append('page', page); params.append('limit', 50);
      const res = await fetch(getApiUrl(`auth/audit-logs?${params.toString()}`), {
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) { setLogs(data.logs || []); setCount(data.count || 0); setTotalPages(data.totalPages || 1); }
    } catch (e) {
      console.error('activity log error:', e);
    } finally {
      setLoading(false);
    }
  }, [actorType, targetType, action, page]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);
  useRegisterRefresh(useCallback(() => fetchLogs(), [fetchLogs]), [fetchLogs]);

  const fmtTime = (d) => (d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
  const prettyAction = (a) => (a || '').replace(/_/g, ' ');
  const metaSummary = (m) => {
    if (!m || typeof m !== 'object') return '';
    const parts = Object.entries(m).slice(0, 3).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
    return parts.join(' · ');
  };

  const selStyle = { padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, background: 'white' };

  return (
    <div className="activity-log">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <p style={{ color: '#6b7280', margin: 0, fontSize: '0.95rem' }}>Who did what, across the whole platform. {count.toLocaleString()} events.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select value={actorType} onChange={(e) => { setActorType(e.target.value); setPage(1); }} style={selStyle}>
            {ACTOR_TYPES.map((t) => <option key={t} value={t}>{t === 'all' ? 'All actors' : t}</option>)}
          </select>
          <select value={targetType} onChange={(e) => { setTargetType(e.target.value); setPage(1); }} style={selStyle}>
            {TARGET_TYPES.map((t) => <option key={t} value={t}>{t === 'all' ? 'All targets' : t.replace(/_/g, ' ')}</option>)}
          </select>
          <form onSubmit={(e) => { e.preventDefault(); setAction(actionInput); setPage(1); }} style={{ display: 'flex', gap: 6 }}>
            <input value={actionInput} onChange={(e) => setActionInput(e.target.value)} placeholder="Action contains…" style={{ ...selStyle, minWidth: 160 }} />
            <button type="submit" style={{ background: '#055B75', color: 'white', border: 'none', padding: '8px 14px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>Filter</button>
          </form>
        </div>
      </div>

      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Loading activity…</div>
        ) : logs.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>No activity for these filters.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#94a3b8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.4px', borderBottom: '1px solid #f1f5f9' }}>
                  <th style={{ padding: '12px 16px' }}>When</th>
                  <th style={{ padding: '12px 8px' }}>Actor</th>
                  <th style={{ padding: '12px 8px' }}>Action</th>
                  <th style={{ padding: '12px 8px' }}>Target</th>
                  <th style={{ padding: '12px 16px' }}>Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => {
                  const ab = ACTOR_BADGE[l.actor_type] || ACTOR_BADGE.user;
                  return (
                    <tr key={l.id} style={{ borderTop: '1px solid #f8fafc' }}>
                      <td style={{ padding: '10px 16px', color: '#64748b', whiteSpace: 'nowrap' }}>{fmtTime(l.created_at)}</td>
                      <td style={{ padding: '10px 8px' }}>
                        <span style={{ background: ab.bg, color: ab.color, padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 700, textTransform: 'capitalize' }}>{l.actor_type || 'user'}</span>
                        {l.actor && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{l.actor.name || l.actor.email}</div>}
                      </td>
                      <td style={{ padding: '10px 8px', fontWeight: 600, color: '#1e293b', textTransform: 'capitalize' }}>{prettyAction(l.action)}</td>
                      <td style={{ padding: '10px 8px', color: '#475569' }}>
                        <span style={{ textTransform: 'capitalize' }}>{(l.target_type || '—').replace(/_/g, ' ')}</span>
                        {l.target_id && <div style={{ fontSize: 11, color: '#cbd5e1', fontFamily: 'monospace' }}>{String(l.target_id).slice(0, 8)}</div>}
                      </td>
                      <td style={{ padding: '10px 16px', color: '#94a3b8', fontSize: 12, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis' }}>{metaSummary(l.metadata)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 16 }}>
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', opacity: page <= 1 ? 0.5 : 1 }}>← Prev</button>
          <span style={{ fontSize: 13, color: '#64748b' }}>Page {page} of {totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', opacity: page >= totalPages ? 0.5 : 1 }}>Next →</button>
        </div>
      )}
    </div>
  );
};

export default ActivityLog;
