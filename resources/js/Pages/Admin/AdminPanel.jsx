import React from 'react';
import { Routes, Route } from 'react-router-dom';
import AdminDashboard from './AdminDashboard';
import InquiryList from './InquiryList';
import InquiryDetail from './InquiryDetail';
import FeatureFlags from './FeatureFlags';
import PriceSettings from './PriceSettings';
import QuoteCreate from './QuoteCreate';
import QuoteDetail from './QuoteDetail';
import BookingsList from './BookingsList';
import './AdminPanel.css';

const AdminPanel = () => {
  return (
    <div className="admin-panel">
      <Routes>
        <Route path="/" element={<AdminDashboard />} />
        <Route path="/inquiries" element={<InquiryList />} />
        <Route path="/inquiries/:id" element={<InquiryDetail />} />
        <Route path="/inquiries/:inquiryId/quote" element={<QuoteCreate />} />
        <Route path="/quotes/:id" element={<QuoteDetail />} />
        <Route path="/feature-flags" element={<FeatureFlags />} />
        <Route path="/price-settings" element={<PriceSettings />} />
        <Route path="/bookings" element={<BookingsList />} />
      </Routes>
    </div>
  );
};

export default AdminPanel;
