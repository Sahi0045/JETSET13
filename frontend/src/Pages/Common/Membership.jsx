import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Check, Crown, Tag, Headphones, Armchair, Sparkles, ShieldCheck, RefreshCw, Clock } from 'lucide-react';
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
      if (res.data.subscription_tier) {
        const updatedUser = { ...user, isPremium: true, subscriptionTier: res.data.subscription_tier };
        localStorage.setItem('user', JSON.stringify(updatedUser));
      }
    }
  };

  const handleSubscribe = async (planId, planName, price) => {
    if (!user) {
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
  const isMonthlyCurrent = userStatus?.subscription_tier === 'premium_monthly';
  const isAnnualCurrent = userStatus?.subscription_tier === 'premium_annual';

  const highlights = [
    { icon: Tag, title: 'Member discounts', desc: 'Up to 10% off every booking' },
    { icon: Headphones, title: 'Priority support', desc: '24/7 VIP assistance' },
    { icon: Armchair, title: 'Free seat selection', desc: 'Complimentary on flights' },
    { icon: Sparkles, title: 'Early access', desc: 'Flash sales & flash deals' },
  ];

  const monthlyBenefits = [
    '5% discount on all bookings',
    'Priority 24/7 support',
    'Free standard seat selection',
    'Monthly travel newsletter',
  ];
  const annualBenefits = [
    '10% discount on all bookings',
    'VIP priority support',
    'Free premium seat selection',
    'Free checked baggage (when available)',
    'Early access to flash sales',
  ];

  return (
    <div className="min-h-screen bg-[#F1FBFD] font-sans flex flex-col">
      <Navbar />

      <main className="flex-grow">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div
            className="absolute inset-0 opacity-[0.06] pointer-events-none"
            style={{ background: 'radial-gradient(1000px 400px at 50% -10%, #0890BC, transparent 60%)' }}
          />
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-10 text-center">
            <span className="inline-flex items-center gap-2 bg-[#055B75]/10 text-[#055B75] text-xs font-bold uppercase tracking-widest px-4 py-1.5 rounded-full mb-5">
              <Crown size={14} /> Jetsetter Premium
            </span>
            <h1 className="text-4xl md:text-5xl font-extrabold text-[#034457] mb-4 tracking-tight">
              Elevate every journey
            </h1>
            <p className="text-lg md:text-xl text-gray-600 max-w-2xl mx-auto">
              Exclusive discounts on flights, priority support, and complimentary seat selection on every booking.
            </p>

            {/* Benefit highlights */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 max-w-4xl mx-auto mt-10">
              {highlights.map((h, i) => (
                <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 text-left">
                  <div className="w-11 h-11 rounded-xl bg-[#0890BC]/10 text-[#0890BC] flex items-center justify-center mb-3">
                    <h.icon size={20} />
                  </div>
                  <div className="font-bold text-gray-900 text-sm">{h.title}</div>
                  <div className="text-gray-500 text-xs mt-0.5">{h.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
          {statusMessage && (
            <div className={`mb-8 p-4 rounded-xl text-center font-medium max-w-3xl mx-auto border ${statusMessage.type === 'success' ? 'bg-green-50 text-green-800 border-green-200' : 'bg-red-50 text-red-800 border-red-200'}`}>
              {statusMessage.text}
            </div>
          )}

          {isPremium && (
            <div className="mb-12 p-6 bg-gradient-to-r from-[#F0FAFC] to-[#E3F1F6] border border-[#B9D0DC] rounded-2xl max-w-3xl mx-auto text-center shadow-sm">
              <span className="inline-flex p-3 bg-[#055B75] text-white rounded-full mb-4">
                <Crown className="w-7 h-7" />
              </span>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">You're a Premium Member!</h2>
              <p className="text-gray-600 mb-1">
                Your subscription is active and renews on {userStatus?.subscription_end_date ? new Date(userStatus.subscription_end_date).toLocaleDateString() : '—'}.
              </p>
              <p className="text-sm font-medium text-[#055B75]">Explore the world with your exclusive benefits.</p>
            </div>
          )}

          {/* Pricing cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto items-stretch">
            {/* Monthly */}
            <div className="bg-white rounded-3xl p-8 border border-gray-200 shadow-sm hover:shadow-lg transition-shadow duration-300 flex flex-col">
              <div className="mb-6">
                <h3 className="text-2xl font-bold text-gray-900 mb-1">Monthly Flexibility</h3>
                <p className="text-gray-500 text-sm">Perfect for occasional travelers looking for quick benefits.</p>
              </div>
              <div className="mb-6 flex items-end gap-1">
                <span className="text-5xl font-extrabold text-[#034457]">$9.99</span>
                <span className="text-gray-500 font-medium mb-2">/month</span>
              </div>
              <ul className="space-y-3.5 mb-8 flex-grow">
                {monthlyBenefits.map((b, i) => (
                  <li key={i} className="flex items-start text-gray-700">
                    <span className="w-5 h-5 rounded-full bg-green-100 text-green-600 flex items-center justify-center mr-3 shrink-0 mt-0.5">
                      <Check size={13} />
                    </span>
                    {b}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => handleSubscribe('premium_monthly', 'Monthly Premium', 9.99)}
                disabled={loading || isMonthlyCurrent}
                className="w-full py-4 px-6 rounded-xl font-bold text-white bg-[#034457] hover:bg-[#055B75] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Processing…' : isMonthlyCurrent ? 'Current Plan' : 'Subscribe Monthly'}
              </button>
            </div>

            {/* Annual (most popular) */}
            <div className="relative rounded-3xl p-8 shadow-2xl flex flex-col text-white md:-translate-y-3"
              style={{ background: 'linear-gradient(155deg, #034457 0%, #055B75 55%, #0890BC 120%)' }}>
              <div className="absolute top-0 right-8 -translate-y-1/2">
                <span className="bg-[#65B3CF] text-[#034457] text-xs font-bold uppercase tracking-widest py-1.5 px-4 rounded-full shadow">
                  Most Popular
                </span>
              </div>
              <div className="mb-6 mt-2">
                <h3 className="text-2xl font-bold mb-1">Annual Jetsetter</h3>
                <p className="text-white/80 text-sm">Ultimate value for regular travelers. Save 20%.</p>
              </div>
              <div className="mb-6 flex items-end gap-1">
                <span className="text-5xl font-extrabold">$95.00</span>
                <span className="text-white/80 font-medium mb-2">/year</span>
              </div>
              <ul className="space-y-3.5 mb-8 flex-grow">
                {annualBenefits.map((b, i) => (
                  <li key={i} className="flex items-start">
                    <span className="w-5 h-5 rounded-full bg-white/20 text-white flex items-center justify-center mr-3 shrink-0 mt-0.5">
                      <Check size={13} />
                    </span>
                    {b}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => handleSubscribe('premium_annual', 'Annual Premium', 95.00)}
                disabled={loading || isAnnualCurrent}
                className="w-full py-4 px-6 rounded-xl font-bold text-[#034457] bg-white hover:bg-gray-100 transition-colors disabled:opacity-90 disabled:cursor-not-allowed shadow-lg"
              >
                {loading ? 'Processing…' : isAnnualCurrent ? 'Current Plan' : 'Subscribe Annually'}
              </button>
            </div>
          </div>

          {/* Trust strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-4xl mx-auto mt-12">
            {[
              { icon: ShieldCheck, label: 'Secure payments', desc: 'SSL-encrypted via ARC Pay' },
              { icon: RefreshCw, label: 'Cancel anytime', desc: 'No long-term lock-in' },
              { icon: Clock, label: '24/7 support', desc: 'We are always here to help' },
            ].map((t, i) => (
              <div key={i} className="flex items-center gap-3 bg-white rounded-2xl border border-gray-100 p-4">
                <span className="w-10 h-10 rounded-full bg-[#055B75]/10 text-[#055B75] flex items-center justify-center shrink-0">
                  <t.icon size={18} />
                </span>
                <div>
                  <div className="font-semibold text-gray-900 text-sm">{t.label}</div>
                  <div className="text-gray-500 text-xs">{t.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Membership;
