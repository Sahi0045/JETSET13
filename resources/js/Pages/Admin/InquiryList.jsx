import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './AdminPanel.css';

const InquiryList = () => {
  const [inquiries, setInquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    status: '',
    inquiry_type: '',
    page: 1,
    limit: 10
  });
  const [pagination, setPagination] = useState({
    total: 0,
    pages: 0,
    currentPage: 1
  });

  useEffect(() => {
    fetchInquiries();
  }, [filters]);

  const fetchInquiries = async () => {
    try {
      setLoading(true);
      const queryParams = new URLSearchParams({
        ...filters,
        sort: 'created_at:desc'
      });

      const response = await fetch(`/api/inquiries?${queryParams}`, {
        credentials: 'include'
      });

      const data = await response.json();

      if (data.success) {
        setInquiries(data.data || []);
        setPagination(data.pagination || { total: 0, pages: 0, currentPage: 1 });
      }
    } catch (error) {
      console.error('Error fetching inquiries:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (filterName, value) => {
    setFilters(prev => ({
      ...prev,
      [filterName]: value,
      page: 1 // Reset to first page when filtering
    }));
  };

  const handlePageChange = (newPage) => {
    setFilters(prev => ({
      ...prev,
      page: newPage
    }));
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
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return <div className="admin-loading">Loading inquiries...</div>;
  }

  return (
    <div className="inquiry-list">
      <div className="page-header">
        <h1>Inquiry Management</h1>
        <p>Manage and respond to customer travel inquiries</p>
      </div>

      {/* Filters */}
      <div className="filters-section">
        <div className="filter-group">
          <label>Status:</label>
          <select
            value={filters.status}
            onChange={(e) => handleFilterChange('status', e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="processing">Processing</option>
            <option value="quoted">Quoted</option>
            <option value="booked">Booked</option>
            <option value="cancelled">Cancelled</option>
            <option value="expired">Expired</option>
          </select>
        </div>

        <div className="filter-group">
          <label>Type:</label>
          <select
            value={filters.inquiry_type}
            onChange={(e) => handleFilterChange('inquiry_type', e.target.value)}
          >
            <option value="">All Types</option>
            <option value="flight">Flight</option>
            <option value="hotel">Hotel</option>
            <option value="cruise">Cruise</option>
            <option value="package">Package</option>
            <option value="general">General</option>
          </select>
        </div>

        <div className="filter-group">
          <label>Per Page:</label>
          <select
            value={filters.limit}
            onChange={(e) => handleFilterChange('limit', e.target.value)}
          >
            <option value="10">10</option>
            <option value="25">25</option>
            <option value="50">50</option>
          </select>
        </div>
      </div>

      {/* Inquiries Table */}
      <div className="table-container">
        <table className="inquiries-table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Type</th>
              <th>Status</th>
              <th>Priority</th>
              <th>Created</th>
              <th>Assigned To</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {inquiries.length === 0 ? (
              <tr>
                <td colSpan="7" className="no-data">
                  No inquiries found matching your criteria.
                </td>
              </tr>
            ) : (
              inquiries.map(inquiry => (
                <tr key={inquiry.id}>
                  <td>
                    <div className="customer-info">
                      <div className="customer-name">{inquiry.customer_name}</div>
                      <div className="customer-email">{inquiry.customer_email}</div>
                    </div>
                  </td>
                  <td>
                    <div className="inquiry-type">
                      <span className="type-icon">{getInquiryTypeIcon(inquiry.inquiry_type)}</span>
                      <span>{inquiry.inquiry_type}</span>
                    </div>
                  </td>
                  <td>
                    <span className={`status-badge ${getStatusColor(inquiry.status)}`}>
                      {inquiry.status}
                    </span>
                  </td>
                  <td>
                    <span className={`priority-badge priority-${inquiry.priority}`}>
                      {inquiry.priority}
                    </span>
                  </td>
                  <td>{formatDate(inquiry.created_at)}</td>
                  <td>
                    {inquiry.assigned_admin ? (
                      <span>{inquiry.assigned_admin.name}</span>
                    ) : (
                      <span className="unassigned">Unassigned</span>
                    )}
                  </td>
                  <td>
                    <div className="action-buttons">
                      <Link to={`/admin/inquiries/${inquiry.id}`} className="action-btn view-btn">
                        View
                      </Link>
                      <Link to={`/admin/inquiries/${inquiry.id}/quote`} className="action-btn quote-btn">
                        Quote
                      </Link>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="pagination">
          <button
            onClick={() => handlePageChange(pagination.currentPage - 1)}
            disabled={pagination.currentPage === 1}
            className="pagination-btn"
          >
            Previous
          </button>

          <span className="pagination-info">
            Page {pagination.currentPage} of {pagination.pages}
            ({pagination.total} total inquiries)
          </span>

          <button
            onClick={() => handlePageChange(pagination.currentPage + 1)}
            disabled={pagination.currentPage === pagination.pages}
            className="pagination-btn"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};

export default InquiryList;
