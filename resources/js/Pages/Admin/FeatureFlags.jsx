import React, { useState, useEffect } from 'react';
import './AdminPanel.css';

const FeatureFlags = () => {
  const [flags, setFlags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(null);
  const [updateSuccess, setUpdateSuccess] = useState(null);
  const [updateError, setUpdateError] = useState(null);

  // Enhanced inquiry types with more detailed information
  const inquiryTypes = [
    {
      key: 'enable_flight_inquiries',
      label: '✈️ Flight Inquiries',
      description: 'Allow users to submit flight booking inquiries and search for flights',
      icon: '✈️',
      category: 'Transportation',
      impact: 'High',
      users: 'Business travelers, vacationers'
    },
    {
      key: 'enable_hotel_inquiries',
      label: '🏨 Hotel Inquiries',
      description: 'Allow users to submit hotel booking inquiries with destination preferences',
      icon: '🏨',
      category: 'Accommodation',
      impact: 'High',
      users: 'All travelers'
    },
    {
      key: 'enable_cruise_inquiries',
      label: '🚢 Cruise Inquiries',
      description: 'Allow users to submit cruise vacation inquiries with itinerary details',
      icon: '🚢',
      category: 'Vacation',
      impact: 'Medium',
      users: 'Luxury travelers, families'
    },
    {
      key: 'enable_package_inquiries',
      label: '🎒 Vacation Packages',
      description: 'Allow users to submit comprehensive vacation package inquiries',
      icon: '🎒',
      category: 'Packages',
      impact: 'Medium',
      users: 'First-time travelers, groups'
    },
    {
      key: 'enable_general_inquiries',
      label: '💬 General Inquiries',
      description: 'Allow users to submit general travel questions and consultations',
      icon: '💬',
      category: 'Support',
      impact: 'Low',
      users: 'All users'
    }
  ];

  useEffect(() => {
    fetchFeatureFlags();
  }, []);

  const fetchFeatureFlags = async () => {
    try {
      setLoading(true);
      
      // Get token from localStorage
      const token = localStorage.getItem('adminToken') || localStorage.getItem('token');
      
      if (!token) {
        console.error('No authentication token found');
        return;
      }

      const response = await fetch('/api/feature-flags', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        credentials: 'include'
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
            description: type.description,
            ...type
          };
        } else {
          // Merge with enhanced data
          flagsMap[type.key] = {
            ...flagsMap[type.key],
            ...type
          };
        }
      });

      setFlags(Object.values(flagsMap));
    } catch (err) {
      console.error('Error fetching feature flags:', err);
      setUpdateError('Failed to load feature flags. Using defaults.');

      // Initialize with defaults on error
      setFlags(inquiryTypes.map(type => ({
        flag_key: type.key,
        flag_name: type.label,
        enabled: true,
        description: type.description,
        ...type
      })));
    } finally {
      setLoading(false);
    }
  };

  const toggleFlag = async (flagKey) => {
    try {
      setUpdating(flagKey);
      setUpdateError(null);
      setUpdateSuccess(null);

      const flag = flags.find(f => f.flag_key === flagKey);
      const newEnabledState = !flag.enabled;
      
      // Get token from localStorage
      const token = localStorage.getItem('adminToken') || localStorage.getItem('token');
      
      if (!token) {
        console.error('No authentication token found');
        setUpdateError('Authentication required. Please log in again.');
        return;
      }

      const response = await fetch(`/api/feature-flags/${flagKey}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        credentials: 'include',
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

      setUpdateSuccess(`${flag.flag_name} ${newEnabledState ? 'enabled' : 'disabled'} successfully!`);
      setTimeout(() => setUpdateSuccess(null), 4000);

    } catch (err) {
      console.error('Error toggling feature flag:', err);
      setUpdateError('Failed to update feature flag. Changes may not persist.');

      // Still update local state even if API fails
      setFlags(flags.map(f =>
        f.flag_key === flagKey
          ? { ...f, enabled: !f.enabled }
          : f
      ));

      setTimeout(() => setUpdateError(null), 4000);
    } finally {
      setUpdating(null);
    }
  };

  const getImpactColor = (impact) => {
    switch (impact) {
      case 'High': return 'impact-high';
      case 'Medium': return 'impact-medium';
      case 'Low': return 'impact-low';
      default: return 'impact-low';
    }
  };

  if (loading) {
    return (
      <div className="feature-flags">
        <div className="page-loading">
          <div className="loading-spinner-large">
            <div className="spinner-ring"></div>
            <div className="spinner-ring"></div>
            <div className="spinner-ring"></div>
          </div>
          <h3>Loading Feature Flags...</h3>
          <p>Fetching system configuration</p>
        </div>
      </div>
    );
  }

  return (
    <div className="feature-flags">
      {/* Page Header */}
      <div className="page-header">
        <div className="header-content">
          <h1>System Configuration</h1>
          <p>Control which features are available to your users and manage system settings</p>
        </div>
        <div className="header-actions">
          <div className="stats-summary">
            <span className="stats-item">
              <strong>{flags.filter(f => f.enabled).length}</strong> of <strong>{flags.length}</strong> enabled
            </span>
          </div>
        </div>
      </div>

      {/* Success/Error Messages */}
      {updateSuccess && (
        <div className="success-banner">
          <div className="success-icon">✅</div>
          <span>{updateSuccess}</span>
        </div>
      )}

      {updateError && (
        <div className="error-banner">
          <div className="error-icon">⚠️</div>
          <span>{updateError}</span>
        </div>
      )}

      {/* Feature Overview */}
      <div className="feature-overview">
        <div className="overview-card">
          <div className="overview-header">
            <div className="overview-icon">🎛️</div>
            <h3>Inquiry Types Control</h3>
          </div>
          <div className="overview-content">
            <p>Manage which types of travel inquiries users can submit through your platform. Disabled types won't appear on the request form.</p>
            <div className="overview-stats">
              <div className="stat-item">
                <span className="stat-label">Active Features:</span>
                <span className="stat-value">{flags.filter(f => f.enabled).length}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Disabled Features:</span>
                <span className="stat-value">{flags.filter(f => !f.enabled).length}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Feature Flags Grid */}
      <div className="feature-flags-grid">
        {flags.map(flag => (
          <div key={flag.flag_key} className={`feature-flag-card ${flag.enabled ? 'enabled' : 'disabled'}`}>
            <div className="card-header">
              <div className="feature-icon">
                {flag.icon}
              </div>
              <div className="feature-status">
                <span className={`status-indicator ${flag.enabled ? 'active' : 'inactive'}`}>
                  {flag.enabled ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>

            <div className="card-content">
              <div className="feature-info">
                <h4 className="feature-title">{flag.flag_name.replace(flag.icon, '').trim()}</h4>
                <p className="feature-description">{flag.description}</p>

                <div className="feature-meta">
                  <div className="meta-item">
                    <span className="meta-label">Category:</span>
                    <span className="meta-value">{flag.category}</span>
                  </div>
                  <div className="meta-item">
                    <span className="meta-label">Impact:</span>
                    <span className={`meta-value impact ${getImpactColor(flag.impact)}`}>
                      {flag.impact}
                    </span>
                  </div>
                  <div className="meta-item">
                    <span className="meta-label">Target Users:</span>
                    <span className="meta-value">{flag.users}</span>
                  </div>
                </div>
              </div>

              <div className="feature-controls">
                <div className="toggle-section">
                  <label className="modern-toggle">
                    <input
                      type="checkbox"
                      checked={flag.enabled}
                      onChange={() => toggleFlag(flag.flag_key)}
                      disabled={updating === flag.flag_key}
                    />
                    <span className="toggle-slider"></span>
                  </label>

                  {updating === flag.flag_key && (
                    <div className="updating-indicator">
                      <div className="spinner small"></div>
                      <span>Updating...</span>
                    </div>
                  )}
                </div>

                <div className="feature-actions">
                  <button
                    className={`action-btn ${flag.enabled ? 'disable' : 'enable'}`}
                    onClick={() => toggleFlag(flag.flag_key)}
                    disabled={updating === flag.flag_key}
                  >
                    {flag.enabled ? 'Disable' : 'Enable'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Information Section */}
      <div className="information-section">
        <div className="info-card">
          <div className="info-header">
            <div className="info-icon">ℹ️</div>
            <h3>How Feature Flags Work</h3>
          </div>
          <div className="info-content">
            <div className="info-points">
              <div className="info-point">
                <div className="point-icon">⚡</div>
                <div className="point-content">
                  <h5>Real-time Updates</h5>
                  <p>Changes take effect immediately for all users visiting your site</p>
                </div>
              </div>
              <div className="info-point">
                <div className="point-icon">🔧</div>
                <div className="point-content">
                  <h5>Maintenance Mode</h5>
                  <p>Disable inquiry types during system maintenance or updates</p>
                </div>
              </div>
              <div className="info-point">
                <div className="point-icon">📊</div>
                <div className="point-content">
                  <h5>Business Control</h5>
                  <p>Focus on specific services based on your business strategy</p>
                </div>
              </div>
              <div className="info-point">
                <div className="point-icon">🔄</div>
                <div className="point-content">
                  <h5>Flexible Configuration</h5>
                  <p>Easily enable/disable features as your business evolves</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="info-card">
          <div className="info-header">
            <div className="info-icon">🚨</div>
            <h3>Important Notes</h3>
          </div>
          <div className="info-content">
            <ul className="important-notes">
              <li>Existing inquiries remain accessible even if their type is disabled</li>
              <li>Disabled inquiry types are hidden from the user request form</li>
              <li>All inquiry types are enabled by default for new installations</li>
              <li>Changes are permanent and affect all users immediately</li>
              <li>Consider user experience when disabling popular inquiry types</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FeatureFlags;
