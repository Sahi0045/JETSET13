import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../config/supabase';

const API_BASE = '/api';

// ─── Status colours ───────────────────────────────────────────
const STATUS_COLOR = {
  pending:     { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b' },
  in_progress: { bg: 'rgba(99,102,241,0.15)', color: '#818cf8' },
  approved:    { bg: 'rgba(16,185,129,0.15)', color: '#10b981' },
  rejected:    { bg: 'rgba(239,68,68,0.15)',  color: '#ef4444' },
  cancelled:   { bg: 'rgba(100,116,139,0.15)', color: '#64748b' },
};

const VALID_STATUSES = ['pending', 'in_progress', 'approved', 'rejected', 'cancelled'];

export default function BulkActions({ onActionComplete }) {
  const [inquiries,   setInquiries]   = useState([]);
  const [selected,    setSelected]    = useState(new Set());
  const [loading,     setLoading]     = useState(true);
  const [processing,  setProcessing]  = useState(false);
  const [newStatus,   setNewStatus]   = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [success,     setSuccess]     = useState('');
  const [error,       setError]       = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const url = statusFilter
        ? `${API_BASE}/inquiries?status=${statusFilter}&limit=200`
        : `${API_BASE}/inquiries?limit=200`;

      const res  = await fetch(url, { headers: { Authorization: `Bearer ${session?.access_token}` } });
      const json = await res.json();
      setInquiries(json.data || []);
    } catch (e) {
      setError('Failed to load inquiries');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const toggleSelect = useCallback((id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelected(prev =>
      prev.size === inquiries.length
        ? new Set()
        : new Set(inquiries.map(i => i.id))
    );
  }, [inquiries]);

  const applyBulkUpdate = useCallback(async () => {
    if (!newStatus || selected.size === 0) return;
    setProcessing(true);
    setSuccess('');
    setError('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const ids = Array.from(selected);

      const res = await fetch(`${API_BASE}/inquiries/bulk-update`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body:    JSON.stringify({ ids, status: newStatus }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message);

      setSuccess(`✓ ${ids.length} inquiries updated to "${newStatus}"`);
      setSelected(new Set());
      setNewStatus('');
      await load();
      onActionComplete?.();
    } catch (e) {
      setError(`Failed: ${e.message}`);
    } finally {
      setProcessing(false);
    }
  }, [selected, newStatus, load, onActionComplete]);

  return (
    <div style={{ padding: 24, fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: '#f1f5f9' }}>Bulk Actions</h2>
        <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: '0.875rem' }}>
          Select multiple inquiries to update them simultaneously
        </p>
      </div>

      {/* Controls bar */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center',
        background: 'rgba(255,255,255,0.03)', borderRadius: 12,
        border: '1px solid rgba(255,255,255,0.08)', padding: '14px 20px', marginBottom: 20,
      }}>
        {/* Filter */}
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          style={{
            padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(255,255,255,0.06)', color: '#cbd5e1', fontSize: '0.875rem',
          }}
        >
          <option value="">All Statuses</option>
          {VALID_STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>

        {/* Selected count */}
        <span style={{ color: '#94a3b8', fontSize: '0.875rem', marginLeft: 4 }}>
          {selected.size > 0 ? `${selected.size} selected` : `${inquiries.length} total`}
        </span>

        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', alignItems: 'center' }}>
          {/* New status picker */}
          <select
            value={newStatus}
            onChange={e => setNewStatus(e.target.value)}
            disabled={selected.size === 0}
            style={{
              padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)',
              background: selected.size > 0 ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.04)',
              color: selected.size > 0 ? '#a5b4fc' : '#475569', fontSize: '0.875rem',
            }}
          >
            <option value="">Set status…</option>
            {VALID_STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>

          {/* Apply button */}
          <button
            id="bulk-apply-btn"
            onClick={applyBulkUpdate}
            disabled={processing || selected.size === 0 || !newStatus}
            style={{
              padding: '8px 20px', borderRadius: 8, border: 'none',
              background: selected.size > 0 && newStatus ? '#6366f1' : 'rgba(255,255,255,0.06)',
              color: selected.size > 0 && newStatus ? '#fff' : '#475569',
              cursor: selected.size > 0 && newStatus ? 'pointer' : 'not-allowed',
              fontWeight: 600, fontSize: '0.875rem', transition: 'background 0.2s',
            }}
          >
            {processing ? 'Updating…' : 'Apply'}
          </button>
        </div>
      </div>

      {/* Feedback */}
      {success && <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 8, padding: '10px 16px', color: '#34d399', marginBottom: 16, fontSize: '0.875rem' }}>{success}</div>}
      {error   && <div style={{ background: 'rgba(239,68,68,0.1)',  border: '1px solid rgba(239,68,68,0.3)',  borderRadius: 8, padding: '10px 16px', color: '#f87171', marginBottom: 16, fontSize: '0.875rem' }}>{error}</div>}

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: 'center', color: '#94a3b8', padding: 60 }}>Loading inquiries…</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <th style={{ padding: '10px 16px', textAlign: 'left' }}>
                  <input
                    type="checkbox"
                    id="select-all-chk"
                    checked={selected.size === inquiries.length && inquiries.length > 0}
                    onChange={toggleAll}
                    style={{ cursor: 'pointer', width: 16, height: 16 }}
                  />
                </th>
                {['Customer', 'Email', 'Type', 'Status', 'Date'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', color: '#64748b', fontWeight: 600, textAlign: 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {inquiries.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: '#475569' }}>No inquiries found</td></tr>
              ) : inquiries.map(inq => {
                const isSelected = selected.has(inq.id);
                const sc = STATUS_COLOR[inq.status] || STATUS_COLOR.pending;
                return (
                  <tr
                    key={inq.id}
                    onClick={() => toggleSelect(inq.id)}
                    style={{
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      background: isSelected ? 'rgba(99,102,241,0.08)' : 'transparent',
                      cursor: 'pointer', transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <td style={{ padding: '12px 16px' }}>
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(inq.id)} onClick={e => e.stopPropagation()} style={{ cursor: 'pointer', width: 16, height: 16 }} />
                    </td>
                    <td style={{ padding: '12px 16px', color: '#e2e8f0', fontWeight: 500 }}>{inq.customer_name}</td>
                    <td style={{ padding: '12px 16px', color: '#94a3b8', fontSize: '0.8rem' }}>{inq.customer_email}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 600, background: 'rgba(99,102,241,0.12)', color: '#818cf8' }}>{inq.inquiry_type}</span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 600, background: sc.bg, color: sc.color }}>
                        {inq.status?.replace('_', ' ')}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', color: '#64748b', fontSize: '0.8rem' }}>
                      {new Date(inq.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
