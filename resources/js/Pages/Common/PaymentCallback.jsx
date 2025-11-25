import { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';

export default function PaymentCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  useEffect(() => {
    const verifyPayment = async () => {
      try {
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
        
        console.log('Payment callback received:', { 
          resultIndicator: resultIndicator || 'undefined',
          sessionId: sessionId || 'undefined',
          quoteId: quoteId || 'undefined',
          inquiryId: inquiryId || 'undefined',
          allParams: Object.fromEntries(searchParams.entries())
        });
        
        // Build backend URL with available parameters
        const params = new URLSearchParams();
        if (resultIndicator) params.append('resultIndicator', resultIndicator);
        if (sessionId) params.append('sessionId', sessionId);
        if (quoteId) params.append('quote_id', quoteId);
        if (inquiryId) params.append('inquiry_id', inquiryId);
        
        // If we have at least sessionId or quoteId, proceed
        if (!sessionId && !quoteId) {
          console.error('Missing required payment parameters:', { resultIndicator, sessionId, quoteId });
          const redirectUrl = inquiryId 
            ? `/inquiry/${inquiryId}?payment=failed&error=missing_params`
            : '/payment/failed?error=missing_params';
          navigate(redirectUrl);
          return;
        }
        
        // Backend will verify and redirect
        console.log('Redirecting to backend for payment verification...');
        const backendUrl = `/api/payments?action=payment-callback&${params.toString()}`;
        console.log('Backend URL:', backendUrl);
        window.location.href = backendUrl;
      } catch (error) {
        console.error('Payment callback error:', error);
        const inquiryId = searchParams.get('inquiry_id');
        const redirectUrl = inquiryId 
          ? `/inquiry/${inquiryId}?payment=failed&error=processing_error`
          : '/payment/failed?error=processing_error';
        navigate(redirectUrl);
      }
    };
    
    verifyPayment();
  }, [searchParams, navigate]);
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center p-8">
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-6"></div>
        <h2 className="text-2xl font-semibold text-gray-800 mb-2">Verifying Payment...</h2>
        <p className="text-gray-600">Please wait while we confirm your payment with ARC Pay Gateway.</p>
        <p className="text-sm text-gray-500 mt-4">This should only take a moment.</p>
      </div>
    </div>
  );
}
