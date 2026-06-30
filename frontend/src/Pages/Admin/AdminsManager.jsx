import React, { useState, useEffect, useCallback } from 'react';
import { useRegisterRefresh } from './shell/RefreshContext';
import { apiGet, apiPost, apiDelete } from '../../utils/apiHelper';
import './AdminPanel.css';

const isSuperAdminClient = () => localStorage.getItem('isSuperAdmin') === 'true';

async function send(promise) {
  const res = await promise;
  let data = {};
  try { data = await res.json(); } catch { /* non-JSON */ }
  return { ok: res.ok, status: res.status, ...data };
}

const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '14px', outline: 'none', boxSizing: 'border-box' };
const labelStyle = { fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '4px' };

const AdminsManager = () => {
  const canManage = isSuperAdminClient();
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState({ email: '', name: '', password: '' });
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const fetchAdmins = useCallback(async () => {
    setLoading(true);
    const res = await send(apiGet('auth/admins'));
    setLoading(false);
    if (res.ok && res.success) setAdmins(res.admins || []);
    else setError(res.message || 'Failed to load admins.');
  }, []);

  useEffect(() => { if (canManage) fetchAdmins(); else setLoading(false); }, [canManage, fetchAdmins]);
  useRegisterRefresh(useCallback(() => fetchAdmins(), [fetchAdmins]), [fetchAdmins]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    if (!form.email.trim()) { setError('Email is required.'); return; }
    setSubmitting(true);
    const res = await send(apiPost('auth/admins', { ...form }));
    setSubmitting(false);
    if (res.ok && res.success) {
      setSuccess(res.message || 'Done.');
      setForm({ email: '', name: '', password: '' });
      fetchAdmins();
    } else {
      setError(res.message || 'Failed to make admin.');
    }
  };

  const removeAdmin = async (a) => {
    if (!window.confirm(`Remove admin access for "${a.name || a.email}"? They become a normal user.`)) return;
    setBusyId(a.id); setError(''); setSuccess('');
    const res = await send(apiDelete(`auth/admins/${a.id}`));
    setBusyId(null);
    if (res.ok && res.success) { setSuccess(res.message || 'Demoted.'); fetchAdmins(); }
    else setError(res.message || 'Failed to remove admin.');
  };

  if (!canManage) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
        <h3>Super admin only</h3>
        <p style={{ color: '#64748b' }}>Only the super admin can manage admins.</p>
      </div>
    );
  }

  return (
    <div className="admins-manager">
      <p style={{ color: '#6b7280', margin: '0 0 8px', fontSize: '0.95rem' }}>
        Manage who has admin access. Promote an existing user by email, or create a new admin account.
      </p>

      {success && <div style={{ background: '#d1fae5', border: '1px solid #a7f3d0', color: '#065f46', padding: '12px 16px', borderRadius: '8px', margin: '12px 0', fontSize: '14px' }}>✅ {success}</div>}
      {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', padding: '12px 16px', borderRadius: '8px', margin: '12px 0', fontSize: '14px' }}>⚠️ {error}</div>}

      {/* Make admin */}
      <form onSubmit={handleSubmit} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, margin: '12px 0 24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 16, color: '#1e293b' }}>Add an admin</h3>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: '#64748b' }}>If the email already has an account, they're promoted. For a brand-new admin, set a password (min 8) — they can change it later.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <div><label style={labelStyle}>Email *</label><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="person@email.com" required style={inputStyle} /></div>
          <div><label style={labelStyle}>Name</label><input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name" style={inputStyle} /></div>
          <div><label style={labelStyle}>Password (new accounts)</label><input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Min 8 chars" style={inputStyle} /></div>
        </div>
        <div style={{ marginTop: 16 }}>
          <button type="submit" disabled={submitting} style={{ background: '#055B75', color: 'white', border: 'none', padding: '10px 20px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>
            {submitting ? 'Saving…' : '+ Add Admin'}
          </button>
        </div>
      </form>

      {/* List */}
      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Admins ({admins.length})</div>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Loading admins…</div>
        ) : admins.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>No admins yet.</div>
        ) : (
          admins.map((a) => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px', borderTop: '1px solid #f8fafc' }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: a.isSuperAdmin ? 'linear-gradient(135deg,#7c3aed,#a855f7)' : 'linear-gradient(135deg,#055B75,#0a7d9e)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, flexShrink: 0 }}>
                {(a.name || a.email || '?').charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <strong style={{ color: '#1e293b' }}>{a.name || '—'}</strong>
                  {a.isSuperAdmin && <span style={{ background: '#ede9fe', color: '#6d28d9', padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>SUPER ADMIN</span>}
                </div>
                <div style={{ fontSize: 13, color: '#64748b' }}>{a.email}</div>
              </div>
              {a.isSuperAdmin ? (
                <span style={{ fontSize: 12, color: '#94a3b8' }}>via allowlist</span>
              ) : (
                <button disabled={busyId === a.id} onClick={() => removeAdmin(a)} style={{ background: '#fef2f2', color: '#dc2626', border: 'none', padding: '8px 14px', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                  Remove admin
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default AdminsManager;
