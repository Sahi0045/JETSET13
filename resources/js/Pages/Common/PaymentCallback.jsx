import { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';

export default function PaymentCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  useEffect(() => {
    const verifyPayment = async () => {
      const resultIndicator = searchParams.get('resultIndicator');
      const sessionId = searchParams.get('sessionId');
      
      if (!resultIndicator || !sessionId) {
        navigate('/payment/failed?error=missing_params');
        return;
      }
      
      // Backend will verify and redirect
      window.location.href = `/api/payments?action=payment-callback&resultIndicator=${resultIndicator}&sessionId=${sessionId}`;
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
