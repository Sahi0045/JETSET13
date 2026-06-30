import React, { useState } from 'react';
import { apiPost } from '../../utils/apiHelper';
import './AdminPanel.css';

async function send(promise) {
  const res = await promise;
  let data = {};
  try { data = await res.json(); } catch { /* non-JSON */ }
  return { ok: res.ok, ...data };
}

const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14, outline: 'none', boxSizing: 'border-box' };
const labelStyle = { fontSize: 13, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 6 };

const AccountSettings = () => {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null); // { type, text }

  const user = (() => { try { return JSON.parse(localStorage.getItem('adminUser') || localStorage.getItem('user') || 'null'); } catch { return null; } })();

  const submit = async (e) => {
    e.preventDefault();
    setMsg(null);
    if (next.length < 8) { setMsg({ type: 'error', text: 'New password must be at least 8 characters.' }); return; }
    if (next !== confirm) { setMsg({ type: 'error', text: 'New passwords do not match.' }); return; }
    setSaving(true);
    const res = await send(apiPost('auth/change-password', { currentPassword: current, newPassword: next }));
    setSaving(false);
    if (res.ok && res.success) {
      setMsg({ type: 'success', text: res.message || 'Password changed.' });
      setCurrent(''); setNext(''); setConfirm('');
    } else {
      setMsg({ type: 'error', text: res.message || 'Failed to change password.' });
    }
  };

  return (
    <div className="account-settings" style={{ maxWidth: 480 }}>
      <p style={{ color: '#6b7280', margin: '0 0 16px', fontSize: '0.95rem' }}>
        Signed in as <strong>{user?.email || 'admin'}</strong>{user?.role ? ` (${user.role})` : ''}.
      </p>

      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <h3 style={{ margin: '0 0 18px', fontSize: 16, color: '#1e293b' }}>Change password</h3>
        {msg && (
          <div style={{ marginBottom: 16, borderRadius: 8, padding: '10px 14px', fontSize: 13, fontWeight: 500,
            background: msg.type === 'success' ? '#d1fae5' : '#fef2f2', color: msg.type === 'success' ? '#065f46' : '#dc2626',
            border: `1px solid ${msg.type === 'success' ? '#a7f3d0' : '#fecaca'}` }}>
            {msg.type === 'success' ? '✅ ' : '⚠️ '}{msg.text}
          </div>
        )}
        <form onSubmit={submit}>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Current password</label>
            <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required style={inputStyle} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>New password</label>
            <input type="password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="At least 8 characters" required style={inputStyle} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Confirm new password</label>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required style={inputStyle} />
          </div>
          <button type="submit" disabled={saving} style={{ background: '#055B75', color: 'white', border: 'none', padding: '10px 22px', borderRadius: 8, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving…' : 'Change Password'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default AccountSettings;
