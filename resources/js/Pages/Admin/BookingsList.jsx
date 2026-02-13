import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getApiUrl } from '../../utils/apiHelper';
import './AdminPanel.css';

const BookingsList = () => {
    const [bookings, setBookings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [totalCount, setTotalCount] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    // Filters
    const [typeFilter, setTypeFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [paymentFilter, setPaymentFilter] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [searchInput, setSearchInput] = useState('');

    // Action modals
    const [cancelModal, setCancelModal] = useState(null);
    const [cancelReason, setCancelReason] = useState('');
    const [cancelProcessing, setCancelProcessing] = useState(false);
    const [statusModal, setStatusModal] = useState(null);
    const [newStatus, setNewStatus] = useState('');
    const [statusProcessing, setStatusProcessing] = useState(false);
    const [expandedBooking, setExpandedBooking] = useState(null);

    // Success/Error messages
    const [actionMessage, setActionMessage] = useState(null);
    // Refund result after cancel
    const [cancelResult, setCancelResult] = useState(null);

    const getAuthHeaders = () => {
        const token = localStorage.getItem('adminToken') || localStorage.getItem('token') || localStorage.getItem('supabase_token');
        return {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };
    };

    const fetchBookings = useCallback(async () => {
        try {
            setLoading(true);
            const params = new URLSearchParams();
            if (typeFilter !== 'all') params.append('type', typeFilter);
            if (statusFilter !== 'all') params.append('status', statusFilter);
            if (paymentFilter !== 'all') params.append('payment_status', paymentFilter);
            if (searchQuery) params.append('search', searchQuery);
            params.append('page', currentPage);
            params.append('limit', 25);

            const response = await fetch(getApiUrl(`flights/admin-bookings?${params.toString()}`), {
                headers: getAuthHeaders(),
                credentials: 'include'
            });
            const result = await response.json();

            if (result.success) {
                setBookings(result.data || []);
                setTotalCount(result.count || 0);
                setTotalPages(result.totalPages || 1);
            }
        } catch (error) {
            console.error('Error fetching bookings:', error);
        } finally {
            setLoading(false);
        }
    }, [typeFilter, statusFilter, paymentFilter, searchQuery, currentPage]);

    useEffect(() => {
        fetchBookings();
    }, [fetchBookings]);

    const handleSearch = (e) => {
        e.preventDefault();
        setSearchQuery(searchInput);
        setCurrentPage(1);
    };

    // Cancel booking with ARC Pay refund
    const handleCancel = async () => {
        if (!cancelModal) return;
        setCancelProcessing(true);
        try {
            const response = await fetch(getApiUrl(`flights/admin-bookings/${cancelModal.id}/cancel`), {
                method: 'POST',
                headers: getAuthHeaders(),
                credentials: 'include',
                body: JSON.stringify({ reason: cancelReason || 'Admin cancellation' })
            });
            const result = await response.json();
            if (result.success) {
                const cancellation = result.data?.cancellation || {};
                const refundAmount = cancellation.refundAmount || result.data?.refundAmount;
                const paymentAction = cancellation.paymentAction || result.data?.paymentAction;
                const refundPending = result.data?.refundPending;

                // Build detailed success message
                let message = `Booking ${cancelModal.bookingReference} cancelled successfully.`;
                if (paymentAction === 'REFUND' && refundAmount) {
                    message += ` Refund of ${formatCurrency(refundAmount)} has been processed.`;
                } else if (paymentAction === 'VOID') {
                    message += ` Payment has been voided (reversed).`;
                } else if (refundPending) {
                    message += ` Refund is pending manual processing.`;
                }

                setCancelResult({
                    booking: cancelModal,
                    refundAmount,
                    paymentAction,
                    refundPending,
                    amadeusCancelled: cancellation.amadeusCancelled
                });

                setActionMessage({ type: 'success', text: message });
                fetchBookings();
            } else {
                setActionMessage({ type: 'error', text: result.error || 'Failed to cancel booking' });
            }
        } catch (error) {
            setActionMessage({ type: 'error', text: 'Failed to cancel booking: ' + error.message });
        } finally {
            setCancelProcessing(false);
            setCancelModal(null);
            setCancelReason('');
            setTimeout(() => setActionMessage(null), 10000);
        }
    };

    // Update booking status
    const handleStatusUpdate = async () => {
        if (!statusModal || !newStatus) return;
        setStatusProcessing(true);
        try {
            const response = await fetch(getApiUrl(`flights/admin-bookings/${statusModal.id}`), {
                method: 'PUT',
                headers: getAuthHeaders(),
                credentials: 'include',
                body: JSON.stringify({ status: newStatus })
            });
            const result = await response.json();
            if (result.success) {
                setActionMessage({ type: 'success', text: 'Booking status updated successfully' });
                fetchBookings();
            } else {
                setActionMessage({ type: 'error', text: result.error });
            }
        } catch (error) {
            setActionMessage({ type: 'error', text: 'Failed to update status' });
        } finally {
            setStatusProcessing(false);
            setStatusModal(null);
            setNewStatus('');
            setTimeout(() => setActionMessage(null), 5000);
        }
    };

    const getTypeIcon = (type) => {
        switch (type) {
            case 'flight': return '✈️';
            case 'cruise': return '🚢';
            case 'hotel': return '🏨';
            case 'package': return '📦';
            default: return '🎫';
        }
    };

    const getStatusBadge = (status) => {
        const colors = {
            confirmed: { bg: '#dcfce7', color: '#16a34a' },
            cancelled: { bg: '#fef2f2', color: '#dc2626' },
            pending: { bg: '#fef3c7', color: '#d97706' },
            refunded: { bg: '#ede9fe', color: '#7c3aed' },
            completed: { bg: '#dbeafe', color: '#2563eb' }
        };
        const style = colors[status] || { bg: '#f1f5f9', color: '#475569' };
        return (
            <span style={{
                backgroundColor: style.bg, color: style.color,
                padding: '4px 10px', borderRadius: '12px', fontSize: '12px',
                fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px'
            }}>
                {status}
            </span>
        );
    };

    const getPaymentBadge = (status) => {
        const colors = {
            paid: { bg: '#dcfce7', color: '#16a34a' },
            refunded: { bg: '#ede9fe', color: '#7c3aed' },
            refund_pending: { bg: '#fef3c7', color: '#d97706' },
            cancelled: { bg: '#fef2f2', color: '#dc2626' },
            voided: { bg: '#fce7f3', color: '#be185d' },
            pending: { bg: '#fef3c7', color: '#d97706' }
        };
        const style = colors[status] || { bg: '#f1f5f9', color: '#475569' };
        return (
            <span style={{
                backgroundColor: style.bg, color: style.color,
                padding: '3px 8px', borderRadius: '8px', fontSize: '11px',
                fontWeight: '500'
            }}>
                {(status || 'unknown').replace('_', ' ')}
            </span>
        );
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return 'N/A';
        return new Date(dateStr).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric'
        });
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency', currency: 'USD', minimumFractionDigits: 0
        }).format(amount || 0);
    };

    const typeTabs = [
        { key: 'all', label: 'All Bookings', icon: '📋' },
        { key: 'flight', label: 'Flights', icon: '✈️' },
        { key: 'cruise', label: 'Cruises', icon: '🚢' },
        { key: 'hotel', label: 'Hotels', icon: '🏨' },
        { key: 'package', label: 'Packages', icon: '📦' }
    ];

    return (
        <div className="admin-dashboard">
            {/* Header */}
            <div className="dashboard-header">
                <div className="header-content">
                    <div className="header-info">
                        <h1>📋 Booking Management</h1>
                        <p>View and manage all direct bookings — Flights, Cruises, Hotels & Packages</p>
                    </div>
                    <div className="header-actions">
                        <Link to="/admin" style={{
                            padding: '8px 16px', backgroundColor: '#f1f5f9', color: '#475569',
                            borderRadius: '8px', textDecoration: 'none', fontSize: '14px', fontWeight: '500'
                        }}>
                            ← Dashboard
                        </Link>
                    </div>
                </div>
            </div>

            {/* Action Message */}
            {actionMessage && (
                <div style={{
                    padding: '12px 20px', margin: '0 24px 16px',
                    borderRadius: '8px', fontWeight: '500', fontSize: '14px',
                    backgroundColor: actionMessage.type === 'success' ? '#dcfce7' : '#fef2f2',
                    color: actionMessage.type === 'success' ? '#16a34a' : '#dc2626',
                    border: `1px solid ${actionMessage.type === 'success' ? '#bbf7d0' : '#fecaca'}`
                }}>
                    {actionMessage.type === 'success' ? '✅' : '❌'} {actionMessage.text}
                </div>
            )}

            {/* Filter Tabs */}
            <div style={{ padding: '0 24px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
                    {typeTabs.map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => { setTypeFilter(tab.key); setCurrentPage(1); }}
                            style={{
                                padding: '8px 16px', borderRadius: '8px', border: '1px solid',
                                borderColor: typeFilter === tab.key ? '#3b82f6' : '#e2e8f0',
                                backgroundColor: typeFilter === tab.key ? '#3b82f6' : '#fff',
                                color: typeFilter === tab.key ? '#fff' : '#475569',
                                cursor: 'pointer', fontSize: '13px', fontWeight: '500',
                                transition: 'all 0.2s'
                            }}
                        >
                            {tab.icon} {tab.label}
                        </button>
                    ))}
                </div>

                {/* Filters Row */}
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <select
                        value={statusFilter}
                        onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
                        style={{
                            padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0',
                            fontSize: '13px', backgroundColor: '#fff', cursor: 'pointer', minWidth: '140px'
                        }}
                    >
                        <option value="all">All Status</option>
                        <option value="confirmed">Confirmed</option>
                        <option value="cancelled">Cancelled</option>
                        <option value="pending">Pending</option>
                        <option value="completed">Completed</option>
                    </select>

                    <select
                        value={paymentFilter}
                        onChange={(e) => { setPaymentFilter(e.target.value); setCurrentPage(1); }}
                        style={{
                            padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0',
                            fontSize: '13px', backgroundColor: '#fff', cursor: 'pointer', minWidth: '140px'
                        }}
                    >
                        <option value="all">All Payments</option>
                        <option value="paid">Paid</option>
                        <option value="refunded">Refunded</option>
                        <option value="refund_pending">Refund Pending</option>
                        <option value="cancelled">Cancelled</option>
                        <option value="voided">Voided</option>
                    </select>

                    <form onSubmit={handleSearch} style={{ display: 'flex', gap: '8px', flex: 1, minWidth: '200px' }}>
                        <input
                            type="text"
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            placeholder="Search by booking reference..."
                            style={{
                                flex: 1, padding: '8px 12px', borderRadius: '8px',
                                border: '1px solid #e2e8f0', fontSize: '13px'
                            }}
                        />
                        <button type="submit" style={{
                            padding: '8px 16px', borderRadius: '8px', backgroundColor: '#3b82f6',
                            color: '#fff', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '500'
                        }}>
                            🔍 Search
                        </button>
                    </form>

                    <div style={{ fontSize: '13px', color: '#64748b', fontWeight: '500', whiteSpace: 'nowrap' }}>
                        {totalCount} booking{totalCount !== 1 ? 's' : ''}
                    </div>
                </div>
            </div>

            {/* Bookings Table */}
            <div style={{ padding: '0 24px', overflowX: 'auto' }}>
                {loading ? (
                    <div className="dashboard-loading">
                        <div className="loading-spinner-large">
                            <div className="spinner-ring"></div>
                            <div className="spinner-ring"></div>
                            <div className="spinner-ring"></div>
                        </div>
                        <h3>Loading Bookings...</h3>
                    </div>
                ) : bookings.length === 0 ? (
                    <div style={{
                        textAlign: 'center', padding: '60px 20px',
                        backgroundColor: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0'
                    }}>
                        <div style={{ fontSize: '48px', marginBottom: '16px' }}>📭</div>
                        <h3 style={{ color: '#1e293b', marginBottom: '8px' }}>No Bookings Found</h3>
                        <p style={{ color: '#64748b' }}>
                            {searchQuery ? `No bookings matching "${searchQuery}"` : 'No bookings match the current filters'}
                        </p>
                    </div>
                ) : (
                    <div style={{
                        backgroundColor: '#fff', borderRadius: '12px',
                        border: '1px solid #e2e8f0', overflow: 'hidden'
                    }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead>
                                <tr style={{ backgroundColor: '#f8fafc' }}>
                                    <th style={thStyle}>Type</th>
                                    <th style={thStyle}>Booking Ref</th>
                                    <th style={thStyle}>Customer</th>
                                    <th style={thStyle}>Route / Details</th>
                                    <th style={thStyle}>Amount</th>
                                    <th style={thStyle}>Status</th>
                                    <th style={thStyle}>Payment</th>
                                    <th style={thStyle}>Date</th>
                                    <th style={{ ...thStyle, textAlign: 'center' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {bookings.map(booking => (
                                    <React.Fragment key={booking.id}>
                                        <tr style={{
                                            borderBottom: '1px solid #f1f5f9',
                                            transition: 'background-color 0.15s',
                                            backgroundColor: expandedBooking === booking.id ? '#f8fafc' : '#fff'
                                        }}
                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = expandedBooking === booking.id ? '#f8fafc' : '#fff'}
                                        >
                                            <td style={tdStyle}>
                                                <span style={{ fontSize: '18px' }}>{getTypeIcon(booking.type)}</span>
                                                <span style={{ marginLeft: '6px', fontWeight: '500', textTransform: 'capitalize', fontSize: '12px' }}>
                                                    {booking.type}
                                                </span>
                                            </td>
                                            <td style={tdStyle}>
                                                <div style={{ fontWeight: '600', color: '#1e293b', fontFamily: 'monospace' }}>
                                                    {booking.bookingReference || 'N/A'}
                                                </div>
                                                {booking.pnr && (
                                                    <div style={{ fontSize: '11px', color: '#64748b' }}>PNR: {booking.pnr}</div>
                                                )}
                                            </td>
                                            <td style={tdStyle}>
                                                <div style={{ fontWeight: '500', color: '#1e293b' }}>{booking.customerName}</div>
                                                {booking.customerEmail && (
                                                    <div style={{ fontSize: '11px', color: '#64748b' }}>{booking.customerEmail}</div>
                                                )}
                                            </td>
                                            <td style={tdStyle}>
                                                {booking.type === 'flight' && booking.origin ? (
                                                    <div style={{ fontWeight: '500' }}>
                                                        {booking.origin} → {booking.destination}
                                                        {booking.departureDate && (
                                                            <div style={{ fontSize: '11px', color: '#64748b' }}>{booking.departureDate}</div>
                                                        )}
                                                    </div>
                                                ) : booking.type === 'cruise' && booking.cruiseName ? (
                                                    <div>
                                                        <div style={{ fontWeight: '500' }}>{booking.cruiseName}</div>
                                                        {booking.cruiseDeparture && (
                                                            <div style={{ fontSize: '11px', color: '#64748b' }}>
                                                                {booking.cruiseDeparture} → {booking.cruiseArrival}
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span style={{ color: '#94a3b8' }}>—</span>
                                                )}
                                            </td>
                                            <td style={tdStyle}>
                                                <span style={{ fontWeight: '600', color: '#1e293b' }}>
                                                    {formatCurrency(booking.totalAmount)}
                                                </span>
                                            </td>
                                            <td style={tdStyle}>{getStatusBadge(booking.status)}</td>
                                            <td style={tdStyle}>{getPaymentBadge(booking.paymentStatus)}</td>
                                            <td style={tdStyle}>
                                                <span style={{ fontSize: '12px', color: '#64748b' }}>{formatDate(booking.bookingDate)}</span>
                                            </td>
                                            <td style={{ ...tdStyle, textAlign: 'center' }}>
                                                <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', flexWrap: 'wrap' }}>
                                                    <button
                                                        onClick={() => setExpandedBooking(expandedBooking === booking.id ? null : booking.id)}
                                                        title="View Details"
                                                        style={actionBtnStyle('#3b82f6')}
                                                    >🔍</button>
                                                    {booking.status !== 'cancelled' && (
                                                        <>
                                                            <button
                                                                onClick={() => setCancelModal(booking)}
                                                                title="Cancel Booking"
                                                                style={actionBtnStyle('#dc2626')}
                                                            >❌</button>
                                                            <button
                                                                onClick={() => { setStatusModal(booking); setNewStatus(booking.status); }}
                                                                title="Modify Status"
                                                                style={actionBtnStyle('#d97706')}
                                                            >✏️</button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>

                                        {/* Expanded Details */}
                                        {expandedBooking === booking.id && (
                                            <tr>
                                                <td colSpan={9} style={{ padding: '0' }}>
                                                    <div style={{
                                                        padding: '20px 24px', backgroundColor: '#f8fafc',
                                                        borderBottom: '2px solid #e2e8f0'
                                                    }}>
                                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
                                                            {/* Booking Info */}
                                                            <div style={detailCardStyle}>
                                                                <h4 style={detailTitleStyle}>📋 Booking Information</h4>
                                                                <div style={detailRowStyle}><span>ID:</span><span style={{ fontFamily: 'monospace', fontSize: '11px' }}>{booking.id}</span></div>
                                                                <div style={detailRowStyle}><span>Reference:</span><span>{booking.bookingReference}</span></div>
                                                                {booking.pnr && <div style={detailRowStyle}><span>PNR:</span><span>{booking.pnr}</span></div>}
                                                                <div style={detailRowStyle}><span>Type:</span><span style={{ textTransform: 'capitalize' }}>{booking.type}</span></div>
                                                                <div style={detailRowStyle}><span>Status:</span>{getStatusBadge(booking.status)}</div>
                                                                <div style={detailRowStyle}><span>Payment:</span>{getPaymentBadge(booking.paymentStatus)}</div>
                                                                <div style={detailRowStyle}><span>Amount:</span><span style={{ fontWeight: '600' }}>{formatCurrency(booking.totalAmount)}</span></div>
                                                                <div style={detailRowStyle}><span>Created:</span><span>{formatDate(booking.bookingDate)}</span></div>
                                                            </div>

                                                            {/* Customer Info */}
                                                            <div style={detailCardStyle}>
                                                                <h4 style={detailTitleStyle}>👤 Customer</h4>
                                                                <div style={detailRowStyle}><span>Name:</span><span>{booking.customerName}</span></div>
                                                                {booking.customerEmail && <div style={detailRowStyle}><span>Email:</span><span>{booking.customerEmail}</span></div>}
                                                                {booking.userId && <div style={detailRowStyle}><span>User ID:</span><span style={{ fontFamily: 'monospace', fontSize: '11px' }}>{booking.userId}</span></div>}
                                                            </div>

                                                            {/* Passengers */}
                                                            {booking.passengerDetails && Array.isArray(booking.passengerDetails) && booking.passengerDetails.length > 0 && (
                                                                <div style={detailCardStyle}>
                                                                    <h4 style={detailTitleStyle}>🧳 Passengers ({booking.passengerDetails.length})</h4>
                                                                    {booking.passengerDetails.map((p, i) => (
                                                                        <div key={i} style={detailRowStyle}>
                                                                            <span>#{i + 1}:</span>
                                                                            <span>{p.firstName || p.first_name || ''} {p.lastName || p.last_name || ''}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}

                                                            {/* Travel Details */}
                                                            <div style={detailCardStyle}>
                                                                <h4 style={detailTitleStyle}>
                                                                    {booking.type === 'flight' ? '✈️ Flight Details' :
                                                                        booking.type === 'cruise' ? '🚢 Cruise Details' :
                                                                            booking.type === 'hotel' ? '🏨 Hotel Details' : '📦 Package Details'}
                                                                </h4>
                                                                {booking.type === 'flight' && (
                                                                    <>
                                                                        {booking.origin && <div style={detailRowStyle}><span>Route:</span><span>{booking.origin} → {booking.destination}</span></div>}
                                                                        {booking.airline && <div style={detailRowStyle}><span>Airline:</span><span>{booking.airline}</span></div>}
                                                                        {booking.departureDate && <div style={detailRowStyle}><span>Departure:</span><span>{booking.departureDate}</span></div>}
                                                                    </>
                                                                )}
                                                                {booking.type === 'cruise' && (
                                                                    <>
                                                                        {booking.cruiseName && <div style={detailRowStyle}><span>Cruise:</span><span>{booking.cruiseName}</span></div>}
                                                                        {booking.cruiseDeparture && <div style={detailRowStyle}><span>From:</span><span>{booking.cruiseDeparture}</span></div>}
                                                                        {booking.cruiseArrival && <div style={detailRowStyle}><span>To:</span><span>{booking.cruiseArrival}</span></div>}
                                                                    </>
                                                                )}
                                                                {/* Show raw booking details as JSON for other types */}
                                                                {(booking.type === 'hotel' || booking.type === 'package') && booking.bookingDetails && (
                                                                    <pre style={{
                                                                        fontSize: '11px', color: '#475569', backgroundColor: '#f1f5f9',
                                                                        padding: '8px', borderRadius: '6px', overflow: 'auto', maxHeight: '200px'
                                                                    }}>
                                                                        {JSON.stringify(booking.bookingDetails, null, 2)}
                                                                    </pre>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                    <div style={{
                        display: 'flex', justifyContent: 'center', gap: '8px',
                        padding: '20px 0', alignItems: 'center'
                    }}>
                        <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            style={{
                                ...paginationBtnStyle,
                                opacity: currentPage === 1 ? 0.5 : 1,
                                cursor: currentPage === 1 ? 'not-allowed' : 'pointer'
                            }}
                        >← Prev</button>
                        <span style={{ fontSize: '13px', color: '#64748b', padding: '0 12px' }}>
                            Page {currentPage} of {totalPages}
                        </span>
                        <button
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            style={{
                                ...paginationBtnStyle,
                                opacity: currentPage === totalPages ? 0.5 : 1,
                                cursor: currentPage === totalPages ? 'not-allowed' : 'pointer'
                            }}
                        >Next →</button>
                    </div>
                )}
            </div>

            {/* Cancel Modal */}
            {cancelModal && (
                <div style={modalOverlayStyle}>
                    <div style={{ ...modalStyle, maxWidth: '500px' }}>
                        <h3 style={{ margin: '0 0 4px', fontSize: '18px', color: '#1e293b' }}>
                            ❌ Cancel Booking & Process Refund
                        </h3>
                        <p style={{ color: '#64748b', fontSize: '14px', margin: '0 0 16px' }}>
                            This will cancel the booking and automatically process a refund through ARC Pay.
                        </p>

                        {/* Booking Summary */}
                        <div style={{
                            backgroundColor: '#f8fafc', borderRadius: '8px', padding: '12px 16px',
                            marginBottom: '16px', border: '1px solid #e2e8f0'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                <span style={{ fontSize: '12px', color: '#64748b' }}>Booking Ref</span>
                                <span style={{ fontSize: '13px', fontWeight: '600', fontFamily: 'monospace' }}>{cancelModal.bookingReference}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                <span style={{ fontSize: '12px', color: '#64748b' }}>Customer</span>
                                <span style={{ fontSize: '13px', fontWeight: '500' }}>{cancelModal.customerName}</span>
                            </div>
                            {cancelModal.customerEmail && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                    <span style={{ fontSize: '12px', color: '#64748b' }}>Email</span>
                                    <span style={{ fontSize: '13px' }}>{cancelModal.customerEmail}</span>
                                </div>
                            )}
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                <span style={{ fontSize: '12px', color: '#64748b' }}>Amount</span>
                                <span style={{ fontSize: '14px', fontWeight: '700', color: '#1e293b' }}>{formatCurrency(cancelModal.totalAmount)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: '12px', color: '#64748b' }}>Payment Status</span>
                                {getPaymentBadge(cancelModal.paymentStatus)}
                            </div>
                        </div>

                        {/* Refund Info */}
                        {cancelModal.paymentStatus === 'paid' && (
                            <div style={{
                                backgroundColor: '#fef3c7', borderRadius: '8px', padding: '10px 14px',
                                marginBottom: '16px', border: '1px solid #fbbf24', fontSize: '13px', color: '#92400e'
                            }}>
                                💰 <strong>Refund will be processed automatically.</strong> The payment of {formatCurrency(cancelModal.totalAmount)} will be refunded via ARC Pay.
                            </div>
                        )}

                        {/* Reason Dropdown */}
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>
                            Cancellation Reason
                        </label>
                        <select
                            value={cancelReason}
                            onChange={(e) => setCancelReason(e.target.value)}
                            style={{
                                width: '100%', padding: '10px', borderRadius: '8px',
                                border: '1px solid #e2e8f0', fontSize: '13px',
                                marginBottom: '12px', cursor: 'pointer', boxSizing: 'border-box'
                            }}
                        >
                            <option value="">Select a reason...</option>
                            <option value="Customer requested cancellation">Customer requested cancellation</option>
                            <option value="Payment issue">Payment issue</option>
                            <option value="Duplicate booking">Duplicate booking</option>
                            <option value="Flight schedule change">Flight schedule change</option>
                            <option value="Service unavailable">Service unavailable</option>
                            <option value="Admin cancellation">Admin cancellation (other)</option>
                        </select>

                        {/* Optional notes */}
                        <textarea
                            value={cancelReason === '' || ['Customer requested cancellation', 'Payment issue', 'Duplicate booking', 'Flight schedule change', 'Service unavailable', 'Admin cancellation'].includes(cancelReason) ? '' : cancelReason}
                            onChange={(e) => setCancelReason(e.target.value)}
                            placeholder="Additional notes (optional)"
                            style={{
                                width: '100%', padding: '10px', borderRadius: '8px',
                                border: '1px solid #e2e8f0', fontSize: '13px',
                                minHeight: '60px', resize: 'vertical', marginBottom: '16px',
                                boxSizing: 'border-box'
                            }}
                        />

                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => { setCancelModal(null); setCancelReason(''); }}
                                style={modalBtnSecondary}
                            >Keep Booking</button>
                            <button
                                onClick={handleCancel}
                                disabled={cancelProcessing}
                                style={{ ...modalBtnPrimary, backgroundColor: '#dc2626', minWidth: '160px' }}
                            >{cancelProcessing ? '⏳ Processing Refund...' : '❌ Cancel & Refund'}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Refund Result Modal */}
            {cancelResult && (
                <div style={modalOverlayStyle}>
                    <div style={{ ...modalStyle, maxWidth: '450px' }}>
                        <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                            <div style={{ fontSize: '48px', marginBottom: '8px' }}>
                                {cancelResult.paymentAction === 'REFUND' ? '💰' : cancelResult.paymentAction === 'VOID' ? '🔄' : '✅'}
                            </div>
                            <h3 style={{ margin: '0 0 4px', fontSize: '20px', color: '#1e293b' }}>
                                Booking Cancelled
                            </h3>
                            <p style={{ color: '#64748b', fontSize: '14px', margin: 0 }}>
                                {cancelResult.booking?.bookingReference}
                            </p>
                        </div>

                        <div style={{
                            backgroundColor: '#f0fdf4', borderRadius: '8px', padding: '16px',
                            marginBottom: '16px', border: '1px solid #bbf7d0'
                        }}>
                            {cancelResult.paymentAction === 'REFUND' && (
                                <>
                                    <div style={{ fontSize: '13px', color: '#15803d', fontWeight: '600', marginBottom: '4px' }}>
                                        💰 Refund Processed
                                    </div>
                                    <div style={{ fontSize: '24px', fontWeight: '700', color: '#166534' }}>
                                        {formatCurrency(cancelResult.refundAmount)}
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#16a34a', marginTop: '4px' }}>
                                        Refund has been initiated to the customer's payment method
                                    </div>
                                </>
                            )}
                            {cancelResult.paymentAction === 'VOID' && (
                                <>
                                    <div style={{ fontSize: '13px', color: '#15803d', fontWeight: '600', marginBottom: '4px' }}>
                                        🔄 Payment Voided
                                    </div>
                                    <div style={{ fontSize: '14px', color: '#166534' }}>
                                        The payment authorization has been reversed. No charge will appear on the customer's account.
                                    </div>
                                </>
                            )}
                            {!cancelResult.paymentAction && cancelResult.refundPending && (
                                <>
                                    <div style={{ fontSize: '13px', color: '#d97706', fontWeight: '600', marginBottom: '4px' }}>
                                        ⏳ Refund Pending
                                    </div>
                                    <div style={{ fontSize: '14px', color: '#92400e' }}>
                                        Automatic refund could not be processed. Manual refund of {formatCurrency(cancelResult.booking?.totalAmount)} is required.
                                    </div>
                                </>
                            )}
                            {!cancelResult.paymentAction && !cancelResult.refundPending && (
                                <div style={{ fontSize: '14px', color: '#166534' }}>
                                    Booking has been cancelled successfully.
                                </div>
                            )}
                        </div>

                        {cancelResult.amadeusCancelled && (
                            <div style={{ fontSize: '12px', color: '#64748b', textAlign: 'center', marginBottom: '12px' }}>
                                ✈️ Flight order also cancelled with Amadeus
                            </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                            <button
                                onClick={() => setCancelResult(null)}
                                style={{ ...modalBtnPrimary, backgroundColor: '#16a34a', minWidth: '120px' }}
                            >Done</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modify Status Modal */}
            {statusModal && (
                <div style={modalOverlayStyle}>
                    <div style={modalStyle}>
                        <h3 style={{ margin: '0 0 4px', fontSize: '18px', color: '#1e293b' }}>
                            ✏️ Modify Booking Status
                        </h3>
                        <p style={{ color: '#64748b', fontSize: '14px', margin: '0 0 16px' }}>
                            Update status for <strong>{statusModal.bookingReference}</strong>
                        </p>
                        <select
                            value={newStatus}
                            onChange={(e) => setNewStatus(e.target.value)}
                            style={{
                                width: '100%', padding: '10px', borderRadius: '8px',
                                border: '1px solid #e2e8f0', fontSize: '14px',
                                marginBottom: '16px', cursor: 'pointer'
                            }}
                        >
                            <option value="confirmed">✅ Confirmed</option>
                            <option value="pending">⏳ Pending</option>
                            <option value="completed">🎉 Completed</option>
                            <option value="cancelled">❌ Cancelled</option>
                        </select>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => { setStatusModal(null); setNewStatus(''); }}
                                style={modalBtnSecondary}
                            >Cancel</button>
                            <button
                                onClick={handleStatusUpdate}
                                disabled={statusProcessing}
                                style={modalBtnPrimary}
                            >{statusProcessing ? 'Updating...' : 'Update Status'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// Styles
const thStyle = {
    padding: '12px 16px', textAlign: 'left', fontWeight: '600',
    color: '#475569', fontSize: '12px', textTransform: 'uppercase',
    letterSpacing: '0.5px', borderBottom: '2px solid #e2e8f0'
};

const tdStyle = {
    padding: '12px 16px', verticalAlign: 'middle'
};

const actionBtnStyle = (color) => ({
    width: '30px', height: '30px', borderRadius: '6px',
    border: 'none', cursor: 'pointer', fontSize: '14px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    backgroundColor: `${color}15`, transition: 'all 0.15s'
});

const detailCardStyle = {
    backgroundColor: '#fff', padding: '16px', borderRadius: '8px',
    border: '1px solid #e2e8f0'
};

const detailTitleStyle = {
    margin: '0 0 12px', fontSize: '14px', fontWeight: '600', color: '#1e293b'
};

const detailRowStyle = {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '6px 0', fontSize: '13px', color: '#475569',
    borderBottom: '1px solid #f1f5f9'
};

const modalOverlayStyle = {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex',
    alignItems: 'center', justifyContent: 'center', zIndex: 1000
};

const modalStyle = {
    backgroundColor: '#fff', borderRadius: '12px', padding: '24px',
    maxWidth: '450px', width: '90%', boxShadow: '0 25px 50px rgba(0,0,0,0.25)'
};

const modalBtnSecondary = {
    padding: '8px 16px', borderRadius: '8px', border: '1px solid #e2e8f0',
    backgroundColor: '#fff', color: '#475569', cursor: 'pointer', fontSize: '13px', fontWeight: '500'
};

const modalBtnPrimary = {
    padding: '8px 16px', borderRadius: '8px', border: 'none',
    backgroundColor: '#3b82f6', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: '600'
};

const paginationBtnStyle = {
    padding: '8px 16px', borderRadius: '8px', border: '1px solid #e2e8f0',
    backgroundColor: '#fff', color: '#475569', fontSize: '13px', fontWeight: '500'
};

export default BookingsList;
