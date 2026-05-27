import React, { useState, useEffect, useCallback } from 'react';
import supabase from '../../lib/supabase';
import { useRegisterRefresh } from './shell/RefreshContext';

const API_BASE = '/api';

const STATUS_COLOR = {
  pending: { bg: '#fef3c7', color: '#92400e' },
  in_progress: { bg: '#dbeafe', color: '#1e40af' },
  approved: { bg: '#d1fae5', color: '#065f46' },
  rejected: { bg: '#fee2e2', color: '#991b1b' },
  cancelled: { bg: '#f3f4f6', color: '#374151' },
};

const VALID_STATUSES = ['pending', 'in_progress', 'approved', 'rejected', 'cancelled'];

const CARD = {
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  padding: '14px 20px',
  marginBottom: 20,
  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)'
};

const INPUT = {
  padding: '8px 14px',
  borderRadius: 8,
  border: '1px solid #d1d5db',
  background: '#fff',
  color: '#1f2937',
  fontSize: '0.875rem'
};

export default function BulkActions({ onActionComplete }) {
  const [inquiries, setInquiries] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const url = statusFilter
        ? `${API_BASE}/inquiries?status=${statusFilter}&limit=200`
        : `${API_BASE}/inquiries?limit=200`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${session?.access_token}` } });
      const json = await res.json();
      setInquiries(json.data || []);
    } catch (e) {
      setError('Failed to load inquiries');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);
  useRegisterRefresh(load, [load]);

  const toggleSelect = useCallback((id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelected(prev =>
      prev.size === inquiries.length ? new Set() : new Set(inquiries.map(i => i.id))
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
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ ids, status: newStatus }),
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
    <div>
      <p style={{ color: '#6b7280', margin: '0 0 16px', fontSize: '0.95rem' }}>
        Select multiple inquiries to update them simultaneously.
      </p>

      <div style={{ ...CARD, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={INPUT}>
          <option value="">All Statuses</option>
          {VALID_STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>

        <span style={{ color: '#6b7280', fontSize: '0.875rem', marginLeft: 4 }}>
          {selected.size > 0 ? `${selected.size} selected` : `${inquiries.length} total`}
        </span>

        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', alignItems: 'center' }}>
          <select
            value={newStatus}
            onChange={e => setNewStatus(e.target.value)}
            disabled={selected.size === 0}
            style={{ ...INPUT, opacity: selected.size === 0 ? 0.6 : 1 }}
          >
            <option value="">Set status…</option>
            {VALID_STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>

          <button
            onClick={applyBulkUpdate}
            disabled={processing || selected.size === 0 || !newStatus}
            style={{
              padding: '8px 20px', borderRadius: 8, border: 'none',
              background: selected.size > 0 && newStatus ? '#055B75' : '#e5e7eb',
              color: selected.size > 0 && newStatus ? '#fff' : '#9ca3af',
              cursor: selected.size > 0 && newStatus ? 'pointer' : 'not-allowed',
              fontWeight: 600, fontSize: '0.875rem'
            }}
          >
            {processing ? 'Updating…' : 'Apply'}
          </button>
        </div>
      </div>

      {success && <div style={{ background: '#d1fae5', border: '1px solid #6ee7b7', borderRadius: 8, padding: '10px 16px', color: '#065f46', marginBottom: 16, fontSize: '0.875rem' }}>{success}</div>}
      {error && <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 16px', color: '#991b1b', marginBottom: 16, fontSize: '0.875rem' }}>{error}</div>}

      <div style={{ ...CARD, padding: 0, overflowX: 'auto', marginBottom: 0 }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: '#6b7280', padding: 60 }}>Loading inquiries…</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', width: 40 }}>
                  <input
                    type="checkbox"
                    checked={selected.size === inquiries.length && inquiries.length > 0}
                    onChange={toggleAll}
                    style={{ cursor: 'pointer', width: 16, height: 16 }}
                  />
                </th>
                {['Customer', 'Email', 'Type', 'Status', 'Date'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', color: '#374151', fontWeight: 600, textAlign: 'left', textTransform: 'uppercase', fontSize: '0.72rem', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {inquiries.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>No inquiries found</td></tr>
              ) : inquiries.map(inq => {
                const isSelected = selected.has(inq.id);
                const sc = STATUS_COLOR[inq.status] || STATUS_COLOR.pending;
                return (
                  <tr
                    key={inq.id}
                    onClick={() => toggleSelect(inq.id)}
                    style={{
                      borderBottom: '1px solid #f3f4f6',
                      background: isSelected ? '#F0FAFC' : 'transparent',
                      cursor: 'pointer'
                    }}
                  >
                    <td style={{ padding: '12px 16px' }}>
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(inq.id)} onClick={e => e.stopPropagation()} style={{ cursor: 'pointer', width: 16, height: 16 }} />
                    </td>
                    <td style={{ padding: '12px 16px', color: '#1f2937', fontWeight: 500 }}>{inq.customer_name}</td>
                    <td style={{ padding: '12px 16px', color: '#6b7280' }}>{inq.customer_email}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 600, background: '#dbeafe', color: '#1e40af' }}>{inq.inquiry_type}</span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 600, background: sc.bg, color: sc.color }}>
                        {inq.status?.replace('_', ' ')}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', color: '#6b7280', fontSize: '0.8rem' }}>
                      {new Date(inq.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
