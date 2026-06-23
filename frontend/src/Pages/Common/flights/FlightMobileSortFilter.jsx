import React, { useMemo } from 'react';
import { SlidersHorizontal } from 'lucide-react';

const SORT_PILLS = [
  { key: 'price', label: 'Cheapest' },
  { key: 'nonstop_first', label: 'Non-stop' },
  { key: 'duration', label: 'Fastest' },
  { key: 'recommended', label: 'Recommended' },
];

/**
 * Compact single-line filter + sort bar for mobile.
 * Combines the filter drawer trigger (with an active-filter count) and the
 * sort options into one subtle horizontally-scrollable row.
 * Design aligned with the Stitch "Atmospheric Horizon" mobile spec:
 * white Filters pill with a solid teal count badge, and solid-teal filled
 * pills for the active sort.
 */
function FlightMobileSortFilter({ filters, priceRangeBounds, sortOrder, onSortChange, onOpenFilters }) {
  const activeCount = useMemo(() => {
    if (!filters) return 0;
    let n = 0;
    if (filters.stops && filters.stops !== 'any') n += 1;
    if (filters.departureTime && filters.departureTime !== 'any') n += 1;
    if (filters.baggage && filters.baggage !== 'any') n += 1;
    if (filters.refundable && filters.refundable !== 'any') n += 1;
    n += (filters.airlines || []).length;
    n += (filters.originAirports || []).length;
    n += (filters.destAirports || []).length;
    if (
      priceRangeBounds &&
      Array.isArray(filters.price) &&
      (filters.price[0] > priceRangeBounds.min || filters.price[1] < priceRangeBounds.max)
    ) {
      n += 1;
    }
    return n;
  }, [filters, priceRangeBounds]);

  return (
    <div className="md:hidden -mx-4 mb-3">
      <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar px-4 py-0.5">
        {/* Filters trigger — stays white, count communicated by the badge */}
        <button
          type="button"
          onClick={onOpenFilters}
          className="flex-shrink-0 inline-flex items-center gap-1.5 pl-3 pr-2.5 py-2 rounded-full border border-[#B9D0DC] bg-white text-[#055B75] text-xs font-semibold shadow-sm active:scale-95 transition-transform"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filters
          {activeCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[#055B75] text-white text-[10px] font-bold leading-none">
              {activeCount}
            </span>
          )}
        </button>

        {/* Divider */}
        <span className="flex-shrink-0 h-6 w-px bg-gray-200" />

        {/* Sort pills — solid teal fill when active */}
        {SORT_PILLS.map(({ key, label }) => {
          const active = sortOrder === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSortChange(key)}
              className={`flex-shrink-0 inline-flex items-center px-4 py-2 rounded-full border text-xs font-semibold whitespace-nowrap active:scale-95 transition-all ${
                active
                  ? 'bg-[#055B75] border-[#055B75] text-white shadow-md'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-[#B9D0DC]'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default React.memo(FlightMobileSortFilter);
