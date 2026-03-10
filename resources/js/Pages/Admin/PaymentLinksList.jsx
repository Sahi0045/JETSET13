import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './AdminPanel.css';

const PaymentLinksList = () => {
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetchLinks();
  }, []);

  const fetchLinks = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('adminToken') || localStorage.getItem('token') || localStorage.getItem('supabase_token');
      const adminUser = JSON.parse(localStorage.getItem('adminUser') || '{}');
      const agentId = adminUser.role === 'agent' ? adminUser.agentId : null;

      let url = '/api/payments?action=list-payment-links';
      if (agentId) {
        url += `&agentId=${agentId}`;
      }

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const result = await response.json();
      if (result.success) {
        setLinks(result.data || []);
      }
    } catch (error) {
      console.error('Error fetching payment links:', error);
    } finally {
      setLoading(false);
    }
  };

  const copyLink = (url, id) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getStatusBadge = (status) => {
    const styles = {
      pending: { bg: '#fef3c7', color: '#92400e', label: '⏳ Pending' },
      paid: { bg: '#d1fae5', color: '#065f46', label: '✅ Paid' },
      expired: { bg: '#fee2e2', color: '#991b1b', label: '⏰ Expired' },
      cancelled: { bg: '#f3f4f6', color: '#6b7280', label: '🚫 Cancelled' }
    };
    const s = styles[status] || styles.pending;
    return (
      <span style={{
        background: s.bg,
        color: s.color,
        padding: '4px 12px',
        borderRadius: '12px',
        fontSize: '12px',
        fontWeight: 600
      }}>
        {s.label}
      </span>
    );
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case 'flight': return '✈️';
      case 'hotel': return '🏨';
      case 'cruise': return '🚢';
      case 'package': return '🎒';
      default: return '🌍';
    }
  };

  const filteredLinks = filter === 'all' ? links : links.filter(l => l.status === filter);

  const stats = {
    total: links.length,
    pending: links.filter(l => l.status === 'pending').length,
    paid: links.filter(l => l.status === 'paid').length,
    expired: links.filter(l => l.status === 'expired').length
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
          <h3>Loading Payment Links...</h3>
        </div>
      </div>
    );
  }

  return (
    <div className="payment-links-list">
      <div className="page-header">
        <div className="header-content">
          <div className="header-info">
            <h1>🔗 Payment Links</h1>
            <p>Manage all generated payment links</p>
          </div>
        </div>
        <div className="header-actions">
          <Link to="/admin/payment-links/create" className="action-button primary" style={{
            background: '#055B75',
            color: 'white',
            textDecoration: 'none',
            padding: '10px 20px',
            borderRadius: '8px',
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            + Create Payment Link
          </Link>
        </div>
      </div>

      {/* Stats Bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {[
          { label: 'Total Links', value: stats.total, color: '#3b82f6' },
          { label: 'Pending', value: stats.pending, color: '#f59e0b' },
          { label: 'Paid', value: stats.paid, color: '#10b981' },
          { label: 'Expired', value: stats.expired, color: '#ef4444' }
        ].map((stat, i) => (
          <div key={i} style={{
            background: 'white',
            borderRadius: '12px',
            padding: '16px 20px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
          }}>
            <div style={{ fontSize: '24px', fontWeight: 700, color: stat.color }}>{stat.value}</div>
            <div style={{ fontSize: '13px', color: '#64748b' }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        {['all', 'pending', 'paid', 'expired', 'cancelled'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? '#055B75' : '#f1f5f9',
            color: filter === f ? 'white' : '#475569',
            border: 'none',
            padding: '6px 16px',
            borderRadius: '20px',
            fontSize: '13px',
            fontWeight: 500,
            cursor: 'pointer',
            textTransform: 'capitalize'
          }}>
            {f} ({f === 'all' ? stats.total : links.filter(l => l.status === f).length})
          </button>
        ))}
      </div>

      {/* List */}
      {filteredLinks.length === 0 ? (
        <div className="empty-state" style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔗</div>
          <h3>No Payment Links Yet</h3>
          <p style={{ color: '#64748b' }}>Create your first payment link to share with clients</p>
          <Link to="/admin/payment-links/create" style={{
            display: 'inline-block',
            marginTop: '16px',
            background: '#055B75',
            color: 'white',
            padding: '10px 24px',
            borderRadius: '8px',
            textDecoration: 'none',
            fontWeight: 600
          }}>
            + Create Payment Link
          </Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filteredLinks.map(link => (
            <div key={link.id} style={{
              background: 'white',
              borderRadius: '12px',
              padding: '20px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              display: 'flex',
              alignItems: 'center',
              gap: '16px'
            }}>
              {/* Type Icon */}
              <div style={{
                width: '44px',
                height: '44px',
                borderRadius: '10px',
                background: '#f0f9ff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px',
                flexShrink: 0
              }}>
                {getTypeIcon(link.booking_type)}
              </div>

              {/* Details */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                  <strong style={{ fontSize: '15px', color: '#1e293b' }}>{link.customer_name}</strong>
                  {getStatusBadge(link.status)}
                </div>
                <div style={{ fontSize: '13px', color: '#64748b', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                  <span>{link.currency} {parseFloat(link.amount).toFixed(2)}</span>
                  {link.customer_email && <span>📧 {link.customer_email}</span>}
                  {link.agent_name && <span>👤 {link.agent_name}</span>}
                  {link.description && <span>• {link.description.substring(0, 50)}</span>}
                  <span>• {new Date(link.created_at).toLocaleDateString()}</span>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                <button onClick={() => copyLink(link.paymentUrl, link.id)} style={{
                  background: copiedId === link.id ? '#d1fae5' : '#f1f5f9',
                  color: copiedId === link.id ? '#065f46' : '#475569',
                  border: 'none',
                  padding: '8px 14px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}>
                  {copiedId === link.id ? '✓ Copied' : '📋 Copy'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PaymentLinksList;
