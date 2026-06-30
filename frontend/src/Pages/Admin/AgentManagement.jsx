import React, { useState, useEffect, useCallback } from 'react';
import { useRegisterRefresh } from './shell/RefreshContext';
import './AdminPanel.css';

const getToken = () =>
  localStorage.getItem('adminToken') || localStorage.getItem('token') || localStorage.getItem('supabase_token');

const isSuperAdmin = () => localStorage.getItem('isSuperAdmin') === 'true';

async function call(action, body, method = 'POST') {
  const res = await fetch(`/api/payments?action=${action}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
    body: method === 'GET' ? undefined : JSON.stringify(body || {}),
  });
  let data = {};
  try { data = await res.json(); } catch { /* non-JSON */ }
  return { ok: res.ok, ...data };
}

const STATUS_STYLE = {
  active: { bg: '#d1fae5', color: '#065f46', label: 'Active' },
  invited: { bg: '#fef3c7', color: '#92400e', label: 'Invited' },
  disabled: { bg: '#f1f5f9', color: '#64748b', label: 'Disabled' },
  inactive: { bg: '#f1f5f9', color: '#64748b', label: 'Disabled' },
  suspended: { bg: '#fee2e2', color: '#991b1b', label: 'Suspended' },
};

const AgentManagement = () => {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingAgent, setEditingAgent] = useState(null);
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', commissionRate: 0 });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busyId, setBusyId] = useState(null);
  const canManage = isSuperAdmin();

  const fetchAgents = useCallback(async () => {
    try {
      setLoading(true);
      const data = await call('list-agents', null, 'GET');
      if (data.success) setAgents(data.data || []);
      else setError(data.error || 'Failed to load agents.');
    } catch (err) {
      console.error('Failed to fetch agents:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAgents(); }, [fetchAgents]);
  useRegisterRefresh(useCallback(() => fetchAgents(), [fetchAgents]), [fetchAgents]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    try {
      let res;
      if (editingAgent) {
        res = await call('update-agent', {
          agentId: editingAgent.id, name: formData.name,
          phone: formData.phone, commissionRate: formData.commissionRate,
        });
      } else {
        res = await call('create-agent', {
          name: formData.name, email: formData.email, phone: formData.phone,
          commissionRate: formData.commissionRate, returnOrigin: window.location.origin,
        });
      }
      if (res.success) {
        setSuccess(editingAgent ? 'Agent updated.' : (res.message || `Invite sent to ${formData.email}.`));
        setShowModal(false);
        setEditingAgent(null);
        setFormData({ name: '', email: '', phone: '', commissionRate: 0 });
        fetchAgents();
      } else {
        setError(res.error || 'Failed.');
      }
    } catch (err) {
      setError('Network error: ' + err.message);
    }
  };

  const toggleStatus = async (agent) => {
    setBusyId(agent.id);
    const newStatus = agent.status === 'active' ? 'disabled' : 'active';
    const res = await call('update-agent', { agentId: agent.id, status: newStatus });
    if (res.success) fetchAgents(); else setError(res.error || 'Update failed.');
    setBusyId(null);
  };

  const resendInvite = async (agent) => {
    setBusyId(agent.id); setError(''); setSuccess('');
    const res = await call('resend-agent-invite', { agentId: agent.id, returnOrigin: window.location.origin });
    if (res.success) setSuccess(`Invite re-sent to ${agent.email}.`); else setError(res.error || 'Failed to resend.');
    setBusyId(null); fetchAgents();
  };

  const removeAgent = async (agent) => {
    if (!window.confirm(`Remove agent "${agent.name}"? They lose portal access. Their sales/commission history is kept.`)) return;
    setBusyId(agent.id); setError(''); setSuccess('');
    const res = await call('delete-agent', { agentId: agent.id });
    if (res.success) { setSuccess('Agent removed.'); fetchAgents(); } else setError(res.error || 'Failed to remove.');
    setBusyId(null);
  };

  const openEditModal = (agent) => {
    setEditingAgent(agent);
    setFormData({ name: agent.name, email: agent.email, phone: agent.phone || '', commissionRate: agent.commission_rate || 0 });
    setShowModal(true); setError('');
  };
  const openCreateModal = () => {
    setEditingAgent(null);
    setFormData({ name: '', email: '', phone: '', commissionRate: 0 });
    setShowModal(true); setError('');
  };

  const stats = {
    total: agents.length,
    active: agents.filter((a) => a.status === 'active').length,
    revenue: agents.reduce((s, a) => s + (a.totalRevenue || 0), 0),
    commission: agents.reduce((s, a) => s + (a.commission || 0), 0),
  };

  if (loading) {
    return (
      <div className="admin-dashboard">
        <div className="dashboard-loading">
          <div className="loading-spinner-large"><div className="spinner-ring"></div><div className="spinner-ring"></div><div className="spinner-ring"></div></div>
          <h3>Loading Agents...</h3>
        </div>
      </div>
    );
  }

  return (
    <div className="agent-management">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <p style={{ color: '#6b7280', margin: 0, fontSize: '0.95rem' }}>
          Invite and manage travel sales agents. New agents get an email to set their password.
        </p>
        {canManage && (
          <button onClick={openCreateModal} style={{ background: '#055B75', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}>
            + Invite Agent
          </button>
        )}
      </div>
      {!canManage && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', padding: '10px 14px', borderRadius: '8px', margin: '12px 0', fontSize: '13px' }}>
          You can view agents, but only the super admin can invite, edit, or remove them.
        </div>
      )}

      {success && <div style={{ background: '#d1fae5', border: '1px solid #a7f3d0', color: '#065f46', padding: '12px 16px', borderRadius: '8px', margin: '12px 0 20px', fontSize: '14px' }}>✅ {success}</div>}
      {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', padding: '12px 16px', borderRadius: '8px', margin: '12px 0 20px', fontSize: '14px' }}>⚠️ {error}</div>}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {[
          { label: 'Total Agents', value: stats.total, color: '#3b82f6' },
          { label: 'Active', value: stats.active, color: '#10b981' },
          { label: 'Sales Revenue', value: `$${stats.revenue.toFixed(0)}`, color: '#8b5cf6' },
          { label: 'Commission', value: `$${stats.commission.toFixed(0)}`, color: '#f59e0b' },
        ].map((s, i) => (
          <div key={i} style={{ background: 'white', borderRadius: '12px', padding: '16px 20px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ fontSize: '24px', fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: '13px', color: '#64748b' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Agent List */}
      {agents.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>👥</div>
          <h3>No Agents Yet</h3>
          <p style={{ color: '#64748b' }}>{canManage ? 'Invite your first agent to get started' : 'No agents have been added yet.'}</p>
          {canManage && <button onClick={openCreateModal} style={{ marginTop: '16px', background: '#055B75', color: 'white', padding: '10px 24px', borderRadius: '8px', border: 'none', fontWeight: 600, cursor: 'pointer' }}>+ Invite Agent</button>}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {agents.map((agent) => {
            const st = STATUS_STYLE[agent.status] || STATUS_STYLE.disabled;
            return (
              <div key={agent.id} style={{ background: 'white', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', gap: '16px', opacity: ['disabled', 'inactive'].includes(agent.status) ? 0.65 : 1 }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: agent.status === 'active' ? 'linear-gradient(135deg, #055B75, #0a7d9e)' : '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: '16px', flexShrink: 0 }}>
                  {(agent.name || '?').charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                    <strong style={{ fontSize: '15px', color: '#1e293b' }}>{agent.name}</strong>
                    <span style={{ background: st.bg, color: st.color, padding: '2px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 600 }}>{st.label}</span>
                  </div>
                  <div style={{ fontSize: '13px', color: '#64748b', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                    <span>📧 {agent.email}</span>
                    {agent.phone && <span>📱 {agent.phone}</span>}
                    <span>🔗 {agent.totalLinks || 0} sales</span>
                    <span>💰 ${(agent.totalRevenue || 0).toFixed(0)}</span>
                    <span>📊 {agent.commission_rate || 0}% · ${(agent.commission || 0).toFixed(0)} comm.</span>
                  </div>
                </div>
                {canManage && (
                  <div style={{ display: 'flex', gap: '8px', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {agent.status === 'invited' && (
                      <button disabled={busyId === agent.id} onClick={() => resendInvite(agent)} style={btn('#fef3c7', '#92400e')}>✉️ Resend</button>
                    )}
                    <button disabled={busyId === agent.id} onClick={() => openEditModal(agent)} style={btn('#f1f5f9', '#475569')}>✏️ Edit</button>
                    <button disabled={busyId === agent.id} onClick={() => toggleStatus(agent)} style={btn(agent.status === 'active' ? '#fef2f2' : '#d1fae5', agent.status === 'active' ? '#dc2626' : '#065f46')}>
                      {agent.status === 'active' ? '🚫 Disable' : '✅ Enable'}
                    </button>
                    <button disabled={busyId === agent.id} onClick={() => removeAgent(agent)} style={btn('#fef2f2', '#dc2626')}>🗑️ Remove</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div style={{ background: 'white', borderRadius: '16px', padding: '30px', maxWidth: '480px', width: '90%', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 6px', fontSize: '18px', color: '#1e293b' }}>{editingAgent ? '✏️ Edit Agent' : '✉️ Invite Agent'}</h3>
            {!editingAgent && <p style={{ margin: '0 0 18px', fontSize: '13px', color: '#64748b' }}>They'll get an email to set their own password — no password needed here.</p>}
            {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '16px' }}>⚠️ {error}</div>}
            <form onSubmit={handleSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={labelStyle}>Full Name *</label>
                  <input type="text" value={formData.name} onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))} placeholder="e.g., John Smith" required style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Email *</label>
                  <input type="email" value={formData.email} onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))} placeholder="agent@email.com" required disabled={!!editingAgent} style={{ ...inputStyle, background: editingAgent ? '#f8fafc' : 'white' }} />
                </div>
                <div>
                  <label style={labelStyle}>Phone</label>
                  <input type="tel" value={formData.phone} onChange={(e) => setFormData((p) => ({ ...p, phone: e.target.value }))} placeholder="+1 234 567 8900" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Commission Rate (%)</label>
                  <input type="number" value={formData.commissionRate} onChange={(e) => setFormData((p) => ({ ...p, commissionRate: e.target.value }))} placeholder="0" min="0" max="100" step="0.5" style={inputStyle} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button type="button" onClick={() => setShowModal(false)} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#475569', fontWeight: 500, cursor: 'pointer' }}>Cancel</button>
                <button type="submit" style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: '#055B75', color: 'white', fontWeight: 600, cursor: 'pointer' }}>
                  {editingAgent ? 'Update Agent' : 'Send Invite'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '14px', outline: 'none', boxSizing: 'border-box' };
const labelStyle = { fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '4px' };
const btn = (bg, color) => ({ background: bg, color, border: 'none', padding: '8px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 500, cursor: 'pointer' });

export default AgentManagement;
