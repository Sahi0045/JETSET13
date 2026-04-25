import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import './AdminPanel.css';

const InquiryDetail = () => {
  const { id } = useParams();
  const [inquiry, setInquiry] = useState(null);
  const [quotes, setQuotes] = useState([]);
  const [payments, setPayments] = useState([]);
  const [bookingInfos, setBookingInfos] = useState({}); // Store booking info by quote ID
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
  
  // Refund state
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundingPayment, setRefundingPayment] = useState(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [refundProcessing, setRefundProcessing] = useState(false);
  const [refundError, setRefundError] = useState(null);
  const [refundSuccess, setRefundSuccess] = useState(false);
  
  // Void state
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [voidingPayment, setVoidingPayment] = useState(null);
  const [voidReason, setVoidReason] = useState('');
  const [voidProcessing, setVoidProcessing] = useState(false);
  const [voidError, setVoidError] = useState(null);
  const [voidSuccess, setVoidSuccess] = useState(false);
  
  // Check Status state
  const [checkingStatusId, setCheckingStatusId] = useState(null);
  const [statusDetails, setStatusDetails] = useState({});
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [currentStatusPayment, setCurrentStatusPayment] = useState(null);

  useEffect(() => {
    fetchInquiryDetails();
    
    // Auto-refresh every 30 seconds to get latest payment status
    const refreshInterval = setInterval(() => {
      fetchInquiryDetails();
    }, 30000); // Refresh every 30 seconds
    
    return () => clearInterval(refreshInterval);
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

      // Fetch inquiry details (Vercel uses query parameters, not path params)
      const inquiryResponse = await fetch(`/api/inquiries?id=${id}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });

      if (!inquiryResponse.ok) {
        if (inquiryResponse.status === 404) {
          console.warn('Inquiry not found:', id);
          setInquiry(null);
          setLoading(false);
          return;
        }
        // Try to parse error response as JSON, fallback to text
        let errorMessage = `Failed to fetch inquiry (${inquiryResponse.status})`;
        try {
          const errorText = await inquiryResponse.text();
          try {
            const errorData = JSON.parse(errorText);
            errorMessage = errorData.message || errorData.error || errorMessage;
          } catch {
            // If not JSON, use the text
            errorMessage = errorText.substring(0, 100);
          }
        } catch (e) {
          // Ignore parse errors
        }
        throw new Error(errorMessage);
      }

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
      const quotesResponse = await fetch(`/api/quotes?inquiryId=${id}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });
      const quotesData = await quotesResponse.json();

      if (quotesData.success) {
        setQuotes(quotesData.data);
        
        // Fetch booking info for each quote
        const quoteIds = quotesData.data.map(q => q.id);
        if (quoteIds.length > 0) {
          // Fetch booking info for all quotes
          const bookingInfoPromises = quoteIds.map(async (quoteId) => {
            try {
              const bookingResponse = await fetch(`/api/quotes?id=${quoteId}&endpoint=booking-info`, {
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json'
                },
                credentials: 'include'
              });
              if (bookingResponse.ok) {
                const bookingData = await bookingResponse.json();
                if (bookingData.success) {
                  return { quoteId, bookingInfo: bookingData.data };
                }
              }
            } catch (error) {
              console.error(`Error fetching booking info for quote ${quoteId}:`, error);
            }
            return { quoteId, bookingInfo: null };
          });

          const bookingInfoResults = await Promise.all(bookingInfoPromises);
          const bookingInfoMap = {};
          bookingInfoResults.forEach(({ quoteId, bookingInfo }) => {
            if (bookingInfo) {
              bookingInfoMap[quoteId] = bookingInfo;
            }
          });
          setBookingInfos(bookingInfoMap);

          // Fetch payments for each quote
          try {
            const paymentsPromises = quoteIds.map(quoteId =>
              fetch(`/api/payments?action=get-payment-details&quoteId=${quoteId}`, {
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json'
                },
                credentials: 'include'
              }).then(res => res.json())
            );
            
            const paymentsResults = await Promise.all(paymentsPromises);
            const allPayments = paymentsResults
              .filter(result => result.success && result.payment)
              .map(result => result.payment);
            
            setPayments(allPayments);
          } catch (paymentError) {
            console.error('Error fetching payments:', paymentError);
          }
        }
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

      const response = await fetch(`/api/inquiries?id=${id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(updateData)
      });

      if (!response.ok) {
        let errorMessage = `Failed to update inquiry (${response.status})`;
        try {
          const errorText = await response.text();
          try {
            const errorData = JSON.parse(errorText);
            errorMessage = errorData.message || errorData.error || errorMessage;
          } catch {
            errorMessage = errorText.substring(0, 100);
          }
        } catch (e) {
          // Ignore parse errors
        }
        throw new Error(errorMessage);
      }

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

      const response = await fetch(`/api/quotes?id=${quoteId}&action=send`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });

      if (!response.ok) {
        let errorMessage = `Failed to send quote (${response.status})`;
        try {
          const errorText = await response.text();
          try {
            const errorData = JSON.parse(errorText);
            errorMessage = errorData.message || errorData.error || errorMessage;
          } catch {
            errorMessage = errorText.substring(0, 100);
          }
        } catch (e) {
          // Ignore parse errors
        }
        throw new Error(errorMessage);
      }

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

  // Open refund modal for a payment
  const openRefundModal = (payment) => {
    setRefundingPayment(payment);
    setRefundAmount(payment.amount.toString());
    setRefundReason('');
    setRefundError(null);
    setRefundSuccess(false);
    setShowRefundModal(true);
  };

  // Handle refund submission
  const handleRefund = async () => {
    if (!refundingPayment) return;
    
    const amount = parseFloat(refundAmount);
    if (isNaN(amount) || amount <= 0) {
      setRefundError('Please enter a valid refund amount');
      return;
    }
    
    if (amount > parseFloat(refundingPayment.amount)) {
      setRefundError('Refund amount cannot exceed original payment amount');
      return;
    }

    try {
      setRefundProcessing(true);
      setRefundError(null);

      const token = localStorage.getItem('adminToken') || localStorage.getItem('token') || localStorage.getItem('supabase_token');
      if (!token) {
        setRefundError('Authentication required. Please log in again.');
        return;
      }

      const response = await fetch('/api/payments?action=payment-refund', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          paymentId: refundingPayment.id,
          amount: amount,
          reason: refundReason || 'Admin initiated refund'
        })
      });

      const result = await response.json();

      if (result.success) {
        setRefundSuccess(true);
        // Refresh data after 2 seconds and close modal
        setTimeout(async () => {
          setShowRefundModal(false);
          setRefundingPayment(null);
          setRefundSuccess(false);
          await fetchInquiryDetails();
        }, 2000);
      } else {
        setRefundError(result.error || result.message || 'Failed to process refund');
      }
    } catch (error) {
      console.error('Error processing refund:', error);
      setRefundError('Error processing refund. Please try again.');
    } finally {
      setRefundProcessing(false);
    }
  };

  // Open void modal for a payment
  const openVoidModal = (payment) => {
    setVoidingPayment(payment);
    setVoidReason('');
    setVoidError(null);
    setVoidSuccess(false);
    setShowVoidModal(true);
  };

  // Handle void submission
  const handleVoid = async () => {
    if (!voidingPayment) return;

    try {
      setVoidProcessing(true);
      setVoidError(null);

      const token = localStorage.getItem('adminToken') || localStorage.getItem('token') || localStorage.getItem('supabase_token');
      if (!token) {
        setVoidError('Authentication required. Please log in again.');
        return;
      }

      const response = await fetch('/api/payments?action=payment-void', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          paymentId: voidingPayment.id,
          reason: voidReason || 'Admin initiated void'
        })
      });

      const result = await response.json();

      if (result.success) {
        setVoidSuccess(true);
        // Refresh data after 2 seconds and close modal
        setTimeout(async () => {
          setShowVoidModal(false);
          setVoidingPayment(null);
          setVoidSuccess(false);
          await fetchInquiryDetails();
        }, 2000);
      } else {
        setVoidError(result.error || result.message || 'Failed to void payment. It may have already settled.');
      }
    } catch (error) {
      console.error('Error voiding payment:', error);
      setVoidError('Error voiding payment. Please try again.');
    } finally {
      setVoidProcessing(false);
    }
  };

  // Check payment status from ARC Pay
  const handleCheckStatus = async (payment) => {
    try {
      setCheckingStatusId(payment.id);

      const token = localStorage.getItem('adminToken') || localStorage.getItem('token') || localStorage.getItem('supabase_token');
      if (!token) {
        alert('Authentication required. Please log in again.');
        return;
      }

      const response = await fetch(`/api/payments?action=payment-retrieve&paymentId=${payment.id}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });

      const result = await response.json();

      if (result.success) {
        setStatusDetails(prev => ({
          ...prev,
          [payment.id]: result.orderData
        }));
        setCurrentStatusPayment({ ...payment, arcData: result.orderData });
        setShowStatusModal(true);
        
        // Refresh the inquiry details to get updated local status
        await fetchInquiryDetails();
      } else {
        alert('Failed to retrieve status: ' + (result.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error checking status:', error);
      alert('Error checking payment status. Please try again.');
    } finally {
      setCheckingStatusId(null);
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
              <span className={`status-badge large ${getStatusColor(
                // Only show "booked" if at least one quote is paid
                quotes.some(q => q.payment_status === 'paid') ? 'booked' : inquiry.status
              )}`}>
                {quotes.some(q => q.payment_status === 'paid') ? 'booked' : inquiry.status}
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
                      <span className={`quote-status ${getStatusColor(quote.payment_status === 'paid' ? 'booked' : quote.status)}`}>
                        {quote.payment_status === 'paid' ? 'booked' : quote.status}
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
                    <div className="meta-row">
                      <span className="meta-label">Payment Status:</span>
                      <span className={`meta-value payment-status ${quote.payment_status || 'unpaid'}`}>
                        {quote.payment_status === 'paid' ? '✓ Paid' : quote.payment_status === 'failed' ? '✗ Failed' : '○ Unpaid'}
                      </span>
                    </div>
                    {quote.paid_at && (
                      <div className="meta-row">
                        <span className="meta-label">Paid At:</span>
                        <span className="meta-value">{formatDateTime(quote.paid_at)}</span>
                      </div>
                    )}
                  </div>

                  {/* Booking Information - Always show section */}
                  <div className="payment-details" style={{ marginTop: '15px', backgroundColor: bookingInfos[quote.id] ? '#f0f9ff' : '#fff7ed', border: `1px solid ${bookingInfos[quote.id] ? '#bae6fd' : '#fed7aa'}` }}>
                    <div className="payment-header" style={{ backgroundColor: bookingInfos[quote.id] ? '#0ea5e9' : '#f59e0b', color: 'white' }}>
                      👤 User Booking Information
                      {bookingInfos[quote.id] && (
                        <span style={{ float: 'right', fontSize: '12px', fontWeight: 'normal' }}>
                          Status: {bookingInfos[quote.id].status}
                        </span>
                      )}
                    </div>
                    {bookingInfos[quote.id] ? (
                      (() => {
                        const bookingInfo = bookingInfos[quote.id];
                        return (
                          <div className="payment-info">
                            {/* Personal Information Section */}
                            <div style={{ marginBottom: '20px', paddingBottom: '15px', borderBottom: '2px solid #e2e8f0' }}>
                              <h4 style={{ marginBottom: '12px', color: '#1e293b', fontSize: '16px', fontWeight: '600' }}>📝 Personal Details</h4>
                              <div className="payment-row">
                                <span className="payment-label">Full Name:</span>
                                <span className="payment-value" style={{ fontWeight: '500' }}>{bookingInfo.full_name}</span>
                              </div>
                              <div className="payment-row">
                                <span className="payment-label">Email:</span>
                                <span className="payment-value">{bookingInfo.email}</span>
                              </div>
                              <div className="payment-row">
                                <span className="payment-label">Phone:</span>
                                <span className="payment-value">{bookingInfo.phone}</span>
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
                            </div>

                            {/* Government ID Information Section */}
                            {(bookingInfo.govt_id_type || bookingInfo.govt_id_number) && (
                              <div style={{ marginBottom: '20px', paddingBottom: '15px', borderBottom: '2px solid #e2e8f0' }}>
                                <h4 style={{ marginBottom: '12px', color: '#1e293b', fontSize: '16px', fontWeight: '600' }}>🪪 Government ID Information</h4>
                                {bookingInfo.govt_id_type && (
                                  <div className="payment-row">
                                    <span className="payment-label">ID Type:</span>
                                    <span className="payment-value capitalize">{bookingInfo.govt_id_type.replace('_', ' ')}</span>
                                  </div>
                                )}
                                {bookingInfo.govt_id_number && (
                                  <div className="payment-row">
                                    <span className="payment-label">ID Number:</span>
                                    <span className="payment-value" style={{ fontFamily: 'monospace', fontWeight: '500' }}>{bookingInfo.govt_id_number}</span>
                                  </div>
                                )}
                                {bookingInfo.govt_id_issue_date && (
                                  <div className="payment-row">
                                    <span className="payment-label">Issue Date:</span>
                                    <span className="payment-value">{formatDate(bookingInfo.govt_id_issue_date)}</span>
                                  </div>
                                )}
                                {bookingInfo.govt_id_expiry_date && (
                                  <div className="payment-row">
                                    <span className="payment-label">Expiry Date:</span>
                                    <span className="payment-value">{formatDate(bookingInfo.govt_id_expiry_date)}</span>
                                  </div>
                                )}
                                {bookingInfo.govt_id_issuing_authority && (
                                  <div className="payment-row">
                                    <span className="payment-label">Issuing Authority:</span>
                                    <span className="payment-value">{bookingInfo.govt_id_issuing_authority}</span>
                                  </div>
                                )}
                                {bookingInfo.govt_id_issuing_country && (
                                  <div className="payment-row">
                                    <span className="payment-label">Issuing Country:</span>
                                    <span className="payment-value">{bookingInfo.govt_id_issuing_country}</span>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Passport Information Section (Only for flights) */}
                            {(bookingInfo.passport_number || bookingInfo.passport_expiry_date || bookingInfo.passport_issue_date || bookingInfo.passport_issuing_country) && (
                              <div style={{ marginBottom: '20px', paddingBottom: '15px', borderBottom: '2px solid #e2e8f0' }}>
                                <h4 style={{ marginBottom: '12px', color: '#1e293b', fontSize: '16px', fontWeight: '600' }}>🛂 Passport Information</h4>
                                {bookingInfo.passport_number && (
                                  <div className="payment-row">
                                    <span className="payment-label">Passport Number:</span>
                                    <span className="payment-value" style={{ fontFamily: 'monospace', fontWeight: '500' }}>{bookingInfo.passport_number}</span>
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

                            {/* Emergency Contact Section */}
                            {(bookingInfo.emergency_contact_name || bookingInfo.emergency_contact_phone || bookingInfo.emergency_contact_relationship) && (
                              <div style={{ marginBottom: '20px', paddingBottom: '15px', borderBottom: '2px solid #e2e8f0' }}>
                                <h4 style={{ marginBottom: '12px', color: '#1e293b', fontSize: '16px', fontWeight: '600' }}>🚨 Emergency Contact</h4>
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
                              <div style={{ marginBottom: '20px', paddingBottom: '15px', borderBottom: '2px solid #e2e8f0' }}>
                                <h4 style={{ marginBottom: '12px', color: '#1e293b', fontSize: '16px', fontWeight: '600' }}>📋 Additional Booking Details</h4>
                                <div className="payment-row">
                                  <span className="payment-label">Details:</span>
                                  <span className="payment-value" style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '13px', backgroundColor: '#f8fafc', padding: '10px', borderRadius: '4px', display: 'block', marginTop: '5px' }}>
                                    {JSON.stringify(bookingInfo.booking_details, null, 2)}
                                  </span>
                                </div>
                              </div>
                            )}

                            {/* Terms and Privacy Section */}
                            <div style={{ marginBottom: '20px', paddingBottom: '15px', borderBottom: '2px solid #e2e8f0' }}>
                              <h4 style={{ marginBottom: '12px', color: '#1e293b', fontSize: '16px', fontWeight: '600' }}>✅ Terms & Privacy</h4>
                              {bookingInfo.terms_accepted && (
                                <div className="payment-row">
                                  <span className="payment-label">Terms Accepted:</span>
                                  <span className="payment-value">✅ Yes {bookingInfo.terms_accepted_at ? `(${formatDateTime(bookingInfo.terms_accepted_at)})` : ''}</span>
                                </div>
                              )}
                              {bookingInfo.privacy_policy_accepted && (
                                <div className="payment-row">
                                  <span className="payment-label">Privacy Policy Accepted:</span>
                                  <span className="payment-value">✅ Yes {bookingInfo.privacy_policy_accepted_at ? `(${formatDateTime(bookingInfo.privacy_policy_accepted_at)})` : ''}</span>
                                </div>
                              )}
                            </div>

                            {/* Timestamps */}
                            {(bookingInfo.submitted_at || bookingInfo.verified_at || bookingInfo.created_at) && (
                              <div style={{ marginBottom: '10px' }}>
                                <h4 style={{ marginBottom: '12px', color: '#1e293b', fontSize: '16px', fontWeight: '600' }}>⏰ Timestamps</h4>
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
                              </div>
                            )}
                          </div>
                        );
                      })()
                    ) : (
                      <div className="payment-info" style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>
                        <p style={{ margin: 0, fontSize: '14px' }}>
                          ⚠️ No booking information submitted yet. User needs to complete the booking form before payment.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Payment Details */}
                  {payments.find(p => p.quote_id === quote.id) && (
                    <div className="payment-details">
                      <div className="payment-header">💳 Payment Information</div>
                      {(() => {
                        const payment = payments.find(p => p.quote_id === quote.id);
                        return (
                          <div className="payment-info">
                            <div className="payment-row">
                              <span className="payment-label">Transaction ID:</span>
                              <span className="payment-value">{payment.arc_transaction_id || payment.id}</span>
                            </div>
                            <div className="payment-row">
                              <span className="payment-label">Amount:</span>
                              <span className="payment-value">${parseFloat(payment.amount).toFixed(2)} {payment.currency}</span>
                            </div>
                            {payment.payment_method && (
                              <div className="payment-row">
                                <span className="payment-label">Method:</span>
                                <span className="payment-value capitalize">{payment.payment_method}</span>
                              </div>
                            )}
                            <div className="payment-row">
                              <span className="payment-label">Status:</span>
                              <span className={`payment-value status-${payment.payment_status}`}>
                                {payment.payment_status}
                              </span>
                            </div>
                            {payment.completed_at && (
                              <div className="payment-row">
                                <span className="payment-label">Completed:</span>
                                <span className="payment-value">{formatDateTime(payment.completed_at)}</span>
                              </div>
                            )}
                            
                            {/* Refund Button - Only show for completed payments */}
                            {payment.payment_status === 'completed' && (
                              <div className="payment-row" style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px solid #e2e8f0' }}>
                                <button
                                  onClick={() => openRefundModal(payment)}
                                  className="refund-button"
                                  style={{
                                    backgroundColor: '#ef4444',
                                    color: 'white',
                                    border: 'none',
                                    padding: '10px 20px',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontWeight: '500',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    fontSize: '14px',
                                    width: '100%',
                                    justifyContent: 'center'
                                  }}
                                >
                                  💸 Issue Refund
                                </button>
                                
                                {/* Void Button - Same day cancellation */}
                                <button
                                  onClick={() => openVoidModal(payment)}
                                  style={{
                                    backgroundColor: '#f59e0b',
                                    color: 'white',
                                    border: 'none',
                                    padding: '10px 20px',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontWeight: '500',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    fontSize: '14px',
                                    width: '100%',
                                    justifyContent: 'center',
                                    marginTop: '8px'
                                  }}
                                >
                                  🚫 Void (Same Day)
                                </button>
                              </div>
                            )}
                            
                            {/* Show refunded status */}
                            {payment.payment_status === 'refunded' && (
                              <div className="payment-row" style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px solid #e2e8f0' }}>
                                <div style={{
                                  backgroundColor: '#fef2f2',
                                  color: '#dc2626',
                                  padding: '10px 15px',
                                  borderRadius: '6px',
                                  width: '100%',
                                  textAlign: 'center',
                                  fontWeight: '500'
                                }}>
                                  ✅ This payment has been refunded
                                </div>
                              </div>
                            )}
                            
                            {/* Show voided status */}
                            {payment.payment_status === 'voided' && (
                              <div className="payment-row" style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px solid #e2e8f0' }}>
                                <div style={{
                                  backgroundColor: '#fef3c7',
                                  color: '#d97706',
                                  padding: '10px 15px',
                                  borderRadius: '6px',
                                  width: '100%',
                                  textAlign: 'center',
                                  fontWeight: '500'
                                }}>
                                  🚫 This payment has been voided
                                </div>
                              </div>
                            )}
                            
                            {/* Check Status Button - Always show */}
                            <div className="payment-row" style={{ marginTop: '10px' }}>
                              <button
                                onClick={() => handleCheckStatus(payment)}
                                disabled={checkingStatusId === payment.id}
                                style={{
                                  backgroundColor: checkingStatusId === payment.id ? '#94a3b8' : '#3b82f6',
                                  color: 'white',
                                  border: 'none',
                                  padding: '10px 20px',
                                  borderRadius: '6px',
                                  cursor: checkingStatusId === payment.id ? 'not-allowed' : 'pointer',
                                  fontWeight: '500',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  fontSize: '14px',
                                  width: '100%',
                                  justifyContent: 'center'
                                }}
                              >
                                {checkingStatusId === payment.id ? (
                                  <>
                                    <div style={{
                                      width: '14px',
                                      height: '14px',
                                      border: '2px solid #cbd5e1',
                                      borderTopColor: 'white',
                                      borderRadius: '50%',
                                      animation: 'spin 1s linear infinite'
                                    }}></div>
                                    Checking...
                                  </>
                                ) : (
                                  <>🔍 Check ARC Pay Status</>
                                )}
                              </button>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}

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

      {/* Refund Modal */}
      {showRefundModal && refundingPayment && (
        <div className="modal-overlay" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div className="refund-modal" style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '30px',
            maxWidth: '500px',
            width: '90%',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}>
            <div className="modal-header" style={{ marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '20px', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '10px' }}>
                💸 Issue Refund
              </h3>
              <button 
                onClick={() => setShowRefundModal(false)}
                style={{
                  position: 'absolute',
                  top: '15px',
                  right: '15px',
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: '#64748b'
                }}
              >
                ×
              </button>
            </div>

            {refundSuccess ? (
              <div style={{
                textAlign: 'center',
                padding: '30px 0'
              }}>
                <div style={{ fontSize: '48px', marginBottom: '15px' }}>✅</div>
                <h4 style={{ color: '#16a34a', marginBottom: '10px' }}>Refund Successful!</h4>
                <p style={{ color: '#64748b' }}>The refund has been processed successfully.</p>
              </div>
            ) : (
              <>
                <div className="modal-body">
                  {/* Payment Info */}
                  <div style={{
                    backgroundColor: '#f8fafc',
                    padding: '15px',
                    borderRadius: '8px',
                    marginBottom: '20px'
                  }}>
                    <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '5px' }}>Original Payment</div>
                    <div style={{ fontSize: '24px', fontWeight: '600', color: '#1e293b' }}>
                      ${parseFloat(refundingPayment.amount).toFixed(2)} {refundingPayment.currency}
                    </div>
                    <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '5px' }}>
                      Transaction ID: {refundingPayment.arc_transaction_id || refundingPayment.id}
                    </div>
                  </div>

                  {/* Refund Amount Input */}
                  <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#374151' }}>
                      Refund Amount ($)
                    </label>
                    <input
                      type="number"
                      value={refundAmount}
                      onChange={(e) => setRefundAmount(e.target.value)}
                      max={refundingPayment.amount}
                      min="0.01"
                      step="0.01"
                      style={{
                        width: '100%',
                        padding: '12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '8px',
                        fontSize: '16px',
                        boxSizing: 'border-box'
                      }}
                    />
                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '5px' }}>
                      Maximum: ${parseFloat(refundingPayment.amount).toFixed(2)}
                    </div>
                  </div>

                  {/* Refund Reason */}
                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#374151' }}>
                      Reason for Refund (Optional)
                    </label>
                    <textarea
                      value={refundReason}
                      onChange={(e) => setRefundReason(e.target.value)}
                      placeholder="Enter reason for refund..."
                      rows="3"
                      style={{
                        width: '100%',
                        padding: '12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '8px',
                        fontSize: '14px',
                        resize: 'vertical',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>

                  {/* Error Message */}
                  {refundError && (
                    <div style={{
                      backgroundColor: '#fef2f2',
                      color: '#dc2626',
                      padding: '12px',
                      borderRadius: '8px',
                      marginBottom: '15px',
                      fontSize: '14px'
                    }}>
                      ❌ {refundError}
                    </div>
                  )}

                  {/* Warning */}
                  <div style={{
                    backgroundColor: '#fffbeb',
                    border: '1px solid #fcd34d',
                    padding: '12px',
                    borderRadius: '8px',
                    marginBottom: '20px',
                    fontSize: '13px',
                    color: '#92400e'
                  }}>
                    ⚠️ <strong>Warning:</strong> This action cannot be undone. The refund will be processed through ARC Pay and the customer will receive the funds.
                  </div>
                </div>

                {/* Modal Actions */}
                <div className="modal-actions" style={{
                  display: 'flex',
                  gap: '12px',
                  justifyContent: 'flex-end'
                }}>
                  <button
                    onClick={() => setShowRefundModal(false)}
                    disabled={refundProcessing}
                    style={{
                      padding: '12px 24px',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      backgroundColor: 'white',
                      color: '#374151',
                      fontWeight: '500',
                      cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleRefund}
                    disabled={refundProcessing}
                    style={{
                      padding: '12px 24px',
                      border: 'none',
                      borderRadius: '8px',
                      backgroundColor: refundProcessing ? '#f87171' : '#ef4444',
                      color: 'white',
                      fontWeight: '500',
                      cursor: refundProcessing ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    {refundProcessing ? (
                      <>
                        <div className="spinner" style={{
                          width: '16px',
                          height: '16px',
                          border: '2px solid #fca5a5',
                          borderTopColor: 'white',
                          borderRadius: '50%',
                          animation: 'spin 1s linear infinite'
                        }}></div>
                        Processing...
                      </>
                    ) : (
                      <>💸 Process Refund</>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Status Details Modal */}
      {showStatusModal && currentStatusPayment && (
        <div className="modal-overlay" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div className="status-modal" style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '30px',
            maxWidth: '600px',
            width: '90%',
            maxHeight: '80vh',
            overflow: 'auto',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}>
            <div className="modal-header" style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '20px', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '10px' }}>
                🔍 ARC Pay Status Details
              </h3>
              <button 
                onClick={() => setShowStatusModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: '#64748b'
                }}
              >
                ×
              </button>
            </div>

            {currentStatusPayment.arcData ? (
              <div className="status-details">
                {/* Order Status Banner */}
                <div style={{
                  backgroundColor: currentStatusPayment.arcData.result === 'SUCCESS' ? '#dcfce7' : 
                                  currentStatusPayment.arcData.result === 'PENDING' ? '#fef3c7' : '#fef2f2',
                  color: currentStatusPayment.arcData.result === 'SUCCESS' ? '#16a34a' : 
                         currentStatusPayment.arcData.result === 'PENDING' ? '#d97706' : '#dc2626',
                  padding: '15px',
                  borderRadius: '8px',
                  marginBottom: '20px',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '24px', marginBottom: '5px' }}>
                    {currentStatusPayment.arcData.result === 'SUCCESS' ? '✅' : 
                     currentStatusPayment.arcData.result === 'PENDING' ? '⏳' : '❌'}
                  </div>
                  <div style={{ fontWeight: '600', fontSize: '18px' }}>
                    {currentStatusPayment.arcData.result || 'Unknown'}
                  </div>
                  <div style={{ fontSize: '14px', opacity: 0.8 }}>
                    Order Status: {currentStatusPayment.arcData.status || 'N/A'}
                  </div>
                </div>

                {/* Amount Details */}
                <div style={{ marginBottom: '20px' }}>
                  <h4 style={{ marginBottom: '12px', color: '#1e293b', fontSize: '16px', fontWeight: '600', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px' }}>
                    💰 Amount Details
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div style={{ backgroundColor: '#f8fafc', padding: '12px', borderRadius: '6px' }}>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>Total Amount</div>
                      <div style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b' }}>
                        ${currentStatusPayment.arcData.amount?.toFixed(2) || '0.00'} {currentStatusPayment.arcData.currency}
                      </div>
                    </div>
                    <div style={{ backgroundColor: '#f8fafc', padding: '12px', borderRadius: '6px' }}>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>Authorized</div>
                      <div style={{ fontSize: '18px', fontWeight: '600', color: '#3b82f6' }}>
                        ${currentStatusPayment.arcData.totalAuthorizedAmount?.toFixed(2) || '0.00'}
                      </div>
                    </div>
                    <div style={{ backgroundColor: '#dcfce7', padding: '12px', borderRadius: '6px' }}>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>Captured</div>
                      <div style={{ fontSize: '18px', fontWeight: '600', color: '#16a34a' }}>
                        ${currentStatusPayment.arcData.totalCapturedAmount?.toFixed(2) || '0.00'}
                      </div>
                    </div>
                    <div style={{ backgroundColor: '#fef2f2', padding: '12px', borderRadius: '6px' }}>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>Refunded</div>
                      <div style={{ fontSize: '18px', fontWeight: '600', color: '#dc2626' }}>
                        ${currentStatusPayment.arcData.totalRefundedAmount?.toFixed(2) || '0.00'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Order Info */}
                <div style={{ marginBottom: '20px' }}>
                  <h4 style={{ marginBottom: '12px', color: '#1e293b', fontSize: '16px', fontWeight: '600', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px' }}>
                    📋 Order Information
                  </h4>
                  <div style={{ backgroundColor: '#f8fafc', padding: '15px', borderRadius: '8px' }}>
                    <div style={{ display: 'grid', gap: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#64748b' }}>Order ID:</span>
                        <span style={{ fontFamily: 'monospace', fontSize: '13px' }}>{currentStatusPayment.arcData.id}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#64748b' }}>Merchant:</span>
                        <span>{currentStatusPayment.arcData.merchant}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#64748b' }}>Created:</span>
                        <span>{currentStatusPayment.arcData.creationTime ? new Date(currentStatusPayment.arcData.creationTime).toLocaleString() : 'N/A'}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#64748b' }}>Last Updated:</span>
                        <span>{currentStatusPayment.arcData.lastUpdatedTime ? new Date(currentStatusPayment.arcData.lastUpdatedTime).toLocaleString() : 'N/A'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Transactions List */}
                {currentStatusPayment.arcData.transaction && currentStatusPayment.arcData.transaction.length > 0 && (
                  <div style={{ marginBottom: '20px' }}>
                    <h4 style={{ marginBottom: '12px', color: '#1e293b', fontSize: '16px', fontWeight: '600', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px' }}>
                      📝 Transaction History ({currentStatusPayment.arcData.transaction.length})
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {currentStatusPayment.arcData.transaction.map((txn, idx) => (
                        <div key={idx} style={{
                          backgroundColor: '#f8fafc',
                          padding: '12px',
                          borderRadius: '8px',
                          border: '1px solid #e2e8f0'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <span style={{
                              backgroundColor: txn.transaction?.type === 'PAYMENT' ? '#dbeafe' :
                                              txn.transaction?.type === 'REFUND' ? '#fce7f3' : '#f3e8ff',
                              color: txn.transaction?.type === 'PAYMENT' ? '#1d4ed8' :
                                     txn.transaction?.type === 'REFUND' ? '#be185d' : '#7c3aed',
                              padding: '4px 10px',
                              borderRadius: '4px',
                              fontSize: '12px',
                              fontWeight: '600'
                            }}>
                              {txn.transaction?.type || 'UNKNOWN'}
                            </span>
                            <span style={{
                              backgroundColor: txn.response?.gatewayCode === 'APPROVED' ? '#dcfce7' : '#fef2f2',
                              color: txn.response?.gatewayCode === 'APPROVED' ? '#16a34a' : '#dc2626',
                              padding: '4px 10px',
                              borderRadius: '4px',
                              fontSize: '12px',
                              fontWeight: '600'
                            }}>
                              {txn.response?.gatewayCode || 'N/A'}
                            </span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                            <span style={{ color: '#64748b' }}>Amount:</span>
                            <span style={{ fontWeight: '600' }}>${txn.transaction?.amount?.toFixed(2) || '0.00'} {txn.transaction?.currency}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#94a3b8', marginTop: '5px' }}>
                            <span>ID: {txn.transaction?.id}</span>
                            <span>{txn.timeOfRecord ? new Date(txn.timeOfRecord).toLocaleString() : ''}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Raw JSON (collapsible) */}
                <details style={{ marginTop: '15px' }}>
                  <summary style={{ cursor: 'pointer', color: '#64748b', fontSize: '14px' }}>
                    🔧 View Raw Response
                  </summary>
                  <pre style={{
                    backgroundColor: '#1e293b',
                    color: '#e2e8f0',
                    padding: '15px',
                    borderRadius: '8px',
                    fontSize: '11px',
                    overflow: 'auto',
                    maxHeight: '300px',
                    marginTop: '10px'
                  }}>
                    {JSON.stringify(currentStatusPayment.arcData, null, 2)}
                  </pre>
                </details>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                No ARC Pay data available
              </div>
            )}

            {/* Close Button */}
            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowStatusModal(false)}
                style={{
                  padding: '12px 24px',
                  border: 'none',
                  borderRadius: '8px',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Void Modal */}
      {showVoidModal && voidingPayment && (
        <div className="modal-overlay" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div className="void-modal" style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '30px',
            maxWidth: '500px',
            width: '90%',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}>
            <div className="modal-header" style={{ marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '20px', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '10px' }}>
                🚫 Void Payment
              </h3>
              <button 
                onClick={() => setShowVoidModal(false)}
                style={{
                  position: 'absolute',
                  top: '15px',
                  right: '15px',
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: '#64748b'
                }}
              >
                ×
              </button>
            </div>

            {voidSuccess ? (
              <div style={{
                textAlign: 'center',
                padding: '30px 0'
              }}>
                <div style={{ fontSize: '48px', marginBottom: '15px' }}>✅</div>
                <h4 style={{ color: '#16a34a', marginBottom: '10px' }}>Payment Voided!</h4>
                <p style={{ color: '#64748b' }}>The payment has been cancelled successfully.</p>
              </div>
            ) : (
              <>
                <div className="modal-body">
                  {/* Payment Info */}
                  <div style={{
                    backgroundColor: '#fef3c7',
                    padding: '15px',
                    borderRadius: '8px',
                    marginBottom: '20px',
                    border: '1px solid #fcd34d'
                  }}>
                    <div style={{ fontSize: '14px', color: '#92400e', marginBottom: '5px' }}>Payment to Void</div>
                    <div style={{ fontSize: '24px', fontWeight: '600', color: '#1e293b' }}>
                      ${parseFloat(voidingPayment.amount).toFixed(2)} {voidingPayment.currency}
                    </div>
                    <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '5px' }}>
                      Transaction ID: {voidingPayment.arc_transaction_id || voidingPayment.id}
                    </div>
                  </div>

                  {/* Info Box */}
                  <div style={{
                    backgroundColor: '#eff6ff',
                    border: '1px solid #bfdbfe',
                    padding: '12px',
                    borderRadius: '8px',
                    marginBottom: '20px',
                    fontSize: '13px',
                    color: '#1e40af'
                  }}>
                    ℹ️ <strong>What is Void?</strong>
                    <ul style={{ margin: '8px 0 0 20px', padding: 0 }}>
                      <li>Cancels the transaction <strong>before</strong> it settles</li>
                      <li>Only works on <strong>same day</strong> transactions</li>
                      <li>No transaction fees charged</li>
                      <li>Customer never sees the charge</li>
                    </ul>
                  </div>

                  {/* Void Reason */}
                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#374151' }}>
                      Reason for Void (Optional)
                    </label>
                    <textarea
                      value={voidReason}
                      onChange={(e) => setVoidReason(e.target.value)}
                      placeholder="Enter reason for voiding..."
                      rows="3"
                      style={{
                        width: '100%',
                        padding: '12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '8px',
                        fontSize: '14px',
                        resize: 'vertical',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>

                  {/* Error Message */}
                  {voidError && (
                    <div style={{
                      backgroundColor: '#fef2f2',
                      color: '#dc2626',
                      padding: '12px',
                      borderRadius: '8px',
                      marginBottom: '15px',
                      fontSize: '14px'
                    }}>
                      ❌ {voidError}
                    </div>
                  )}

                  {/* Warning */}
                  <div style={{
                    backgroundColor: '#fffbeb',
                    border: '1px solid #fcd34d',
                    padding: '12px',
                    borderRadius: '8px',
                    marginBottom: '20px',
                    fontSize: '13px',
                    color: '#92400e'
                  }}>
                    ⚠️ <strong>Note:</strong> If the payment has already settled (usually after midnight), use <strong>Refund</strong> instead of Void.
                  </div>
                </div>

                {/* Modal Actions */}
                <div className="modal-actions" style={{
                  display: 'flex',
                  gap: '12px',
                  justifyContent: 'flex-end'
                }}>
                  <button
                    onClick={() => setShowVoidModal(false)}
                    disabled={voidProcessing}
                    style={{
                      padding: '12px 24px',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      backgroundColor: 'white',
                      color: '#374151',
                      fontWeight: '500',
                      cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleVoid}
                    disabled={voidProcessing}
                    style={{
                      padding: '12px 24px',
                      border: 'none',
                      borderRadius: '8px',
                      backgroundColor: voidProcessing ? '#fbbf24' : '#f59e0b',
                      color: 'white',
                      fontWeight: '500',
                      cursor: voidProcessing ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    {voidProcessing ? (
                      <>
                        <div className="spinner" style={{
                          width: '16px',
                          height: '16px',
                          border: '2px solid #fde68a',
                          borderTopColor: 'white',
                          borderRadius: '50%',
                          animation: 'spin 1s linear infinite'
                        }}></div>
                        Processing...
                      </>
                    ) : (
                      <>🚫 Void Payment</>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default InquiryDetail;
