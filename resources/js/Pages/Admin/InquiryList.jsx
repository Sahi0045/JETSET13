import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './AdminPanel.css';

const InquiryList = () => {
  const [inquiries, setInquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    status: '',
    inquiry_type: '',
    priority: '',
    assigned_admin: '',
    page: 1,
    limit: 10
  });
  const [pagination, setPagination] = useState({
    total: 0,
    pages: 0,
    currentPage: 1
  });
  const [showFilters, setShowFilters] = useState(false);
  const [sortConfig, setSortConfig] = useState({
    key: 'created_at',
    direction: 'desc'
  });

  useEffect(() => {
    fetchInquiries();
  }, [filters, sortConfig]);

  const fetchInquiries = async () => {
    try {
      setLoading(true);
      
      // Get token from localStorage
      const token = localStorage.getItem('adminToken') || localStorage.getItem('token') || localStorage.getItem('supabase_token');
      
      if (!token) {
        console.error('No authentication token found');
        return;
      }

      const queryParams = new URLSearchParams({
        ...filters,
        search: searchTerm,
        sort: `${sortConfig.key}:${sortConfig.direction}`
      });

      const response = await fetch(`/api/inquiries?${queryParams}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
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

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    // Debounce search
    setTimeout(() => {
      setFilters(prev => ({ ...prev, page: 1 }));
    }, 500);
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

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const clearFilters = () => {
    setFilters({
      status: '',
      inquiry_type: '',
      priority: '',
      assigned_admin: '',
      page: 1,
      limit: 10
    });
    setSearchTerm('');
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

  const getPriorityIcon = (priority) => {
    switch (priority) {
      case 'urgent': return '🔴';
      case 'high': return '🟠';
      case 'normal': return '🟡';
      case 'low': return '🟢';
      default: return '⚪';
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) return 'Today';
    if (diffDays === 2) return 'Yesterday';
    if (diffDays <= 7) return `${diffDays - 1} days ago`;
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const SortIcon = ({ column }) => {
    if (sortConfig.key !== column) return <span className="sort-icon">↕️</span>;
    return <span className="sort-icon">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>;
  };

  if (loading) {
    return (
      <div className="inquiry-list">
        <div className="page-loading">
          <div className="loading-spinner-large">
            <div className="spinner-ring"></div>
            <div className="spinner-ring"></div>
            <div className="spinner-ring"></div>
          </div>
          <h3>Loading Inquiries...</h3>
          <p>Fetching customer inquiries</p>
        </div>
      </div>
    );
  }

  return (
    <div className="inquiry-list">
      {/* Page Header */}
      <div className="page-header">
        <div className="header-content">
          <h1>Inquiry Management</h1>
          <p>Manage and respond to customer travel inquiries</p>
        </div>
        <div className="header-actions">
          <Link to="/admin/inquiries/new" className="action-button primary">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd"/>
            </svg>
            New Inquiry
          </Link>
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="search-filters-bar">
        <div className="search-section">
          <div className="search-input-wrapper">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd"/>
            </svg>
            <input
              type="text"
              placeholder="Search inquiries by name, email, or content..."
              value={searchTerm}
              onChange={handleSearchChange}
              className="search-input"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="search-clear"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        <div className="filters-section">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`filter-toggle ${showFilters ? 'active' : ''}`}
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h6a1 1 0 110 2H4a1 1 0 01-1-1zM3 17a1 1 0 011-1h3a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd"/>
            </svg>
            Filters
            {(filters.status || filters.inquiry_type || filters.priority || filters.assigned_admin) && (
              <span className="filter-count">
                {Object.values(filters).filter(v => v && v !== 1 && v !== 10).length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Advanced Filters */}
      {showFilters && (
        <div className="advanced-filters">
          <div className="filters-grid">
            <div className="filter-item">
              <label>Status</label>
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

            <div className="filter-item">
              <label>Type</label>
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

            <div className="filter-item">
              <label>Priority</label>
              <select
                value={filters.priority}
                onChange={(e) => handleFilterChange('priority', e.target.value)}
              >
                <option value="">All Priorities</option>
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="normal">Normal</option>
                <option value="low">Low</option>
              </select>
            </div>

            <div className="filter-item">
              <label>Per Page</label>
              <select
                value={filters.limit}
                onChange={(e) => handleFilterChange('limit', parseInt(e.target.value))}
              >
                <option value="10">10 per page</option>
                <option value="25">25 per page</option>
                <option value="50">50 per page</option>
                <option value="100">100 per page</option>
              </select>
            </div>
          </div>

          <div className="filter-actions">
            <button onClick={clearFilters} className="clear-filters-btn">
              Clear All
            </button>
          </div>
        </div>
      )}

      {/* Results Summary */}
      <div className="results-summary">
        <div className="summary-text">
          Showing <strong>{inquiries.length}</strong> of <strong>{pagination.total}</strong> inquiries
          {searchTerm && ` matching "${searchTerm}"`}
        </div>
        <div className="summary-actions">
          <button onClick={fetchInquiries} className="refresh-btn">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd"/>
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Inquiries Table */}
      <div className="data-table-container">
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th onClick={() => handleSort('customer_name')} className="sortable">
                  Customer <SortIcon column="customer_name" />
                </th>
                <th onClick={() => handleSort('inquiry_type')} className="sortable">
                  Type <SortIcon column="inquiry_type" />
                </th>
                <th onClick={() => handleSort('status')} className="sortable">
                  Status <SortIcon column="status" />
                </th>
                <th onClick={() => handleSort('priority')} className="sortable">
                  Priority <SortIcon column="priority" />
                </th>
                <th onClick={() => handleSort('created_at')} className="sortable">
                  Created <SortIcon column="created_at" />
                </th>
                <th>Assigned To</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {inquiries.length === 0 ? (
                <tr>
                  <td colSpan="7" className="empty-state">
                    <div className="empty-content">
                      <div className="empty-icon">📭</div>
                      <h4>No inquiries found</h4>
                      <p>No inquiries match your current search and filter criteria.</p>
                      {(searchTerm || filters.status || filters.inquiry_type || filters.priority) && (
                        <button onClick={clearFilters} className="empty-action">
                          Clear Filters
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                inquiries.map(inquiry => (
                  <tr key={inquiry.id} className="data-row">
                    <td>
                      <div className="customer-cell">
                        <div className="customer-avatar">
                          {inquiry.customer_name.charAt(0).toUpperCase()}
                        </div>
                        <div className="customer-info">
                          <div className="customer-name">{inquiry.customer_name}</div>
                          <div className="customer-email">{inquiry.customer_email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="type-cell">
                        <span className="type-icon">{getInquiryTypeIcon(inquiry.inquiry_type)}</span>
                        <span className="type-text">{inquiry.inquiry_type}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`status-badge ${getStatusColor(inquiry.status)}`}>
                        {inquiry.status}
                      </span>
                    </td>
                    <td>
                      <div className="priority-cell">
                        <span className="priority-icon">{getPriorityIcon(inquiry.priority)}</span>
                        <span className="priority-text">{inquiry.priority}</span>
                      </div>
                    </td>
                    <td>
                      <div className="date-cell">
                        <div className="date-main">{formatDate(inquiry.created_at)}</div>
                        <div className="date-secondary">
                          {new Date(inquiry.created_at).toLocaleTimeString('en-US', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </div>
                      </div>
                    </td>
                    <td>
                      {inquiry.assigned_admin ? (
                        <div className="assigned-cell">
                          <div className="assignee-avatar">
                            {inquiry.assigned_admin.name.charAt(0).toUpperCase()}
                          </div>
                          <span>{inquiry.assigned_admin.name}</span>
                        </div>
                      ) : (
                        <span className="unassigned">Unassigned</span>
                      )}
                    </td>
                    <td>
                      <div className="actions-cell">
                        <Link to={`/admin/inquiries/${inquiry.id}`} className="action-btn view-btn">
                          <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/>
                            <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd"/>
                          </svg>
                          View
                        </Link>
                        <Link to={`/admin/inquiries/${inquiry.id}/quote`} className="action-btn quote-btn">
                          <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd"/>
                          </svg>
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
      </div>

      {/* Enhanced Pagination */}
      {pagination.pages > 1 && (
        <div className="pagination-container">
          <div className="pagination-info">
            Showing {((pagination.currentPage - 1) * filters.limit) + 1} to {Math.min(pagination.currentPage * filters.limit, pagination.total)} of {pagination.total} inquiries
          </div>

          <div className="pagination-controls">
            <button
              onClick={() => handlePageChange(1)}
              disabled={pagination.currentPage === 1}
              className="pagination-btn"
            >
              First
            </button>

            <button
              onClick={() => handlePageChange(pagination.currentPage - 1)}
              disabled={pagination.currentPage === 1}
              className="pagination-btn"
            >
              Previous
            </button>

            <div className="pagination-pages">
              {Array.from({ length: Math.min(5, pagination.pages) }, (_, i) => {
                let pageNum;
                if (pagination.pages <= 5) {
                  pageNum = i + 1;
                } else if (pagination.currentPage <= 3) {
                  pageNum = i + 1;
                } else if (pagination.currentPage >= pagination.pages - 2) {
                  pageNum = pagination.pages - 4 + i;
                } else {
                  pageNum = pagination.currentPage - 2 + i;
                }

                return (
                  <button
                    key={pageNum}
                    onClick={() => handlePageChange(pageNum)}
                    className={`pagination-btn ${pagination.currentPage === pageNum ? 'active' : ''}`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => handlePageChange(pagination.currentPage + 1)}
              disabled={pagination.currentPage === pagination.pages}
              className="pagination-btn"
            >
              Next
            </button>

            <button
              onClick={() => handlePageChange(pagination.pages)}
              disabled={pagination.currentPage === pagination.pages}
              className="pagination-btn"
            >
              Last
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default InquiryList;
