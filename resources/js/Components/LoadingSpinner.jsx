import React from 'react';
import { Plane } from 'lucide-react';

const LoadingSpinner = ({ text = "Loading...", fullScreen = false, className = "" }) => {
    const containerClasses = fullScreen
        ? "fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm"
        : `flex flex-col items-center justify-center p-8 ${className}`;

    return (
        <div className={containerClasses} role="status" aria-label={text}>
            {/* Animated Orbit Container */}
            <div className="relative w-24 h-24">
                {/* Outer Ring - Static with pulse */}
                <div className="absolute inset-0 rounded-full border-4 border-primary-100 opacity-30 animate-pulse"></div>

                {/* Middle Ring - Spinning slowly */}
                <div className="absolute inset-2 rounded-full border-4 border-t-primary-500 border-r-transparent border-b-primary-200 border-l-transparent animate-spin-slow"></div>

                {/* Inner Circle with Plane */}
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="relative">
                        {/* Pulsing background for plane */}
                        <div className="absolute inset-0 bg-primary-50 rounded-full scale-150 animate-ping opacity-20"></div>
                        <div className="relative bg-white rounded-full p-3 shadow-lg z-10">
                            <Plane className="w-8 h-8 text-primary-600 animate-bounce-gentle" />
                        </div>
                    </div>
                </div>

                {/* Orbiting Dot */}
                <div className="absolute inset-0 animate-spin-reverse-slower">
                    <div className="h-full w-full relative">
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 -mt-1 w-3 h-3 bg-secondary-400 rounded-full shadow-sm"></div>
                    </div>
                </div>
            </div>

            {/* Loading Text */}
            {text && (
                <div className="mt-8 flex flex-col items-center space-y-2">
                    <h3 className="text-lg font-medium text-gray-800 tracking-wide animate-pulse">
                        {text}
                    </h3>
                    <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-primary-400 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
                        <div className="w-2 h-2 bg-primary-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                        <div className="w-2 h-2 bg-primary-600 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                    </div>
                </div>
            )}

            <style>{`
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes spin-reverse-slower {
          from { transform: rotate(360deg); }
          to { transform: rotate(0deg); }
        }
        .animate-spin-slow {
          animation: spin-slow 3s linear infinite;
        }
        .animate-spin-reverse-slower {
          animation: spin-reverse-slower 6s linear infinite;
        }
        .animate-bounce-gentle {
          animation: bounceGentle 2s infinite;
        }
        @keyframes bounceGentle {
          0%, 100% { transform: translateY(-10%); }
          50% { transform: translateY(10%); }
        }
      `}</style>
        </div>
    );
};

export default LoadingSpinner;
