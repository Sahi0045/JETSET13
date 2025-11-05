import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import './AdminPanel.css';

const InquiryDetail = () => {
  const { id } = useParams();
  const [inquiry, setInquiry] = useState(null);
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [updateData, setUpdateData] = useState({
    status: '',
    priority: '',
    assigned_admin: '',
    internal_notes: ''
  });

  useEffect(() => {
    fetchInquiryDetails();
  }, [id]);

  const fetchInquiryDetails = async () => {
    try {
      setLoading(true);

      // Fetch inquiry details
      const inquiryResponse = await fetch(`/api/inquiries/${id}`, {
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

      const response = await fetch(`/api/inquiries/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(updateData)
      });

      const result = await response.json();

      if (result.success) {
        setInquiry(prev => ({ ...prev, ...updateData }));
        alert('Inquiry updated successfully!');
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
          <div key="flight" className="detail-section">
            <h3>✈️ Flight Details</h3>
            <div className="detail-grid">
              <div><strong>From:</strong> {inquiry.flight_origin}</div>
              <div><strong>To:</strong> {inquiry.flight_destination}</div>
              <div><strong>Departure:</strong> {inquiry.flight_departure_date ? formatDate(inquiry.flight_departure_date) : 'Not specified'}</div>
              <div><strong>Return:</strong> {inquiry.flight_return_date ? formatDate(inquiry.flight_return_date) : 'One-way'}</div>
              <div><strong>Passengers:</strong> {inquiry.flight_passengers}</div>
              <div><strong>Class:</strong> {inquiry.flight_class}</div>
            </div>
          </div>
        );
        break;

      case 'hotel':
        details.push(
          <div key="hotel" className="detail-section">
            <h3>🏨 Hotel Details</h3>
            <div className="detail-grid">
              <div><strong>Destination:</strong> {inquiry.hotel_destination}</div>
              <div><strong>Check-in:</strong> {inquiry.hotel_checkin_date ? formatDate(inquiry.hotel_checkin_date) : 'Not specified'}</div>
              <div><strong>Check-out:</strong> {inquiry.hotel_checkout_date ? formatDate(inquiry.hotel_checkout_date) : 'Not specified'}</div>
              <div><strong>Rooms:</strong> {inquiry.hotel_rooms}</div>
              <div><strong>Guests:</strong> {inquiry.hotel_guests}</div>
              <div><strong>Room Type:</strong> {inquiry.hotel_room_type || 'Any'}</div>
            </div>
          </div>
        );
        break;

      case 'cruise':
        details.push(
          <div key="cruise" className="detail-section">
            <h3>🚢 Cruise Details</h3>
            <div className="detail-grid">
              <div><strong>Destination:</strong> {inquiry.cruise_destination}</div>
              <div><strong>Departure:</strong> {inquiry.cruise_departure_date ? formatDate(inquiry.cruise_departure_date) : 'Not specified'}</div>
              <div><strong>Duration:</strong> {inquiry.cruise_duration} days</div>
              <div><strong>Passengers:</strong> {inquiry.cruise_passengers}</div>
              <div><strong>Cabin Type:</strong> {inquiry.cruise_cabin_type || 'Any'}</div>
            </div>
          </div>
        );
        break;

      case 'package':
        details.push(
          <div key="package" className="detail-section">
            <h3>🎒 Vacation Package Details</h3>
            <div className="detail-grid">
              <div><strong>Destination:</strong> {inquiry.package_destination}</div>
              <div><strong>Start Date:</strong> {inquiry.package_start_date ? formatDate(inquiry.package_start_date) : 'Not specified'}</div>
              <div><strong>End Date:</strong> {inquiry.package_end_date ? formatDate(inquiry.package_end_date) : 'Not specified'}</div>
              <div><strong>Travelers:</strong> {inquiry.package_travelers}</div>
              <div><strong>Budget:</strong> {inquiry.package_budget_range || 'Not specified'}</div>
              <div><strong>Interests:</strong> {inquiry.package_interests?.join(', ') || 'Not specified'}</div>
            </div>
          </div>
        );
        break;

      case 'general':
        details.push(
          <div key="general" className="detail-section">
            <h3>💬 General Inquiry</h3>
            <div className="detail-grid">
              <div><strong>Subject:</strong> {inquiry.inquiry_subject}</div>
              <div className="message-content"><strong>Message:</strong> {inquiry.inquiry_message}</div>
            </div>
          </div>
        );
        break;
    }

    return details;
  };

  if (loading) {
    return <div className="admin-loading">Loading inquiry details...</div>;
  }

  if (!inquiry) {
    return <div className="error-message">Inquiry not found</div>;
  }

  return (
    <div className="inquiry-detail">
      <div className="page-header">
        <div className="header-content">
          <h1>Inquiry Details</h1>
          <div className="inquiry-meta">
            <span className="inquiry-id">ID: {inquiry.id}</span>
            <span className={`status-badge ${getStatusColor(inquiry.status)}`}>
              {inquiry.status}
            </span>
            <span className="inquiry-type">
              {getInquiryTypeIcon(inquiry.inquiry_type)} {inquiry.inquiry_type}
            </span>
          </div>
        </div>
        <div className="header-actions">
          <Link to={`/admin/inquiries/${id}/quote`} className="action-btn primary-btn">
            Create Quote
          </Link>
          <Link to="/admin/inquiries" className="action-btn secondary-btn">
            Back to List
          </Link>
        </div>
      </div>

      <div className="detail-content">
        {/* Customer Information */}
        <div className="detail-section">
          <h3>👤 Customer Information</h3>
          <div className="detail-grid">
            <div><strong>Name:</strong> {inquiry.customer_name}</div>
            <div><strong>Email:</strong> {inquiry.customer_email}</div>
            <div><strong>Phone:</strong> {inquiry.customer_phone}</div>
            <div><strong>Country:</strong> {inquiry.customer_country || 'Not specified'}</div>
            <div><strong>Preferred Contact:</strong> {inquiry.preferred_contact_method}</div>
            <div><strong>Budget Range:</strong> {inquiry.budget_range || 'Not specified'}</div>
          </div>
        </div>

        {/* Inquiry Specific Details */}
        {renderInquiryDetails()}

        {/* Special Requirements */}
        {inquiry.special_requirements && (
          <div className="detail-section">
            <h3>📝 Special Requirements</h3>
            <p>{inquiry.special_requirements}</p>
          </div>
        )}

        {/* Quotes Section */}
        <div className="detail-section">
          <h3>💰 Quotes ({quotes.length})</h3>
          {quotes.length === 0 ? (
            <p>No quotes have been created for this inquiry yet.</p>
          ) : (
            <div className="quotes-list">
              {quotes.map(quote => (
                <div key={quote.id} className="quote-item">
                  <div className="quote-header">
                    <span className="quote-number">{quote.quote_number}</span>
                    <span className={`status-badge ${getStatusColor(quote.status)}`}>
                      {quote.status}
                    </span>
                  </div>
                  <div className="quote-details">
                    <div><strong>Amount:</strong> ${quote.total_amount} {quote.currency}</div>
                    <div><strong>Created:</strong> {formatDate(quote.created_at)}</div>
                    {quote.expires_at && (
                      <div><strong>Expires:</strong> {formatDate(quote.expires_at)}</div>
                    )}
                  </div>
                  <div className="quote-actions">
                    <Link to={`/admin/quotes/${quote.id}`} className="action-btn view-btn">
                      View Quote
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Update Form */}
        <div className="detail-section">
          <h3>⚙️ Update Inquiry</h3>
          <div className="update-form">
            <div className="form-row">
              <div className="form-group">
                <label>Status:</label>
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

              <div className="form-group">
                <label>Priority:</label>
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
            </div>

            <div className="form-group">
              <label>Internal Notes:</label>
              <textarea
                value={updateData.internal_notes}
                onChange={(e) => setUpdateData(prev => ({ ...prev, internal_notes: e.target.value }))}
                placeholder="Add internal notes for this inquiry..."
                rows="4"
              />
            </div>

            <button
              onClick={handleUpdate}
              disabled={updating}
              className="update-btn"
            >
              {updating ? 'Updating...' : 'Update Inquiry'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InquiryDetail;
