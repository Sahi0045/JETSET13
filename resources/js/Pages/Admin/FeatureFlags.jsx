import React, { useState, useEffect } from 'react';
import './AdminPanel.css';

const FeatureFlags = () => {
  const [flags, setFlags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Available inquiry types
  const inquiryTypes = [
    { key: 'enable_flight_inquiries', label: '✈️ Flight Inquiries', description: 'Allow users to submit flight booking inquiries' },
    { key: 'enable_hotel_inquiries', label: '🏨 Hotel Inquiries', description: 'Allow users to submit hotel booking inquiries' },
    { key: 'enable_cruise_inquiries', label: '🚢 Cruise Inquiries', description: 'Allow users to submit cruise vacation inquiries' },
    { key: 'enable_package_inquiries', label: '🎒 Package Inquiries', description: 'Allow users to submit vacation package inquiries' },
    { key: 'enable_general_inquiries', label: '💬 General Inquiries', description: 'Allow users to submit general travel inquiries' }
  ];

  useEffect(() => {
    fetchFeatureFlags();
  }, []);

  const fetchFeatureFlags = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/feature-flags', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch feature flags');
      }

      const data = await response.json();
      
      // Initialize flags with defaults if they don't exist
      const flagsMap = {};
      data.data?.forEach(flag => {
        flagsMap[flag.flag_key] = flag;
      });

      // Ensure all inquiry types have a flag entry (default enabled)
      inquiryTypes.forEach(type => {
        if (!flagsMap[type.key]) {
          flagsMap[type.key] = {
            flag_key: type.key,
            flag_name: type.label,
            enabled: true,
            description: type.description
          };
        }
      });

      setFlags(Object.values(flagsMap));
    } catch (err) {
      console.error('Error fetching feature flags:', err);
      setError('Failed to load feature flags');
      
      // Initialize with defaults on error
      setFlags(inquiryTypes.map(type => ({
        flag_key: type.key,
        flag_name: type.label,
        enabled: true,
        description: type.description
      })));
    } finally {
      setLoading(false);
    }
  };

  const toggleFlag = async (flagKey) => {
    try {
      setSaving(true);
      setError(null);
      
      const flag = flags.find(f => f.flag_key === flagKey);
      const newEnabledState = !flag.enabled;

      const response = await fetch(`/api/feature-flags/${flagKey}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          enabled: newEnabledState
        })
      });

      if (!response.ok) {
        throw new Error('Failed to update feature flag');
      }

      // Update local state
      setFlags(flags.map(f => 
        f.flag_key === flagKey 
          ? { ...f, enabled: newEnabledState }
          : f
      ));

      setSuccess(`${flag.flag_name} ${newEnabledState ? 'enabled' : 'disabled'} successfully!`);
      setTimeout(() => setSuccess(null), 3000);

    } catch (err) {
      console.error('Error toggling feature flag:', err);
      setError('Failed to update feature flag. Using local state only.');
      
      // Still update local state even if API fails
      setFlags(flags.map(f => 
        f.flag_key === flagKey 
          ? { ...f, enabled: !f.enabled }
          : f
      ));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="admin-content">
        <div className="loading-spinner">Loading feature flags...</div>
      </div>
    );
  }

  return (
    <div className="admin-content">
      <div className="admin-header">
        <h2>Feature Flags</h2>
        <p>Control which inquiry types are available to users</p>
      </div>

      {error && (
        <div className="alert alert-error">
          {error}
        </div>
      )}

      {success && (
        <div className="alert alert-success">
          {success}
        </div>
      )}

      <div className="feature-flags-container">
        {flags.map(flag => (
          <div key={flag.flag_key} className="feature-flag-card">
            <div className="flag-info">
              <h3>{flag.flag_name}</h3>
              <p>{flag.description}</p>
            </div>
            <div className="flag-toggle">
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={flag.enabled}
                  onChange={() => toggleFlag(flag.flag_key)}
                  disabled={saving}
                />
                <span className="toggle-slider"></span>
              </label>
              <span className={`flag-status ${flag.enabled ? 'enabled' : 'disabled'}`}>
                {flag.enabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="feature-flags-info">
        <h3>ℹ️ About Feature Flags</h3>
        <ul>
          <li>Disabled inquiry types will not appear on the request page</li>
          <li>Changes take effect immediately for all users</li>
          <li>Use this to temporarily disable inquiry types during maintenance</li>
          <li>All inquiry types are enabled by default</li>
        </ul>
      </div>
    </div>
  );
};

export default FeatureFlags;
