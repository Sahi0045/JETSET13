import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Send, Search, Filter, CheckCircle, XCircle } from 'lucide-react';

const API_BASE = '/api';

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

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/templates`);
      const data = await response.json();
      if (data.success) {
        setTemplates(data.data);
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

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

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Loading templates...</div>;

  return (
    <div style={{ padding: '24px', color: '#f1f5f9', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '600', margin: 0 }}>Email Templates</h1>
          <p style={{ color: '#94a3b8', margin: '4px 0 0' }}>Manage response templates for automated communications</p>
        </div>
        <button
          onClick={() => { setIsEditing(true); setSelectedTemplate(null); setFormData({ name: '', category: 'visa', subject: '', body: '', variables: '' }); }}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
        >
          <Plus size={16} /> Add Template
        </button>
      </div>

      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: 12, color: '#64748b' }} />
          <input
            type="text"
            placeholder="Search templates..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: '100%', padding: '10px 10px 10px 40px', background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f1f5f9' }}
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          style={{ padding: '10px 16px', background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f1f5f9' }}
        >
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {error && (
        <div style={{ padding: '12px', background: '#fef2f2', borderRadius: '8px', color: '#dc2626', marginBottom: '16px' }}>
          {error}
        </div>
      )}

      {isEditing ? (
        <div style={{ background: '#1e293b', padding: '24px', borderRadius: '12px' }}>
          <h2 style={{ marginBottom: '20px' }}>{selectedTemplate ? 'Edit Template' : 'Create Template'}</h2>
          <div style={{ display: 'grid', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', color: '#94a3b8' }}>Template Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                style={{ width: '100%', padding: '10px', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', color: '#f1f5f9' }}
                placeholder="e.g., Visa Approved Notification"
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', color: '#94a3b8' }}>Category</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                style={{ width: '100%', padding: '10px', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', color: '#f1f5f9' }}
              >
                <option value="visa">Visa</option>
                <option value="booking">Booking</option>
                <option value="payment">Payment</option>
                <option value="general">General</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', color: '#94a3b8' }}>Subject</label>
              <input
                type="text"
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                style={{ width: '100%', padding: '10px', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', color: '#f1f5f9' }}
                placeholder="Use {{variable}} for dynamic content"
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', color: '#94a3b8' }}>Body</label>
              <textarea
                value={formData.body}
                onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                rows={12}
                style={{ width: '100%', padding: '10px', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', color: '#f1f5f9', fontFamily: 'monospace' }}
                placeholder="Email body with {{variables}}"
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', color: '#94a3b8' }}>Variables (comma separated)</label>
              <input
                type="text"
                value={formData.variables}
                onChange={(e) => setFormData({ ...formData, variables: e.target.value })}
                style={{ width: '100%', padding: '10px', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', color: '#f1f5f9' }}
                placeholder="customerName, applicationRef, destination"
              />
            </div>
            <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
              <button onClick={handleSave} style={{ padding: '12px 24px', background: '#10b981', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Save Template</button>
              <button onClick={() => { setIsEditing(false); setSelectedTemplate(null); }} style={{ padding: '12px 24px', background: '#64748b', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '12px' }}>
          {filteredTemplates.map((template, i) => (
            <div key={i} style={{ background: '#1e293b', padding: '20px', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <h3 style={{ margin: 0, fontSize: '16px' }}>{template.name}</h3>
                  <span style={{ padding: '2px 8px', background: '#3b82f6', borderRadius: '4px', fontSize: '12px' }}>{template.category}</span>
                </div>
                <p style={{ margin: 0, color: '#94a3b8', fontSize: '14px' }}>{template.subject}</p>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => { setSendDialog({ inquiryId: '', templateKey: template.key || template.id, variables: {} }); }} style={{ padding: '8px', background: '#10b981', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }} title="Send"><Send size={16} /></button>
                <button onClick={() => { setSelectedTemplate(template); setFormData({ name: template.name, category: template.category, subject: template.subject, body: template.body, variables: template.variables?.join(', ') || '' }); setIsEditing(true); }} style={{ padding: '8px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }} title="Edit"><Edit size={16} /></button>
                <button onClick={() => handleDelete(template.id)} style={{ padding: '8px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }} title="Delete"><Trash2 size={16} /></button>
              </div>
            </div>
          ))}
          {filteredTemplates.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>No templates found</div>
          )}
        </div>
      )}

      {sendDialog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#1e293b', padding: '24px', borderRadius: '12px', width: '400px' }}>
            <h3 style={{ margin: '0 0 16px' }}>Send Template</h3>
            <input type="text" placeholder="Inquiry ID" value={sendDialog.inquiryId} onChange={(e) => setSendDialog({ ...sendDialog, inquiryId: e.target.value })} style={{ width: '100%', padding: '10px', marginBottom: '12px', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', color: '#f1f5f9' }} />
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => setSendDialog(null)} style={{ padding: '8px 16px', background: '#64748b', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleSendTemplate} disabled={sending} style={{ padding: '8px 16px', background: '#10b981', color: 'white', border: 'none', borderRadius: '6px', cursor: sending ? 'not-allowed' : 'pointer' }}>{sending ? 'Sending...' : 'Send'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}