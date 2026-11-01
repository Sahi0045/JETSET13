import React, { useState, useEffect, useCallback } from 'react';
import { getApiUrl } from '../../utils/apiHelper';
import { useRegisterRefresh } from './shell/RefreshContext';
import './AdminPanel.css';
import { adminHeaders } from '../../utils/adminAuth';
import { coinBandsProblem, coinLimitFor, DEFAULT_COIN_BANDS, MAX_COIN_BANDS, usableCoinBands } from '../../../../shared/jetCoins.js';

const toBandDraft = (bands) => usableCoinBands(bands).map(({ from, usd }) => ({ from: String(from), usd: String(usd) }));
const readAmount = (value) => (String(value).trim() === '' ? NaN : Number(value));
const bandInputStyle = { width: '100%', padding: '8px 10px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' };
const visuallyHidden = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' };

const PriceSettings = () => {
  const [settings, setSettings] = useState({
    flight_taxes_fees: 25.00,
    flight_taxes_fees_percentage: 5.0,
    cruise_taxes_fees: 150.00,
    cruise_taxes_fees_percentage: 8.0,
    cruise_port_charges: 50.00,
    hotel_taxes_fees: 35.00,
    hotel_taxes_fees_percentage: 12.0,
    hotel_service_fee_percentage: 5.0,
    package_markup_percentage: 10.0,
    service_fee_percentage: 2.5,
    cancellation_fee: 50.00,
    flight_cancellation_fee: 50.00,
    flight_cancellation_fee_percent: null
  });
  
  const [coinBands, setCoinBands] = useState(() => toBandDraft(DEFAULT_COIN_BANDS));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [activeTab, setActiveTab] = useState('flights');

  useEffect(() => {
    fetchPriceSettings();
  }, []);

  useRegisterRefresh(useCallback(() => fetchPriceSettings(), []), []);

  // The PUT is now admin-gated server-side. Auth is the httpOnly jt_access cookie
  // (sent via credentials:'include'); adminHeaders() adds the X-CSRF-Token that
  // `protect` requires on state-changing cookie requests (and a legacy Bearer if
  // one happens to exist). The GET stays public but the header is harmless there.
  const getAuthHeaders = () => adminHeaders();

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
          setCoinBands(toBandDraft(data.data.flight_coin_bands));
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

  const parsedBands = coinBands.map(({ from, usd }) => ({ from: readAmount(from), usd: readAmount(usd) }));
  const bandsProblem = coinBandsProblem(parsedBands);

  const updateBand = (index, key, value) => {
    setCoinBands((bands) => bands.map((band, i) => (i === index ? { ...band, [key]: value } : band)));
  };

  const savePriceSettings = async () => {
    if (bandsProblem) {
      setMessage({ type: 'error', text: `Jet Coins per booking: ${bandsProblem} Nothing was saved.` });
      return;
    }
    try {
      setSaving(true);
      const response = await fetch(getApiUrl('admin/price-settings'), {
        method: 'PUT',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({ ...settings, flight_coin_bands: parsedBands })
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
      hotel_service_fee_percentage: 5.0,
      package_markup_percentage: 10.0,
      service_fee_percentage: 2.5,
      cancellation_fee: 50.00,
      flight_cancellation_fee: 50.00,
      flight_cancellation_fee_percent: null
    });
    setCoinBands(toBandDraft(DEFAULT_COIN_BANDS));
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
    <div className="price-settings-container" style={{ maxWidth: 1200, margin: '0 auto' }}>
      <p style={{ color: '#6b7280', fontSize: 14, margin: '0 0 20px' }}>
        Configure taxes, fees, and markup percentages for flights, cruises, hotels, and packages.
      </p>

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
                <InputField
                  label="Cancellation Fee - Flat"
                  value={settings.flight_cancellation_fee}
                  onChange={(value) => handleInputChange('flight_cancellation_fee', value)}
                  suffix="USD"
                  description="Kept when a customer cancels a flight after the free cancellation time, on top of the airline's own penalty. Set 0 to use only the percentage"
                />
                <InputField
                  label="Cancellation Fee - Percentage"
                  value={settings.flight_cancellation_fee_percent ?? ''}
                  onChange={(value) => handleInputChange('flight_cancellation_fee_percent', value)}
                  suffix="%"
                  description="Of what the customer paid, kept on top of the flat fee. Leave empty or 0 to use only the flat fee"
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

            <div style={{ marginTop: '32px', padding: '20px', backgroundColor: '#F1FBFD', border: '1px solid #65B3CF', borderRadius: '8px' }}>
              <h3 style={{ margin: '0 0 6px', fontSize: '16px', color: '#034457' }}>Jet Coins per booking</h3>
              <p style={{ margin: '0 0 12px', fontSize: '12px', color: '#4b5563', lineHeight: '1.5' }}>
                The most Jet Coins one flight booking can use, by its base fare for all travellers: the airline's fare before taxes, our fee and any coupon. The same in every country. Customers see this table in their Jet Wallet.
              </p>
              <table aria-label="Jet Coins per flight booking" style={{ width: '100%', maxWidth: '520px', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: '#034457' }}>
                    <th scope="col" style={{ padding: '4px 8px 4px 0' }}>Base fare from (USD)</th>
                    <th scope="col" style={{ padding: '4px 8px' }}>Coins up to (USD)</th>
                    <th scope="col"><span style={visuallyHidden}>Remove</span></th>
                  </tr>
                </thead>
                <tbody>
                  {coinBands.map((band, i) => (
                    <tr key={i}>
                      <td style={{ padding: '4px 8px 4px 0' }}>
                        <input
                          aria-label={`Band ${i + 1} base fare from`}
                          type="number"
                          min="0"
                          step="0.01"
                          value={band.from}
                          readOnly={i === 0}
                          onChange={(e) => updateBand(i, 'from', e.target.value)}
                          style={{ ...bandInputStyle, backgroundColor: i === 0 ? '#f3f4f6' : 'white' }}
                        />
                      </td>
                      <td style={{ padding: '4px 8px' }}>
                        <input
                          aria-label={`Band ${i + 1} coins up to`}
                          type="number"
                          min="0"
                          step="0.01"
                          value={band.usd}
                          onChange={(e) => updateBand(i, 'usd', e.target.value)}
                          style={bandInputStyle}
                        />
                      </td>
                      <td style={{ padding: '4px 0' }}>
                        {coinBands.length > 1 && (
                          <button
                            type="button"
                            aria-label={`Remove band ${i + 1}`}
                            onClick={() => setCoinBands((bands) => bands.filter((_, j) => j !== i))}
                            style={{ padding: '6px 10px', border: '1px solid #65B3CF', borderRadius: '6px', backgroundColor: 'white', color: '#034457', cursor: 'pointer' }}
                          >
                            Remove
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button
                type="button"
                onClick={() => setCoinBands((bands) => [...bands, { from: '', usd: '' }])}
                disabled={coinBands.length >= MAX_COIN_BANDS}
                style={{ marginTop: '10px', padding: '8px 14px', border: 'none', borderRadius: '6px', backgroundColor: '#055B75', color: 'white', fontWeight: '600', cursor: 'pointer', opacity: coinBands.length >= MAX_COIN_BANDS ? 0.5 : 1 }}
              >
                Add band
              </button>
              <p style={{ margin: '12px 0 0', fontSize: '13px', color: bandsProblem ? '#dc2626' : '#034457' }}>
                {bandsProblem || `Example: a $120 base fare can use up to ${formatCurrency(coinLimitFor(120, parsedBands) / 100)} of coins.`}
              </p>
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
                <InputField
                  label="Service Fee Percentage"
                  value={settings.hotel_service_fee_percentage}
                  onChange={(value) => handleInputChange('hotel_service_fee_percentage', value)}
                  suffix="%"
                  description="Platform service fee charged on the room subtotal (shown on hotel detail & checkout)"
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
                  <strong>Subtotal = Room Rate × Nights</strong><br/>
                  <strong>Total = Subtotal + (Subtotal × Taxes%) + (Subtotal × Service Fee%)</strong><br/>
                  Example: $150 × 3 = $450 + ($450 × {settings.hotel_taxes_fees_percentage}%) + ($450 × {settings.hotel_service_fee_percentage}%) = {formatCurrency(450 + (450 * settings.hotel_taxes_fees_percentage / 100) + (450 * settings.hotel_service_fee_percentage / 100))}
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