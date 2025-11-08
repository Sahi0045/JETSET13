import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Navbar from './Navbar';
import Footer from './Footer';

const QuoteDetail = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { quoteData, inquiryData } = location.state || {};

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
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default QuoteDetail;

