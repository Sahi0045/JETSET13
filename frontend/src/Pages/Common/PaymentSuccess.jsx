import { useEffect, useState, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { getApiUrl } from '../../utils/apiHelper';

export default function PaymentSuccess() {
  const [searchParams] = useSearchParams();
  const [payment, setPayment] = useState(null);
  const [loading, setLoading] = useState(true);
  const receiptRef = useRef(null);
  const paymentId = searchParams.get('paymentId');

  useEffect(() => {
    if (paymentId) {
      fetchPaymentDetails();
    } else {
      setLoading(false);
    }
  }, [paymentId]);

  const fetchPaymentDetails = async () => {
    try {
      const response = await fetch(getApiUrl(`payments?action=get-payment-details&paymentId=${paymentId}`));
      const data = await response.json();
      if (data.success) {
        setPayment(data.payment);
      }
    } catch (error) {
      console.error('Failed to fetch payment details:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2
    }).format(parseFloat(amount) || 0);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = () => {
    window.print();
  };

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.loadingSpinner}></div>
        <p style={styles.loadingText}>Loading your receipt...</p>
      </div>
    );
  }

  const pl = payment?.payment_link;
  const isPaymentLink = !!pl;
  const quote = payment?.quote;
  const inquiry = payment?.inquiry;

  const receiptNumber = `RCP-${(payment?.id || '').slice(-8).toUpperCase() || Date.now().toString().slice(-8)}`;
  const transactionId = payment?.arc_transaction_id || payment?.id || 'N/A';
  const amountPaid = payment?.amount || pl?.amount || 0;
  const currency = payment?.currency || pl?.currency || 'USD';
  const customerName = payment?.customer_name || pl?.customer_name || inquiry?.customer_name || 'Valued Customer';
  const customerEmail = payment?.customer_email || pl?.customer_email || inquiry?.customer_email || '';
  const paymentDate = payment?.completed_at || payment?.created_at;
  const description = pl?.description || quote?.title || inquiry?.inquiry_type || 'Travel Booking';
  const travelDetails = pl?.travel_details || {};

  return (
    <>
      {/* Print-specific styles */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .receipt-printable, .receipt-printable * { visibility: visible; }
          .receipt-printable { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
        }
        @keyframes checkmark-pop {
          0% { transform: scale(0); opacity: 0; }
          50% { transform: scale(1.2); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
      `}</style>

      <div style={styles.pageWrapper}>
        <div style={styles.container} className="receipt-printable" ref={receiptRef}>
          
          {/* Success Header */}
          <div style={styles.successHeader}>
            <div style={styles.checkmarkCircle}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>
            <h1 style={styles.successTitle}>Payment Successful!</h1>
            <p style={styles.successSubtitle}>Your payment has been processed and confirmed</p>
          </div>

          {/* Receipt Card */}
          <div style={styles.receiptCard}>
            {/* Receipt Header Bar */}
            <div style={styles.receiptHeaderBar}>
              <div style={styles.receiptHeaderLeft}>
                <div style={styles.companyLogo}>✈️</div>
                <div>
                  <h2 style={styles.companyName}>JetSet Go Travel</h2>
                  <p style={styles.companyTagline}>Your Premium Travel Partner</p>
                </div>
              </div>
              <div style={styles.receiptBadge}>
                <span style={styles.receiptBadgeText}>PAID</span>
              </div>
            </div>

            {/* Receipt Number & Date Row */}
            <div style={styles.receiptMetaRow}>
              <div style={styles.receiptMetaItem}>
                <span style={styles.metaLabel}>Receipt No.</span>
                <span style={styles.metaValue}>{receiptNumber}</span>
              </div>
              <div style={styles.receiptMetaItem}>
                <span style={styles.metaLabel}>Date</span>
                <span style={styles.metaValue}>{formatDate(paymentDate)}</span>
              </div>
              <div style={styles.receiptMetaItem}>
                <span style={styles.metaLabel}>Transaction ID</span>
                <span style={{ ...styles.metaValue, fontFamily: 'monospace', fontSize: '12px' }}>{transactionId}</span>
              </div>
            </div>

            <div style={styles.divider}></div>

            {/* Customer Details */}
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>
                <span style={styles.sectionIcon}>👤</span> Bill To
              </h3>
              <div style={styles.customerInfo}>
                <p style={styles.customerName}>{customerName}</p>
                {customerEmail && <p style={styles.customerEmail}>{customerEmail}</p>}
              </div>
            </div>

            <div style={styles.divider}></div>

            {/* Service Details */}
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>
                <span style={styles.sectionIcon}>📋</span> Service Details
              </h3>
              
              <div style={styles.serviceTable}>
                <div style={styles.serviceHeader}>
                  <span style={{ ...styles.serviceCol, flex: 3 }}>Description</span>
                  <span style={{ ...styles.serviceCol, flex: 1, textAlign: 'right' }}>Amount</span>
                </div>

                <div style={styles.serviceRow}>
                  <div style={{ flex: 3 }}>
                    <p style={styles.serviceDescription}>{description}</p>
                    {isPaymentLink && pl?.booking_type && (
                      <p style={styles.serviceSubtext}>Type: {pl.booking_type.charAt(0).toUpperCase() + pl.booking_type.slice(1)}</p>
                    )}
                    {quote && (
                      <p style={styles.serviceSubtext}>Quote: {quote.quote_number}</p>
                    )}
                  </div>
                  <span style={{ flex: 1, textAlign: 'right', fontWeight: '600', color: '#1e293b', fontSize: '15px' }}>
                    {formatCurrency(amountPaid, currency)}
                  </span>
                </div>

                {/* Travel Details if available */}
                {isPaymentLink && Object.keys(travelDetails).length > 0 && (
                  <div style={styles.travelDetailsBox}>
                    <p style={styles.travelDetailsTitle}>Travel Information</p>
                    {travelDetails.airline && (
                      <div style={styles.travelDetailRow}>
                        <span style={styles.travelDetailLabel}>✈️ Airline:</span>
                        <span style={styles.travelDetailValue}>{travelDetails.airline}</span>
                      </div>
                    )}
                    {travelDetails.flight_number && (
                      <div style={styles.travelDetailRow}>
                        <span style={styles.travelDetailLabel}>🔢 Flight:</span>
                        <span style={styles.travelDetailValue}>{travelDetails.flight_number}</span>
                      </div>
                    )}
                    {(travelDetails.departure_city || travelDetails.origin) && (
                      <div style={styles.travelDetailRow}>
                        <span style={styles.travelDetailLabel}>🛫 From:</span>
                        <span style={styles.travelDetailValue}>{travelDetails.departure_city || travelDetails.origin}</span>
                      </div>
                    )}
                    {(travelDetails.arrival_city || travelDetails.destination) && (
                      <div style={styles.travelDetailRow}>
                        <span style={styles.travelDetailLabel}>🛬 To:</span>
                        <span style={styles.travelDetailValue}>{travelDetails.arrival_city || travelDetails.destination}</span>
                      </div>
                    )}
                    {travelDetails.departure_date && (
                      <div style={styles.travelDetailRow}>
                        <span style={styles.travelDetailLabel}>📅 Date:</span>
                        <span style={styles.travelDetailValue}>{travelDetails.departure_date}</span>
                      </div>
                    )}
                    {travelDetails.return_date && (
                      <div style={styles.travelDetailRow}>
                        <span style={styles.travelDetailLabel}>📅 Return:</span>
                        <span style={styles.travelDetailValue}>{travelDetails.return_date}</span>
                      </div>
                    )}
                    {travelDetails.pnr && (
                      <div style={styles.travelDetailRow}>
                        <span style={styles.travelDetailLabel}>🎫 PNR:</span>
                        <span style={{ ...styles.travelDetailValue, fontFamily: 'monospace', fontWeight: '700' }}>{travelDetails.pnr}</span>
                      </div>
                    )}
                    {travelDetails.passengers && (
                      <div style={styles.travelDetailRow}>
                        <span style={styles.travelDetailLabel}>👥 Passengers:</span>
                        <span style={styles.travelDetailValue}>{travelDetails.passengers}</span>
                      </div>
                    )}
                    {travelDetails.class && (
                      <div style={styles.travelDetailRow}>
                        <span style={styles.travelDetailLabel}>💺 Class:</span>
                        <span style={styles.travelDetailValue}>{travelDetails.class}</span>
                      </div>
                    )}
                    {travelDetails.hotel_name && (
                      <div style={styles.travelDetailRow}>
                        <span style={styles.travelDetailLabel}>🏨 Hotel:</span>
                        <span style={styles.travelDetailValue}>{travelDetails.hotel_name}</span>
                      </div>
                    )}
                    {travelDetails.cruise_name && (
                      <div style={styles.travelDetailRow}>
                        <span style={styles.travelDetailLabel}>🚢 Cruise:</span>
                        <span style={styles.travelDetailValue}>{travelDetails.cruise_name}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div style={styles.divider}></div>

            {/* Total Amount */}
            <div style={styles.totalSection}>
              <div style={styles.totalRow}>
                <span style={styles.totalLabel}>Total Paid</span>
                <span style={styles.totalAmount}>
                  {formatCurrency(amountPaid, currency)}
                </span>
              </div>
              <div style={styles.paymentMethod}>
                <span style={styles.paymentMethodLabel}>Payment Method:</span>
                <span style={styles.paymentMethodValue}>
                  💳 {payment?.payment_method || 'Credit/Debit Card'} via ARC Pay
                </span>
              </div>
              <div style={styles.paymentStatus}>
                <span style={styles.statusDot}></span>
                <span style={styles.statusText}>Payment Confirmed</span>
              </div>
            </div>

            <div style={styles.divider}></div>

            {/* Footer Notes */}
            <div style={styles.footerNotes}>
              <p style={styles.footerNote}>✅ A confirmation email has been sent to <strong>{customerEmail || 'your email address'}</strong></p>
              <p style={styles.footerNote}>✅ Your booking is confirmed and being processed</p>
              <p style={styles.footerNote}>✅ You will receive your travel documents within 24 hours</p>
            </div>

            {/* Company Footer */}
            <div style={styles.companyFooter}>
              <p style={styles.companyFooterText}>JetSet Go Travel — www.jetsetters.com</p>
              <p style={styles.companyFooterText}>Thank you for choosing us for your travel needs!</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={styles.actionButtons} className="no-print">
            <button onClick={handlePrint} style={styles.printBtn}>
              🖨️ Print Receipt
            </button>
            <button onClick={handleDownloadPDF} style={styles.downloadBtn}>
              📥 Download PDF
            </button>
            <Link to="/" style={styles.homeBtn}>
              🏠 Back to Home
            </Link>
          </div>

          {/* Support */}
          <div style={styles.supportSection} className="no-print">
            <p style={styles.supportText}>Need help? Contact our support team at</p>
            <a href="mailto:support@jetsetters.com" style={styles.supportEmail}>support@jetsetters.com</a>
          </div>
        </div>
      </div>
    </>
  );
}

const styles = {
  // Page
  pageWrapper: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 50%, #f0fdf4 100%)',
    padding: '40px 16px',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
  },
  container: {
    maxWidth: '720px',
    margin: '0 auto'
  },

  // Loading
  loadingContainer: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f8fafc'
  },
  loadingSpinner: {
    width: '48px',
    height: '48px',
    border: '4px solid #e2e8f0',
    borderTop: '4px solid #3b82f6',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  },
  loadingText: {
    marginTop: '16px',
    color: '#64748b',
    fontSize: '16px'
  },

  // Success Header
  successHeader: {
    textAlign: 'center',
    marginBottom: '32px',
    animation: 'fade-in-up 0.6s ease-out'
  },
  checkmarkCircle: {
    width: '80px',
    height: '80px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #dcfce7, #bbf7d0)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 20px',
    boxShadow: '0 8px 25px rgba(22, 163, 74, 0.2)',
    animation: 'checkmark-pop 0.5s ease-out'
  },
  successTitle: {
    fontSize: '32px',
    fontWeight: '800',
    color: '#1e293b',
    margin: '0 0 8px',
    letterSpacing: '-0.5px'
  },
  successSubtitle: {
    fontSize: '16px',
    color: '#64748b',
    margin: 0
  },

  // Receipt Card
  receiptCard: {
    background: '#ffffff',
    borderRadius: '16px',
    boxShadow: '0 4px 24px rgba(0, 0, 0, 0.08), 0 1px 4px rgba(0, 0, 0, 0.04)',
    overflow: 'hidden',
    border: '1px solid #e2e8f0',
    animation: 'fade-in-up 0.6s ease-out 0.2s both'
  },
  receiptHeaderBar: {
    background: 'linear-gradient(135deg, #1e40af, #3b82f6)',
    padding: '24px 28px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  receiptHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px'
  },
  companyLogo: {
    fontSize: '32px',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: '12px',
    width: '52px',
    height: '52px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  companyName: {
    fontSize: '20px',
    fontWeight: '700',
    color: '#ffffff',
    margin: 0
  },
  companyTagline: {
    fontSize: '13px',
    color: 'rgba(255,255,255,0.8)',
    margin: '2px 0 0'
  },
  receiptBadge: {
    backgroundColor: '#dcfce7',
    borderRadius: '24px',
    padding: '8px 20px'
  },
  receiptBadgeText: {
    fontSize: '14px',
    fontWeight: '800',
    color: '#16a34a',
    letterSpacing: '2px'
  },

  // Meta Row
  receiptMetaRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '20px 28px',
    backgroundColor: '#f8fafc',
    gap: '16px',
    flexWrap: 'wrap'
  },
  receiptMetaItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
  },
  metaLabel: {
    fontSize: '11px',
    fontWeight: '600',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  },
  metaValue: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#1e293b'
  },

  // Sections
  divider: {
    height: '1px',
    background: 'linear-gradient(to right, transparent, #e2e8f0, transparent)',
    margin: '0 28px'
  },
  section: {
    padding: '24px 28px'
  },
  sectionTitle: {
    fontSize: '14px',
    fontWeight: '700',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    margin: '0 0 16px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  sectionIcon: {
    fontSize: '16px'
  },

  // Customer
  customerInfo: {},
  customerName: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#1e293b',
    margin: '0 0 4px'
  },
  customerEmail: {
    fontSize: '14px',
    color: '#64748b',
    margin: 0
  },

  // Service Table
  serviceTable: {
    border: '1px solid #e2e8f0',
    borderRadius: '10px',
    overflow: 'hidden'
  },
  serviceHeader: {
    display: 'flex',
    padding: '12px 16px',
    backgroundColor: '#f8fafc',
    borderBottom: '1px solid #e2e8f0'
  },
  serviceCol: {
    fontSize: '11px',
    fontWeight: '700',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  },
  serviceRow: {
    display: 'flex',
    padding: '16px',
    alignItems: 'flex-start'
  },
  serviceDescription: {
    fontSize: '15px',
    fontWeight: '600',
    color: '#1e293b',
    margin: '0 0 4px'
  },
  serviceSubtext: {
    fontSize: '13px',
    color: '#64748b',
    margin: 0
  },

  // Travel Details
  travelDetailsBox: {
    margin: '0',
    padding: '16px',
    backgroundColor: '#f0f9ff',
    borderTop: '1px solid #e2e8f0'
  },
  travelDetailsTitle: {
    fontSize: '13px',
    fontWeight: '700',
    color: '#1e40af',
    margin: '0 0 12px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  },
  travelDetailRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '6px 0',
    borderBottom: '1px solid rgba(59, 130, 246, 0.1)'
  },
  travelDetailLabel: {
    fontSize: '13px',
    color: '#64748b',
    fontWeight: '500'
  },
  travelDetailValue: {
    fontSize: '14px',
    color: '#1e293b',
    fontWeight: '600'
  },

  // Total
  totalSection: {
    padding: '24px 28px',
    backgroundColor: '#f8fafc'
  },
  totalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px'
  },
  totalLabel: {
    fontSize: '18px',
    fontWeight: '700',
    color: '#1e293b'
  },
  totalAmount: {
    fontSize: '28px',
    fontWeight: '800',
    color: '#16a34a',
    letterSpacing: '-0.5px'
  },
  paymentMethod: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    marginBottom: '8px'
  },
  paymentMethodLabel: {
    fontSize: '13px',
    color: '#94a3b8',
    fontWeight: '500'
  },
  paymentMethodValue: {
    fontSize: '13px',
    color: '#475569',
    fontWeight: '600'
  },
  paymentStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  statusDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: '#16a34a',
    boxShadow: '0 0 0 3px rgba(22, 163, 74, 0.2)'
  },
  statusText: {
    fontSize: '13px',
    color: '#16a34a',
    fontWeight: '600'
  },

  // Footer Notes
  footerNotes: {
    padding: '24px 28px'
  },
  footerNote: {
    fontSize: '14px',
    color: '#475569',
    margin: '0 0 10px',
    lineHeight: '1.5'
  },

  // Company Footer
  companyFooter: {
    textAlign: 'center',
    padding: '20px 28px',
    backgroundColor: '#f1f5f9',
    borderTop: '1px solid #e2e8f0'
  },
  companyFooterText: {
    fontSize: '13px',
    color: '#94a3b8',
    margin: '0 0 4px'
  },

  // Action Buttons
  actionButtons: {
    display: 'flex',
    gap: '12px',
    marginTop: '24px',
    flexWrap: 'wrap',
    justifyContent: 'center',
    animation: 'fade-in-up 0.6s ease-out 0.4s both'
  },
  printBtn: {
    flex: '1',
    minWidth: '160px',
    padding: '14px 24px',
    backgroundColor: '#1e40af',
    color: '#ffffff',
    border: 'none',
    borderRadius: '12px',
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
    boxShadow: '0 2px 8px rgba(30, 64, 175, 0.3)'
  },
  downloadBtn: {
    flex: '1',
    minWidth: '160px',
    padding: '14px 24px',
    backgroundColor: '#16a34a',
    color: '#ffffff',
    border: 'none',
    borderRadius: '12px',
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
    boxShadow: '0 2px 8px rgba(22, 163, 74, 0.3)'
  },
  homeBtn: {
    flex: '1',
    minWidth: '160px',
    padding: '14px 24px',
    backgroundColor: '#ffffff',
    color: '#475569',
    border: '2px solid #e2e8f0',
    borderRadius: '12px',
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
    textDecoration: 'none',
    textAlign: 'center',
    transition: 'all 0.2s'
  },

  // Support
  supportSection: {
    textAlign: 'center',
    marginTop: '32px',
    animation: 'fade-in-up 0.6s ease-out 0.6s both'
  },
  supportText: {
    fontSize: '14px',
    color: '#94a3b8',
    margin: '0 0 4px'
  },
  supportEmail: {
    fontSize: '15px',
    color: '#3b82f6',
    fontWeight: '600',
    textDecoration: 'none'
  }
};
