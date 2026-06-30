import React from 'react';
import { Routes, Route } from 'react-router-dom';
import AdminShell from './shell/AdminShell';
import AdminDashboard from './AdminDashboard';
import InquiryList from './InquiryList';
import InquiryDetail from './InquiryDetail';
import FeatureFlags from './FeatureFlags';
import PriceSettings from './PriceSettings';
import QuoteCreate from './QuoteCreate';
import QuoteDetail from './QuoteDetail';
import BookingsList from './BookingsList';
import CustomersList from './CustomersList';
import PaymentLinkCreate from './PaymentLinkCreate';
import PaymentLinksList from './PaymentLinksList';
import AgentManagement from './AgentManagement';
import AdminsManager from './AdminsManager';
import ActivityLog from './ActivityLog';
import AccountSettings from './AccountSettings';
import CouponManagement from './CouponManagement';
import SubscriptionManagement from './SubscriptionManagement';
import SLADashboard from './SLADashboard';
import BulkActions from './BulkActions';
import AnalyticsDashboard from './AnalyticsDashboard';
import BulkUpload from './BulkUpload';
import TemplateManager from './TemplateManager';

const AdminPanel = () => {
  return (
    <Routes>
      <Route element={<AdminShell />}>
        <Route path="/" element={<AdminDashboard />} />
        <Route path="inquiries" element={<InquiryList />} />
        <Route path="inquiries/:id" element={<InquiryDetail />} />
        <Route path="inquiries/:inquiryId/quote" element={<QuoteCreate />} />
        <Route path="quotes/:id" element={<QuoteDetail />} />
        <Route path="feature-flags" element={<FeatureFlags />} />
        <Route path="price-settings" element={<PriceSettings />} />
        <Route path="bookings" element={<BookingsList />} />
        <Route path="customers" element={<CustomersList />} />
        <Route path="payment-links" element={<PaymentLinksList />} />
        <Route path="payment-links/create" element={<PaymentLinkCreate />} />
        <Route path="agents" element={<AgentManagement />} />
        <Route path="admins" element={<AdminsManager />} />
        <Route path="activity" element={<ActivityLog />} />
        <Route path="account" element={<AccountSettings />} />
        <Route path="coupons" element={<CouponManagement />} />
        <Route path="subscriptions" element={<SubscriptionManagement />} />
        <Route path="sla" element={<SLADashboard />} />
        <Route path="bulk" element={<BulkActions />} />
        <Route path="bulk-upload" element={<BulkUpload />} />
        <Route path="templates" element={<TemplateManager />} />
        <Route path="reports" element={<AnalyticsDashboard />} />
      </Route>
    </Routes>
  );
};

export default AdminPanel;
