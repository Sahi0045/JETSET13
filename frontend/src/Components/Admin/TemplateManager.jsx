import React, { useState, useEffect } from 'react';
import './TemplateManager.css';

const TemplateManager = ({ 
  apiEndpoint = '/api/templates',
  onSave,
  onDelete,
  onError
}) => {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    subject: '',
    body: '',
    category: 'general',
    isActive: true
  });

  const categories = [
    { value: 'general', label: 'General' },
    { value: 'booking', label: 'Booking Confirmation' },
    { value: 'inquiry', label: 'Inquiry Response' },
    { value: 'payment', label: 'Payment' },
    { value: 'reminder', label: 'Reminder' },
    { value: 'newsletter', label: 'Newsletter' }
  ];

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('adminToken') || localStorage.getItem('token');
      const response = await fetch(`${apiEndpoint}?action=list`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      const data = await response.json();
      if (data.success) {
        setTemplates(data.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch templates:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectTemplate = (template) => {
    setSelectedTemplate(template);
    setFormData({
      name: template.name,
      subject: template.subject || '',
      body: template.body || '',
      category: template.category || 'general',
      isActive: template.isActive !== false
    });
    setIsEditing(false);
    setIsCreating(false);
  };

  const handleCreateNew = () => {
    setSelectedTemplate(null);
    setFormData({
      name: '',
      subject: '',
      body: '',
      category: 'general',
      isActive: true
    });
    setIsCreating(true);
    setIsEditing(true);
  };

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleCancel = () => {
    if (isCreating) {
      setIsCreating(false);
      setFormData({
        name: '',
        subject: '',
        body: '',
        category: 'general',
        isActive: true
      });
    } else if (selectedTemplate) {
      setIsEditing(false);
      handleSelectTemplate(selectedTemplate);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const token = localStorage.getItem('adminToken') || localStorage.getItem('token');
      
      const payload = {
        ...formData,
        action: isCreating ? 'create' : 'update',
        id: selectedTemplate?.id
      };

      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      
      if (data.success) {
        await fetchTemplates();
        setIsEditing(false);
        setIsCreating(false);
        if (data.data) {
          setSelectedTemplate(data.data);
        }
        onSave?.(data);
      } else {
        onError?.(data.message || 'Failed to save template');
      }
    } catch (err) {
      onError?.(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (templateId) => {
    if (!confirm('Are you sure you want to delete this template?')) return;
    
    try {
      const token = localStorage.getItem('adminToken') || localStorage.getItem('token');
      
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action: 'delete', id: templateId })
      });

      const data = await response.json();
      
      if (data.success) {
        await fetchTemplates();
        setSelectedTemplate(null);
        setFormData({
          name: '',
          subject: '',
          body: '',
          category: 'general',
          isActive: true
        });
        onDelete?.(data);
      } else {
        onError?.(data.message || 'Failed to delete template');
      }
    } catch (err) {
      onError?.(err.message);
    }
  };

  const handleToggleActive = async (template) => {
    try {
      const token = localStorage.getItem('adminToken') || localStorage.getItem('token');
      
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          action: 'update', 
          id: template.id,
          isActive: !template.isActive 
        })
      });

      const data = await response.json();
      
      if (data.success) {
        await fetchTemplates();
        if (selectedTemplate?.id === template.id) {
          setSelectedTemplate({ ...template, isActive: !template.isActive });
        }
      }
    } catch (err) {
      onError?.(err.message);
    }
  };

  return (
    <div className="template-manager">
      <div className="template-sidebar">
        <div className="sidebar-header">
          <h3>Email Templates</h3>
          <button className="create-btn" onClick={handleCreateNew}>
            <span className="material-symbols-outlined">add</span>
            New
          </button>
        </div>
        
        {loading ? (
          <div className="loading-spinner">Loading...</div>
        ) : templates.length === 0 ? (
          <div className="empty-state">
            <span className="material-symbols-outlined">folder_open</span>
            <p>No templates yet</p>
          </div>
        ) : (
          <div className="template-list">
            {templates.map(template => (
              <div
                key={template.id}
                className={`template-item ${selectedTemplate?.id === template.id ? 'selected' : ''}`}
                onClick={() => handleSelectTemplate(template)}
              >
                <div className="template-item-info">
                  <span className="template-name">{template.name}</span>
                  <span className="template-category">{template.category}</span>
                </div>
                <div className={`template-status ${template.isActive ? 'active' : 'inactive'}`}>
                  {template.isActive ? 'Active' : 'Inactive'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="template-editor">
        {!selectedTemplate && !isCreating ? (
          <div className="empty-editor">
            <span className="material-symbols-outlined">email</span>
            <p>Select a template to view or edit</p>
          </div>
        ) : (
          <>
            <div className="editor-header">
              <h3>{isCreating ? 'Create New Template' : isEditing ? 'Edit Template' : selectedTemplate?.name}</h3>
              {!isEditing && (
                <div className="header-actions">
                  <button className="edit-btn" onClick={handleEdit}>
                    <span className="material-symbols-outlined">edit</span>
                    Edit
                  </button>
                  <button 
                    className="toggle-btn"
                    onClick={() => handleToggleActive(selectedTemplate)}
                  >
                    {selectedTemplate?.isActive ? 'Disable' : 'Enable'}
                  </button>
                  <button 
                    className="delete-btn"
                    onClick={() => handleDelete(selectedTemplate.id)}
                  >
                    <span className="material-symbols-outlined">delete</span>
                    Delete
                  </button>
                </div>
              )}
            </div>

            <div className="editor-form">
              <div className="form-group">
                <label>Template Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  disabled={!isEditing}
                  placeholder="Enter template name"
                />
              </div>

              <div className="form-group">
                <label>Category</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  disabled={!isEditing}
                >
                  {categories.map(cat => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Subject Line</label>
                <input
                  type="text"
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  disabled={!isEditing}
                  placeholder="Enter email subject"
                />
              </div>

              <div className="form-group">
                <label>Email Body</label>
                <textarea
                  value={formData.body}
                  onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                  disabled={!isEditing}
                  placeholder="Enter email body content. Use {{variable}} for dynamic content."
                  rows={12}
                />
                <span className="help-text">
                  Use {'{{variable}}'} syntax for dynamic content (e.g., {'{{customer_name}}'}, {'{{booking_id}}'})
                </span>
              </div>

              <div className="form-group checkbox-group">
                <label>
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    disabled={!isEditing}
                  />
                  <span>Active</span>
                </label>
              </div>

              {isEditing && (
                <div className="form-actions">
                  <button className="cancel-btn" onClick={handleCancel} disabled={saving}>
                    Cancel
                  </button>
                  <button className="save-btn" onClick={handleSave} disabled={saving}>
                    {saving ? 'Saving...' : 'Save Template'}
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default TemplateManager;