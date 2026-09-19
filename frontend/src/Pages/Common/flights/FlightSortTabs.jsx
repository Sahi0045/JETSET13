import React, { useMemo } from 'react';
import { ArrowUpDown, ChevronDown, ThumbsUp, TrendingDown, Plane } from 'lucide-react';
import Price from '../../../Components/Price';
import { computeBounds, formatMinutes, legMinutes, maxStops, recommendScore, priceOf } from './flightSort';

// The tabs' durations come from flightSort, which reads both "PT2H35M" and the
// search card's "2h 35m". A parser here that knew only the first printed
// "0h 00m" under every tab.

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
      if (maxStops(f) === 0) {
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
    { key: 'price', label: 'Cheapest', Icon: TrendingDown, flight: cheapest, sub: cheapest ? formatMinutes(legMinutes(cheapest)) : '' },
    { key: 'nonstop_first', label: 'Non-stop first', Icon: Plane, flight: nonstop, sub: nonstopCount > 0 ? `${nonstopCount} non-stop` : 'None today' },
    { key: 'recommended', label: 'Best overall', Icon: ThumbsUp, flight: recommended, sub: recommended ? formatMinutes(legMinutes(recommended)) : '' },
  ];

  const otherSelect = (extraClass = '') => (
    <div className={`relative ${extraClass}`}>
      <select
        value={isOtherActive ? sortOrder : ''}
        onChange={(e) => e.target.value && onSortChange(e.target.value)}
        className={`appearance-none cursor-pointer w-full pl-8 pr-8 py-3 bg-white border rounded-2xl text-[13px] font-semibold focus:outline-none focus:ring-2 focus:ring-[#65B3CF] transition-all ${
          isOtherActive ? 'border-[#055B75] text-[#055B75]' : 'border-[#EFE9DD] text-gray-600 hover:border-[#B9D0DC]'
        }`}
      >
        <option value="" disabled hidden>Sort by…</option>
        {OTHER_SORTS.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ArrowUpDown className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
    </div>
  );

  return (
    <div className="mb-5">
      {/* Tabs: horizontal scroll on mobile (full labels), equal-width row on desktop */}
      <div className="flex items-stretch gap-2.5 overflow-x-auto sm:overflow-visible hide-scrollbar snap-x">
        {tabs.map(({ key, label, Icon, flight, sub }) => {
          const active = sortOrder === key;
          const disabled = !flight;
          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              onClick={() => onSortChange(key)}
              className={`flex-shrink-0 w-[62%] sm:w-auto sm:flex-1 snap-start text-left px-4 py-3 rounded-2xl border bg-white transition-all ${
                active ? 'border-[#055B75] shadow-[inset_0_0_0_1px_#055B75]' : 'border-[#EFE9DD] hover:border-[#B9D0DC]'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${active ? 'text-[#055B75]' : 'text-gray-400'}`} />
                <span className={`text-[11px] font-bold uppercase tracking-[0.12em] whitespace-nowrap ${active ? 'text-[#055B75]' : 'text-gray-500'}`}>
                  {label}
                </span>
              </div>
              <div className="flex items-baseline gap-2 whitespace-nowrap">
                <span className="font-grotesk text-lg font-semibold text-ink tracking-tight">
                  {flight ? <Price amount={flight.price} /> : '—'}
                </span>
                {sub && <span className="text-[12px] text-gray-500">{sub}</span>}
              </div>
            </button>
          );
        })}

        {/* Other sort dropdown – inline on desktop only */}
        <div className="hidden sm:flex items-center flex-shrink-0">
          {otherSelect()}
        </div>
      </div>

      {/* Other sort dropdown – own full-width row on mobile */}
      <div className="sm:hidden mt-2.5">
        {otherSelect('w-full')}
      </div>
    </div>
  );
}

export default React.memo(FlightSortTabs);
