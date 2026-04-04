import React, { useState, useEffect } from 'react';
import './NotificationSettings.css';

const NotificationSettings = ({ 
  apiEndpoint = '/api/notifications/settings',
  onSave,
  onError
}) => {
  const [settings, setSettings] = useState({
    emailNotifications: true,
    smsNotifications: false,
    pushNotifications: true,
    inquiryUpdates: true,
    bookingAlerts: true,
    paymentReminders: true,
    promotionalEmails: false,
    newsletter: false,
    frequency: 'instant'
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('supabase_token') || localStorage.getItem('token');
      
      const response = await fetch(`${apiEndpoint}`, {
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json'
        }
      });
      
      const data = await response.json();
      if (data.success && data.data) {
        setSettings({ ...settings, ...data.data });
      }
    } catch (err) {
      console.log('Using default notification settings');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (key) => {
    setSettings({ ...settings, [key]: !settings[key] });
    setSuccess(false);
  };

  const handleFrequencyChange = (value) => {
    setSettings({ ...settings, frequency: value });
    setSuccess(false);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const token = localStorage.getItem('supabase_token') || localStorage.getItem('token');
      
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action: 'update', ...settings })
      });

      const data = await response.json();
      
      if (data.success) {
        setSuccess(true);
        onSave?.(data);
        setTimeout(() => setSuccess(false), 3000);
      } else {
        onError?.(data.message);
      }
    } catch (err) {
      onError?.(err.message);
    } finally {
      setSaving(false);
    }
  };

  const notificationChannels = [
    { key: 'emailNotifications', label: 'Email Notifications', icon: 'email', description: 'Receive updates via email' },
    { key: 'smsNotifications', label: 'SMS Notifications', icon: 'sms', description: 'Receive updates via text message' },
    { key: 'pushNotifications', label: 'Push Notifications', icon: 'notifications', description: 'Receive browser push notifications' }
  ];

  const notificationTypes = [
    { key: 'inquiryUpdates', label: 'Inquiry Updates', description: 'Get notified when your inquiry status changes' },
    { key: 'bookingAlerts', label: 'Booking Alerts', description: 'Receive confirmations and updates for bookings' },
    { key: 'paymentReminders', label: 'Payment Reminders', description: 'Get reminded about pending payments' },
    { key: 'promotionalEmails', label: 'Promotional Emails', description: 'Receive special offers and deals' },
    { key: 'newsletter', label: 'Newsletter', description: 'Subscribe to our monthly newsletter' }
  ];

  if (loading) {
    return (
      <div className="notification-settings loading">
        <div className="spinner"></div>
        <p>Loading notification settings...</p>
      </div>
    );
  }

  return (
    <div className="notification-settings">
      <div className="settings-header">
        <h2>Notification Settings</h2>
        <p>Manage how you receive notifications and updates</p>
      </div>

      <div className="settings-section">
        <h3>Notification Channels</h3>
        <div className="channel-cards">
          {notificationChannels.map(channel => (
            <div key={channel.key} className="channel-card">
              <div className="channel-icon">
                <span className="material-symbols-outlined">{channel.icon}</span>
              </div>
              <div className="channel-info">
                <span className="channel-label">{channel.label}</span>
                <span className="channel-desc">{channel.description}</span>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={settings[channel.key]}
                  onChange={() => handleToggle(channel.key)}
                />
                <span className="slider"></span>
              </label>
            </div>
          ))}
        </div>
      </div>

      <div className="settings-section">
        <h3>Notification Types</h3>
        <div className="notification-types">
          {notificationTypes.map(type => (
            <div key={type.key} className="notification-type-row">
              <div className="type-info">
                <span className="type-label">{type.label}</span>
                <span className="type-desc">{type.description}</span>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={settings[type.key]}
                  onChange={() => handleToggle(type.key)}
                />
                <span className="slider"></span>
              </label>
            </div>
          ))}
        </div>
      </div>

      <div className="settings-section">
        <h3>Email Frequency</h3>
        <div className="frequency-options">
          <label className={`frequency-option ${settings.frequency === 'instant' ? 'selected' : ''}`}>
            <input
              type="radio"
              name="frequency"
              value="instant"
              checked={settings.frequency === 'instant'}
              onChange={() => handleFrequencyChange('instant')}
            />
            <span className="option-content">
              <span className="option-label">Instant</span>
              <span className="option-desc">Receive notifications immediately</span>
            </span>
          </label>
          <label className={`frequency-option ${settings.frequency === 'daily' ? 'selected' : ''}`}>
            <input
              type="radio"
              name="frequency"
              value="daily"
              checked={settings.frequency === 'daily'}
              onChange={() => handleFrequencyChange('daily')}
            />
            <span className="option-content">
              <span className="option-label">Daily Digest</span>
              <span className="option-desc">Receive a summary once a day</span>
            </span>
          </label>
          <label className={`frequency-option ${settings.frequency === 'weekly' ? 'selected' : ''}`}>
            <input
              type="radio"
              name="frequency"
              value="weekly"
              checked={settings.frequency === 'weekly'}
              onChange={() => handleFrequencyChange('weekly')}
            />
            <span className="option-content">
              <span className="option-label">Weekly Digest</span>
              <span className="option-desc">Receive a summary once a week</span>
            </span>
          </label>
        </div>
      </div>

      <div className="settings-actions">
        {success && (
          <div className="success-message">
            <span className="material-symbols-outlined">check_circle</span>
            Settings saved successfully!
          </div>
        )}
        <button className="save-btn" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
};

export default NotificationSettings;