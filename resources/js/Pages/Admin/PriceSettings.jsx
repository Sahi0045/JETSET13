import React, { useState, useEffect } from 'react';
import { getApiUrl } from '../../utils/apiHelper';
import './AdminPanel.css';

const PriceSettings = () => {
  const [settings, setSettings] = useState({
    flight_taxes_fees: 25.00,
    flight_taxes_fees_percentage: 5.0,
    cruise_taxes_fees: 150.00,
    cruise_taxes_fees_percentage: 8.0,
    cruise_port_charges: 50.00,
    hotel_taxes_fees: 35.00,
    hotel_taxes_fees_percentage: 12.0,
    package_markup_percentage: 10.0,
    service_fee_percentage: 2.5,
    cancellation_fee: 50.00
  });
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [activeTab, setActiveTab] = useState('flights');

  useEffect(() => {
    fetchPriceSettings();
  }, []);

  const getAuthHeaders = () => {
    const token = localStorage.getItem('adminToken') || localStorage.getItem('token') || localStorage.getItem('supabase_token');
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  };

  const fetchPriceSettings = async () => {
    try {
      setLoading(true);
      const response = await fetch(getApiUrl('admin/price-settings'), {
        headers: getAuthHeaders(),
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          setSettings({ ...settings, ...data.data });
        }
      }
    } catch (error) {
      console.error('Error fetching price settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (key, value) => {
    setSettings(prev => ({
      ...prev,
      [key]: parseFloat(value) || 0
    }));
  };

  const savePriceSettings = async () => {
    try {
      setSaving(true);
      const response = await fetch(getApiUrl('admin/price-settings'), {
        method: 'PUT',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify(settings)
      });

      const data = await response.json();
      
      if (data.success) {
        setMessage({ type: 'success', text: 'Price settings updated successfully!' });
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to update price settings' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to update price settings: ' + error.message });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 5000);
    }
  };

  const resetToDefaults = () => {
    setSettings({
      flight_taxes_fees: 25.00,
      flight_taxes_fees_percentage: 5.0,
      cruise_taxes_fees: 150.00,
      cruise_taxes_fees_percentage: 8.0,
      cruise_port_charges: 50.00,
      hotel_taxes_fees: 35.00,
      hotel_taxes_fees_percentage: 12.0,
      package_markup_percentage: 10.0,
      service_fee_percentage: 2.5,
      cancellation_fee: 50.00
    });
    setMessage({ type: 'info', text: 'Settings reset to defaults. Click Save to apply.' });
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const InputField = ({ label, value, onChange, type = "number", step = "0.01", min = "0", suffix = "", description = "" }) => (
    <div style={{ marginBottom: '24px' }}>
      <label style={{ 
        display: 'block', 
        fontSize: '14px', 
        fontWeight: '600', 
        color: '#374151', 
        marginBottom: '6px' 
      }}>
        {label}
      </label>
      {description && (
        <p style={{ 
          fontSize: '12px', 
          color: '#6b7280', 
          margin: '0 0 8px',
          lineHeight: '1.4'
        }}>
          {description}
        </p>
      )}
      <div style={{ position: 'relative' }}>
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          step={step}
          min={min}
          style={{
            width: '100%',
            padding: '12px',
            paddingRight: suffix ? '60px' : '12px',
            border: '2px solid #e5e7eb',
            borderRadius: '8px',
            fontSize: '14px',
            transition: 'border-color 0.2s ease',
            boxSizing: 'border-box'
          }}
          onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
          onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
        />
        {suffix && (
          <span style={{
            position: 'absolute',
            right: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: '14px',
            color: '#6b7280',
            fontWeight: '500'
          }}>
            {suffix}
          </span>
        )}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="price-settings-container">
        <div style={{ textAlign: 'center', padding: '50px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>💰</div>
          <h3>Loading Price Settings...</h3>
          <p style={{ color: '#6b7280' }}>Fetching current pricing configuration</p>
        </div>
      </div>
    );
  }

  return (
    <div className="price-settings-container" style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '8px' }}>
          <div style={{ fontSize: '32px' }}>💰</div>
          <h1 style={{ margin: 0, fontSize: '28px', color: '#1f2937' }}>Price Control Settings</h1>
        </div>
        <p style={{ color: '#6b7280', fontSize: '16px', margin: 0 }}>
          Configure taxes, fees, and markup percentages for flights, cruises, hotels, and packages
        </p>
      </div>

      {/* Message */}
      {message && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '8px',
          marginBottom: '24px',
          backgroundColor: message.type === 'success' ? '#dcfce7' : message.type === 'error' ? '#fee2e2' : '#fef3c7',
          border: `1px solid ${message.type === 'success' ? '#bbf7d0' : message.type === 'error' ? '#fecaca' : '#fde68a'}`,
          color: message.type === 'success' ? '#15803d' : message.type === 'error' ? '#dc2626' : '#d97706'
        }}>
          {message.text}
        </div>
      )}

      {/* Tab Navigation */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', gap: '8px', borderBottom: '2px solid #e5e7eb' }}>
          {[
            { id: 'flights', label: 'Flights ✈️', icon: '✈️' },
            { id: 'cruises', label: 'Cruises 🚢', icon: '🚢' },
            { id: 'hotels', label: 'Hotels 🏨', icon: '🏨' },
            { id: 'general', label: 'General 🔧', icon: '🔧' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '12px 24px',
                border: 'none',
                borderBottom: `3px solid ${activeTab === tab.id ? '#3b82f6' : 'transparent'}`,
                backgroundColor: 'transparent',
                cursor: 'pointer',
                fontSize: '16px',
                fontWeight: '600',
                color: activeTab === tab.id ? '#3b82f6' : '#6b7280',
                transition: 'all 0.2s ease'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div style={{
        backgroundColor: '#f9fafb',
        border: '2px solid #e5e7eb',
        borderRadius: '12px',
        padding: '32px'
      }}>
        
        {activeTab === 'flights' && (
          <div>
            <h2 style={{ margin: '0 0 24px', fontSize: '20px', color: '#1f2937' }}>✈️ Flight Pricing Settings</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '32px' }}>
              <div>
                <InputField
                  label="Fixed Taxes & Fees"
                  value={settings.flight_taxes_fees}
                  onChange={(value) => handleInputChange('flight_taxes_fees', value)}
                  suffix="USD"
                  description="Fixed amount added for taxes, airport fees, and government charges per ticket"
                />
                <InputField
                  label="Taxes & Fees Percentage"
                  value={settings.flight_taxes_fees_percentage}
                  onChange={(value) => handleInputChange('flight_taxes_fees_percentage', value)}
                  suffix="%"
                  description="Percentage of base fare added for variable taxes and fees"
                />
              </div>
              <div style={{
                padding: '20px',
                backgroundColor: '#f0f9ff',
                border: '1px solid #bae6fd',
                borderRadius: '8px'
              }}>
                <h4 style={{ margin: '0 0 12px', color: '#0369a1' }}>💡 Current Flight Pricing Formula</h4>
                <div style={{ fontSize: '14px', color: '#0c4a6e', lineHeight: '1.6' }}>
                  <strong>Total = Base Fare + Fixed Fee + (Base Fare × Percentage)</strong><br/>
                  Example: $200 + ${settings.flight_taxes_fees} + ($200 × {settings.flight_taxes_fees_percentage}%) = {formatCurrency(200 + settings.flight_taxes_fees + (200 * settings.flight_taxes_fees_percentage / 100))}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'cruises' && (
          <div>
            <h2 style={{ margin: '0 0 24px', fontSize: '20px', color: '#1f2937' }}>🚢 Cruise Pricing Settings</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '32px' }}>
              <div>
                <InputField
                  label="Fixed Taxes & Fees"
                  value={settings.cruise_taxes_fees}
                  onChange={(value) => handleInputChange('cruise_taxes_fees', value)}
                  suffix="USD"
                  description="Fixed amount for cruise taxes, government fees, and mandatory charges"
                />
                <InputField
                  label="Taxes & Fees Percentage"
                  value={settings.cruise_taxes_fees_percentage}
                  onChange={(value) => handleInputChange('cruise_taxes_fees_percentage', value)}
                  suffix="%"
                  description="Percentage of cruise fare for variable taxes and gratuities"
                />
                <InputField
                  label="Port Charges"
                  value={settings.cruise_port_charges}
                  onChange={(value) => handleInputChange('cruise_port_charges', value)}
                  suffix="USD"
                  description="Per-person port fees charged by cruise terminals"
                />
              </div>
              <div style={{
                padding: '20px',
                backgroundColor: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: '8px'
              }}>
                <h4 style={{ margin: '0 0 12px', color: '#15803d' }}>💡 Current Cruise Pricing Formula</h4>
                <div style={{ fontSize: '14px', color: '#14532d', lineHeight: '1.6' }}>
                  <strong>Total = Base Fare + Taxes & Fees + Port Charges + (Base Fare × Percentage)</strong><br/>
                  Example: $800 + ${settings.cruise_taxes_fees} + ${settings.cruise_port_charges} + ($800 × {settings.cruise_taxes_fees_percentage}%) = {formatCurrency(800 + settings.cruise_taxes_fees + settings.cruise_port_charges + (800 * settings.cruise_taxes_fees_percentage / 100))}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'hotels' && (
          <div>
            <h2 style={{ margin: '0 0 24px', fontSize: '20px', color: '#1f2937' }}>🏨 Hotel Pricing Settings</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '32px' }}>
              <div>
                <InputField
                  label="Fixed Taxes & Fees"
                  value={settings.hotel_taxes_fees}
                  onChange={(value) => handleInputChange('hotel_taxes_fees', value)}
                  suffix="USD"
                  description="Fixed amount for hotel taxes, resort fees, and city taxes per night"
                />
                <InputField
                  label="Taxes & Fees Percentage"
                  value={settings.hotel_taxes_fees_percentage}
                  onChange={(value) => handleInputChange('hotel_taxes_fees_percentage', value)}
                  suffix="%"
                  description="Percentage of room rate for occupancy taxes and service charges"
                />
              </div>
              <div style={{
                padding: '20px',
                backgroundColor: '#fefce8',
                border: '1px solid #fde047',
                borderRadius: '8px'
              }}>
                <h4 style={{ margin: '0 0 12px', color: '#ca8a04' }}>💡 Current Hotel Pricing Formula</h4>
                <div style={{ fontSize: '14px', color: '#713f12', lineHeight: '1.6' }}>
                  <strong>Total = Room Rate + Fixed Fee + (Room Rate × Percentage)</strong><br/>
                  Example: $150/night + ${settings.hotel_taxes_fees} + ($150 × {settings.hotel_taxes_fees_percentage}%) = {formatCurrency(150 + settings.hotel_taxes_fees + (150 * settings.hotel_taxes_fees_percentage / 100))}/night
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'general' && (
          <div>
            <h2 style={{ margin: '0 0 24px', fontSize: '20px', color: '#1f2937' }}>🔧 General Pricing Settings</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '32px' }}>
              <div>
                <InputField
                  label="Package Markup Percentage"
                  value={settings.package_markup_percentage}
                  onChange={(value) => handleInputChange('package_markup_percentage', value)}
                  suffix="%"
                  description="Markup percentage for vacation packages including flights + hotels"
                />
                <InputField
                  label="Service Fee Percentage"
                  value={settings.service_fee_percentage}
                  onChange={(value) => handleInputChange('service_fee_percentage', value)}
                  suffix="%"
                  description="General service fee percentage applied to all bookings"
                />
                <InputField
                  label="Cancellation Fee"
                  value={settings.cancellation_fee}
                  onChange={(value) => handleInputChange('cancellation_fee', value)}
                  suffix="USD"
                  description="Standard cancellation fee charged when customers cancel bookings"
                />
              </div>
              <div style={{
                padding: '20px',
                backgroundColor: '#f5f3ff',
                border: '1px solid #c4b5fd',
                borderRadius: '8px'
              }}>
                <h4 style={{ margin: '0 0 12px', color: '#7c3aed' }}>💡 General Pricing Notes</h4>
                <div style={{ fontSize: '14px', color: '#5b21b6', lineHeight: '1.6' }}>
                  • Package markup applies to combined flight + hotel bookings<br/>
                  • Service fee is added to final total before payment<br/>
                  • Cancellation fees help offset processing costs<br/>
                  • All fees are configurable per business requirements
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div style={{ 
        marginTop: '32px', 
        display: 'flex', 
        gap: '12px', 
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <button
          onClick={resetToDefaults}
          disabled={saving}
          style={{
            padding: '12px 24px',
            backgroundColor: '#f3f4f6',
            border: '2px solid #d1d5db',
            borderRadius: '8px',
            fontSize: '16px',
            fontWeight: '600',
            color: '#374151',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
          onMouseOver={(e) => {
            e.target.style.backgroundColor = '#e5e7eb';
            e.target.style.borderColor = '#9ca3af';
          }}
          onMouseOut={(e) => {
            e.target.style.backgroundColor = '#f3f4f6';
            e.target.style.borderColor = '#d1d5db';
          }}
        >
          🔄 Reset to Defaults
        </button>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => window.location.href = '/admin'}
            style={{
              padding: '12px 24px',
              backgroundColor: '#6b7280',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: '600',
              color: 'white',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
            onMouseOver={(e) => e.target.style.backgroundColor = '#4b5563'}
            onMouseOut={(e) => e.target.style.backgroundColor = '#6b7280'}
          >
            Cancel
          </button>
          
          <button
            onClick={savePriceSettings}
            disabled={saving}
            style={{
              padding: '12px 32px',
              backgroundColor: saving ? '#9ca3af' : '#10b981',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: '600',
              color: 'white',
              cursor: saving ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease',
              minWidth: '140px'
            }}
            onMouseOver={(e) => {
              if (!saving) e.target.style.backgroundColor = '#059669';
            }}
            onMouseOut={(e) => {
              if (!saving) e.target.style.backgroundColor = '#10b981';
            }}
          >
            {saving ? '⏳ Saving...' : '💾 Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PriceSettings;