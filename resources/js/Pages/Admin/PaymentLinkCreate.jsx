import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import './AdminPanel.css';

const PaymentLinkCreate = () => {
  const [formData, setFormData] = useState({
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    bookingType: 'flight',
    amount: '',
    currency: 'USD',
    description: '',
    expiryDays: 30,
    travelDetails: {
      origin: '',
      destination: '',
      travelDate: '',
      returnDate: '',
      passengers: 1,
      airline: '',
      flightNumber: '',
      cabinClass: 'economy',
      hotelName: '',
      cruiseLine: '',
      notes: ''
    }
  });

  const [submitting, setSubmitting] = useState(false);
  const [generatedLink, setGeneratedLink] = useState(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleTravelDetailChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      travelDetails: { ...prev.travelDetails, [name]: value }
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const token = localStorage.getItem('adminToken') || localStorage.getItem('token') || localStorage.getItem('supabase_token');
      if (!token) {
        setError('Authentication required. Please log in again.');
        return;
      }

      const response = await fetch('/api/payments?action=create-payment-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      const result = await response.json();

      if (result.success) {
        setGeneratedLink(result.paymentLink);
      } else {
        setError(result.error || 'Failed to create payment link');
      }
    } catch (err) {
      setError('Network error: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const copyLink = () => {
    if (generatedLink?.paymentUrl) {
      navigator.clipboard.writeText(generatedLink.paymentUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const resetForm = () => {
    setGeneratedLink(null);
    setFormData({
      customerName: '',
      customerEmail: '',
      customerPhone: '',
      bookingType: 'flight',
      amount: '',
      currency: 'USD',
      description: '',
      expiryDays: 30,
      travelDetails: {
        origin: '',
        destination: '',
        travelDate: '',
        returnDate: '',
        passengers: 1,
        airline: '',
        flightNumber: '',
        cabinClass: 'economy',
        hotelName: '',
        cruiseLine: '',
        notes: ''
      }
    });
  };

  // Success view after link is generated
  if (generatedLink) {
    return (
      <div className="payment-link-create">
        <div className="page-header">
          <div className="header-content">
            <h1>✅ Payment Link Generated!</h1>
            <p>Share this link with your client to collect payment</p>
          </div>
        </div>

        <div className="success-container" style={{ maxWidth: '700px', margin: '30px auto' }}>
          <div className="generated-link-card" style={{
            background: 'linear-gradient(135deg, #055B75, #0a7d9e)',
            color: 'white',
            borderRadius: '16px',
            padding: '30px',
            marginBottom: '20px'
          }}>
            <div style={{ fontSize: '14px', opacity: 0.8, marginBottom: '8px' }}>Payment Link</div>
            <div style={{
              background: 'rgba(255,255,255,0.15)',
              borderRadius: '8px',
              padding: '14px 16px',
              fontSize: '14px',
              wordBreak: 'break-all',
              fontFamily: 'monospace',
              marginBottom: '16px'
            }}>
              {generatedLink.paymentUrl}
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={copyLink} style={{
                background: copied ? '#22c55e' : 'white',
                color: copied ? 'white' : '#055B75',
                border: 'none',
                padding: '10px 24px',
                borderRadius: '8px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}>
                {copied ? '✓ Copied!' : '📋 Copy Link'}
              </button>
              {generatedLink.customer_email && (
                <button onClick={() => {
                  window.open(`mailto:${generatedLink.customer_email}?subject=Payment Link - ${generatedLink.description || 'Booking'}&body=Hi ${generatedLink.customer_name},%0A%0APlease use the following link to complete your payment:%0A%0A${generatedLink.paymentUrl}%0A%0AAmount: ${generatedLink.currency} ${parseFloat(generatedLink.amount).toFixed(2)}%0A%0AThank you,%0AJetsetters Team`);
                }} style={{
                  background: 'rgba(255,255,255,0.2)',
                  color: 'white',
                  border: '1px solid rgba(255,255,255,0.3)',
                  padding: '10px 24px',
                  borderRadius: '8px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}>
                  📧 Email to Client
                </button>
              )}
            </div>
          </div>

          <div style={{
            background: '#f8fafc',
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '20px',
            border: '1px solid #e2e8f0'
          }}>
            <h3 style={{ margin: '0 0 15px', fontSize: '16px', color: '#334155' }}>Link Details</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '14px' }}>
              <div><span style={{ color: '#64748b' }}>Customer:</span> <strong>{generatedLink.customer_name}</strong></div>
              <div><span style={{ color: '#64748b' }}>Amount:</span> <strong>{generatedLink.currency} {parseFloat(generatedLink.amount).toFixed(2)}</strong></div>
              <div><span style={{ color: '#64748b' }}>Type:</span> <strong style={{ textTransform: 'capitalize' }}>{generatedLink.booking_type}</strong></div>
              <div><span style={{ color: '#64748b' }}>Expires:</span> <strong>{new Date(generatedLink.expires_at).toLocaleDateString()}</strong></div>
              {generatedLink.customer_email && (
                <div><span style={{ color: '#64748b' }}>Email:</span> <strong>{generatedLink.customer_email}</strong></div>
              )}
              <div><span style={{ color: '#64748b' }}>Status:</span> <span style={{ background: '#fef3c7', color: '#92400e', padding: '2px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 600 }}>Pending</span></div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button onClick={resetForm} className="action-button secondary" style={{ flex: 1 }}>
              + Create Another Link
            </button>
            <Link to="/admin/payment-links" className="action-button secondary" style={{ flex: 1, textAlign: 'center', textDecoration: 'none' }}>
              View All Links
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="payment-link-create">
      <div className="page-header">
        <div className="header-content">
          <div className="header-info">
            <h1>🔗 Create Payment Link</h1>
            <p>Enter travel details and generate a payment link for your client</p>
          </div>
        </div>
        <div className="header-actions">
          <Link to="/admin/payment-links" className="action-button secondary">
            View All Links
          </Link>
        </div>
      </div>

      {error && (
        <div style={{
          background: '#fef2f2',
          border: '1px solid #fecaca',
          color: '#dc2626',
          padding: '12px 16px',
          borderRadius: '8px',
          margin: '0 0 20px',
          fontSize: '14px'
        }}>
          ⚠️ {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          {/* Left Column: Customer & Pricing */}
          <div>
            {/* Customer Info */}
            <div className="form-section active" style={{ marginBottom: '20px' }}>
              <div className="section-header">
                <h3>👤 Customer Information</h3>
              </div>
              <div className="form-grid">
                <div className="form-field full-width">
                  <label>Customer Name *</label>
                  <input type="text" name="customerName" value={formData.customerName} onChange={handleChange} placeholder="e.g., John Doe" required />
                </div>
                <div className="form-field">
                  <label>Email</label>
                  <input type="email" name="customerEmail" value={formData.customerEmail} onChange={handleChange} placeholder="client@email.com" />
                </div>
                <div className="form-field">
                  <label>Phone</label>
                  <input type="tel" name="customerPhone" value={formData.customerPhone} onChange={handleChange} placeholder="+1 234 567 8900" />
                </div>
              </div>
            </div>

            {/* Pricing */}
            <div className="form-section active">
              <div className="section-header">
                <h3>💰 Pricing</h3>
              </div>
              <div className="form-grid">
                <div className="form-field">
                  <label>Amount *</label>
                  <div className="currency-input">
                    <select name="currency" value={formData.currency} onChange={handleChange} className="currency-select">
                      <option value="USD">USD ($)</option>
                      <option value="EUR">EUR (€)</option>
                      <option value="GBP">GBP (£)</option>
                      <option value="INR">INR (₹)</option>
                    </select>
                    <input type="number" name="amount" value={formData.amount} onChange={handleChange} placeholder="0.00" step="0.01" min="1" required />
                  </div>
                </div>
                <div className="form-field">
                  <label>Link Expires In</label>
                  <select name="expiryDays" value={formData.expiryDays} onChange={handleChange}>
                    <option value="3">3 days</option>
                    <option value="7">7 days</option>
                    <option value="14">14 days</option>
                    <option value="30">30 days</option>
                    <option value="60">60 days</option>
                    <option value="90">90 days</option>
                  </select>
                </div>
                <div className="form-field full-width">
                  <label>Description</label>
                  <input type="text" name="description" value={formData.description} onChange={handleChange} placeholder="e.g., Round trip NYC to London - Business Class" />
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Travel Details */}
          <div>
            <div className="form-section active">
              <div className="section-header">
                <h3>✈️ Travel Details</h3>
              </div>
              <div className="form-grid">
                <div className="form-field full-width">
                  <label>Booking Type</label>
                  <select name="bookingType" value={formData.bookingType} onChange={handleChange}>
                    <option value="flight">✈️ Flight</option>
                    <option value="hotel">🏨 Hotel</option>
                    <option value="cruise">🚢 Cruise</option>
                    <option value="package">🎒 Vacation Package</option>
                  </select>
                </div>

                {/* Dynamic fields based on type */}
                {(formData.bookingType === 'flight' || formData.bookingType === 'package') && (
                  <>
                    <div className="form-field">
                      <label>Origin</label>
                      <input type="text" name="origin" value={formData.travelDetails.origin} onChange={handleTravelDetailChange} placeholder="e.g., New York (JFK)" />
                    </div>
                    <div className="form-field">
                      <label>Destination</label>
                      <input type="text" name="destination" value={formData.travelDetails.destination} onChange={handleTravelDetailChange} placeholder="e.g., London (LHR)" />
                    </div>
                    <div className="form-field">
                      <label>Airline</label>
                      <input type="text" name="airline" value={formData.travelDetails.airline} onChange={handleTravelDetailChange} placeholder="e.g., British Airways" />
                    </div>
                    <div className="form-field">
                      <label>Flight Number</label>
                      <input type="text" name="flightNumber" value={formData.travelDetails.flightNumber} onChange={handleTravelDetailChange} placeholder="e.g., BA 117" />
                    </div>
                    <div className="form-field">
                      <label>Cabin Class</label>
                      <select name="cabinClass" value={formData.travelDetails.cabinClass} onChange={handleTravelDetailChange}>
                        <option value="economy">Economy</option>
                        <option value="premium_economy">Premium Economy</option>
                        <option value="business">Business</option>
                        <option value="first">First Class</option>
                      </select>
                    </div>
                  </>
                )}

                {formData.bookingType === 'hotel' && (
                  <>
                    <div className="form-field full-width">
                      <label>Hotel Name</label>
                      <input type="text" name="hotelName" value={formData.travelDetails.hotelName} onChange={handleTravelDetailChange} placeholder="e.g., The Ritz London" />
                    </div>
                    <div className="form-field full-width">
                      <label>Location</label>
                      <input type="text" name="destination" value={formData.travelDetails.destination} onChange={handleTravelDetailChange} placeholder="e.g., London, UK" />
                    </div>
                  </>
                )}

                {formData.bookingType === 'cruise' && (
                  <>
                    <div className="form-field">
                      <label>Cruise Line</label>
                      <input type="text" name="cruiseLine" value={formData.travelDetails.cruiseLine} onChange={handleTravelDetailChange} placeholder="e.g., Royal Caribbean" />
                    </div>
                    <div className="form-field">
                      <label>Destination</label>
                      <input type="text" name="destination" value={formData.travelDetails.destination} onChange={handleTravelDetailChange} placeholder="e.g., Caribbean" />
                    </div>
                  </>
                )}

                <div className="form-field">
                  <label>Travel Date</label>
                  <input type="date" name="travelDate" value={formData.travelDetails.travelDate} onChange={handleTravelDetailChange} />
                </div>
                <div className="form-field">
                  <label>Return Date</label>
                  <input type="date" name="returnDate" value={formData.travelDetails.returnDate} onChange={handleTravelDetailChange} />
                </div>
                <div className="form-field">
                  <label>Passengers</label>
                  <input type="number" name="passengers" value={formData.travelDetails.passengers} onChange={handleTravelDetailChange} min="1" max="20" />
                </div>
                <div className="form-field full-width">
                  <label>Additional Notes</label>
                  <textarea name="notes" value={formData.travelDetails.notes} onChange={handleTravelDetailChange} placeholder="Any special requests or notes..." rows="3" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Submit */}
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
          <Link to="/admin/payment-links" className="action-button secondary" style={{ textDecoration: 'none' }}>
            Cancel
          </Link>
          <button type="submit" className="action-button primary" disabled={submitting} style={{
            background: submitting ? '#94a3b8' : '#055B75',
            color: 'white',
            border: 'none',
            padding: '12px 32px',
            borderRadius: '8px',
            fontWeight: '600',
            fontSize: '15px',
            cursor: submitting ? 'not-allowed' : 'pointer'
          }}>
            {submitting ? '⏳ Generating...' : '🔗 Generate Payment Link'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default PaymentLinkCreate;
