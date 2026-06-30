import React, { useState, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useRegisterRefresh } from './shell/RefreshContext';
import './AdminPanel.css';

const PaymentLinksList = () => {
  // Works under both the admin panel (/admin) and the agent portal (/agent).
  const base = useLocation().pathname.startsWith('/agent') ? '/agent' : '/admin';
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState(null);
  const [filter, setFilter] = useState('all');
  const [selectedLink, setSelectedLink] = useState(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    fetchLinks();
  }, []);

  useRegisterRefresh(useCallback(() => fetchLinks(), []), []);

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

  const copyLink = (e, url, id) => {
    e.stopPropagation();
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleLinkClick = (link) => {
    setSelectedLink(link);
    setShowModal(true);
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <p style={{ color: '#6b7280', margin: 0, fontSize: '0.95rem' }}>Manage all generated payment links.</p>
        <Link to={`${base}/payment-links/create`} style={{
          background: '#055B75', color: '#fff', textDecoration: 'none',
          padding: '10px 20px', borderRadius: 8, fontWeight: 600,
          display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.875rem'
        }}>
          + Create Payment Link
        </Link>
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
          <Link to={`${base}/payment-links/create`} style={{
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
            <div 
              key={link.id} 
              onClick={() => handleLinkClick(link)}
              style={{
                background: 'white',
                borderRadius: '12px',
                padding: '20px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                '&:hover': {
                  borderColor: '#055B75',
                  boxShadow: '0 4px 6px rgba(0,0,0,0.05)'
                }
              }}
            >
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
                <button onClick={(e) => copyLink(e, link.paymentUrl, link.id)} style={{
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

      {/* Detail Modal */}
      {showModal && selectedLink && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }} onClick={() => setShowModal(false)}>
          <div style={{
            background: 'white',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '600px',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '32px',
            position: 'relative',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)'
          }} onClick={e => e.stopPropagation()}>
            <button 
              onClick={() => setShowModal(false)}
              style={{
                position: 'absolute',
                top: '20px',
                right: '20px',
                background: 'none',
                border: 'none',
                fontSize: '24px',
                cursor: 'pointer',
                color: '#64748b'
              }}
            >✕</button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
              <div style={{
                width: '60px',
                height: '60px',
                borderRadius: '12px',
                background: '#f0f9ff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '32px'
              }}>
                {getTypeIcon(selectedLink.booking_type)}
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: '24px', color: '#1e293b' }}>Payment Details</h2>
                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                  {getStatusBadge(selectedLink.status)}
                  <span style={{ fontSize: '13px', color: '#64748b' }}>Created on {new Date(selectedLink.created_at).toLocaleString()}</span>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '32px' }}>
              <div>
                <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Customer Information</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ fontSize: '16px', fontWeight: 600, color: '#1e293b' }}>{selectedLink.customer_name}</div>
                  {selectedLink.customer_email && <div style={{ fontSize: '14px', color: '#475569' }}>📧 {selectedLink.customer_email}</div>}
                  {selectedLink.customer_phone && <div style={{ fontSize: '14px', color: '#475569' }}>📱 {selectedLink.customer_phone}</div>}
                </div>
              </div>
              <div>
                <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Payment Information</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ fontSize: '24px', fontWeight: 700, color: '#055B75' }}>
                    {selectedLink.currency} {parseFloat(selectedLink.amount).toFixed(2)}
                  </div>
                  {selectedLink.actual_fee && (
                    <div style={{ fontSize: '13px', color: '#475569' }}>
                      Actual Fee: {selectedLink.currency} {parseFloat(selectedLink.actual_fee).toFixed(2)}
                    </div>
                  )}
                  {selectedLink.agent_fee && (
                    <div style={{ fontSize: '13px', color: '#475569' }}>
                      Agent Fee: {selectedLink.currency} {parseFloat(selectedLink.agent_fee).toFixed(2)}
                    </div>
                  )}
                  <div style={{ fontSize: '13px', color: '#ef4444', fontWeight: 500 }}>
                    Expires: {new Date(selectedLink.expires_at).toLocaleDateString()}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ marginBottom: '32px' }}>
              <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Booking Details</h4>
              <div style={{ 
                background: '#f8fafc', 
                borderRadius: '12px', 
                padding: '16px',
                border: '1px solid #e2e8f0'
              }}>
                <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: '8px', textTransform: 'capitalize' }}>
                  {selectedLink.booking_type} Reservation
                </div>
                <div style={{ fontSize: '14px', color: '#475569', lineHeight: 1.6 }}>
                  {selectedLink.description || 'No description provided'}
                </div>
                
                {selectedLink.travel_details && Object.keys(selectedLink.travel_details).length > 0 && (
                  <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', marginBottom: '8px', textTransform: 'uppercase' }}>Travel Details</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      {Object.entries(selectedLink.travel_details).map(([key, value]) => (
                        <div key={key}>
                          <span style={{ fontSize: '12px', color: '#64748b', textTransform: 'capitalize' }}>{key.replace(/_/g, ' ')}:</span>
                          <span style={{ fontSize: '12px', fontWeight: 600, color: '#1e293b', marginLeft: '4px' }}>
                            {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Payment Link</h4>
              <div style={{ 
                display: 'flex', 
                gap: '8px',
                background: '#f1f5f9',
                padding: '4px',
                borderRadius: '8px',
                border: '1px solid #e2e8f0'
              }}>
                <input 
                  type="text" 
                  readOnly 
                  value={selectedLink.paymentUrl}
                  style={{
                    flex: 1,
                    background: 'none',
                    border: 'none',
                    padding: '8px 12px',
                    fontSize: '13px',
                    color: '#475569',
                    fontFamily: 'monospace'
                  }}
                />
                <button 
                  onClick={(e) => copyLink(e, selectedLink.paymentUrl, selectedLink.id)}
                  style={{
                    background: copiedId === selectedLink.id ? '#d1fae5' : '#055B75',
                    color: copiedId === selectedLink.id ? '#065f46' : 'white',
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  {copiedId === selectedLink.id ? '✓ Copied' : 'Copy'}
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '32px' }}>
              <button 
                onClick={() => setShowModal(false)}
                style={{
                  padding: '10px 24px',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  background: 'white',
                  color: '#475569',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PaymentLinksList;
