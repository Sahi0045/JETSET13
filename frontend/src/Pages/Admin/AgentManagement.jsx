import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './AdminPanel.css';

const AgentManagement = () => {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingAgent, setEditingAgent] = useState(null);
  const [formData, setFormData] = useState({
    name: '', email: '', password: '', phone: '', commissionRate: 0
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => { fetchAgents(); }, []);

  const getToken = () => localStorage.getItem('adminToken') || localStorage.getItem('token') || localStorage.getItem('supabase_token');

  const fetchAgents = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/payments?action=list-agents', {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await res.json();
      if (data.success) setAgents(data.data || []);
    } catch (err) {
      console.error('Failed to fetch agents:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      const action = editingAgent ? 'update-agent' : 'create-agent';
      const body = editingAgent
        ? { agentId: editingAgent.id, ...formData }
        : formData;

      // Don't send empty password on update
      if (editingAgent && !body.password) delete body.password;

      const res = await fetch(`/api/payments?action=${action}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify(body)
      });

      const data = await res.json();
      if (data.success) {
        setSuccess(editingAgent ? 'Agent updated!' : 'Agent created!');
        setShowModal(false);
        setEditingAgent(null);
        setFormData({ name: '', email: '', password: '', phone: '', commissionRate: 0 });
        fetchAgents();
      } else {
        setError(data.error || 'Failed');
      }
    } catch (err) {
      setError('Network error: ' + err.message);
    }
  };

  const toggleStatus = async (agent) => {
    const newStatus = agent.status === 'active' ? 'inactive' : 'active';
    try {
      const res = await fetch('/api/payments?action=update-agent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify({ agentId: agent.id, status: newStatus })
      });
      const data = await res.json();
      if (data.success) fetchAgents();
    } catch (err) {
      console.error('Toggle failed:', err);
    }
  };

  const openEditModal = (agent) => {
    setEditingAgent(agent);
    setFormData({
      name: agent.name,
      email: agent.email,
      password: '',
      phone: agent.phone || '',
      commissionRate: agent.commission_rate || 0
    });
    setShowModal(true);
    setError('');
  };

  const openCreateModal = () => {
    setEditingAgent(null);
    setFormData({ name: '', email: '', password: '', phone: '', commissionRate: 0 });
    setShowModal(true);
    setError('');
  };

  const stats = {
    total: agents.length,
    active: agents.filter(a => a.status === 'active').length,
    totalRevenue: agents.reduce((sum, a) => sum + (a.totalRevenue || 0), 0),
    totalLinks: agents.reduce((sum, a) => sum + (a.totalLinks || 0), 0)
  };

  if (loading) {
    return (
      <div className="admin-dashboard">
        <div className="dashboard-loading">
          <div className="loading-spinner-large">
            <div className="spinner-ring"></div>
            <div className="spinner-ring"></div>
            <div className="spinner-ring"></div>
          </div>
          <h3>Loading Agents...</h3>
        </div>
      </div>
    );
  }

  return (
    <div className="agent-management">
      <div className="page-header">
        <div className="header-content">
          <div className="header-info">
            <h1>👥 Agent Management</h1>
            <p>Create and manage travel agents</p>
          </div>
        </div>
        <div className="header-actions">
          <button onClick={openCreateModal} className="action-button primary" style={{
            background: '#055B75', color: 'white', border: 'none',
            padding: '10px 20px', borderRadius: '8px', fontWeight: 600,
            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px'
          }}>
            + Add Agent
          </button>
        </div>
      </div>

      {success && (
        <div style={{
          background: '#d1fae5', border: '1px solid #a7f3d0', color: '#065f46',
          padding: '12px 16px', borderRadius: '8px', margin: '0 0 20px', fontSize: '14px'
        }}>
          ✅ {success}
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {[
          { label: 'Total Agents', value: stats.total, color: '#3b82f6' },
          { label: 'Active', value: stats.active, color: '#10b981' },
          { label: 'Total Links', value: stats.totalLinks, color: '#f59e0b' },
          { label: 'Revenue', value: `$${stats.totalRevenue.toFixed(0)}`, color: '#8b5cf6' }
        ].map((s, i) => (
          <div key={i} style={{
            background: 'white', borderRadius: '12px', padding: '16px 20px',
            border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
          }}>
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
          <p style={{ color: '#64748b' }}>Create your first agent to get started</p>
          <button onClick={openCreateModal} style={{
            marginTop: '16px', background: '#055B75', color: 'white',
            padding: '10px 24px', borderRadius: '8px', border: 'none',
            fontWeight: 600, cursor: 'pointer'
          }}>
            + Add Agent
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {agents.map(agent => (
            <div key={agent.id} style={{
              background: 'white', borderRadius: '12px', padding: '20px',
              border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              display: 'flex', alignItems: 'center', gap: '16px',
              opacity: agent.status === 'inactive' ? 0.6 : 1
            }}>
              {/* Avatar */}
              <div style={{
                width: '44px', height: '44px', borderRadius: '50%',
                background: agent.status === 'active' ? 'linear-gradient(135deg, #055B75, #0a7d9e)' : '#94a3b8',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'white', fontWeight: 700, fontSize: '16px', flexShrink: 0
              }}>
                {agent.name.charAt(0).toUpperCase()}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                  <strong style={{ fontSize: '15px', color: '#1e293b' }}>{agent.name}</strong>
                  <span style={{
                    background: agent.status === 'active' ? '#d1fae5' : '#fee2e2',
                    color: agent.status === 'active' ? '#065f46' : '#991b1b',
                    padding: '2px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 600
                  }}>
                    {agent.status}
                  </span>
                </div>
                <div style={{ fontSize: '13px', color: '#64748b', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                  <span>📧 {agent.email}</span>
                  {agent.phone && <span>📱 {agent.phone}</span>}
                  <span>🔗 {agent.totalLinks || 0} links</span>
                  <span>💰 ${(agent.totalRevenue || 0).toFixed(0)}</span>
                  {agent.commission_rate > 0 && <span>📊 {agent.commission_rate}%</span>}
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                <button onClick={() => openEditModal(agent)} style={{
                  background: '#f1f5f9', color: '#475569', border: 'none',
                  padding: '8px 14px', borderRadius: '6px', fontSize: '12px',
                  fontWeight: 500, cursor: 'pointer'
                }}>
                  ✏️ Edit
                </button>
                <button onClick={() => toggleStatus(agent)} style={{
                  background: agent.status === 'active' ? '#fef2f2' : '#d1fae5',
                  color: agent.status === 'active' ? '#dc2626' : '#065f46',
                  border: 'none', padding: '8px 14px', borderRadius: '6px',
                  fontSize: '12px', fontWeight: 500, cursor: 'pointer'
                }}>
                  {agent.status === 'active' ? '🚫 Deactivate' : '✅ Activate'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', zIndex: 1000
        }} onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div style={{
            background: 'white', borderRadius: '16px', padding: '30px',
            maxWidth: '480px', width: '90%', maxHeight: '90vh', overflowY: 'auto'
          }}>
            <h3 style={{ margin: '0 0 20px', fontSize: '18px', color: '#1e293b' }}>
              {editingAgent ? '✏️ Edit Agent' : '+ New Agent'}
            </h3>

            {error && (
              <div style={{
                background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626',
                padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '16px'
              }}>
                ⚠️ {error}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '4px' }}>Full Name *</label>
                  <input type="text" value={formData.name} onChange={(e) => setFormData(p => ({...p, name: e.target.value}))} placeholder="e.g., John Smith" required style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '4px' }}>Email *</label>
                  <input type="email" value={formData.email} onChange={(e) => setFormData(p => ({...p, email: e.target.value}))} placeholder="agent@email.com" required style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '4px' }}>
                    Password {editingAgent ? '(leave blank to keep current)' : '*'}
                  </label>
                  <input type="password" value={formData.password} onChange={(e) => setFormData(p => ({...p, password: e.target.value}))} placeholder={editingAgent ? '••••••••' : 'Min 6 characters'} required={!editingAgent} minLength={editingAgent ? 0 : 6} style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '4px' }}>Phone</label>
                  <input type="tel" value={formData.phone} onChange={(e) => setFormData(p => ({...p, phone: e.target.value}))} placeholder="+1 234 567 8900" style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '4px' }}>Commission Rate (%)</label>
                  <input type="number" value={formData.commissionRate} onChange={(e) => setFormData(p => ({...p, commissionRate: e.target.value}))} placeholder="0" min="0" max="100" step="0.5" style={inputStyle} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button type="button" onClick={() => setShowModal(false)} style={{
                  flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0',
                  background: 'white', color: '#475569', fontWeight: 500, cursor: 'pointer'
                }}>
                  Cancel
                </button>
                <button type="submit" style={{
                  flex: 1, padding: '10px', borderRadius: '8px', border: 'none',
                  background: '#055B75', color: 'white', fontWeight: 600, cursor: 'pointer'
                }}>
                  {editingAgent ? 'Update Agent' : 'Create Agent'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const inputStyle = {
  width: '100%', padding: '10px 12px', borderRadius: '8px',
  border: '1px solid #e2e8f0', fontSize: '14px', outline: 'none',
  boxSizing: 'border-box'
};

export default AgentManagement;
