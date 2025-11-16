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
      <div className="min-h-screen bg-[#f0f7fc]">
        <Navbar />
        <div className="container mx-auto px-4 py-8">
          <div className="bg-white rounded-lg shadow-sm p-8 text-center">
            <p className="text-red-600 mb-4">Quote information not found</p>
            <button
              onClick={() => navigate('/my-trips')}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
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
    <div className="min-h-screen bg-[#f0f7fc]">
      <Navbar />
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <button
            onClick={() => navigate('/my-trips')}
            className="text-blue-600 hover:text-blue-800 flex items-center gap-2"
          >
            ← Back to My Trips
          </button>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Quote #{quoteData.quote_number}</h1>
              <p className="text-sm text-gray-500 mt-1">
                {inquiryData && `For ${inquiryData.inquiry_type} inquiry`}
              </p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-green-700">
                ${quoteData.total_amount} {quoteData.currency || 'USD'}
              </p>
              <p className="text-sm text-gray-600 mt-1 capitalize">{quoteData.status}</p>
            </div>
          </div>

          {quoteData.breakdown && Array.isArray(quoteData.breakdown) && quoteData.breakdown.length > 0 && (
            <div className="mb-6">
              <h2 className="text-lg font-semibold mb-4">Price Breakdown</h2>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Item</th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {quoteData.breakdown.map((item, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {item.description || item.item || 'Item'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 text-right font-medium">
                          ${item.amount || item.price || 0}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-green-50 font-semibold">
                      <td className="px-4 py-3 text-sm text-gray-900">Total</td>
                      <td className="px-4 py-3 text-sm text-green-700 text-right">
                        ${quoteData.total_amount} {quoteData.currency || 'USD'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {quoteData.admin_notes && (
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Notes from our team:</h3>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{quoteData.admin_notes}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {quoteData.created_at && (
              <div>
                <p className="text-sm text-gray-500">Quote Created</p>
                <p className="font-medium">{new Date(quoteData.created_at).toLocaleString()}</p>
              </div>
            )}
            {quoteData.sent_at && (
              <div>
                <p className="text-sm text-gray-500">Quote Sent</p>
                <p className="font-medium">{new Date(quoteData.sent_at).toLocaleString()}</p>
              </div>
            )}
            {quoteData.expires_at && (
              <div>
                <p className="text-sm text-gray-500">Expires</p>
                <p className="font-medium">{new Date(quoteData.expires_at).toLocaleString()}</p>
              </div>
            )}
            {quoteData.validity_days && (
              <div>
                <p className="text-sm text-gray-500">Valid for</p>
                <p className="font-medium">{quoteData.validity_days} days</p>
              </div>
            )}
          </div>

          {inquiryData && (
            <div className="mt-6 pt-6 border-t">
              <h3 className="text-lg font-semibold mb-4">Related Inquiry</h3>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600">
                  <strong>Type:</strong> {inquiryData.inquiry_type}
                </p>
                {inquiryData.customer_name && (
                  <p className="text-sm text-gray-600">
                    <strong>Customer:</strong> {inquiryData.customer_name}
                  </p>
                )}
                <button
                  onClick={() => navigate(`/inquiry/${inquiryData.id}`)}
                  className="mt-3 text-blue-600 hover:text-blue-800 text-sm font-medium"
                >
                  View Inquiry Details →
                </button>
              </div>
            </div>
          )}

          {/* Booking Info Section */}
          {(quoteData.status === 'sent' || quoteData.status === 'accepted') && (
            <div className="mt-6 pt-6 border-t">
              <h3 className="text-lg font-semibold mb-4">Booking Information</h3>
              {bookingInfoStatus?.exists && bookingInfoStatus.isComplete ? (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center">
                    <svg className="w-5 h-5 text-green-600 mr-2" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <p className="text-green-800 font-medium">Booking information completed</p>
                  </div>
                  <p className="text-green-700 text-sm mt-1">
                    You can proceed to payment. All required information has been submitted.
                  </p>
                  <button
                    onClick={() => setShowBookingForm(true)}
                    className="mt-3 text-green-700 hover:text-green-800 text-sm font-medium underline"
                  >
                    Update Information
                  </button>
                </div>
              ) : (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex items-center">
                    <svg className="w-5 h-5 text-yellow-600 mr-2" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <p className="text-yellow-800 font-medium">Booking information required</p>
                  </div>
                  <p className="text-yellow-700 text-sm mt-1">
                    Please complete your booking information before proceeding to payment.
                  </p>
                  <button
                    onClick={() => setShowBookingForm(true)}
                    className="mt-3 px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 font-medium"
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

