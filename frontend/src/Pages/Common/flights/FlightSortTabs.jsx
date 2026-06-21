import React, { useMemo } from 'react';
import { ArrowUpDown, ChevronDown, ThumbsUp, TrendingDown, Plane } from 'lucide-react';
import Price from '../../../Components/Price';
import { computeBounds, recommendScore, priceOf } from './flightSort';

const fmtDuration = (durationStr) => {
  if (!durationStr) return '';
  const h = durationStr.match(/(\d+)H/);
  const m = durationStr.match(/(\d+)M/);
  return `${h ? parseInt(h[1], 10) : 0}h ${String(m ? parseInt(m[1], 10) : 0).padStart(2, '0')}m`;
};

const OTHER_SORTS = [
  { value: 'duration', label: 'Fastest' },
  { value: '-price', label: 'Price – High to Low' },
  { value: 'departure', label: 'Departure – Earliest' },
  { value: 'arrival', label: 'Arrival – Earliest' },
];

function FlightSortTabs({ flights = [], sortOrder, onSortChange }) {
  const { cheapest, nonstop, recommended, nonstopCount } = useMemo(() => {
    let cheapest = null, nonstop = null, recommended = null, nonstopCount = 0;
    const bounds = computeBounds(flights);
    let bestScore = Infinity;
    flights.forEach((f) => {
      if (!cheapest || priceOf(f) < priceOf(cheapest)) cheapest = f;
      if (f.stops === 0) {
        nonstopCount += 1;
        if (!nonstop || priceOf(f) < priceOf(nonstop)) nonstop = f;
      }
      const score = recommendScore(f, bounds);
      if (score < bestScore) { bestScore = score; recommended = f; }
    });
    return { cheapest, nonstop, recommended, nonstopCount };
  }, [flights]);

  const isOtherActive = OTHER_SORTS.some(o => o.value === sortOrder);

  const tabs = [
    { key: 'price', label: 'CHEAPEST', Icon: TrendingDown, flight: cheapest, sub: cheapest ? fmtDuration(cheapest.duration) : '' },
    { key: 'nonstop_first', label: 'NON STOP FIRST', Icon: Plane, flight: nonstop, sub: nonstopCount > 0 ? `${nonstopCount} available` : 'None' },
    { key: 'recommended', label: 'YOU MAY PREFER', Icon: ThumbsUp, flight: recommended, sub: recommended ? fmtDuration(recommended.duration) : '' },
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-5">
      <div className="flex items-stretch divide-x divide-gray-100">
        {tabs.map(({ key, label, Icon, flight, sub }) => {
          const active = sortOrder === key;
          const disabled = !flight;
          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              onClick={() => onSortChange(key)}
              className={`flex-1 min-w-0 text-left px-3 sm:px-4 py-3 transition-colors relative ${
                active ? 'bg-[#F0FAFC]' : 'hover:bg-gray-50'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {active && <span className="absolute top-0 left-0 right-0 h-1 bg-[#055B75]" />}
              <div className="flex items-center gap-1.5 mb-0.5">
                <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${active ? 'text-[#055B75]' : 'text-gray-400'}`} />
                <span className={`text-[11px] font-bold tracking-wide truncate ${active ? 'text-[#055B75]' : 'text-gray-500'}`}>
                  {label}
                </span>
              </div>
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-sm sm:text-base font-bold text-gray-900">
                  {flight ? <Price amount={flight.price} /> : '—'}
                </span>
                {sub && <span className="text-[11px] text-gray-400">{sub}</span>}
              </div>
            </button>
          );
        })}

        {/* Other sort dropdown */}
        <div className="flex items-center px-2 sm:px-3 flex-shrink-0">
          <div className="relative">
            <select
              value={isOtherActive ? sortOrder : ''}
              onChange={(e) => e.target.value && onSortChange(e.target.value)}
              className={`appearance-none cursor-pointer pl-7 pr-7 py-2 bg-white border rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#65B3CF] transition-all ${
                isOtherActive ? 'border-[#055B75] text-[#055B75]' : 'border-gray-200 text-gray-600 hover:border-[#B9D0DC]'
              }`}
            >
              <option value="" disabled hidden>OTHER</option>
              {OTHER_SORTS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <ArrowUpDown className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default React.memo(FlightSortTabs);
