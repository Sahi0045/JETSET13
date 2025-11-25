import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { CheckCircle, Download, ArrowRight } from 'lucide-react';

export default function PaymentSuccess() {
  const [searchParams] = useSearchParams();
  const [payment, setPayment] = useState(null);
  const [loading, setLoading] = useState(true);
  const paymentId = searchParams.get('paymentId');

  useEffect(() => {
    if (paymentId) {
      fetchPaymentDetails();
    }
  }, [paymentId]);

  const fetchPaymentDetails = async () => {
    try {
      const response = await fetch(`/api/payments?action=get-payment-details&paymentId=${paymentId}`);
      const data = await response.json();
      
      if (data.success) {
        setPayment(data.payment);
      }
    } catch (error) {
      console.error('Failed to fetch payment details:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        {/* Success Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mb-4">
            <CheckCircle className="w-12 h-12 text-green-600" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Payment Successful!</h1>
          <p className="text-lg text-gray-600">
            Your payment has been processed successfully.
          </p>
        </div>

        {/* Payment Details Card */}
        {payment && (
          <div className="bg-white rounded-lg shadow-lg overflow-hidden mb-6">
            <div className="bg-gradient-to-r from-green-600 to-green-700 px-6 py-4">
              <h2 className="text-xl font-semibold text-white">Payment Confirmation</h2>
            </div>
            
            <div className="p-6 space-y-4">
              {/* Transaction ID */}
              <div className="flex justify-between items-center pb-4 border-b">
                <span className="text-gray-600">Transaction ID</span>
                <span className="font-mono text-sm font-semibold text-gray-900">
                  {payment.arc_transaction_id || payment.id || 'N/A'}
                </span>
              </div>

              {/* Amount */}
              <div className="flex justify-between items-center pb-4 border-b">
                <span className="text-gray-600">Amount Paid</span>
                <span className="text-2xl font-bold text-green-600">
                  ${payment.amount ? parseFloat(payment.amount).toFixed(2) : '0.00'} {payment.currency || 'USD'}
                </span>
              </div>

              {/* Payment Method */}
              {payment.payment_method && (
                <div className="flex justify-between items-center pb-4 border-b">
                  <span className="text-gray-600">Payment Method</span>
                  <span className="font-semibold text-gray-900 capitalize">
                    {payment.payment_method}
                  </span>
                </div>
              )}

              {/* Date */}
              <div className="flex justify-between items-center pb-4 border-b">
                <span className="text-gray-600">Date</span>
                <span className="font-semibold text-gray-900">
                  {new Date(payment.completed_at || payment.created_at).toLocaleString()}
                </span>
              </div>

              {/* Quote Details */}
              {payment.quote && (
                <>
                  <div className="flex justify-between items-center pb-4 border-b">
                    <span className="text-gray-600">Quote Number</span>
                    <span className="font-semibold text-gray-900">
                      {payment.quote.quote_number || 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Booking</span>
                    <span className="font-semibold text-gray-900">
                      {payment.quote.title || 'N/A'}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Confirmation Message */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
          <h3 className="font-semibold text-blue-900 mb-2">What's Next?</h3>
          <ul className="space-y-2 text-blue-800">
              <li className="flex items-start">
              <span className="mr-2">✓</span>
              <span>A confirmation email has been sent to {payment?.customer_email || 'your email address'}</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">✓</span>
              <span>Your booking is now confirmed and being processed</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">✓</span>
              <span>You will receive your travel documents within 24 hours</span>
            </li>
          </ul>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4">
          <Link
            to="/my-trips"
            className="flex-1 flex items-center justify-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
          >
            View My Trips
            <ArrowRight className="ml-2 w-5 h-5" />
          </Link>
          
          <button
            onClick={() => window.print()}
            className="flex-1 flex items-center justify-center px-6 py-3 bg-white border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-semibold"
          >
            <Download className="mr-2 w-5 h-5" />
            Print Receipt
          </button>
        </div>

        {/* Support */}
        <div className="text-center mt-8 text-sm text-gray-600">
          <p>Need help? Contact our support team at</p>
          <a href="mailto:support@jetset.com" className="text-blue-600 hover:underline font-semibold">
            support@jetset.com
          </a>
        </div>
      </div>
    </div>
  );
}
