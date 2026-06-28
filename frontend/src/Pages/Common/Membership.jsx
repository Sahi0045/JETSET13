import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Navbar from './Navbar';
import Footer from './Footer';
import SubscriptionService from '../../Services/SubscriptionService';

const Membership = () => {
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  const [userStatus, setUserStatus] = useState(null);
  const location = useLocation();
  const navigate = useNavigate();

  const user = JSON.parse(localStorage.getItem('user') || 'null');

  useEffect(() => {
    const query = new URLSearchParams(location.search);
    const status = query.get('status');
    const tx = query.get('tx');

    if (status === 'cancel') {
      setStatusMessage({ type: 'error', text: 'Checkout was cancelled.' });
    }

    const run = async () => {
      if (status === 'success' && tx) {
        const complete = await SubscriptionService.completeAfterPayment(tx, user?.id || null);
        if (complete.success) {
          setStatusMessage({
            type: 'success',
            text: complete.alreadyActive
              ? 'Your Premium subscription is already active.'
              : 'Welcome to Premium! Your subscription is now active.',
          });
        } else if (user?.id) {
          setStatusMessage({
            type: 'error',
            text:
              complete.message ||
              'We could not confirm your payment yet. If you were charged, contact support with your receipt.',
          });
        } else {
          setStatusMessage({
            type: 'success',
            text: 'Thank you for completing checkout. Log in to refresh your membership status.',
          });
        }
      } else if (status === 'success') {
        setStatusMessage({
          type: 'success',
          text: 'Thank you! If you just paid, your subscription will appear once confirmed.',
        });
      }

      if (user && user.id) {
        await fetchUserStatus();
      }
    };

    run();
  }, [location.search]);

  const fetchUserStatus = async () => {
    const res = await SubscriptionService.getStatus(user.id);
    if (res.success && res.data) {
      setUserStatus(res.data);
      // Update local storage so the rest of the app knows
      if (res.data.subscription_tier) {
        const updatedUser = { ...user, isPremium: true, subscriptionTier: res.data.subscription_tier };
        localStorage.setItem('user', JSON.stringify(updatedUser));
      }
    }
  };

  const handleSubscribe = async (planId, planName, price) => {
    if (!user) {
      // Redirect to login, then come back here
      navigate('/login', { state: { returnUrl: '/membership' } });
      return;
    }

    setLoading(true);
    setStatusMessage(null);

    try {
      const response = await SubscriptionService.createCheckoutSession({
        planId,
        planName,
        price,
        email: user.email,
        userId: user.id,
        // So ARC returns to wherever checkout started (localhost in dev, prod in prod)
        // instead of always bouncing to FRONTEND_URL.
        returnOrigin: window.location.origin
      });

      if (response.success && response.checkoutUrl) {
        window.location.href = response.checkoutUrl;
      } else {
        setStatusMessage({ type: 'error', text: response.message || 'Failed to initialize checkout.' });
        setLoading(false);
      }
    } catch (err) {
      setStatusMessage({ type: 'error', text: 'An unexpected error occurred.' });
      setLoading(false);
    }
  };

  const isPremium = userStatus?.subscription_tier === 'premium_monthly' || userStatus?.subscription_tier === 'premium_annual';

  return (
    <div className="min-h-screen bg-gray-50 font-sans flex flex-col">
      <Navbar />

      <main className="flex-grow max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-4 tracking-tight">
            Elevate Your Travel with Jetsetter <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-cyan-500">Premium</span>
          </h1>
          <p className="text-lg md:text-xl text-gray-600 max-w-2xl mx-auto">
            Get exclusive discounts on flights, priority support, and complimentary seat selection on all your bookings.
          </p>
        </div>

        {statusMessage && (
          <div className={`mb-8 p-4 rounded-xl text-center font-medium max-w-3xl mx-auto border ${statusMessage.type === 'success' ? 'bg-green-50 text-green-800 border-green-200' : 'bg-red-50 text-red-800 border-red-200'}`}>
            {statusMessage.text}
          </div>
        )}

        {isPremium && (
          <div className="mb-12 p-6 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl max-w-3xl mx-auto text-center shadow-sm">
            <span className="inline-block p-3 bg-blue-100 text-blue-800 rounded-full mb-4">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </span>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">You're a Premium Member!</h2>
            <p className="text-gray-600 mb-2">Your subscription is active and renews on {new Date(userStatus.subscription_end_date).toLocaleDateString()}.</p>
            <p className="text-sm font-medium text-blue-700">Explore the world with your exclusive benefits.</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          {/* Monthly Plan */}
          <div className="bg-white rounded-3xl p-8 border border-gray-200 shadow-sm hover:shadow-xl transition-shadow duration-300 relative flex flex-col">
            <div className="mb-6">
              <h3 className="text-2xl font-bold text-gray-900 mb-2">Monthly Flexibility</h3>
              <p className="text-gray-500">Perfect for occasional travelers looking for quick benefits.</p>
            </div>
            
            <div className="mb-6">
              <span className="text-5xl font-extrabold text-gray-900">$9.99</span>
              <span className="text-gray-500 font-medium">/month</span>
            </div>

            <ul className="space-y-4 mb-8 flex-grow">
              {['5% discount on all bookings', 'Priority 24/7 Support', 'Free standard seat selection', 'Monthly travel newsletter'].map((benefit, i) => (
                <li key={i} className="flex items-start text-gray-700">
                  <svg className="w-5 h-5 text-green-500 mr-3 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"></path></svg>
                  {benefit}
                </li>
              ))}
            </ul>

            <button
              onClick={() => handleSubscribe('premium_monthly', 'Monthly Premium', 9.99)}
              disabled={loading || isPremium}
              className="w-full py-4 px-6 rounded-xl font-bold text-white bg-gray-900 hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Processing...' : isPremium ? 'Current Plan' : 'Subscribe Monthly'}
            </button>
          </div>

          {/* Annual Plan */}
          <div className="bg-gradient-to-b from-blue-900 to-indigo-900 rounded-3xl p-8 shadow-2xl relative flex flex-col transform md:-translate-y-4">
            <div className="absolute top-0 right-8 transform -translate-y-1/2">
              <span className="bg-gradient-to-r from-cyan-400 to-blue-400 text-blue-900 text-xs font-bold uppercase tracking-widest py-1.5 px-4 rounded-full shadow-sm">
                Most Popular
              </span>
            </div>

            <div className="mb-6 mt-2">
              <h3 className="text-2xl font-bold text-white mb-2">Annual Jetsetter</h3>
              <p className="text-blue-200">Ultimate value for regular travelers. Save 20%.</p>
            </div>
            
            <div className="mb-6">
              <span className="text-5xl font-extrabold text-white">$95.00</span>
              <span className="text-blue-200 font-medium">/year</span>
            </div>

            <ul className="space-y-4 mb-8 flex-grow">
              {['10% discount on all bookings', 'VIP Priority Support', 'Free premium seat selection', 'Free checked baggage (when available)', 'Early access to flash sales'].map((benefit, i) => (
                <li key={i} className="flex items-start text-white">
                  <svg className="w-5 h-5 text-cyan-400 mr-3 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"></path></svg>
                  {benefit}
                </li>
              ))}
            </ul>

            <button
              onClick={() => handleSubscribe('premium_annual', 'Annual Premium', 95.00)}
              disabled={loading || isPremium}
              className="w-full py-4 px-6 rounded-xl font-bold text-blue-900 bg-white hover:bg-gray-100 transition-colors disabled:opacity-90 disabled:cursor-not-allowed shadow-lg"
            >
              {loading ? 'Processing...' : isPremium ? 'Current Plan' : 'Subscribe Annually'}
            </button>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Membership;
