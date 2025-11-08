import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { XCircle, ArrowLeft, RefreshCw, Mail } from 'lucide-react';

export default function PaymentFailed() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const error = searchParams.get('error');
  const reason = searchParams.get('reason');

  const getErrorMessage = () => {
    switch (error) {
      case 'missing_params':
        return 'Invalid payment callback. Missing required parameters.';
      case 'invalid_session':
        return 'Payment session not found or has expired.';
      case 'invalid_indicator':
        return 'Payment verification failed. Security check did not pass.';
      case 'verification_failed':
        return 'Unable to verify payment status with payment gateway.';
      case 'processing_error':
        return 'An error occurred while processing your payment.';
      default:
        if (reason) {
          return `Payment declined: ${reason.replace(/_/g, ' ')}`;
        }
        return 'Your payment could not be completed.';
    }
  };

  const getErrorDetails = () => {
    switch (error) {
      case 'missing_params':
      case 'invalid_session':
        return 'The payment session may have expired. Please try again.';
      case 'invalid_indicator':
        return 'For security reasons, this payment could not be verified. Please contact support if you believe this is an error.';
      case 'verification_failed':
        return 'We could not confirm the payment status. Your card may not have been charged. Please check with your bank.';
      default:
        return 'Please check your payment details and try again. If the problem persists, contact your bank or try a different payment method.';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        {/* Error Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-red-100 rounded-full mb-4">
            <XCircle className="w-12 h-12 text-red-600" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Payment Failed</h1>
          <p className="text-lg text-gray-600">
            {getErrorMessage()}
          </p>
        </div>

        {/* Error Details Card */}
        <div className="bg-white rounded-lg shadow-lg overflow-hidden mb-6">
          <div className="bg-gradient-to-r from-red-600 to-red-700 px-6 py-4">
            <h2 className="text-xl font-semibold text-white">What Happened?</h2>
          </div>
          
          <div className="p-6">
            <p className="text-gray-700 mb-4">
              {getErrorDetails()}
            </p>

            {error && (
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <p className="text-sm text-gray-600">
                  <span className="font-semibold">Error Code:</span>{' '}
                  <span className="font-mono">{error}</span>
                </p>
              </div>
            )}

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <h3 className="font-semibold text-yellow-900 mb-2">Important Note</h3>
              <p className="text-sm text-yellow-800">
                If you see a charge on your card statement, it will be automatically reversed within 3-5 business days.
                No action is required from your side.
              </p>
            </div>
          </div>
        </div>

        {/* Common Reasons */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h3 className="font-semibold text-gray-900 mb-4">Common Reasons for Payment Failure</h3>
          <ul className="space-y-3 text-gray-700">
            <li className="flex items-start">
              <span className="mr-2 text-red-500">•</span>
              <span>Insufficient funds in your account</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2 text-red-500">•</span>
              <span>Incorrect card details or CVV</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2 text-red-500">•</span>
              <span>Card expired or blocked by your bank</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2 text-red-500">•</span>
              <span>Transaction limit exceeded</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2 text-red-500">•</span>
              <span>International transactions not enabled</span>
            </li>
          </ul>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <button
            onClick={() => navigate(-2)}
            className="flex-1 flex items-center justify-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
          >
            <RefreshCw className="mr-2 w-5 h-5" />
            Try Again
          </button>
          
          <Link
            to="/my-trips"
            className="flex-1 flex items-center justify-center px-6 py-3 bg-white border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-semibold"
          >
            <ArrowLeft className="mr-2 w-5 h-5" />
            Back to My Trips
          </Link>
        </div>

        {/* Support Section */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
          <Mail className="w-8 h-8 text-blue-600 mx-auto mb-3" />
          <h3 className="font-semibold text-blue-900 mb-2">Need Help?</h3>
          <p className="text-blue-800 mb-4">
            Our support team is here to assist you with any payment issues.
          </p>
          <div className="space-y-2">
            <a
              href="mailto:support@jetset.com"
              className="inline-block text-blue-600 hover:underline font-semibold"
            >
              support@jetset.com
            </a>
            <p className="text-sm text-blue-700">
              Available 24/7 • Response within 1 hour
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
