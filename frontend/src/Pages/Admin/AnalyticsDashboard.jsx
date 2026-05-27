import React, { useState, useEffect, useCallback } from 'react';
import supabase from '../../lib/supabase';
import { useRegisterRefresh } from './shell/RefreshContext';

const API_BASE = '/api';

const CARD = {
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  padding: 20,
  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)'
};

export default function AnalyticsDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [period, setPeriod] = useState('month');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers = { Authorization: `Bearer ${session?.access_token}` };

      const [dashRes, convRes, revRes] = await Promise.all([
        fetch(`${API_BASE}/analytics/dashboard`, { headers }),
        fetch(`${API_BASE}/analytics/conversion?period=${period}`, { headers }),
        fetch(`${API_BASE}/analytics/revenue?period=${period}`, { headers })
      ]);

      const dashJson = await dashRes.json();
      const convJson = await convRes.json();
      const revJson = await revRes.json();

      if (!dashJson.success) throw new Error(dashJson.message);

      setData({
        summary: dashJson.data,
        conversion: convJson.data,
        revenue: revJson.data
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { load(); }, [load]);
  useRegisterRefresh(load, [load]);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Loading analytics…</div>;
  if (error) return <div style={{ padding: 40, textAlign: 'center', color: '#ef4444' }}>Error: {error}</div>;

  const { totals } = data.summary;
  const { funnel, rates } = data.conversion;
  const { summary: revSum, series } = data.revenue;

  const statCards = [
    { label: 'Total Revenue', value: `$${revSum.grand_total}`, color: '#10b981', icon: '💰' },
    { label: 'Applications', value: totals.inquiries, color: '#055B75', icon: '📄' },
    { label: 'Conversion', value: `${rates.overall_conversion}%`, color: '#f59e0b', icon: '🎯' },
    { label: 'Avg Sale', value: `$${revSum.avg_transaction}`, color: '#ec4899', icon: '📈' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <p style={{ color: '#6b7280', margin: 0, fontSize: '0.95rem' }}>Conversion funnel and revenue trends</p>
        <div style={{ display: 'flex', gap: 8 }}>
          {['week', 'month', 'year'].map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              style={{
                padding: '6px 14px', borderRadius: 8, border: '1px solid #e5e7eb',
                background: period === p ? '#055B75' : '#fff',
                color: period === p ? '#fff' : '#374151',
                cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600
              }}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        {statCards.map(c => (
          <div key={c.label} style={CARD}>
            <div style={{ fontSize: '1.2rem', marginBottom: 8 }}>{c.icon}</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 700, color: c.color }}>{c.value}</div>
            <div style={{ color: '#6b7280', fontSize: '0.85rem', marginTop: 4 }}>{c.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
        <div style={CARD}>
          <h3 style={{ margin: '0 0 20px', fontSize: '1.05rem', color: '#1f2937' }}>Conversion Funnel</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[
              { label: 'Applications', value: funnel.applications_submitted, pct: 100, color: '#055B75' },
              { label: 'Approved', value: funnel.applications_approved, pct: rates.approval_rate, color: '#10b981' },
              { label: 'Paid', value: funnel.payments_completed, pct: rates.payment_rate, color: '#f59e0b', sub: '(from approved)' },
            ].map(step => (
              <div key={step.label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: '0.9rem', color: '#374151' }}>{step.label} <small style={{ color: '#6b7280' }}>{step.sub}</small></span>
                  <span style={{ fontWeight: 600, color: '#1f2937' }}>{step.value} <small style={{ color: step.color }}>{step.pct}%</small></span>
                </div>
                <div style={{ height: 8, background: '#f3f4f6', borderRadius: 4 }}>
                  <div style={{ width: `${step.label === 'Paid' ? (funnel.payments_completed / funnel.applications_submitted * 100) : step.pct}%`, height: '100%', background: step.color, borderRadius: 4 }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={CARD}>
          <h3 style={{ margin: '0 0 20px', fontSize: '1.05rem', color: '#1f2937' }}>Revenue Trends ({period})</h3>
          {series.length === 0 ? <p style={{ color: '#6b7280' }}>No data for this period</p> : (
            <div style={{ height: 180, display: 'flex', alignItems: 'flex-end', gap: 8, paddingBottom: 20 }}>
              {series.slice(-10).map(s => (
                <div key={s.period} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: '100%', background: '#10b981', borderRadius: '4px 4px 0 0', height: `${Math.max(10, Math.min(100, (parseFloat(s.total) / parseFloat(revSum.grand_total)) * 500))}%` }} />
                  <span style={{ fontSize: '0.65rem', color: '#6b7280', transform: 'rotate(-45deg)', marginTop: 8 }}>{s.period.split('-').pop()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
