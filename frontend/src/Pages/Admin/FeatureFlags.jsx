import React, { useState, useEffect, useCallback } from 'react';
import { useRegisterRefresh } from './shell/RefreshContext';
import './AdminPanel.css';
import { adminHeaders, getStoredToken } from '../../utils/adminAuth';

// Whether a flight can be booked without an account. Checkout reads it on every
// guest checkout (backend/services/guestBooking.service.js), and no row is off.
const GUEST_FLAG = 'guest_flight_booking';
const GUEST_FLAG_DESCRIPTION = 'Allow flights to be booked and paid for without an account';

const FeatureFlags = () => {
  const [flags, setFlags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(null);
  const [updateSuccess, setUpdateSuccess] = useState(null);
  const [updateError, setUpdateError] = useState(null);
  // `enabled` is null while unknown: never offer to flip a switch that was not read.
  const [guestBooking, setGuestBooking] = useState({ enabled: null, updatedAt: null });
  const [guestSaving, setGuestSaving] = useState(false);
  const [guestError, setGuestError] = useState(null);

  // Enhanced inquiry types with more detailed information
  const inquiryTypes = [
    {
      key: 'enable_flight_inquiries',
      label: 'Flight Inquiries',
      description: 'Allow users to submit flight booking inquiries and search for flights',
      icon: 'FL',
      category: 'Transportation',
      impact: 'High',
      users: 'Business travelers, vacationers'
    },
    {
      key: 'enable_hotel_inquiries',
      label: 'Hotel Inquiries',
      description: 'Allow users to submit hotel booking inquiries with destination preferences',
      icon: 'HT',
      category: 'Accommodation',
      impact: 'High',
      users: 'All travelers'
    },
    {
      key: 'enable_cruise_inquiries',
      label: 'Cruise Inquiries',
      description: 'Allow users to submit cruise vacation inquiries with itinerary details',
      icon: 'CR',
      category: 'Vacation',
      impact: 'Medium',
      users: 'Luxury travelers, families'
    },
    {
      key: 'enable_package_inquiries',
      label: 'Vacation Packages',
      description: 'Allow users to submit comprehensive vacation package inquiries',
      icon: 'PK',
      category: 'Packages',
      impact: 'Medium',
      users: 'First-time travelers, groups'
    },
    {
      key: 'enable_general_inquiries',
      label: 'General Inquiries',
      description: 'Allow users to submit general travel questions and consultations',
      icon: 'GN',
      category: 'Support',
      impact: 'Low',
      users: 'All users'
    }
  ];

  useEffect(() => {
    fetchFeatureFlags();
  }, []);

  useRegisterRefresh(useCallback(() => fetchFeatureFlags(), []), []);

  const fetchFeatureFlags = async () => {
    try {
      setLoading(true);

      // Get token from localStorage
      const token = getStoredToken();


      const response = await fetch('/api/feature-flags', {
        headers: adminHeaders(),
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to fetch feature flags');
      }

      const data = await response.json();

      // Stored flags are keyed by `flag_name`, the table's own column.
      const stored = {};
      data.data?.forEach(flag => {
        stored[flag.flag_name] = flag;
      });

      // No row means off: the same rule checkout refuses a guest by.
      const guest = stored[GUEST_FLAG];
      setGuestBooking({ enabled: guest?.enabled === true, updatedAt: guest?.updated_at || null });

      // One card per inquiry type, with its stored state or enabled by default.
      // Other stored flags - the guest switch among them - are not inquiry types.
      setFlags(inquiryTypes.map(type => ({
        flag_key: type.key,
        flag_name: type.label,
        enabled: stored[type.key] ? stored[type.key].enabled : true,
        description: type.description,
        ...type
      })));
    } catch (err) {
      console.error('Error fetching feature flags:', err);
      // Unknown, not "off": the switch's button stays disabled until it is read.
      setGuestBooking({ enabled: null, updatedAt: null });
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
      const token = getStoredToken();


      const response = await fetch(`/api/feature-flags/${flagKey}`, {
        method: 'PUT',
        headers: adminHeaders(),
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

  // Unlike the inquiry toggles, this never shows a position the server did not
  // store: it decides who can pay, and a page claiming "off" while guests still
  // check out would be worse than an error.
  const toggleGuestBooking = async () => {
    if (guestBooking.enabled === null || guestSaving) return;
    const next = !guestBooking.enabled;
    setGuestSaving(true);
    setGuestError(null);
    setUpdateSuccess(null);
    try {
      const response = await fetch(`/api/feature-flags/${GUEST_FLAG}`, {
        method: 'PUT',
        headers: adminHeaders(),
        credentials: 'include',
        body: JSON.stringify({ enabled: next, description: GUEST_FLAG_DESCRIPTION })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.success) {
        throw new Error(body.message || `HTTP ${response.status}`);
      }
      setGuestBooking({ enabled: body.data?.enabled === true, updatedAt: body.data?.updated_at || null });
      setUpdateSuccess(body.data?.enabled
        ? 'Guest flight booking is on. Visitors can book a flight without an account.'
        : 'Guest flight booking is off. Visitors must log in to book a flight.');
      setTimeout(() => setUpdateSuccess(null), 5000);
    } catch (err) {
      console.error('Error switching guest flight booking:', err);
      setGuestError('The switch was not changed. Please try again.');
    } finally {
      setGuestSaving(false);
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <p style={{ color: '#6b7280', margin: 0, fontSize: '0.95rem' }}>Control which features are available to your users.</p>
        <span style={{ color: '#374151', fontSize: '0.875rem' }}>
          <strong style={{ color: '#055B75' }}>{flags.filter(f => f.enabled).length}</strong> of <strong>{flags.length}</strong> enabled
        </span>
      </div>

      {/* Success/Error Messages */}
      {updateSuccess && (
        <div className="success-banner">
          <div className="success-icon">OK</div>
          <span>{updateSuccess}</span>
        </div>
      )}

      {updateError && (
        <div className="error-banner">
          <div className="error-icon">!</div>
          <span>{updateError}</span>
        </div>
      )}

      {/* Guest flight booking: who can pay for a flight, not an inquiry type */}
      <div
        className={`feature-flag-card ${guestBooking.enabled ? 'enabled' : 'disabled'}`}
        style={{ marginBottom: 24 }}
      >
        <div className="card-header">
          <div className="feature-icon">GB</div>
          <div className="feature-status">
            <span className={`status-indicator ${guestBooking.enabled ? 'active' : 'inactive'}`}>
              {guestBooking.enabled === null ? 'Unknown' : guestBooking.enabled ? 'On' : 'Off'}
            </span>
          </div>
        </div>

        <div className="card-content">
          <div className="feature-info">
            <h4 className="feature-title">Guest flight booking</h4>
            <p className="feature-description">
              <strong>On:</strong> visitors can book and pay for a flight without an account. They must enter an
              email: the ticket is sent there, and Manage Booking finds the booking with it. Guest bookings do not
              appear in My Trips.
            </p>
            <p className="feature-description">
              <strong>Off:</strong> visitors are asked to log in before they enter traveller details. Turning it off
              stops new guest checkouts straight away; bookings already paid for are not affected, and guests can
              still open and cancel them with their email.
            </p>
            {guestBooking.updatedAt && (
              <p className="feature-description" style={{ fontSize: '0.8rem' }}>
                Last changed {new Date(guestBooking.updatedAt).toLocaleString()}
              </p>
            )}
            {guestBooking.enabled === null && (
              <p className="feature-description" style={{ color: '#b91c1c' }}>
                The switch could not be read. Refresh the page to try again.
              </p>
            )}
            {guestError && (
              <p className="feature-description" style={{ color: '#b91c1c' }}>{guestError}</p>
            )}
          </div>

          <div className="feature-controls">
            <div className="feature-actions">
              <button
                className={`action-btn ${guestBooking.enabled ? 'disable' : 'enable'}`}
                onClick={toggleGuestBooking}
                disabled={guestSaving || guestBooking.enabled === null}
              >
                {guestSaving ? 'Saving...' : guestBooking.enabled ? 'Turn off guest booking' : 'Turn on guest booking'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Feature Overview */}
      <div className="feature-overview">
        <div className="overview-card">
          <div className="overview-header">
            <div className="overview-icon">CFG</div>
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
            <div className="info-icon">i</div>
            <h3>How Feature Flags Work</h3>
          </div>
          <div className="info-content">
            <div className="info-points">
              <div className="info-point">
                <div className="point-icon">1</div>
                <div className="point-content">
                  <h5>Real-time Updates</h5>
                  <p>Changes take effect immediately for all users visiting your site</p>
                </div>
              </div>
              <div className="info-point">
                <div className="point-icon">2</div>
                <div className="point-content">
                  <h5>Maintenance Mode</h5>
                  <p>Disable inquiry types during system maintenance or updates</p>
                </div>
              </div>
              <div className="info-point">
                <div className="point-icon">3</div>
                <div className="point-content">
                  <h5>Business Control</h5>
                  <p>Focus on specific services based on your business strategy</p>
                </div>
              </div>
              <div className="info-point">
                <div className="point-icon">4</div>
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
            <div className="info-icon">!</div>
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
