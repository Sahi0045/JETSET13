import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Ship, Plane, Package, Hotel } from 'lucide-react';

/**
 * Reusable service switcher tabs (Cruise / Flight / Packages / Hotels).
 * Drop on any service landing page for quick cross-navigation.
 *
 * Props:
 *   active: 'cruise' | 'flight' | 'packages' | 'hotels'
 *   className: optional extra classes for the wrapper
 */
const TABS = [
  { key: 'cruise', label: 'Cruise', Icon: Ship, to: '/cruise' },
  { key: 'flight', label: 'Flight', Icon: Plane, to: '/flights' },
  { key: 'packages', label: 'Packages', Icon: Package, to: '/packages' },
  { key: 'hotels', label: 'Hotels', Icon: Hotel, to: '/hotels' },
];

export default function ServiceTabs({ active, className = '' }) {
  const navigate = useNavigate();

  return (
    <div className={`w-full ${className}`}>
      <div className="flex items-center justify-center gap-1 px-2 sm:px-4 overflow-x-auto hide-scrollbar">
        {TABS.map(({ key, label, Icon, to }) => {
          const isActive = active === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => navigate(to)}
              aria-current={isActive ? 'page' : undefined}
              className={`relative flex flex-col items-center gap-1 px-5 sm:px-8 pb-3 pt-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#055B75]/40 rounded-lg ${isActive ? 'text-[#055B75]' : 'text-gray-500 hover:text-[#055B75]'}`}
            >
              <Icon className="h-6 w-6" strokeWidth={1.75} />
              <span className="relative text-[13px] font-semibold whitespace-nowrap">
                {label}
                {isActive && <span className="absolute -bottom-3 inset-x-0 h-[3px] rounded-full bg-[#055B75]" />}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
