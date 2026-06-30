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
  const [viewing, setViewing] = useState(null);   // agent whose detail panel is open
  const [detail, setDetail] = useState(null);      // fetched { agent, stats, sales, payouts }
  const [detailLoading, setDetailLoading] = useState(false);
  const [payoutAmt, setPayoutAmt] = useState('');
  const [payoutNote, setPayoutNote] = useState('');
  const [payoutSaving, setPayoutSaving] = useState(false);
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

  const viewAgent = async (agent) => {
    setViewing(agent); setDetail(null); setDetailLoading(true); setError('');
    setPayoutAmt(''); setPayoutNote('');
    const res = await call(`admin-agent-detail&agentId=${agent.id}`, null, 'GET');
    setDetailLoading(false);
    if (res.ok && res.success) setDetail(res);
    else setError(res.error || 'Failed to load agent detail.');
  };

  const refreshDetail = async (agentId) => {
    const res = await call(`admin-agent-detail&agentId=${agentId}`, null, 'GET');
    if (res.ok && res.success) setDetail(res);
  };

  const recordPayout = async () => {
    const amt = parseFloat(payoutAmt);
    if (!amt || amt <= 0) { setError('Enter a payout amount greater than 0.'); return; }
    setPayoutSaving(true); setError('');
    const res = await call('record-payout', { agentId: viewing.id, amount: amt, note: payoutNote });
    setPayoutSaving(false);
    if (res.ok && res.success) {
      setPayoutAmt(''); setPayoutNote('');
      setSuccess(res.message || 'Payout recorded.');
      refreshDetail(viewing.id);
    } else {
      setError(res.error || 'Failed to record payout.');
    }
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
                <div style={{ display: 'flex', gap: '8px', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <button disabled={busyId === agent.id} onClick={() => viewAgent(agent)} style={btn('#eef2ff', '#4338ca')}>📊 View</button>
                  {canManage && (<>
                    {agent.status === 'invited' && (
                      <button disabled={busyId === agent.id} onClick={() => resendInvite(agent)} style={btn('#fef3c7', '#92400e')}>✉️ Resend</button>
                    )}
                    <button disabled={busyId === agent.id} onClick={() => openEditModal(agent)} style={btn('#f1f5f9', '#475569')}>✏️ Edit</button>
                    <button disabled={busyId === agent.id} onClick={() => toggleStatus(agent)} style={btn(agent.status === 'active' ? '#fef2f2' : '#d1fae5', agent.status === 'active' ? '#dc2626' : '#065f46')}>
                      {agent.status === 'active' ? '🚫 Disable' : '✅ Enable'}
                    </button>
                    <button disabled={busyId === agent.id} onClick={() => removeAgent(agent)} style={btn('#fef2f2', '#dc2626')}>🗑️ Remove</button>
                  </>)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      {/* Agent detail / performance panel */}
      {viewing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, padding: '40px 16px', overflowY: 'auto' }}
          onClick={(e) => { if (e.target === e.currentTarget) { setViewing(null); setDetail(null); } }}>
          <div style={{ background: '#f8fafc', borderRadius: '16px', maxWidth: '760px', width: '100%', maxHeight: '88vh', overflowY: 'auto' }}>
            {/* Header */}
            <div style={{ background: 'white', borderRadius: '16px 16px 0 0', padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'sticky', top: 0 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', color: '#1e293b' }}>{viewing.name}</h3>
                <div style={{ fontSize: '13px', color: '#64748b', marginTop: 2 }}>
                  {viewing.email} · {viewing.commission_rate || 0}% commission ·{' '}
                  <span style={{ textTransform: 'capitalize' }}>{viewing.status}</span>
                </div>
              </div>
              <button onClick={() => { setViewing(null); setDetail(null); }} style={{ background: '#f1f5f9', border: 'none', borderRadius: '8px', width: 32, height: 32, cursor: 'pointer', fontSize: 16 }}>✕</button>
            </div>

            <div style={{ padding: '20px 24px' }}>
              {detailLoading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>Loading agent performance…</div>
              ) : !detail ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#dc2626' }}>{error || 'Could not load this agent.'}</div>
              ) : (
                <>
                  {/* KPIs */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
                    {[
                      { label: 'Sales Revenue', value: `$${detail.stats.totalRevenue.toFixed(2)}`, sub: `${detail.stats.paidCount} paid`, color: '#10b981' },
                      { label: 'Commission Earned', value: `$${detail.stats.commissionEarned.toFixed(2)}`, sub: 'from paid', color: '#055B75' },
                      { label: 'Pending Commission', value: `$${detail.stats.commissionPending.toFixed(2)}`, sub: `${detail.stats.pendingCount} pending`, color: '#f59e0b' },
                      { label: 'Total Sales', value: detail.stats.totalLinks, sub: `${detail.stats.expiredCount} expired`, color: '#3b82f6' },
                    ].map((c) => (
                      <div key={c.label} style={{ background: 'white', borderRadius: '12px', padding: '14px 16px', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '20px', fontWeight: 700, color: c.color }}>{c.value}</div>
                        <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{c.label}</div>
                        <div style={{ fontSize: '11px', color: '#94a3b8' }}>{c.sub}</div>
                      </div>
                    ))}
                  </div>

                  {/* Commission ledger */}
                  <div style={{ background: 'white', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 12 }}>Commission ledger</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: detail.payouts?.length || canManage ? 14 : 0 }}>
                      <div><div style={{ fontSize: 18, fontWeight: 700, color: '#055B75' }}>${detail.stats.commissionEarned.toFixed(2)}</div><div style={{ fontSize: 11, color: '#64748b' }}>Earned (paid sales)</div></div>
                      <div><div style={{ fontSize: 18, fontWeight: 700, color: '#16a34a' }}>${(detail.stats.commissionPaidOut || 0).toFixed(2)}</div><div style={{ fontSize: 11, color: '#64748b' }}>Paid out</div></div>
                      <div><div style={{ fontSize: 18, fontWeight: 700, color: (detail.stats.commissionOutstanding || 0) > 0 ? '#d97706' : '#94a3b8' }}>${(detail.stats.commissionOutstanding || 0).toFixed(2)}</div><div style={{ fontSize: 11, color: '#64748b' }}>Outstanding</div></div>
                    </div>

                    {canManage && (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', paddingTop: 12, borderTop: '1px solid #f1f5f9' }}>
                        <input type="number" min="0" step="0.01" value={payoutAmt} onChange={(e) => setPayoutAmt(e.target.value)} placeholder="Amount $" style={{ ...inputStyle, width: 120 }} />
                        <input type="text" value={payoutNote} onChange={(e) => setPayoutNote(e.target.value)} placeholder="Note (optional)" style={{ ...inputStyle, flex: 1, minWidth: 140 }} />
                        <button onClick={recordPayout} disabled={payoutSaving} style={{ background: '#055B75', color: 'white', border: 'none', padding: '9px 16px', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap' }}>
                          {payoutSaving ? 'Saving…' : 'Record Payout'}
                        </button>
                      </div>
                    )}

                    {detail.payouts && detail.payouts.length > 0 && (
                      <div style={{ marginTop: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 6 }}>Payout history</div>
                        {detail.payouts.map((p) => (
                          <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 0', borderTop: '1px solid #f8fafc' }}>
                            <span style={{ color: '#64748b' }}>{new Date(p.created_at).toLocaleDateString()}{p.note ? ` · ${p.note}` : ''}</span>
                            <span style={{ fontWeight: 600, color: '#16a34a' }}>${parseFloat(p.amount).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* By type */}
                  {detail.stats.byType && Object.keys(detail.stats.byType).length > 0 && (
                    <div style={{ background: 'white', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 10 }}>Sales by type</div>
                      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                        {Object.entries(detail.stats.byType).map(([t, v]) => (
                          <div key={t}>
                            <div style={{ fontWeight: 700, color: '#1e293b' }}>${v.revenue.toFixed(2)}</div>
                            <div style={{ fontSize: '12px', color: '#64748b', textTransform: 'capitalize' }}>{t} · {v.count}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Sales list */}
                  <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', padding: '12px 16px', borderBottom: '1px solid #f1f5f9' }}>
                      Sales ({detail.sales.length})
                    </div>
                    {detail.sales.length === 0 ? (
                      <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No sales yet.</div>
                    ) : (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ textAlign: 'left', color: '#94a3b8', fontSize: '11px', textTransform: 'uppercase' }}>
                              <th style={{ padding: '8px 16px' }}>Customer</th>
                              <th style={{ padding: '8px' }}>Type</th>
                              <th style={{ padding: '8px', textAlign: 'right' }}>Amount</th>
                              <th style={{ padding: '8px' }}>Status</th>
                              <th style={{ padding: '8px 16px' }}>Date</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detail.sales.map((l) => {
                              const sb = STATUS_STYLE[l.status === 'paid' ? 'active' : l.status === 'pending' ? 'invited' : 'disabled'];
                              return (
                                <tr key={l.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                                  <td style={{ padding: '8px 16px' }}>
                                    <div style={{ fontWeight: 600, color: '#1e293b' }}>{l.customer_name || '—'}</div>
                                    <div style={{ fontSize: 11, color: '#94a3b8' }}>{l.customer_email || ''}</div>
                                  </td>
                                  <td style={{ padding: '8px', textTransform: 'capitalize' }}>{l.booking_type || '—'}</td>
                                  <td style={{ padding: '8px', textAlign: 'right', fontWeight: 600 }}>{l.currency || '$'} {Number(l.amount || 0).toLocaleString()}</td>
                                  <td style={{ padding: '8px' }}>
                                    <span style={{ background: sb.bg, color: sb.color, padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600, textTransform: 'capitalize' }}>{l.status}</span>
                                  </td>
                                  <td style={{ padding: '8px 16px', color: '#94a3b8', fontSize: 12 }}>{l.created_at ? new Date(l.created_at).toLocaleDateString() : '—'}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

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
