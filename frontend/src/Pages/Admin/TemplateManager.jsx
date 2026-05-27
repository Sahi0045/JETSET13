import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Edit, Trash2, Send, Search } from 'lucide-react';
import { useRegisterRefresh } from './shell/RefreshContext';

const API_BASE = '/api';

const CARD = {
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  padding: 20,
  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)'
};

const INPUT = {
  width: '100%',
  padding: '10px 12px',
  background: '#ffffff',
  border: '1px solid #d1d5db',
  borderRadius: 8,
  color: '#1f2937',
  fontSize: 14,
  outline: 'none'
};

const LABEL = {
  display: 'block',
  marginBottom: 6,
  fontSize: 13,
  fontWeight: 500,
  color: '#374151'
};

const CATEGORY_BADGE = {
  visa: { bg: '#e0f2fe', color: '#075985' },
  booking: { bg: '#dcfce7', color: '#166534' },
  payment: { bg: '#fef3c7', color: '#92400e' },
  general: { bg: '#f1f5f9', color: '#475569' }
};

export default function TemplateManager() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sending, setSending] = useState(false);
  const [sendDialog, setSendDialog] = useState(null);

  const [formData, setFormData] = useState({
    name: '',
    category: 'visa',
    subject: '',
    body: '',
    variables: ''
  });

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/templates`);
      const data = await response.json();
      if (data.success) {
        setTemplates(data.data);
        setError(null);
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  useRegisterRefresh(loadTemplates, [loadTemplates]);

  const handleSave = async () => {
    try {
      const variables = formData.variables.split(',').map(v => v.trim()).filter(Boolean);
      const payload = { ...formData, variables };

      let response;
      if (selectedTemplate?.id) {
        response = await fetch(`${API_BASE}/templates/${selectedTemplate.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        response = await fetch(`${API_BASE}/templates`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      const data = await response.json();
      if (data.success) {
        setIsEditing(false);
        setSelectedTemplate(null);
        setFormData({ name: '', category: 'visa', subject: '', body: '', variables: '' });
        loadTemplates();
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this template?')) return;
    try {
      const response = await fetch(`${API_BASE}/templates/${id}`, { method: 'DELETE' });
      const data = await response.json();
      if (data.success) {
        loadTemplates();
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSendTemplate = async () => {
    if (!sendDialog) return;
    setSending(true);
    try {
      const response = await fetch(`${API_BASE}/templates/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sendDialog)
      });
      const data = await response.json();
      if (data.success) {
        alert('Template sent successfully!');
        setSendDialog(null);
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const filteredTemplates = templates.filter(t => {
    const matchesSearch = t.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          t.subject?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || t.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const categories = [
    { id: 'all', name: 'All Categories' },
    { id: 'visa', name: 'Visa' },
    { id: 'booking', name: 'Booking' },
    { id: 'payment', name: 'Payment' },
    { id: 'general', name: 'General' }
  ];

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>
        Loading templates...
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <p style={{ color: '#6b7280', fontSize: 14, margin: 0 }}>
          Manage response templates for automated communications.
        </p>
        <button
          onClick={() => {
            setIsEditing(true);
            setSelectedTemplate(null);
            setFormData({ name: '', category: 'visa', subject: '', body: '', variables: '' });
          }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 16px',
            background: '#055B75',
            color: '#ffffff',
            border: 'none',
            borderRadius: 8,
            fontWeight: 500,
            cursor: 'pointer'
          }}
        >
          <Plus size={16} /> Add Template
        </button>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 240, position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: 12, color: '#9ca3af' }} />
          <input
            type="text"
            placeholder="Search templates..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ ...INPUT, paddingLeft: 38 }}
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          style={{ ...INPUT, width: 'auto', minWidth: 180 }}
        >
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {error && (
        <div style={{ padding: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#b91c1c', marginBottom: 16, fontSize: 14 }}>
          {error}
        </div>
      )}

      {isEditing ? (
        <div style={CARD}>
          <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 600, color: '#1f2937' }}>
            {selectedTemplate ? 'Edit Template' : 'Create Template'}
          </h2>
          <div style={{ display: 'grid', gap: 16 }}>
            <div>
              <label style={LABEL}>Template Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                style={INPUT}
                placeholder="e.g., Visa Approved Notification"
              />
            </div>
            <div>
              <label style={LABEL}>Category</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                style={INPUT}
              >
                <option value="visa">Visa</option>
                <option value="booking">Booking</option>
                <option value="payment">Payment</option>
                <option value="general">General</option>
              </select>
            </div>
            <div>
              <label style={LABEL}>Subject</label>
              <input
                type="text"
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                style={INPUT}
                placeholder="Use {{variable}} for dynamic content"
              />
            </div>
            <div>
              <label style={LABEL}>Body</label>
              <textarea
                value={formData.body}
                onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                rows={12}
                style={{ ...INPUT, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', resize: 'vertical' }}
                placeholder="Email body with {{variables}}"
              />
            </div>
            <div>
              <label style={LABEL}>Variables (comma separated)</label>
              <input
                type="text"
                value={formData.variables}
                onChange={(e) => setFormData({ ...formData, variables: e.target.value })}
                style={INPUT}
                placeholder="customerName, applicationRef, destination"
              />
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
              <button
                onClick={handleSave}
                style={{
                  padding: '10px 20px',
                  background: '#055B75',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 8,
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
              >
                Save Template
              </button>
              <button
                onClick={() => { setIsEditing(false); setSelectedTemplate(null); }}
                style={{
                  padding: '10px 20px',
                  background: '#ffffff',
                  color: '#374151',
                  border: '1px solid #d1d5db',
                  borderRadius: 8,
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {filteredTemplates.map((template, i) => {
            const badge = CATEGORY_BADGE[template.category] || CATEGORY_BADGE.general;
            return (
              <div
                key={template.id || i}
                style={{
                  ...CARD,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 16,
                  flexWrap: 'wrap'
                }}
              >
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#1f2937' }}>{template.name}</h3>
                    <span
                      style={{
                        padding: '2px 10px',
                        background: badge.bg,
                        color: badge.color,
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: 0.4
                      }}
                    >
                      {template.category}
                    </span>
                  </div>
                  <p style={{ margin: 0, color: '#6b7280', fontSize: 13 }}>{template.subject}</p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => setSendDialog({ inquiryId: '', templateKey: template.key || template.id, variables: {} })}
                    style={{
                      padding: 8,
                      background: '#055B75',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: 6,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center'
                    }}
                    title="Send"
                  >
                    <Send size={16} />
                  </button>
                  <button
                    onClick={() => {
                      setSelectedTemplate(template);
                      setFormData({
                        name: template.name,
                        category: template.category,
                        subject: template.subject,
                        body: template.body,
                        variables: template.variables?.join(', ') || ''
                      });
                      setIsEditing(true);
                    }}
                    style={{
                      padding: 8,
                      background: '#ffffff',
                      color: '#055B75',
                      border: '1px solid #65B3CF',
                      borderRadius: 6,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center'
                    }}
                    title="Edit"
                  >
                    <Edit size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(template.id)}
                    style={{
                      padding: 8,
                      background: '#ffffff',
                      color: '#dc2626',
                      border: '1px solid #fecaca',
                      borderRadius: 6,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center'
                    }}
                    title="Delete"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })}
          {filteredTemplates.length === 0 && (
            <div style={{ ...CARD, textAlign: 'center', color: '#6b7280' }}>
              No templates found
            </div>
          )}
        </div>
      )}

      {sendDialog && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 16
          }}
        >
          <div style={{ ...CARD, width: '100%', maxWidth: 420 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 17, fontWeight: 600, color: '#1f2937' }}>Send Template</h3>
            <label style={LABEL}>Inquiry ID</label>
            <input
              type="text"
              placeholder="Inquiry ID"
              value={sendDialog.inquiryId}
              onChange={(e) => setSendDialog({ ...sendDialog, inquiryId: e.target.value })}
              style={{ ...INPUT, marginBottom: 16 }}
            />
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setSendDialog(null)}
                style={{
                  padding: '8px 16px',
                  background: '#ffffff',
                  color: '#374151',
                  border: '1px solid #d1d5db',
                  borderRadius: 6,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSendTemplate}
                disabled={sending}
                style={{
                  padding: '8px 16px',
                  background: '#055B75',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 6,
                  cursor: sending ? 'not-allowed' : 'pointer',
                  opacity: sending ? 0.7 : 1
                }}
              >
                {sending ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
