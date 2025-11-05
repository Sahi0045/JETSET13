import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './AdminPanel.css';

const AdminDashboard = () => {
  const [stats, setStats] = useState({
    totalInquiries: 0,
    pendingInquiries: 0,
    activeQuotes: 0,
    expiredQuotes: 0
  });
  const [recentInquiries, setRecentInquiries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      // Fetch statistics
      const statsResponse = await fetch('/api/inquiries/stats', {
        credentials: 'include'
      });
      const statsData = await statsResponse.json();

      if (statsData.success) {
        setStats({
          totalInquiries: statsData.data.total,
          pendingInquiries: statsData.data.byStatus?.pending || 0,
          activeQuotes: statsData.data.byStatus?.quoted || 0,
          expiredQuotes: 0 // TODO: Implement expired quotes count
        });
      }

      // Fetch recent inquiries
      const inquiriesResponse = await fetch('/api/inquiries?limit=5&sort=created_at:desc', {
        credentials: 'include'
      });
      const inquiriesData = await inquiriesResponse.json();

      if (inquiriesData.success) {
        setRecentInquiries(inquiriesData.data.inquiries);
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
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

  if (loading) {
    return <div className="admin-loading">Loading dashboard...</div>;
  }

  return (
    <div className="admin-dashboard">
      <div className="admin-header">
        <h1>Admin Dashboard</h1>
        <p>Welcome back! Here's an overview of your inquiry management system.</p>
      </div>

      {/* Statistics Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">📊</div>
          <div className="stat-content">
            <h3>{stats.totalInquiries}</h3>
            <p>Total Inquiries</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">⏳</div>
          <div className="stat-content">
            <h3>{stats.pendingInquiries}</h3>
            <p>Pending Inquiries</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">💰</div>
          <div className="stat-content">
            <h3>{stats.activeQuotes}</h3>
            <p>Active Quotes</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">⏰</div>
          <div className="stat-content">
            <h3>{stats.expiredQuotes}</h3>
            <p>Expired Quotes</p>
          </div>
        </div>
      </div>

      {/* Recent Inquiries */}
      <div className="recent-inquiries">
        <div className="section-header">
          <h2>Recent Inquiries</h2>
          <Link to="/admin/inquiries" className="view-all-btn">View All</Link>
        </div>

        <div className="inquiries-list">
          {recentInquiries.length === 0 ? (
            <div className="no-inquiries">
              <p>No inquiries yet. They will appear here when customers submit requests.</p>
            </div>
          ) : (
            recentInquiries.map(inquiry => (
              <div key={inquiry.id} className="inquiry-card">
                <div className="inquiry-header">
                  <div className="inquiry-type">
                    <span className="type-icon">{getInquiryTypeIcon(inquiry.inquiry_type)}</span>
                    <span className="type-label">{inquiry.inquiry_type.charAt(0).toUpperCase() + inquiry.inquiry_type.slice(1)}</span>
                  </div>
                  <span className={`status-badge ${getStatusColor(inquiry.status)}`}>
                    {inquiry.status}
                  </span>
                </div>

                <div className="inquiry-content">
                  <h4>{inquiry.customer_name}</h4>
                  <p className="inquiry-email">{inquiry.customer_email}</p>
                  <p className="inquiry-date">
                    {new Date(inquiry.created_at).toLocaleDateString()}
                  </p>
                </div>

                <div className="inquiry-actions">
                  <Link to={`/admin/inquiries/${inquiry.id}`} className="action-btn view-btn">
                    View Details
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="quick-actions">
        <h2>Quick Actions</h2>
        <div className="actions-grid">
          <Link to="/admin/inquiries" className="action-card">
            <div className="action-icon">📋</div>
            <h3>Manage Inquiries</h3>
            <p>View and respond to customer inquiries</p>
          </Link>

          <Link to="/admin/quotes" className="action-card">
            <div className="action-icon">💰</div>
            <h3>Create Quotes</h3>
            <p>Generate and send quotes to customers</p>
          </Link>

          <Link to="/admin/reports" className="action-card">
            <div className="action-icon">📈</div>
            <h3>View Reports</h3>
            <p>Analyze inquiry and quote statistics</p>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
