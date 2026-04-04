import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../config/supabase';
import { t } from '../../../utils/i18n';

const API_BASE = '/api';

export default function PrivacyControls() {
  const [summary,     setSummary]     = useState(null);
  const [consents,    setConsents]    = useState({ marketing: false, analytics: true, cookies: true });
  const [loading,     setLoading]     = useState(true);
  const [exporting,   setExporting]   = useState(false);
  const [deleting,    setDeleting]    = useState(false);
  const [confirmDel,  setConfirmDel]  = useState(false);
  const [feedback,    setFeedback]    = useState(null); // { type: 'success'|'error', text }

  const showFeedback = (type, text) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 4000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res  = await fetch(`${API_BASE}/gdpr/my-data-summary`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const json = await res.json();
      if (json.success) setSummary(json.data);
    } catch (e) {
      console.error('GDPR summary load error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Export data ──────────────────────────────────────────────
  const handleExport = async () => {
    setExporting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${API_BASE}/gdpr/export-data`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `jetset-data-export-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showFeedback('success', 'Your data has been exported successfully.');
    } catch (e) {
      showFeedback('error', 'Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  // ── Record consent ────────────────────────────────────────────
  const handleConsent = async (type, granted) => {
    setConsents(c => ({ ...c, [type]: granted }));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch(`${API_BASE}/gdpr/consent`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body:    JSON.stringify({ type, granted }),
      });
      showFeedback('success', `Preference saved.`);
    } catch (_) {
      showFeedback('error', 'Failed to save preference.');
    }
  };

  // ── Delete account ────────────────────────────────────────────
  const handleDelete = async () => {
    setDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res  = await fetch(`${API_BASE}/gdpr/delete-account`, {
        method:  'DELETE',
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message);
      await supabase.auth.signOut();
      window.location.href = '/';
    } catch (e) {
      showFeedback('error', `Deletion failed: ${e.message}`);
      setDeleting(false);
    }
  };

  const card = {
    background: 'rgba(255,255,255,0.03)',
    border:     '1px solid rgba(255,255,255,0.08)',
    borderRadius: 16, padding: '24px',
    marginBottom: 20,
  };

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px 16px', fontFamily: 'Inter, system-ui, sans-serif', color: '#e2e8f0' }}>
      <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: 6 }}>
        {t('gdpr.title')}
      </h1>
      <p style={{ color: '#94a3b8', marginBottom: 32 }}>
        GDPR-compliant controls — manage your data, consents, and account.
      </p>

      {/* Feedback banner */}
      {feedback && (
        <div style={{
          padding: '12px 20px', borderRadius: 10, marginBottom: 20,
          background: feedback.type === 'success' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
          border:     feedback.type === 'success' ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(239,68,68,0.3)',
          color:      feedback.type === 'success' ? '#34d399' : '#f87171',
          fontSize: '0.9rem',
        }}>
          {feedback.text}
        </div>
      )}

      {/* Data summary */}
      <div style={card}>
        <h3 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: 600 }}>📊 Your Data Summary</h3>
        {loading ? <p style={{ color: '#64748b' }}>Loading…</p> : summary ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
              {[
                { label: 'Inquiries',  value: summary.inquiries_count },
                { label: 'Payments',   value: summary.payments_count },
                { label: 'Drafts',     value: summary.drafts_count },
              ].map(d => (
                <div key={d.label} style={{ textAlign: 'center', background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '12px 8px' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#818cf8' }}>{d.value}</div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>{d.label}</div>
                </div>
              ))}
            </div>
            <p style={{ fontSize: '0.8rem', color: '#64748b', margin: 0 }}>
              📌 {summary.retention_policy}
            </p>
          </>
        ) : null}
      </div>

      {/* Consent toggles */}
      <div style={card}>
        <h3 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: 600 }}>⚙️ {t('gdpr.manage')}</h3>
        {[
          { key: 'marketing', label: t('gdpr.consentMarketing'), desc: 'Receive promotional emails and travel deals' },
          { key: 'analytics', label: t('gdpr.consentAnalytics'),  desc: 'Help us improve by sharing anonymous usage data' },
          { key: 'cookies',   label: t('gdpr.consentCookies'),    desc: 'Allow tracking cookies for a personalised experience' },
        ].map(c => (
          <div key={c.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div>
              <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{c.label}</div>
              <div style={{ color: '#64748b', fontSize: '0.78rem', marginTop: 2 }}>{c.desc}</div>
            </div>
            <button
              id={`consent-${c.key}-btn`}
              onClick={() => handleConsent(c.key, !consents[c.key])}
              style={{
                width: 48, height: 26, borderRadius: 13,
                background: consents[c.key] ? '#6366f1' : 'rgba(255,255,255,0.1)',
                border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.3s',
              }}
            >
              <span style={{
                position: 'absolute', top: 3,
                left:     consents[c.key] ? 25 : 3,
                width: 20, height: 20, borderRadius: '50%',
                background: '#fff', transition: 'left 0.3s',
              }} />
            </button>
          </div>
        ))}
      </div>

      {/* Export */}
      <div style={card}>
        <h3 style={{ margin: '0 0 8px', fontSize: '1rem', fontWeight: 600 }}>📥 {t('gdpr.exportData')}</h3>
        <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: 16 }}>
          Download a complete copy of all your personal data in JSON format.
        </p>
        <button
          id="gdpr-export-btn"
          onClick={handleExport}
          disabled={exporting}
          style={{
            padding: '10px 24px', borderRadius: 10, border: '1px solid rgba(99,102,241,0.4)',
            background: 'rgba(99,102,241,0.1)', color: '#818cf8',
            cursor: exporting ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.9rem',
          }}
        >
          {exporting ? 'Preparing download…' : '⬇ Download My Data'}
        </button>
      </div>

      {/* Delete account */}
      <div style={{ ...card, borderColor: 'rgba(239,68,68,0.2)' }}>
        <h3 style={{ margin: '0 0 8px', fontSize: '1rem', fontWeight: 600, color: '#f87171' }}>
          🗑 {t('gdpr.deleteAccount')}
        </h3>
        <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: 16 }}>
          {t('gdpr.deleteWarning')} Your inquiries will be anonymised and permanently removed after 30 days.
        </p>

        {!confirmDel ? (
          <button
            id="gdpr-delete-initiate-btn"
            onClick={() => setConfirmDel(true)}
            style={{
              padding: '10px 24px', borderRadius: 10, border: '1px solid rgba(239,68,68,0.4)',
              background: 'rgba(239,68,68,0.08)', color: '#f87171', cursor: 'pointer', fontWeight: 600,
            }}
          >
            Delete My Account
          </button>
        ) : (
          <div style={{ background: 'rgba(239,68,68,0.08)', borderRadius: 10, padding: 16 }}>
            <p style={{ color: '#fca5a5', fontSize: '0.875rem', fontWeight: 600, margin: '0 0 12px' }}>
              ⚠️ Are you absolutely sure? This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                id="gdpr-delete-confirm-btn"
                onClick={handleDelete}
                disabled={deleting}
                style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#ef4444', color: '#fff', cursor: 'pointer', fontWeight: 700 }}
              >
                {deleting ? 'Deleting…' : 'Yes, delete permanently'}
              </button>
              <button
                onClick={() => setConfirmDel(false)}
                style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#94a3b8', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
