"use client"

import React, { useState, useEffect } from 'react';
import { Mail, Check, AlertCircle } from 'lucide-react';
import { subscriptionAirplane } from "./data.js"
import supabase from '../../../lib/supabase';

export default function SubscribeSection() {
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [stats, setStats] = useState({
    totalSubscribers: 2500,
    subscribersToday: 0,
    avatars: []
  });

  useEffect(() => {
    // Fetch subscription stats when component mounts
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      // Use mocked data for now, or connect to real API
      // In production, you would uncomment this code to fetch real data
      /*
      const response = await axios.get('/api/subscriptions/stats');
      if (response.data && response.data.success) {
        setStats(response.data.data);
      }
      */

      // For demo purposes, use static data
      setStats({
        totalSubscribers: 2500,
        subscribersToday: Math.floor(Math.random() * 100) + 10,
        avatars: [
          { id: 1, image_url: 'https://randomuser.me/api/portraits/men/32.jpg' },
          { id: 2, image_url: 'https://randomuser.me/api/portraits/women/44.jpg' },
          { id: 3, image_url: 'https://randomuser.me/api/portraits/men/67.jpg' },
          { id: 4, image_url: 'https://randomuser.me/api/portraits/women/28.jpg' }
        ]
      });
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  };

  const validateEmail = (email) => {
    return email.match(/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Reset states
    setError('');
    setSuccess(false);

    // Validate email
    if (!email) {
      setError('Please enter your email address');
      return;
    }

    if (!validateEmail(email)) {
      setError('Please enter a valid email address');
      return;
    }

    // Validate consent
    if (!consent) {
      setError('You must agree to receive promotional emails');
      return;
    }

    setLoading(true);

    try {
      // Save to Supabase subscriptions table
      const { data, error: supabaseError } = await supabase
        .from('subscriptions')
        .insert([
          { email: email, status: 'active' }
        ]);

      if (supabaseError) {
        if (supabaseError.code === '23505') { // Unique violation - duplicate email
          setError('This email is already subscribed.');
        } else {
          setError('Failed to subscribe. Please try again.');
          console.error('Supabase error:', supabaseError);
        }
        return;
      }

      setSuccess(true);
      setEmail('');
      setConsent(false);
      // Update the subscriber count
      setStats(prev => ({
        ...prev,
        totalSubscribers: prev.totalSubscribers + 1,
        subscribersToday: prev.subscribersToday + 1
      }));

      // Reset success message after 3 seconds
      setTimeout(() => {
        setSuccess(false);
      }, 3000);
    } catch (err) {
      console.error('Subscription error:', err);
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="bg-[url('https://images.unsplash.com/photo-1503220317375-aaad61436b1b?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center rounded-xl overflow-hidden shadow-2xl relative">
        {/* Overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#055B75]/95 to-[#034457]/90 backdrop-blur-sm"></div>

        {/* Content container */}
        <div className="relative z-10 p-8 md:p-10">
          {/* Cloud elements */}
          <div className="absolute top-0 left-0 w-full">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 320" className="text-white/10">
              <path fill="currentColor" d="M0,192L48,176C96,160,192,128,288,133.3C384,139,480,181,576,197.3C672,213,768,203,864,186.7C960,171,1056,149,1152,149.3C1248,149,1344,171,1392,181.3L1440,192L1440,0L1392,0C1344,0,1248,0,1152,0C1056,0,960,0,864,0C768,0,672,0,576,0C480,0,384,0,288,0C192,0,96,0,48,0L0,0Z"></path>
            </svg>
          </div>

          <div className="flex flex-col md:flex-row items-center gap-8">
            {/* Left side - promotional content */}
            <div className="md:w-1/2 text-white">
              <div className="inline-block mb-4 bg-[#65B3CF] text-white px-3 py-0.5 rounded-full font-bold text-xs shadow-lg transform -rotate-2">
                EXCLUSIVE OFFER
              </div>

              <h2 className="text-3xl md:text-4xl font-extrabold mb-4 leading-tight drop-shadow-md">
                GET <span className="text-[#B9D0DC]">10% OFF</span> ON YOUR NEXT FLIGHT!
              </h2>

              <div className="flex gap-4 mb-6 flex-wrap text-sm">
                <div className="flex items-center">
                  <div className="bg-white/20 p-1.5 rounded-full mr-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <span>Limited time</span>
                </div>
                <div className="flex items-center">
                  <div className="bg-white/20 p-1.5 rounded-full mr-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <span>Secure</span>
                </div>
              </div>

              <div className="bg-white/10 p-6 rounded-xl backdrop-blur-sm border border-white/20 relative overflow-hidden">
                <div className="absolute -right-6 -top-6 bg-[#65B3CF]/20 h-24 w-24 rounded-full blur-xl"></div>

                <p className="text-base mb-4 text-left">
                  Join <span className="font-bold text-[#65B3CF]">{stats.totalSubscribers.toLocaleString()}</span> travelers for best deals:
                </p>

                <ul className="mb-2 space-y-2 text-sm pl-0 list-none">
                  <li className="flex items-start">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-[#65B3CF] mr-3 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-left">Flash sales & seasonal offers</span>
                  </li>
                  <li className="flex items-start">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-[#65B3CF] mr-3 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-left">Member-only discounts</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Right side - form */}
            <div className="md:w-1/2 w-full">
              {success ? (
                <div className="bg-slate-50/95 backdrop-blur-sm border border-[#65B3CF]/20 rounded-xl shadow-2xl p-6 relative overflow-hidden">
                  <div className="absolute -left-12 -top-12 bg-[#055B75]/10 h-32 w-32 rounded-full blur-xl"></div>
                  {/* Success state (kept simple) */}
                  {/* ... */}
                </div>
              ) : (
                <div className="bg-slate-50/95 backdrop-blur-sm border border-[#65B3CF]/20 rounded-xl shadow-2xl p-6 relative overflow-hidden">
                  <div className="absolute -left-12 -top-12 bg-[#055B75]/10 h-32 w-32 rounded-full blur-xl"></div>
                  <div className="absolute -right-12 -bottom-12 bg-[#65B3CF]/10 h-32 w-32 rounded-full blur-xl"></div>

                  <div className="flex items-center mb-6 pl-1">
                    {subscriptionAirplane && subscriptionAirplane.startsWith('M') ? (
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 text-[#055B75] mr-3" viewBox="0 0 24 24" fill="currentColor">
                        <path d={subscriptionAirplane} />
                      </svg>
                    ) : (
                      <img
                        src={subscriptionAirplane || "https://images.unsplash.com/photo-1556388158-158ea5ccacbd?q=80&w=320&auto=format&fit=crop"}
                        alt="Airplane"
                        className="w-10 h-10 object-contain mr-3"
                      />
                    )}
                    <h3 className="text-xl font-bold text-gray-800">Subscribe & Save</h3>
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                    <div>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 h-4 w-4" />
                        <input
                          type="email"
                          placeholder="Enter your email"
                          className={`w-full pl-9 pr-4 py-3 text-sm border ${error ? 'border-red-500' : 'border-gray-200 bg-gray-50/50'} rounded-lg focus:outline-none focus:ring-2 focus:ring-[#055B75] transition-all`}
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          disabled={loading || success}
                        />
                      </div>
                      {error && (
                        <p className="mt-1 text-xs text-red-600 flex items-center">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          {error}
                        </p>
                      )}
                    </div>

                    <div className="flex items-start">
                      <div className="flex items-center h-4">
                        <input
                          id="consent"
                          type="checkbox"
                          className="w-3.5 h-3.5 text-[#055B75] border-gray-300 rounded focus:ring-[#055B75]"
                          checked={consent}
                          onChange={(e) => setConsent(e.target.checked)}
                          disabled={loading || success}
                        />
                      </div>
                      <div className="ml-2 text-xs">
                        <label htmlFor="consent" className="font-medium text-gray-600">
                          I agree to receive emails. View <a href="#" className="text-[#055B75] hover:underline">Terms</a> & <a href="#" className="text-[#055B75] hover:underline">Privacy</a>.
                        </label>
                      </div>
                    </div>

                    <button
                      type="submit"
                      className={`w-full py-4 rounded-xl font-bold text-lg relative overflow-hidden transition-all ${email && consent
                        ? "bg-gradient-to-r from-[#055B75] to-[#034457] text-white shadow-lg hover:shadow-[#055B75]/30 hover:scale-[1.02]"
                        : "bg-gray-200 text-gray-400 cursor-not-allowed"
                        }`}
                      disabled={!email || !consent}
                    >
                      <span className="relative z-10">GET 10% OFF MY NEXT FLIGHT</span>
                      {email && consent && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-full h-full bg-gradient-to-r from-[#055B75] to-[#044A5F] absolute"></div>
                          <div className="w-32 h-32 bg-white/20 rounded-full absolute blur-xl"></div>
                        </div>
                      )}
                    </button>
                  </form>

                  <div className="flex items-center justify-center mt-6">
                    <div className="flex -space-x-2 mr-3">
                      {stats.avatars.map((avatar, index) => (
                        <div key={avatar.id || index} className="w-8 h-8 rounded-full border-2 border-white overflow-hidden">
                          <img
                            src={avatar.image_url}
                            alt={`Subscriber ${index + 1}`}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ))}
                    </div>
                    <div className="text-sm text-gray-500">
                      <span className="font-bold text-gray-700">
                        {stats.subscribersToday.toLocaleString()}+
                      </span> travelers joined today
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Airplane path decoration */}
          <div className="absolute left-0 bottom-5 w-full overflow-hidden opacity-20">
            <svg viewBox="0 0 1200 120" xmlns="http://www.w3.org/2000/svg" className="text-white">
              <path d="M985.66 92.83C906.67 72 823.78 31 743.84 14.19c-82.26-17.34-168.06-16.33-250.45.39-57.84 11.73-114 31.07-172 41.86A600.21 600.21 0 0 1 0 27.35V120h1200V95.8c-67.81 23.12-144.29 15.51-214.34-2.97Z" fill="currentColor"></path>
            </svg>
          </div>
        </div>
      </div>
    </div>
  )
}
