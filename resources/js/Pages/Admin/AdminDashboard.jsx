import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './AdminPanel.css';
import { getApiUrl } from '../../utils/apiHelper';

const AdminDashboard = () => {
  const [stats, setStats] = useState({
    totalInquiries: 0,
    pendingInquiries: 0,
    processingInquiries: 0,
    quotedInquiries: 0,
    bookedInquiries: 0,
    cancelledInquiries: 0,
    activeQuotes: 0,
    expiredQuotes: 0,
    totalRevenue: 0,
    monthlyRevenue: 0
  });
  const [recentInquiries, setRecentInquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('7d');
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [timeRange]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);

      // Get token from localStorage
      const token = localStorage.getItem('adminToken') || localStorage.getItem('token') || localStorage.getItem('supabase_token');

      if (!token) {
        console.error('No authentication token found');
        return;
      }

      const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      };

      // Fetch statistics
      const statsResponse = await fetch(getApiUrl('inquiries/stats'), {
        headers,
        credentials: 'include'
      });
      const statsData = await statsResponse.json();

      if (statsData.success && statsData.data) {
        setStats({
          totalInquiries: statsData.data.total || 0,
          pendingInquiries: statsData.data.byStatus?.pending || 0,
          processingInquiries: statsData.data.byStatus?.processing || 0,
          quotedInquiries: statsData.data.byStatus?.quoted || 0,
          bookedInquiries: statsData.data.byStatus?.booked || 0,
          cancelledInquiries: statsData.data.byStatus?.cancelled || 0,
          activeQuotes: statsData.data.byStatus?.quoted || 0,
          expiredQuotes: 0, // TODO: Implement expired quotes count
          totalRevenue: 0, // TODO: Implement revenue tracking
          monthlyRevenue: 0 // TODO: Implement monthly revenue
        });
      } else {
        // If stats request failed, keep default values (all zeros)
        console.warn('Failed to fetch stats or invalid response:', statsData);
      }

      // Fetch recent inquiries
      const inquiriesResponse = await fetch(getApiUrl('inquiries?limit=5&sort=created_at:desc'), {
        headers,
        credentials: 'include'
      });

      if (!inquiriesResponse.ok) {
        console.warn('Failed to fetch inquiries:', inquiriesResponse.status, inquiriesResponse.statusText);
        setRecentInquiries([]);
        return;
      }

      const inquiriesData = await inquiriesResponse.json();
      console.log('Inquiries API response:', inquiriesData);

      // Handle different response structures
      let inquiries = [];

      if (inquiriesData && inquiriesData.success) {
        if (Array.isArray(inquiriesData.data)) {
          // Direct array response: { success: true, data: [...] }
          inquiries = inquiriesData.data;
        } else if (inquiriesData.data && Array.isArray(inquiriesData.data.inquiries)) {
          // Nested inquiries array: { success: true, data: { inquiries: [...] } }
          inquiries = inquiriesData.data.inquiries;
        } else if (inquiriesData.data && inquiriesData.data.data && Array.isArray(inquiriesData.data.data)) {
          // Double nested: { success: true, data: { data: [...] } }
          inquiries = inquiriesData.data.data;
        } else if (inquiriesData.inquiries && Array.isArray(inquiriesData.inquiries)) {
          // Alternative structure: { success: true, inquiries: [...] }
          inquiries = inquiriesData.inquiries;
        }
      }

      // Final safety check - ensure it's always an array
      if (!Array.isArray(inquiries)) {
        console.warn('Inquiries is not an array, received:', typeof inquiries, inquiries);
        inquiries = [];
      }

      setRecentInquiries(inquiries);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      // Ensure arrays are set to empty on error
      setRecentInquiries([]);
    } finally {
      setLoading(false);
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
      case 'flight': return 'FL';
      case 'hotel': return 'HT';
      case 'cruise': return 'CR';
      case 'package': return 'PK';
      default: return 'GN';
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) return 'Today';
    if (diffDays === 2) return 'Yesterday';
    if (diffDays <= 7) return `${diffDays - 1} days ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const StatCard = ({ icon, title, value, change, changeType, color = 'blue' }) => (
    <div className={`stat-card stat-card-${color}`}>
      <div className="stat-header">
        <div className={`stat-icon icon-${color}`}>
          {icon}
        </div>
        {change && (
          <div className={`stat-change ${changeType}`}>
            <span className="change-value">{change > 0 ? '+' : ''}{change}%</span>
            <span className="change-label">vs last month</span>
          </div>
        )}
      </div>
      <div className="stat-content">
        <h3 className="stat-value">{value}</h3>
        <p className="stat-title">{title}</p>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="admin-dashboard">
        <div className="dashboard-loading">
          <div className="loading-spinner-large">
            <div className="spinner-ring"></div>
            <div className="spinner-ring"></div>
            <div className="spinner-ring"></div>
          </div>
          <h3>Loading Dashboard...</h3>
          <p>Fetching your latest statistics</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-dashboard">
      {/* Dashboard Header */}
      <div className="dashboard-header">
        <div className="header-content">
          <div className="header-info">
            <h1>Dashboard Overview</h1>
            <p>Welcome back! Here's what's happening with your travel business today.</p>
          </div>
          <div className="header-actions">
            <div className="time-display">
              <span className="current-time">
                {currentTime.toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: true
                })}
              </span>
              <span className="current-date">
                {currentTime.toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Time Range Selector */}
      <div className="dashboard-controls">
        <div className="time-range-selector">
          <button
            className={`time-btn ${timeRange === '7d' ? 'active' : ''}`}
            onClick={() => setTimeRange('7d')}
          >
            7 Days
          </button>
          <button
            className={`time-btn ${timeRange === '30d' ? 'active' : ''}`}
            onClick={() => setTimeRange('30d')}
          >
            30 Days
          </button>
          <button
            className={`time-btn ${timeRange === '90d' ? 'active' : ''}`}
            onClick={() => setTimeRange('90d')}
          >
            90 Days
          </button>
        </div>
      </div>

      {/* Statistics Grid */}
      <div className="stats-grid">
        <StatCard
          icon="#"
          title="Total Inquiries"
          value={stats.totalInquiries}
          change={12}
          changeType="positive"
          color="blue"
        />
        <StatCard
          icon="P"
          title="Pending"
          value={stats.pendingInquiries}
          change={-5}
          changeType="negative"
          color="yellow"
        />
        <StatCard
          icon="W"
          title="Processing"
          value={stats.processingInquiries}
          change={8}
          changeType="positive"
          color="purple"
        />
        <StatCard
          icon="Q"
          title="Quoted"
          value={stats.quotedInquiries}
          change={15}
          changeType="positive"
          color="green"
        />
        <StatCard
          icon="B"
          title="Booked"
          value={stats.bookedInquiries}
          change={22}
          changeType="positive"
          color="success"
        />
        <StatCard
          icon="$"
          title="Revenue"
          value={formatCurrency(stats.totalRevenue)}
          change={18}
          changeType="positive"
          color="gold"
        />
      </div>

      {/* Charts and Analytics Row */}
      <div className="analytics-row">
        <div className="analytics-card chart-card">
          <div className="card-header">
            <h3>Inquiry Trends</h3>
            <div className="chart-legend">
              <span className="legend-item">
                <span className="legend-dot pending"></span>
                Pending
              </span>
              <span className="legend-item">
                <span className="legend-dot processing"></span>
                Processing
              </span>
              <span className="legend-item">
                <span className="legend-dot quoted"></span>
                Quoted
              </span>
            </div>
          </div>
          <div className="chart-placeholder">
            <div className="chart-icon">📈</div>
            <p>Interactive chart will be displayed here</p>
            <small>Showing data for last {timeRange}</small>
          </div>
        </div>

        <div className="analytics-card conversion-card">
          <div className="card-header">
            <h3>Conversion Funnel</h3>
          </div>
          <div className="conversion-funnel">
            <div className="funnel-step">
              <div className="step-label">Inquiries</div>
              <div className="step-value">{stats.totalInquiries}</div>
              <div className="step-bar" style={{ width: '100%' }}></div>
            </div>
            <div className="funnel-step">
              <div className="step-label">Quoted</div>
              <div className="step-value">{stats.quotedInquiries}</div>
              <div className="step-bar" style={{
                width: `${stats.totalInquiries > 0 ? (stats.quotedInquiries / stats.totalInquiries) * 100 : 0}%`
              }}></div>
            </div>
            <div className="funnel-step">
              <div className="step-label">Booked</div>
              <div className="step-value">{stats.bookedInquiries}</div>
              <div className="step-bar" style={{
                width: `${stats.totalInquiries > 0 ? (stats.bookedInquiries / stats.totalInquiries) * 100 : 0}%`
              }}></div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Row */}
      <div className="bottom-row">
        {/* Recent Inquiries */}
        <div className="recent-activity-card">
          <div className="card-header">
            <h3>Recent Inquiries</h3>
            <Link to="/admin/inquiries" className="view-all-link">
              View All →
            </Link>
          </div>

          <div className="activity-list">
            {(() => {
              // Defensive check - ensure recentInquiries is always an array
              const safeInquiries = Array.isArray(recentInquiries) ? recentInquiries : [];

              if (safeInquiries.length === 0) {
                return (
                  <div className="empty-state">
                    <div className="empty-icon">📭</div>
                    <h4>No Recent Inquiries</h4>
                    <p>New customer inquiries will appear here</p>
                  </div>
                );
              }

              return safeInquiries.map(inquiry => (
                <div key={inquiry.id} className="activity-item">
                  <div className="activity-icon">
                    {getInquiryTypeIcon(inquiry.inquiry_type)}
                  </div>
                  <div className="activity-content">
                    <div className="activity-title">
                      <span className="customer-name">{inquiry.customer_name}</span>
                      <span className={`activity-status ${getStatusColor(inquiry.status)}`}>
                        {inquiry.status}
                      </span>
                    </div>
                    <div className="activity-meta">
                      <span className="inquiry-type">{inquiry.inquiry_type}</span>
                      <span className="activity-time">{formatDate(inquiry.created_at)}</span>
                    </div>
                  </div>
                  <Link to={`/admin/inquiries/${inquiry.id}`} className="activity-action">
                    View
                  </Link>
                </div>
              ));
            })()}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="quick-actions-card">
          <div className="card-header">
            <h3>Quick Actions</h3>
          </div>

          <div className="actions-grid">
            <Link to="/admin/inquiries" className="action-card">
              <div className="action-icon">📋</div>
              <div className="action-content">
                <h4>Manage Inquiries</h4>
                <p>View and respond to customer inquiries</p>
              </div>
              <div className="action-arrow">→</div>
            </Link>

            <Link to="/admin/feature-flags" className="action-card">
              <div className="action-icon">⚙️</div>
              <div className="action-content">
                <h4>Feature Flags</h4>
                <p>Control system features and settings</p>
              </div>
              <div className="action-arrow">→</div>
            </Link>

            <Link to="/admin/quotes" className="action-card">
              <div className="action-icon">💰</div>
              <div className="action-content">
                <h4>Create Quotes</h4>
                <p>Generate and send quotes to customers</p>
              </div>
              <div className="action-arrow">→</div>
            </Link>

            <Link to="/admin/reports" className="action-card">
              <div className="action-icon">📊</div>
              <div className="action-content">
                <h4>Analytics</h4>
                <p>View detailed reports and insights</p>
              </div>
              <div className="action-arrow">→</div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
