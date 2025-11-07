import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import './AdminPanel.css';

const InquiryDetail = () => {
  const { id } = useParams();
  const [inquiry, setInquiry] = useState(null);
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [showUpdateForm, setShowUpdateForm] = useState(false);
  const [updateData, setUpdateData] = useState({
    status: '',
    priority: '',
    assigned_admin: '',
    internal_notes: ''
  });
  const [updateSuccess, setUpdateSuccess] = useState(false);
  const [sendingQuoteId, setSendingQuoteId] = useState(null);

  useEffect(() => {
    fetchInquiryDetails();
  }, [id]);

  const fetchInquiryDetails = async () => {
    try {
      setLoading(true);
      
      // Get token from localStorage
      const token = localStorage.getItem('adminToken') || localStorage.getItem('token') || localStorage.getItem('supabase_token');
      
      if (!token) {
        console.error('No authentication token found');
        setLoading(false);
        return;
      }

      // Fetch inquiry details
      const inquiryResponse = await fetch(`/api/inquiries/${id}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });
      const inquiryData = await inquiryResponse.json();

      if (inquiryData.success) {
        setInquiry(inquiryData.data);
        setUpdateData({
          status: inquiryData.data.status,
          priority: inquiryData.data.priority,
          assigned_admin: inquiryData.data.assigned_admin || '',
          internal_notes: inquiryData.data.internal_notes || ''
        });
      }

      // Fetch quotes for this inquiry
      const quotesResponse = await fetch(`/api/quotes/inquiry/${id}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });
      const quotesData = await quotesResponse.json();

      if (quotesData.success) {
        setQuotes(quotesData.data);
      }
    } catch (error) {
      console.error('Error fetching inquiry details:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async () => {
    try {
      setUpdating(true);
      
      // Get token from localStorage
      const token = localStorage.getItem('adminToken') || localStorage.getItem('token') || localStorage.getItem('supabase_token');
      
      if (!token) {
        console.error('No authentication token found');
        alert('Authentication required. Please log in again.');
        setUpdating(false);
        return;
      }

      const response = await fetch(`/api/inquiries/${id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(updateData)
      });

      const result = await response.json();

      if (result.success) {
        setInquiry(prev => ({ ...prev, ...updateData }));
        setUpdateSuccess(true);
        setTimeout(() => setUpdateSuccess(false), 3000);
        setShowUpdateForm(false);
      } else {
        alert('Failed to update inquiry: ' + result.message);
      }
    } catch (error) {
      console.error('Error updating inquiry:', error);
      alert('Error updating inquiry');
    } finally {
      setUpdating(false);
    }
  };

  const handleSendQuote = async (quoteId) => {
    try {
      setSendingQuoteId(quoteId);

      const token = localStorage.getItem('adminToken') || localStorage.getItem('token') || localStorage.getItem('supabase_token');
      if (!token) {
        alert('Authentication required. Please log in again.');
        return;
      }

      const response = await fetch(`/api/quotes/${quoteId}/send`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });

      const result = await response.json();

      if (result.success) {
        // Refresh quotes and inquiry to reflect new statuses
        await fetchInquiryDetails();
        alert('Quote sent to customer');
      } else {
        alert(result.message || 'Failed to send quote');
      }
    } catch (error) {
      console.error('Error sending quote:', error);
      alert('Error sending quote');
    } finally {
      setSendingQuoteId(null);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return 'status-pending';
      case 'processing': return 'status-processing';
      case 'quoted': return 'status-quoted';
      case 'booked': return 'status-booked';
      case 'cancelled': return 'status-cancelled';
      case 'expired': return 'status-expired';
      default: return 'status-default';
    }
  };

  const getPriorityIcon = (priority) => {
    switch (priority) {
      case 'urgent': return '🔴';
      case 'high': return '🟠';
      case 'normal': return '🟡';
      case 'low': return '🟢';
      default: return '⚪';
    }
  };

  const getInquiryTypeIcon = (type) => {
    switch (type) {
      case 'flight': return '✈️';
      case 'hotel': return '🏨';
      case 'cruise': return '🚢';
      case 'package': return '🎒';
      default: return '💬';
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Not specified';
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) return 'Today';
    if (diffDays === 2) return 'Yesterday';
    if (diffDays <= 7) return `${diffDays - 1} days ago`;
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return 'Not specified';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const renderInquiryDetails = () => {
    if (!inquiry) return null;

    const details = [];

    switch (inquiry.inquiry_type) {
      case 'flight':
        details.push(
          <div key="flight" className="service-detail-card">
            <div className="card-header">
              <div className="card-icon">✈️</div>
              <h4>Flight Details</h4>
            </div>
            <div className="card-content">
              <div className="detail-grid">
                <div className="detail-item">
                  <span className="detail-label">From</span>
                  <span className="detail-value">{inquiry.flight_origin || 'Not specified'}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">To</span>
                  <span className="detail-value">{inquiry.flight_destination || 'Not specified'}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Departure</span>
                  <span className="detail-value">{formatDate(inquiry.flight_departure_date)}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Return</span>
                  <span className="detail-value">{inquiry.flight_return_date ? formatDate(inquiry.flight_return_date) : 'One-way'}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Passengers</span>
                  <span className="detail-value">{inquiry.flight_passengers || 'Not specified'}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Class</span>
                  <span className="detail-value">{inquiry.flight_class || 'Economy'}</span>
                </div>
              </div>
            </div>
          </div>
        );
        break;

      case 'hotel':
        details.push(
          <div key="hotel" className="service-detail-card">
            <div className="card-header">
              <div className="card-icon">🏨</div>
              <h4>Hotel Details</h4>
            </div>
            <div className="card-content">
              <div className="detail-grid">
                <div className="detail-item">
                  <span className="detail-label">Destination</span>
                  <span className="detail-value">{inquiry.hotel_destination || 'Not specified'}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Check-in</span>
                  <span className="detail-value">{formatDate(inquiry.hotel_checkin_date)}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Check-out</span>
                  <span className="detail-value">{formatDate(inquiry.hotel_checkout_date)}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Rooms</span>
                  <span className="detail-value">{inquiry.hotel_rooms || 'Not specified'}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Guests</span>
                  <span className="detail-value">{inquiry.hotel_guests || 'Not specified'}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Room Type</span>
                  <span className="detail-value">{inquiry.hotel_room_type || 'Any'}</span>
                </div>
              </div>
            </div>
          </div>
        );
        break;

      case 'cruise':
        details.push(
          <div key="cruise" className="service-detail-card">
            <div className="card-header">
              <div className="card-icon">🚢</div>
              <h4>Cruise Details</h4>
            </div>
            <div className="card-content">
              <div className="detail-grid">
                <div className="detail-item">
                  <span className="detail-label">Destination</span>
                  <span className="detail-value">{inquiry.cruise_destination || 'Not specified'}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Departure</span>
                  <span className="detail-value">{formatDate(inquiry.cruise_departure_date)}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Duration</span>
                  <span className="detail-value">{inquiry.cruise_duration ? `${inquiry.cruise_duration} days` : 'Not specified'}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Passengers</span>
                  <span className="detail-value">{inquiry.cruise_passengers || 'Not specified'}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Cabin Type</span>
                  <span className="detail-value">{inquiry.cruise_cabin_type || 'Any'}</span>
                </div>
              </div>
            </div>
          </div>
        );
        break;

      case 'package':
        details.push(
          <div key="package" className="service-detail-card">
            <div className="card-header">
              <div className="card-icon">🎒</div>
              <h4>Vacation Package Details</h4>
            </div>
            <div className="card-content">
              <div className="detail-grid">
                <div className="detail-item">
                  <span className="detail-label">Destination</span>
                  <span className="detail-value">{inquiry.package_destination || 'Not specified'}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Start Date</span>
                  <span className="detail-value">{formatDate(inquiry.package_start_date)}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">End Date</span>
                  <span className="detail-value">{formatDate(inquiry.package_end_date)}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Travelers</span>
                  <span className="detail-value">{inquiry.package_travelers || 'Not specified'}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Budget</span>
                  <span className="detail-value">{inquiry.package_budget_range || 'Not specified'}</span>
                </div>
                <div className="detail-item full-width">
                  <span className="detail-label">Interests</span>
                  <span className="detail-value">{inquiry.package_interests?.join(', ') || 'Not specified'}</span>
                </div>
              </div>
            </div>
          </div>
        );
        break;

      case 'general':
        details.push(
          <div key="general" className="service-detail-card">
            <div className="card-header">
              <div className="card-icon">💬</div>
              <h4>General Inquiry</h4>
            </div>
            <div className="card-content">
              <div className="inquiry-message">
                <div className="message-header">
                  <h5>{inquiry.inquiry_subject || 'General Inquiry'}</h5>
                </div>
                <div className="message-content">
                  {inquiry.inquiry_message}
                </div>
              </div>
            </div>
          </div>
        );
        break;
    }

    return details;
  };

  if (loading) {
    return (
      <div className="inquiry-detail">
        <div className="page-loading">
          <div className="loading-spinner-large">
            <div className="spinner-ring"></div>
            <div className="spinner-ring"></div>
            <div className="spinner-ring"></div>
          </div>
          <h3>Loading Inquiry Details...</h3>
          <p>Fetching customer information and quotes</p>
        </div>
      </div>
    );
  }

  if (!inquiry) {
    return (
      <div className="inquiry-detail">
        <div className="error-state">
          <div className="error-icon">❌</div>
          <h3>Inquiry Not Found</h3>
          <p>The inquiry you're looking for doesn't exist or has been deleted.</p>
          <Link to="/admin/inquiries" className="error-action">
            Back to Inquiries
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="inquiry-detail">
      {/* Success Message */}
      {updateSuccess && (
        <div className="success-banner">
          <div className="success-icon">✅</div>
          <span>Inquiry updated successfully!</span>
        </div>
      )}

      {/* Page Header */}
      <div className="page-header">
        <div className="header-content">
          <div className="inquiry-title-section">
            <h1>Inquiry Details</h1>
            <div className="inquiry-badges">
              <span className="inquiry-id">#{inquiry.id}</span>
              <span className={`status-badge large ${getStatusColor(inquiry.status)}`}>
                {inquiry.status}
              </span>
              <div className="inquiry-type-badge">
                <span className="type-icon">{getInquiryTypeIcon(inquiry.inquiry_type)}</span>
                <span className="type-text">{inquiry.inquiry_type}</span>
              </div>
              <div className="priority-badge">
                <span className="priority-icon">{getPriorityIcon(inquiry.priority)}</span>
                <span className="priority-text">{inquiry.priority}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="header-actions">
          <button
            onClick={() => setShowUpdateForm(!showUpdateForm)}
            className="action-button secondary"
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c1.56.379 2.978-1.56 2.978-2.978a1.533 1.533 0 01.947-2.287c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01-2.287-.947c-.378-1.56-2.6-1.56-2.978 0a1.533 1.533 0 01-.947 2.287c-.836-1.372-.734-2.942 2.106-2.106a1.534 1.534 0 012.287-.947c1.56-.379 1.56-2.6 0-2.978a1.533 1.533 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.534 1.534 0 01-2.287.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd"/>
            </svg>
            Update Inquiry
          </button>
          <Link to={`/admin/inquiries/${id}/quote`} className="action-button primary">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd"/>
            </svg>
            Create Quote
          </Link>
          <Link to="/admin/inquiries" className="action-button secondary">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd"/>
            </svg>
            Back to List
          </Link>
        </div>
      </div>

      {/* Update Form */}
      {showUpdateForm && (
        <div className="update-form-card">
          <div className="card-header">
            <h4>Update Inquiry Status</h4>
            <button
              onClick={() => setShowUpdateForm(false)}
              className="close-button"
            >
              ✕
            </button>
          </div>
          <div className="card-content">
            <div className="update-form-grid">
              <div className="form-field">
                <label>Status</label>
                <select
                  value={updateData.status}
                  onChange={(e) => setUpdateData(prev => ({ ...prev, status: e.target.value }))}
                >
                  <option value="pending">Pending</option>
                  <option value="processing">Processing</option>
                  <option value="quoted">Quoted</option>
                  <option value="booked">Booked</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="expired">Expired</option>
                </select>
              </div>

              <div className="form-field">
                <label>Priority</label>
                <select
                  value={updateData.priority}
                  onChange={(e) => setUpdateData(prev => ({ ...prev, priority: e.target.value }))}
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>

              <div className="form-field full-width">
                <label>Internal Notes</label>
                <textarea
                  value={updateData.internal_notes}
                  onChange={(e) => setUpdateData(prev => ({ ...prev, internal_notes: e.target.value }))}
                  placeholder="Add internal notes for this inquiry..."
                  rows="4"
                />
              </div>
            </div>

            <div className="form-actions">
              <button
                onClick={() => setShowUpdateForm(false)}
                className="cancel-button"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdate}
                disabled={updating}
                className="update-button"
              >
                {updating ? (
                  <>
                    <div className="spinner small"></div>
                    Updating...
                  </>
                ) : (
                  'Update Inquiry'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="detail-content">
        {/* Customer Information */}
        <div className="customer-info-card">
          <div className="card-header">
            <div className="card-icon">👤</div>
            <h4>Customer Information</h4>
          </div>
          <div className="card-content">
            <div className="customer-profile">
              <div className="customer-avatar-large">
                {inquiry.customer_name.charAt(0).toUpperCase()}
              </div>
              <div className="customer-details">
                <h5>{inquiry.customer_name}</h5>
                <div className="customer-meta">
                  <div className="meta-item">
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/>
                      <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/>
                    </svg>
                    {inquiry.customer_email}
                  </div>
                  {inquiry.customer_phone && (
                    <div className="meta-item">
                      <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z"/>
                      </svg>
                      {inquiry.customer_phone}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="customer-additional-info">
              <div className="info-grid">
                <div className="info-item">
                  <span className="info-label">Country</span>
                  <span className="info-value">{inquiry.customer_country || 'Not specified'}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Contact Method</span>
                  <span className="info-value">{inquiry.preferred_contact_method || 'Not specified'}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Budget Range</span>
                  <span className="info-value">{inquiry.budget_range || 'Not specified'}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Created</span>
                  <span className="info-value">{formatDateTime(inquiry.created_at)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Service Details */}
        <div className="service-details-section">
          {renderInquiryDetails()}
        </div>

        {/* Special Requirements */}
        {inquiry.special_requirements && (
          <div className="requirements-card">
            <div className="card-header">
              <div className="card-icon">📝</div>
              <h4>Special Requirements</h4>
            </div>
            <div className="card-content">
              <div className="requirements-text">
                {inquiry.special_requirements}
              </div>
            </div>
          </div>
        )}

        {/* Quotes Section */}
        <div className="quotes-section">
          <div className="section-header">
            <h3>Quotes ({quotes.length})</h3>
            <Link to={`/admin/inquiries/${id}/quote`} className="create-quote-link">
              <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd"/>
              </svg>
              Create New Quote
            </Link>
          </div>

          {quotes.length === 0 ? (
            <div className="empty-quotes">
              <div className="empty-icon">💰</div>
              <h4>No Quotes Yet</h4>
              <p>Create a professional quote for this customer to get started.</p>
            </div>
          ) : (
            <div className="quotes-grid">
              {quotes.map(quote => (
                <div key={quote.id} className="quote-card">
                  <div className="quote-header">
                    <div className="quote-title">
                      <h5>{quote.quote_number}</h5>
                      <span className={`quote-status ${getStatusColor(quote.status)}`}>
                        {quote.status}
                      </span>
                    </div>
                    <div className="quote-amount">
                      <span className="currency">${quote.total_amount}</span>
                      <span className="currency-code">{quote.currency}</span>
                    </div>
                  </div>

                  <div className="quote-meta">
                    <div className="meta-row">
                      <span className="meta-label">Created:</span>
                      <span className="meta-value">{formatDate(quote.created_at)}</span>
                    </div>
                    {quote.expires_at && (
                      <div className="meta-row">
                        <span className="meta-label">Expires:</span>
                        <span className="meta-value">{formatDate(quote.expires_at)}</span>
                      </div>
                    )}
                  </div>

                  <div className="quote-actions">
                    <Link to={`/admin/quotes/${quote.id}`} className="quote-action view">
                      View Details
                    </Link>
                    {quote.status === 'draft' ? (
                      <button
                        className="quote-action send"
                        onClick={() => handleSendQuote(quote.id)}
                        disabled={sendingQuoteId === quote.id}
                      >
                        {sendingQuoteId === quote.id ? 'Sending...' : 'Send to Customer'}
                      </button>
                    ) : (
                      <button
                        className="quote-action sent"
                        disabled
                      >
                        Already Sent
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default InquiryDetail;
