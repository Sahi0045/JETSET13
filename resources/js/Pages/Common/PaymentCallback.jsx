import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';

export default function PaymentCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('Processing payment...');
  const [error, setError] = useState(null);
  
  useEffect(() => {
    const verifyPayment = async () => {
      try {
        // Get the full URL for debugging
        console.log('🔍 PaymentCallback - Full URL:', window.location.href);
        console.log('🔍 PaymentCallback - Search params:', window.location.search);
        
        // ARC Pay may send parameters with different names
        // Try multiple possible parameter formats
        const resultIndicator = searchParams.get('resultIndicator') || 
                               searchParams.get('result') ||
                               searchParams.get('resultIndicator');
        const sessionId = searchParams.get('sessionId') || 
                         searchParams.get('session.id') ||
                         searchParams.get('session_id');
        const quoteId = searchParams.get('quote_id');
        const inquiryId = searchParams.get('inquiry_id');
        const statusParam = searchParams.get('status');
        
        console.log('📋 Payment callback received:', { 
          resultIndicator: resultIndicator || '(not provided)',
          sessionId: sessionId || '(not provided)',
          quoteId: quoteId || '(not provided)',
          inquiryId: inquiryId || '(not provided)',
          status: statusParam || '(not provided)',
          allParams: Object.fromEntries(searchParams.entries())
        });

        setStatus('Verifying payment with gateway...');
        
        // Build backend URL with available parameters
        const params = new URLSearchParams();
        if (resultIndicator) params.append('resultIndicator', resultIndicator);
        if (sessionId) params.append('sessionId', sessionId);
        if (quoteId) params.append('quote_id', quoteId);
        if (inquiryId) params.append('inquiry_id', inquiryId);
        
        // If we have at least resultIndicator or sessionId or quoteId, proceed
        if (!resultIndicator && !sessionId && !quoteId) {
          console.error('❌ Missing required payment parameters:', { resultIndicator, sessionId, quoteId });
          setError('Missing payment verification parameters. The payment may not have completed properly.');
          
          // Wait a moment then redirect
          setTimeout(() => {
            const redirectUrl = inquiryId 
              ? `/inquiry/${inquiryId}?payment=failed&error=missing_params`
              : '/payment/failed?error=missing_params';
            navigate(redirectUrl);
          }, 3000);
          return;
        }
        
        // Backend will verify and redirect
        setStatus('Confirming payment status...');
        console.log('🔄 Redirecting to backend for payment verification...');
        const backendUrl = `/api/payments?action=payment-callback&${params.toString()}`;
        console.log('🔗 Backend URL:', backendUrl);
        window.location.href = backendUrl;
      } catch (error) {
        console.error('❌ Payment callback error:', error);
        setError(`Error processing payment: ${error.message || 'Unknown error'}`);
        
        setTimeout(() => {
          const inquiryId = searchParams.get('inquiry_id');
          const redirectUrl = inquiryId 
            ? `/inquiry/${inquiryId}?payment=failed&error=processing_error`
            : '/payment/failed?error=processing_error';
          navigate(redirectUrl);
        }, 3000);
      }
    };
    
    verifyPayment();
  }, [searchParams, navigate]);
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center p-8 max-w-md">
        {error ? (
          <>
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-2xl font-semibold text-gray-800 mb-2">Payment Verification Issue</h2>
            <p className="text-red-600 mb-4">{error}</p>
            <p className="text-sm text-gray-500">Redirecting you shortly...</p>
          </>
        ) : (
          <>
            <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-6"></div>
            <h2 className="text-2xl font-semibold text-gray-800 mb-2">Verifying Payment...</h2>
            <p className="text-gray-600">{status}</p>
            <p className="text-sm text-gray-500 mt-4">Please wait while we confirm your payment with ARC Pay Gateway.</p>
          </>
        )}
      </div>
    </div>
  );
}
