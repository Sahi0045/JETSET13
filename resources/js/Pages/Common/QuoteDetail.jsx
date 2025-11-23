import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Navbar from './Navbar';
import Footer from './Footer';
import BookingInfoForm from './BookingInfoForm';
import api from '../../api.js';

const QuoteDetail = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { quoteData, inquiryData } = location.state || {};
  
  const [showBookingForm, setShowBookingForm] = useState(false);
  const [bookingInfoStatus, setBookingInfoStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (quoteData && (quoteData.status === 'sent' || quoteData.status === 'accepted')) {
      checkBookingInfoStatus();
    }
  }, [quoteData]);

  const checkBookingInfoStatus = async () => {
    try {
      setLoading(true);
      const response = await api.get(`quotes?id=${quoteData.id}&endpoint=booking-info`);
      if (response.data.success) {
        setBookingInfoStatus({
          exists: true,
          status: response.data.data.status,
          isComplete: response.data.data.status === 'completed'
        });
      }
    } catch (error) {
      if (error.response?.status === 404) {
        setBookingInfoStatus({ exists: false, isComplete: false });
      } else {
        console.error('Error checking booking info:', error);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleBookingInfoComplete = (bookingInfo) => {
    setShowBookingForm(false);
    setBookingInfoStatus({
      exists: true,
      status: bookingInfo.status,
      isComplete: bookingInfo.status === 'completed'
    });
  };

  if (!quoteData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
        <Navbar />
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-white rounded-xl shadow-lg border border-gray-200/50 p-8 text-center">
            <p className="text-red-600 mb-4 font-semibold">Quote information not found</p>
            <button
              onClick={() => navigate('/my-trips')}
              className="px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-200 shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
            >
              Back to My Trips
            </button>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <Navbar />
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <button
            onClick={() => navigate('/my-trips')}
            className="text-blue-600 hover:text-blue-800 flex items-center gap-2 font-semibold transition-colors duration-200 p-2 rounded-lg hover:bg-blue-50 group"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="group-hover:-translate-x-1 transition-transform duration-200">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            Back to My Trips
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-lg border border-gray-200/50 p-6 lg:p-8 mb-6 relative overflow-hidden">
          {/* Gradient accent bar */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-purple-600"></div>
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-8 pt-4">
            <div className="flex-1">
              <div className="flex items-center gap-4 mb-2">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white shadow-lg transform transition-transform hover:scale-105">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 tracking-tight">Quote #{quoteData.quote_number}</h1>
                  <p className="text-sm text-gray-500 mt-1 font-medium flex items-center gap-2">
                    {inquiryData && (
                      <>
                        <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs uppercase tracking-wide">{inquiryData.inquiry_type}</span>
                        <span>Inquiry Ref: #{inquiryData.id?.slice(-8)}</span>
                      </>
                    )}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex flex-col items-start sm:items-end gap-3">
              <div className="text-right">
                <p className="text-sm text-gray-500 font-medium mb-1 uppercase tracking-wider">Total Amount</p>
                <p className="text-3xl lg:text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-700 to-purple-700">
                  ${parseFloat(quoteData.total_amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-lg text-gray-400 font-normal">{quoteData.currency || 'USD'}</span>
                </p>
              </div>
              <span className={`inline-flex items-center px-4 py-1.5 text-sm font-bold rounded-full shadow-sm border ${
                quoteData.status === 'sent' || quoteData.status === 'accepted' 
                  ? 'bg-green-50 text-green-700 border-green-200'
                  : quoteData.status === 'paid'
                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : 'bg-gray-100 text-gray-700 border-gray-200'
              }`}>
                <span className={`w-2 h-2 rounded-full mr-2 ${
                  quoteData.status === 'sent' || quoteData.status === 'accepted' ? 'bg-green-500' :
                  quoteData.status === 'paid' ? 'bg-blue-500' : 'bg-gray-500'
                }`}></span>
                {quoteData.status?.charAt(0).toUpperCase() + quoteData.status?.slice(1) || 'Pending'}
              </span>
            </div>
          </div>

          {quoteData.breakdown && Array.isArray(quoteData.breakdown) && quoteData.breakdown.length > 0 && (
            <div className="mb-8">
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                Price Breakdown
              </h2>
              <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full">
                  <thead className="bg-gradient-to-r from-gray-50 to-blue-50">
                    <tr>
                      <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 uppercase tracking-wider">Item</th>
                      <th className="px-6 py-4 text-right text-sm font-bold text-gray-700 uppercase tracking-wider">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {quoteData.breakdown.map((item, idx) => (
                      <tr key={idx} className="hover:bg-blue-50 transition-colors duration-150">
                        <td className="px-6 py-4 text-sm text-gray-700 font-medium">
                          {item.description || item.item || 'Item'}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900 text-right font-semibold">
                          ${item.amount || item.price || 0}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-gradient-to-r from-green-50 to-emerald-50 font-bold border-t-2 border-green-200">
                      <td className="px-6 py-4 text-base text-gray-900">Total</td>
                      <td className="px-6 py-4 text-lg text-green-700 text-right">
                        ${quoteData.total_amount} {quoteData.currency || 'USD'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {quoteData.admin_notes && (
            <div className="mb-8 p-5 bg-gradient-to-r from-blue-50 to-indigo-50 border-l-4 border-blue-500 rounded-lg shadow-sm">
              <h3 className="text-sm font-bold text-blue-800 mb-2 flex items-center gap-2">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                Notes from our team:
              </h3>
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{quoteData.admin_notes}</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {quoteData.created_at && (
              <div className="bg-gray-50 rounded-xl p-4 hover:bg-white hover:shadow-md transition-all duration-200 border border-gray-100 group">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-blue-100 rounded-lg text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  </div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Created</p>
                </div>
                <p className="font-bold text-gray-900 text-lg">{new Date(quoteData.created_at).toLocaleDateString()}</p>
                <p className="text-xs text-gray-400 font-medium">{new Date(quoteData.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
              </div>
            )}
            {quoteData.sent_at && (
              <div className="bg-gray-50 rounded-xl p-4 hover:bg-white hover:shadow-md transition-all duration-200 border border-gray-100 group">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-green-100 rounded-lg text-green-600 group-hover:bg-green-600 group-hover:text-white transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                  </div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Sent</p>
                </div>
                <p className="font-bold text-gray-900 text-lg">{new Date(quoteData.sent_at).toLocaleDateString()}</p>
                <p className="text-xs text-gray-400 font-medium">{new Date(quoteData.sent_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
              </div>
            )}
            {quoteData.expires_at && (
              <div className="bg-gray-50 rounded-xl p-4 hover:bg-white hover:shadow-md transition-all duration-200 border border-gray-100 group">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-amber-100 rounded-lg text-amber-600 group-hover:bg-amber-600 group-hover:text-white transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Expires</p>
                </div>
                <p className="font-bold text-gray-900 text-lg">{new Date(quoteData.expires_at).toLocaleDateString()}</p>
                <p className="text-xs text-gray-400 font-medium">{new Date(quoteData.expires_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
              </div>
            )}
            {quoteData.validity_days && (
              <div className="bg-gray-50 rounded-xl p-4 hover:bg-white hover:shadow-md transition-all duration-200 border border-gray-100 group">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-purple-100 rounded-lg text-purple-600 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Validity</p>
                </div>
                <p className="font-bold text-gray-900 text-lg">{quoteData.validity_days} Days</p>
                <p className="text-xs text-gray-400 font-medium">Standard period</p>
              </div>
            )}
          </div>

          {inquiryData && (
            <div className="mt-8 pt-6 border-t border-gray-200">
              <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Related Inquiry
              </h3>
              <div className="bg-gradient-to-r from-gray-50 to-blue-50 p-5 rounded-lg border border-gray-200 shadow-sm">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Type</p>
                    <p className="text-sm font-bold text-gray-900 capitalize">{inquiryData.inquiry_type}</p>
                  </div>
                  {inquiryData.customer_name && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Customer</p>
                      <p className="text-sm font-bold text-gray-900">{inquiryData.customer_name}</p>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => navigate(`/inquiry/${inquiryData.id}`)}
                  className="px-6 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white text-sm font-semibold rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-200 shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
                >
                  View Inquiry Details →
                </button>
              </div>
            </div>
          )}

          {/* Booking Info Section */}
          {(quoteData.status === 'sent' || quoteData.status === 'accepted') && (
            <div className="mt-8 pt-6 border-t border-gray-200">
              <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Booking Information
              </h3>
              {bookingInfoStatus?.exists && bookingInfoStatus.isComplete ? (
                <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-l-4 border-green-500 rounded-lg p-5 shadow-sm">
                  <div className="flex items-center mb-2">
                    <svg className="w-6 h-6 text-green-600 mr-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <p className="text-green-800 font-bold text-lg">Booking information completed</p>
                  </div>
                  <p className="text-green-700 text-sm mb-4">
                    You can proceed to payment. All required information has been submitted.
                  </p>
                  <button
                    onClick={() => setShowBookingForm(true)}
                    className="px-6 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 transition-all duration-200 shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
                  >
                    Update Information
                  </button>
                </div>
              ) : (
                <div className="bg-gradient-to-r from-yellow-50 to-amber-50 border-l-4 border-yellow-500 rounded-lg p-5 shadow-sm">
                  <div className="flex items-center mb-2">
                    <svg className="w-6 h-6 text-yellow-600 mr-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <p className="text-yellow-800 font-bold text-lg">Booking information required</p>
                  </div>
                  <p className="text-yellow-700 text-sm mb-4">
                    Please complete your booking information before proceeding to payment.
                  </p>
                  <button
                    onClick={() => setShowBookingForm(true)}
                    className="px-6 py-3 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-lg hover:from-green-700 hover:to-green-800 font-semibold transition-all duration-200 shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
                  >
                    Fill Booking Information
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Booking Info Form Modal */}
      {showBookingForm && (
        <BookingInfoForm
          quoteId={quoteData.id}
          inquiryType={inquiryData?.inquiry_type}
          onComplete={handleBookingInfoComplete}
          onClose={() => setShowBookingForm(false)}
        />
      )}

      <Footer />
    </div>
  );
};

export default QuoteDetail;

