import React from 'react';
import { Plane, Globe } from 'lucide-react';

const LoadingSpinner = ({ text = "Loading...", fullScreen = false, className = "" }) => {
  const containerClasses = fullScreen
    ? "fixed inset-0 z-[999] flex flex-col items-center justify-center"
    : `flex flex-col items-center justify-center p-8 ${className}`;

  return (
    <div className={containerClasses} role="status" aria-label={text}>
      {/* Professional Background with Ocean Theme */}
      {fullScreen && (
        <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-white to-[#B9D0DC]/20">
          {/* Subtle animated gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#055B75]/5 to-transparent animate-gradient-shift" />
          {/* Decorative elements */}
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#65B3CF]/10 rounded-full blur-3xl animate-pulse-slow" />
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-[#055B75]/10 rounded-full blur-3xl animate-pulse-slow-delay" />
        </div>
      )}

      {/* Main Loading Container */}
      <div className="relative z-10 flex flex-col items-center">
        {/* Premium Loader Animation */}
        <div className="relative w-32 h-32 mb-8">
          {/* Outer gradient ring - Static with glow */}
          <div className="absolute inset-0 rounded-full border-4 border-[#B9D0DC]/50 shadow-lg" />

          {/* Elegant arc spinner - Primary animation */}
          <div className="absolute inset-1 rounded-full">
            <svg className="w-full h-full animate-spin-medium" viewBox="0 0 100 100">
              <defs>
                <linearGradient id="spinnerGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#055B75" stopOpacity="1" />
                  <stop offset="50%" stopColor="#65B3CF" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="#055B75" stopOpacity="0.1" />
                </linearGradient>
              </defs>
              <circle
                cx="50"
                cy="50"
                r="42"
                stroke="url(#spinnerGradient)"
                strokeWidth="5"
                fill="none"
                strokeLinecap="round"
                strokeDasharray="180 80"
              />
            </svg>
          </div>

          {/* Secondary inner ring - Counter rotation */}
          <div className="absolute inset-5 rounded-full">
            <svg className="w-full h-full animate-spin-reverse" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="40"
                stroke="#65B3CF"
                strokeWidth="3"
                fill="none"
                strokeLinecap="round"
                strokeDasharray="40 60"
                opacity="0.6"
              />
            </svg>
          </div>

          {/* Center logo container */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative">
              {/* Glow effect */}
              <div className="absolute inset-0 bg-[#65B3CF]/30 rounded-full blur-lg scale-125" />

              {/* Logo container with glassmorphism */}
              <div className="relative bg-white/95 backdrop-blur-sm rounded-full p-4 shadow-xl border border-[#B9D0DC]/50">
                <Plane
                  className="w-8 h-8 text-[#055B75] animate-plane-float"
                  style={{ transform: 'rotate(-45deg)' }}
                />
              </div>
            </div>
          </div>

          {/* Orbiting globe element */}
          <div className="absolute inset-0 animate-orbit">
            <div className="absolute -top-1.5 left-1/2 -translate-x-1/2">
              <div className="relative">
                <div className="absolute inset-0 bg-[#65B3CF] rounded-full blur-sm animate-pulse" />
                <div className="relative bg-[#055B75] rounded-full p-1">
                  <Globe className="w-3.5 h-3.5 text-white" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Brand Text */}
        <div className="text-center mb-6">
          <h3 className="text-2xl font-bold tracking-wide animate-gradient-text"
            style={{
              background: 'linear-gradient(135deg, #055B75, #65B3CF, #055B75)',
              backgroundSize: '200% 200%',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text'
            }}>
            JetSetters
          </h3>
          <div className="h-0.5 w-20 mx-auto mt-2 bg-gradient-to-r from-transparent via-[#055B75] to-transparent rounded-full" />
        </div>

        {/* Loading message with elegant animation */}
        {text && (
          <div className="flex flex-col items-center space-y-4">
            <p className="text-[#626363] text-lg font-medium tracking-wide animate-fade-in-out">
              {text}
            </p>

            {/* Progress dots with brand colors */}
            <div className="flex items-center space-x-2.5">
              <div
                className="w-2.5 h-2.5 rounded-full animate-progress-dot shadow-sm"
                style={{ backgroundColor: '#055B75', animationDelay: '0s' }}
              />
              <div
                className="w-2.5 h-2.5 rounded-full animate-progress-dot shadow-sm"
                style={{ backgroundColor: '#65B3CF', animationDelay: '0.15s' }}
              />
              <div
                className="w-2.5 h-2.5 rounded-full animate-progress-dot shadow-sm"
                style={{ backgroundColor: '#B9D0DC', animationDelay: '0.3s' }}
              />
              <div
                className="w-2.5 h-2.5 rounded-full animate-progress-dot shadow-sm"
                style={{ backgroundColor: '#7F8073', animationDelay: '0.45s' }}
              />
            </div>
          </div>
        )}
      </div>

      <style>{`
                @keyframes spin-medium {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                @keyframes spin-reverse {
                    from { transform: rotate(360deg); }
                    to { transform: rotate(0deg); }
                }
                @keyframes orbit {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                @keyframes plane-float {
                    0%, 100% { 
                        transform: rotate(-45deg) translateY(-2px); 
                    }
                    50% { 
                        transform: rotate(-45deg) translateY(2px); 
                    }
                }
                @keyframes gradient-shift {
                    0%, 100% { 
                        transform: translateX(-100%); 
                        opacity: 0;
                    }
                    50% { 
                        transform: translateX(100%); 
                        opacity: 1;
                    }
                }
                @keyframes pulse-slow {
                    0%, 100% { 
                        opacity: 0.3;
                        transform: scale(1);
                    }
                    50% { 
                        opacity: 0.6;
                        transform: scale(1.05);
                    }
                }
                @keyframes fade-in-out {
                    0%, 100% { opacity: 0.6; }
                    50% { opacity: 1; }
                }
                @keyframes progress-dot {
                    0%, 100% { 
                        transform: scale(0.7);
                        opacity: 0.4;
                    }
                    50% { 
                        transform: scale(1.3);
                        opacity: 1;
                    }
                }
                @keyframes gradient-text {
                    0%, 100% { background-position: 0% 50%; }
                    50% { background-position: 100% 50%; }
                }
                .animate-spin-medium {
                    animation: spin-medium 1.8s linear infinite;
                }
                .animate-spin-reverse {
                    animation: spin-reverse 2.5s linear infinite;
                }
                .animate-orbit {
                    animation: orbit 6s linear infinite;
                }
                .animate-plane-float {
                    animation: plane-float 1.5s ease-in-out infinite;
                }
                .animate-gradient-shift {
                    animation: gradient-shift 5s ease-in-out infinite;
                }
                .animate-pulse-slow {
                    animation: pulse-slow 4s ease-in-out infinite;
                }
                .animate-pulse-slow-delay {
                    animation: pulse-slow 4s ease-in-out infinite;
                    animation-delay: 2s;
                }
                .animate-fade-in-out {
                    animation: fade-in-out 2.5s ease-in-out infinite;
                }
                .animate-progress-dot {
                    animation: progress-dot 1.2s ease-in-out infinite;
                }
                .animate-gradient-text {
                    animation: gradient-text 3s ease infinite;
                }
            `}</style>
    </div>
  );
};

export default LoadingSpinner;
