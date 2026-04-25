import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

const PaymentLinkPage = () => {
  const { token } = useParams();
  const [searchParams] = useSearchParams();
  const [linkData, setLinkData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const cancelled = searchParams.get('cancelled');

  useEffect(() => {
    fetchLinkData();
  }, [token]);

  const fetchLinkData = async () => {
    try {
      const response = await fetch(`/api/payments?action=get-payment-link&token=${token}`);
      const result = await response.json();

      if (result.success) {
        setLinkData(result.paymentLink);
      } else {
        setError(result.error || 'Payment link not found');
      }
    } catch (err) {
      setError('Unable to load payment details. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handlePay = async () => {
    setProcessing(true);
    setError('');

    try {
      const response = await fetch('/api/payments?action=process-payment-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });

      const result = await response.json();

      if (result.success && result.sessionId) {
        // Redirect to ARC Pay checkout
        if (result.checkoutUrl) {
          window.location.href = result.checkoutUrl;
        } else {
          // Use Checkout.js
          if (window.Checkout) {
            window.Checkout.configure({
              session: { id: result.sessionId }
            });
            window.Checkout.showPaymentPage();
          } else {
            setError('Payment gateway not available. Please try again.');
            setProcessing(false);
          }
        }
      } else {
        setError(result.error || 'Failed to initiate payment');
        setProcessing(false);
      }
    } catch (err) {
      setError('Payment failed: ' + err.message);
      setProcessing(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric'
    });
  };

  const getTypeLabel = (type) => {
    const labels = { flight: '✈️ Flight', hotel: '🏨 Hotel', cruise: '🚢 Cruise', package: '🎒 Package' };
    return labels[type] || '🌍 Travel';
  };

  const getCurrencySymbol = (currency) => {
    const symbols = { USD: '$', EUR: '€', GBP: '£', INR: '₹' };
    return symbols[currency] || currency;
  };

  if (loading) {
    return (
      <div style={styles.pageContainer}>
        <div style={styles.card}>
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontSize: '40px', marginBottom: '16px' }}>⏳</div>
            <h2 style={{ color: '#1e293b', margin: '0 0 8px' }}>Loading payment details...</h2>
            <p style={{ color: '#64748b' }}>Please wait</p>
          </div>
        </div>
      </div>
    );
  }

  if (error && !linkData) {
    return (
      <div style={styles.pageContainer}>
        <div style={styles.card}>
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>❌</div>
            <h2 style={{ color: '#dc2626', margin: '0 0 8px' }}>Payment Link Not Found</h2>
            <p style={{ color: '#64748b' }}>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (linkData.status === 'paid') {
    return (
      <div style={styles.pageContainer}>
        <div style={styles.card}>
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
            <h2 style={{ color: '#065f46', margin: '0 0 8px' }}>Payment Complete</h2>
            <p style={{ color: '#64748b' }}>This payment has already been processed. Thank you!</p>
          </div>
        </div>
      </div>
    );
  }

  if (linkData.status === 'expired') {
    return (
      <div style={styles.pageContainer}>
        <div style={styles.card}>
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>⏰</div>
            <h2 style={{ color: '#92400e', margin: '0 0 8px' }}>Link Expired</h2>
            <p style={{ color: '#64748b' }}>This payment link has expired. Please contact your travel agent for a new link.</p>
          </div>
        </div>
      </div>
    );
  }

  if (linkData.status === 'cancelled') {
    return (
      <div style={styles.pageContainer}>
        <div style={styles.card}>
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🚫</div>
            <h2 style={{ color: '#6b7280', margin: '0 0 8px' }}>Link Cancelled</h2>
            <p style={{ color: '#64748b' }}>This payment link has been cancelled.</p>
          </div>
        </div>
      </div>
    );
  }

  const td = linkData.travel_details || {};

  return (
    <div style={styles.pageContainer}>
      {/* Header */}
      <div style={styles.header}>
        <img src="/logo.png" alt="Jetsetters" style={{ height: '36px' }} onError={(e) => { e.target.style.display = 'none'; }} />
        <span style={{ fontSize: '20px', fontWeight: 700, color: '#055B75' }}>Jetsetters</span>
      </div>

      {cancelled && (
        <div style={{
          background: '#fef3c7', border: '1px solid #fde68a', color: '#92400e',
          padding: '12px 16px', borderRadius: '8px', maxWidth: '600px', margin: '0 auto 16px',
          fontSize: '14px', textAlign: 'center'
        }}>
          Payment was cancelled. You can try again below.
        </div>
      )}

      <div style={styles.card}>
        {/* Amount Header */}
        <div style={{
          background: 'linear-gradient(135deg, #055B75, #0a7d9e)',
          color: 'white',
          padding: '30px',
          borderRadius: '16px 16px 0 0',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '14px', opacity: 0.8, marginBottom: '4px' }}>Amount Due</div>
          <div style={{ fontSize: '42px', fontWeight: 800, letterSpacing: '-1px' }}>
            {getCurrencySymbol(linkData.currency)}{parseFloat(linkData.amount).toFixed(2)}
          </div>
          <div style={{ fontSize: '14px', opacity: 0.7, marginTop: '4px' }}>
            {getTypeLabel(linkData.booking_type)}
          </div>
        </div>

        {/* Details */}
        <div style={{ padding: '24px 30px' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '16px', color: '#334155' }}>Booking Details</h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '20px' }}>
            <DetailRow label="Customer" value={linkData.customer_name} />
            {td.origin && <DetailRow label="From" value={td.origin} />}
            {td.destination && <DetailRow label="To" value={td.destination} />}
            {td.travelDate && <DetailRow label="Travel Date" value={formatDate(td.travelDate)} />}
            {td.returnDate && <DetailRow label="Return Date" value={formatDate(td.returnDate)} />}
            {td.airline && <DetailRow label="Airline" value={td.airline} />}
            {td.flightNumber && <DetailRow label="Flight" value={td.flightNumber} />}
            {td.cabinClass && td.cabinClass !== 'economy' && <DetailRow label="Class" value={td.cabinClass.replace('_', ' ')} />}
            {td.hotelName && <DetailRow label="Hotel" value={td.hotelName} />}
            {td.cruiseLine && <DetailRow label="Cruise Line" value={td.cruiseLine} />}
            {td.passengers > 1 && <DetailRow label="Passengers" value={td.passengers} />}
          </div>

          {linkData.description && (
            <div style={{
              background: '#f8fafc',
              padding: '12px 16px',
              borderRadius: '8px',
              fontSize: '14px',
              color: '#475569',
              marginBottom: '20px',
              borderLeft: '3px solid #055B75'
            }}>
              {linkData.description}
            </div>
          )}

          {td.notes && (
            <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '20px' }}>
              <strong>Notes:</strong> {td.notes}
            </div>
          )}

          {error && (
            <div style={{
              background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626',
              padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '16px'
            }}>
              {error}
            </div>
          )}

          {/* Pay Button */}
          <button onClick={handlePay} disabled={processing} style={{
            width: '100%',
            background: processing ? '#94a3b8' : 'linear-gradient(135deg, #055B75, #0a7d9e)',
            color: 'white',
            border: 'none',
            padding: '16px',
            borderRadius: '10px',
            fontSize: '17px',
            fontWeight: 700,
            cursor: processing ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s'
          }}>
            {processing ? '⏳ Redirecting to payment...' : `💳 Pay ${getCurrencySymbol(linkData.currency)}${parseFloat(linkData.amount).toFixed(2)} Now`}
          </button>

          <div style={{ textAlign: 'center', marginTop: '16px', fontSize: '12px', color: '#94a3b8' }}>
            🔒 Secured by ARC Pay • Your payment is encrypted and secure
          </div>

          {linkData.expires_at && (
            <div style={{ textAlign: 'center', marginTop: '8px', fontSize: '11px', color: '#94a3b8' }}>
              Link expires: {formatDate(linkData.expires_at)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const DetailRow = ({ label, value }) => (
  <div>
    <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>{label}</div>
    <div style={{ fontSize: '14px', color: '#1e293b', fontWeight: 500, textTransform: 'capitalize' }}>{value}</div>
  </div>
);

const styles = {
  pageContainer: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #f0f9ff, #e0f2fe)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '24px 16px'
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '24px'
  },
  card: {
    background: 'white',
    borderRadius: '16px',
    boxShadow: '0 10px 40px rgba(0,0,0,0.08)',
    maxWidth: '520px',
    width: '100%',
    overflow: 'hidden'
  }
};

export default PaymentLinkPage;
