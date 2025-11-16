import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import './AdminPanel.css';

const QuoteDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [quote, setQuote] = useState(null);
  const [inquiry, setInquiry] = useState(null);
  const [bookingInfo, setBookingInfo] = useState(null);
  const [payment, setPayment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchQuoteDetails();
  }, [id]);

  const fetchQuoteDetails = async () => {
    try {
      setLoading(true);
      setError(null);

      const token = localStorage.getItem('adminToken') || localStorage.getItem('token') || localStorage.getItem('supabase_token');
      
      if (!token) {
        setError('Authentication required. Please log in again.');
        setLoading(false);
        return;
      }

      // Fetch quote details
      const quoteResponse = await fetch(`/api/quotes?id=${id}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });

      if (!quoteResponse.ok) {
        if (quoteResponse.status === 404) {
          setError('Quote not found');
          setLoading(false);
          return;
        }
        throw new Error(`Failed to fetch quote (${quoteResponse.status})`);
      }

      const quoteData = await quoteResponse.json();
      if (!quoteData.success) {
        throw new Error(quoteData.message || 'Failed to fetch quote');
      }

      setQuote(quoteData.data);

      // Fetch inquiry details
      if (quoteData.data.inquiry_id) {
        const inquiryResponse = await fetch(`/api/inquiries?id=${quoteData.data.inquiry_id}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          credentials: 'include'
        });

        if (inquiryResponse.ok) {
          const inquiryData = await inquiryResponse.json();
          if (inquiryData.success) {
            setInquiry(inquiryData.data);
          }
        }
      }

      // Fetch booking information
      const bookingInfoResponse = await fetch(`/api/quotes?id=${id}&endpoint=booking-info`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });

      if (bookingInfoResponse.ok) {
        const bookingData = await bookingInfoResponse.json();
        if (bookingData.success && bookingData.data) {
          setBookingInfo(bookingData.data);
        }
      }

      // Fetch payment information
      const paymentsResponse = await fetch(`/api/payments?action=get-payment-details&quoteId=${id}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });

      if (paymentsResponse.ok) {
        const paymentsData = await paymentsResponse.json();
        if (paymentsData.success && paymentsData.payment) {
          setPayment(paymentsData.payment);
        }
      }

    } catch (err) {
      console.error('Error fetching quote details:', err);
      setError(err.message || 'Failed to load quote details');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch {
      return dateString;
    }
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateString;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return 'status-pending';
      case 'processing': return 'status-processing';
      case 'quoted': return 'status-quoted';
      case 'booked': return 'status-booked';
      case 'sent': return 'status-quoted';
      case 'accepted': return 'status-processing';
      case 'cancelled': return 'status-cancelled';
      case 'expired': return 'status-expired';
      case 'paid': return 'status-booked';
      case 'unpaid': return 'status-pending';
      default: return 'status-default';
    }
  };

  if (loading) {
    return (
      <div className="admin-container">
        <div className="admin-header">
          <h1>Loading Quote Details...</h1>
        </div>
        <div className="loading-spinner" style={{ textAlign: 'center', padding: '50px' }}>
          <div className="spinner"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="admin-container">
        <div className="admin-header">
          <button onClick={() => navigate(-1)} className="btn-secondary" style={{ marginBottom: '20px' }}>
            ← Back
          </button>
          <h1>Error</h1>
        </div>
        <div className="error-message" style={{ padding: '20px', backgroundColor: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '8px', color: '#991b1b' }}>
          {error}
        </div>
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="admin-container">
        <div className="admin-header">
          <button onClick={() => navigate(-1)} className="btn-secondary" style={{ marginBottom: '20px' }}>
            ← Back
          </button>
          <h1>Quote Not Found</h1>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-container">
      <div className="admin-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '20px' }}>
          <button onClick={() => navigate(-1)} className="btn-secondary">
            ← Back
          </button>
          {inquiry && (
            <Link to={`/admin/inquiries/${inquiry.id}`} className="btn-secondary">
              View Inquiry
            </Link>
          )}
        </div>
        <h1>Quote Details: {quote.quote_number || quote.id}</h1>
      </div>

      <div className="admin-content">
        {/* Quote Information */}
        <div className="quote-card" style={{ marginBottom: '20px' }}>
          <div className="quote-header">
            <div className="quote-title">
              <h2>{quote.quote_number || 'Quote'}</h2>
              <span className={`quote-status ${getStatusColor(quote.payment_status === 'paid' ? 'booked' : quote.status)}`}>
                {quote.payment_status === 'paid' ? 'booked' : quote.status}
              </span>
            </div>
            <div className="quote-amount">
              <span className="currency">${parseFloat(quote.total_amount || 0).toFixed(2)}</span>
              <span className="currency-code">{quote.currency || 'USD'}</span>
            </div>
          </div>

          <div className="quote-meta" style={{ marginTop: '20px' }}>
            <div className="info-row">
              <span className="info-label">Title:</span>
              <span className="info-value">{quote.title || 'N/A'}</span>
            </div>
            {quote.description && (
              <div className="info-row">
                <span className="info-label">Description:</span>
                <span className="info-value" style={{ whiteSpace: 'pre-wrap' }}>{quote.description}</span>
              </div>
            )}
            <div className="info-row">
              <span className="info-label">Status:</span>
              <span className={`info-value ${getStatusColor(quote.status)}`}>{quote.status}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Payment Status:</span>
              <span className={`info-value ${getStatusColor(quote.payment_status)}`}>
                {quote.payment_status || 'unpaid'}
              </span>
            </div>
            {quote.sent_at && (
              <div className="info-row">
                <span className="info-label">Sent At:</span>
                <span className="info-value">{formatDateTime(quote.sent_at)}</span>
              </div>
            )}
            {quote.accepted_at && (
              <div className="info-row">
                <span className="info-label">Accepted At:</span>
                <span className="info-value">{formatDateTime(quote.accepted_at)}</span>
              </div>
            )}
            {quote.expires_at && (
              <div className="info-row">
                <span className="info-label">Expires At:</span>
                <span className="info-value">{formatDateTime(quote.expires_at)}</span>
              </div>
            )}
            {quote.admin_notes && (
              <div className="info-row">
                <span className="info-label">Admin Notes:</span>
                <span className="info-value" style={{ whiteSpace: 'pre-wrap' }}>{quote.admin_notes}</span>
              </div>
            )}
          </div>
        </div>

        {/* Inquiry Information */}
        {inquiry && (
          <div className="quote-card" style={{ marginBottom: '20px' }}>
            <div className="payment-header" style={{ backgroundColor: '#0ea5e9', color: 'white' }}>
              📋 Inquiry Information
            </div>
            <div className="payment-info">
              <div className="payment-row">
                <span className="payment-label">Inquiry ID:</span>
                <span className="payment-value">{inquiry.id}</span>
              </div>
              <div className="payment-row">
                <span className="payment-label">Type:</span>
                <span className="payment-value capitalize">{inquiry.inquiry_type || 'N/A'}</span>
              </div>
              <div className="payment-row">
                <span className="payment-label">Status:</span>
                <span className={`payment-value ${getStatusColor(inquiry.status)}`}>{inquiry.status}</span>
              </div>
              {inquiry.customer_name && (
                <div className="payment-row">
                  <span className="payment-label">Customer Name:</span>
                  <span className="payment-value">{inquiry.customer_name}</span>
                </div>
              )}
              {inquiry.customer_email && (
                <div className="payment-row">
                  <span className="payment-label">Customer Email:</span>
                  <span className="payment-value">{inquiry.customer_email}</span>
                </div>
              )}
              {inquiry.customer_phone && (
                <div className="payment-row">
                  <span className="payment-label">Customer Phone:</span>
                  <span className="payment-value">{inquiry.customer_phone}</span>
                </div>
              )}
              {inquiry.travel_details && (
                <div className="payment-row">
                  <span className="payment-label">Travel Details:</span>
                  <span className="payment-value" style={{ whiteSpace: 'pre-wrap' }}>
                    {typeof inquiry.travel_details === 'string' ? inquiry.travel_details : JSON.stringify(inquiry.travel_details, null, 2)}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Booking Information */}
        {bookingInfo ? (
          <div className="quote-card" style={{ marginBottom: '20px' }}>
            <div className="payment-header" style={{ backgroundColor: '#10b981', color: 'white' }}>
              👤 Booking Information
              <span style={{ float: 'right', fontSize: '14px', fontWeight: 'normal' }}>
                Status: {bookingInfo.status || 'N/A'}
              </span>
            </div>
            <div className="payment-info">
              <div className="payment-row">
                <span className="payment-label">Full Name:</span>
                <span className="payment-value">{bookingInfo.full_name || 'N/A'}</span>
              </div>
              <div className="payment-row">
                <span className="payment-label">Email:</span>
                <span className="payment-value">{bookingInfo.email || 'N/A'}</span>
              </div>
              <div className="payment-row">
                <span className="payment-label">Phone:</span>
                <span className="payment-value">{bookingInfo.phone || 'N/A'}</span>
              </div>
              {bookingInfo.date_of_birth && (
                <div className="payment-row">
                  <span className="payment-label">Date of Birth:</span>
                  <span className="payment-value">{formatDate(bookingInfo.date_of_birth)}</span>
                </div>
              )}
              {bookingInfo.nationality && (
                <div className="payment-row">
                  <span className="payment-label">Nationality:</span>
                  <span className="payment-value">{bookingInfo.nationality}</span>
                </div>
              )}

              {/* Passport Information */}
              {(bookingInfo.passport_number || bookingInfo.passport_expiry_date || bookingInfo.passport_issue_date || bookingInfo.passport_issuing_country) && (
                <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '2px solid #e2e8f0' }}>
                  <h3 style={{ marginBottom: '15px', color: '#1e293b' }}>🛂 Passport Information</h3>
                  {bookingInfo.passport_number && (
                    <div className="payment-row">
                      <span className="payment-label">Passport Number:</span>
                      <span className="payment-value">{bookingInfo.passport_number}</span>
                    </div>
                  )}
                  {bookingInfo.passport_issue_date && (
                    <div className="payment-row">
                      <span className="payment-label">Issue Date:</span>
                      <span className="payment-value">{formatDate(bookingInfo.passport_issue_date)}</span>
                    </div>
                  )}
                  {bookingInfo.passport_expiry_date && (
                    <div className="payment-row">
                      <span className="payment-label">Expiry Date:</span>
                      <span className="payment-value">{formatDate(bookingInfo.passport_expiry_date)}</span>
                    </div>
                  )}
                  {bookingInfo.passport_issuing_country && (
                    <div className="payment-row">
                      <span className="payment-label">Issuing Country:</span>
                      <span className="payment-value">{bookingInfo.passport_issuing_country}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Emergency Contact */}
              {(bookingInfo.emergency_contact_name || bookingInfo.emergency_contact_phone || bookingInfo.emergency_contact_relationship) && (
                <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '2px solid #e2e8f0' }}>
                  <h3 style={{ marginBottom: '15px', color: '#1e293b' }}>🚨 Emergency Contact</h3>
                  {bookingInfo.emergency_contact_name && (
                    <div className="payment-row">
                      <span className="payment-label">Name:</span>
                      <span className="payment-value">{bookingInfo.emergency_contact_name}</span>
                    </div>
                  )}
                  {bookingInfo.emergency_contact_phone && (
                    <div className="payment-row">
                      <span className="payment-label">Phone:</span>
                      <span className="payment-value">{bookingInfo.emergency_contact_phone}</span>
                    </div>
                  )}
                  {bookingInfo.emergency_contact_relationship && (
                    <div className="payment-row">
                      <span className="payment-label">Relationship:</span>
                      <span className="payment-value">{bookingInfo.emergency_contact_relationship}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Additional Booking Details */}
              {bookingInfo.booking_details && Object.keys(bookingInfo.booking_details).length > 0 && (
                <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '2px solid #e2e8f0' }}>
                  <h3 style={{ marginBottom: '15px', color: '#1e293b' }}>📝 Additional Details</h3>
                  <div className="payment-row">
                    <span className="payment-label">Details:</span>
                    <span className="payment-value" style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                      {JSON.stringify(bookingInfo.booking_details, null, 2)}
                    </span>
                  </div>
                </div>
              )}

              {/* Terms and Privacy */}
              <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '2px solid #e2e8f0' }}>
                <h3 style={{ marginBottom: '15px', color: '#1e293b' }}>✅ Acceptances</h3>
                {bookingInfo.terms_accepted && (
                  <div className="payment-row">
                    <span className="payment-label">Terms Accepted:</span>
                    <span className="payment-value">
                      ✅ Yes {bookingInfo.terms_accepted_at ? `(${formatDateTime(bookingInfo.terms_accepted_at)})` : ''}
                    </span>
                  </div>
                )}
                {bookingInfo.privacy_policy_accepted && (
                  <div className="payment-row">
                    <span className="payment-label">Privacy Policy Accepted:</span>
                    <span className="payment-value">
                      ✅ Yes {bookingInfo.privacy_policy_accepted_at ? `(${formatDateTime(bookingInfo.privacy_policy_accepted_at)})` : ''}
                    </span>
                  </div>
                )}
              </div>

              {/* Timestamps */}
              <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '2px solid #e2e8f0' }}>
                <h3 style={{ marginBottom: '15px', color: '#1e293b' }}>⏰ Timestamps</h3>
                {bookingInfo.submitted_at && (
                  <div className="payment-row">
                    <span className="payment-label">Submitted:</span>
                    <span className="payment-value">{formatDateTime(bookingInfo.submitted_at)}</span>
                  </div>
                )}
                {bookingInfo.verified_at && (
                  <div className="payment-row">
                    <span className="payment-label">Verified:</span>
                    <span className="payment-value">{formatDateTime(bookingInfo.verified_at)}</span>
                  </div>
                )}
                {bookingInfo.created_at && (
                  <div className="payment-row">
                    <span className="payment-label">Created:</span>
                    <span className="payment-value">{formatDateTime(bookingInfo.created_at)}</span>
                  </div>
                )}
                {bookingInfo.updated_at && (
                  <div className="payment-row">
                    <span className="payment-label">Last Updated:</span>
                    <span className="payment-value">{formatDateTime(bookingInfo.updated_at)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="quote-card" style={{ marginBottom: '20px' }}>
            <div className="payment-header" style={{ backgroundColor: '#f59e0b', color: 'white' }}>
              👤 Booking Information
            </div>
            <div className="payment-info" style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>
              No booking information submitted yet.
            </div>
          </div>
        )}

        {/* Payment Information */}
        {payment ? (
          <div className="quote-card" style={{ marginBottom: '20px' }}>
            <div className="payment-header" style={{ backgroundColor: '#8b5cf6', color: 'white' }}>
              💳 Payment Information
            </div>
            <div className="payment-info">
              <div className="payment-row">
                <span className="payment-label">Transaction ID:</span>
                <span className="payment-value">{payment.arc_transaction_id || payment.id}</span>
              </div>
              <div className="payment-row">
                <span className="payment-label">Amount:</span>
                <span className="payment-value">
                  ${parseFloat(payment.amount || 0).toFixed(2)} {payment.currency || 'USD'}
                </span>
              </div>
              {payment.payment_method && (
                <div className="payment-row">
                  <span className="payment-label">Payment Method:</span>
                  <span className="payment-value capitalize">{payment.payment_method}</span>
                </div>
              )}
              <div className="payment-row">
                <span className="payment-label">Status:</span>
                <span className={`payment-value status-${payment.payment_status}`}>
                  {payment.payment_status || 'pending'}
                </span>
              </div>
              {payment.completed_at && (
                <div className="payment-row">
                  <span className="payment-label">Completed:</span>
                  <span className="payment-value">{formatDateTime(payment.completed_at)}</span>
                </div>
              )}
              {payment.created_at && (
                <div className="payment-row">
                  <span className="payment-label">Created:</span>
                  <span className="payment-value">{formatDateTime(payment.created_at)}</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="quote-card" style={{ marginBottom: '20px' }}>
            <div className="payment-header" style={{ backgroundColor: '#6b7280', color: 'white' }}>
              💳 Payment Information
            </div>
            <div className="payment-info" style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>
              No payment information available.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default QuoteDetail;

