import React from 'react';
import { X } from 'lucide-react';
import currencyService from '../../../Services/CurrencyService';

const STOP_LABELS = { '0': 'Non-stop', '1': 'Up to 1 stop', '2': '2+ stops' };
const TIME_LABELS = {
  early_morning: 'Before 6 AM',
  morning: 'Morning 6AM–12PM',
  afternoon: 'Afternoon 12–6PM',
  evening: 'Evening 6–9PM',
  night: 'Night after 9PM',
};
const BAGGAGE_LABELS = { included: 'With check-in baggage', cabin_only: 'Cabin baggage only' };
const REFUND_LABELS = { yes: 'Refundable', no: 'Non-refundable' };

function FlightAppliedFilters({ filters, priceRangeBounds, onFilterChange, onToggleAirline, onToggleAirport, onResetAll }) {
  const sym = currencyService.getCurrencySymbol();
  const chips = [];

  if (filters.stops !== 'any') {
    chips.push({ key: 'stops', label: STOP_LABELS[filters.stops] || filters.stops, clear: () => onFilterChange('stops', 'any') });
  }
  if (filters.departureTime !== 'any') {
    chips.push({ key: 'depart', label: TIME_LABELS[filters.departureTime] || filters.departureTime, clear: () => onFilterChange('departureTime', 'any') });
  }
  if (filters.baggage !== 'any') {
    chips.push({ key: 'baggage', label: BAGGAGE_LABELS[filters.baggage] || filters.baggage, clear: () => onFilterChange('baggage', 'any') });
  }
  if (filters.refundable !== 'any') {
    chips.push({ key: 'refundable', label: REFUND_LABELS[filters.refundable] || filters.refundable, clear: () => onFilterChange('refundable', 'any') });
  }
  (filters.airlines || []).forEach((a) => {
    chips.push({ key: `air-${a}`, label: a, clear: () => onToggleAirline(a) });
  });
  (filters.originAirports || []).forEach((c) => {
    chips.push({ key: `org-${c}`, label: `From ${c}`, clear: () => onToggleAirport?.('origin', c) });
  });
  (filters.destAirports || []).forEach((c) => {
    chips.push({ key: `dst-${c}`, label: `To ${c}`, clear: () => onToggleAirport?.('dest', c) });
  });

  const priceChanged =
    priceRangeBounds &&
    (filters.price[0] > priceRangeBounds.min || filters.price[1] < priceRangeBounds.max);
  if (priceChanged) {
    chips.push({
      key: 'price',
      label: `${sym}${Math.round(filters.price[0]).toLocaleString()} – ${sym}${Math.round(filters.price[1]).toLocaleString()}`,
      clear: () => onFilterChange('price', [priceRangeBounds.min, priceRangeBounds.max]),
    });
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap mb-3">
      <span className="text-xs font-semibold text-gray-500">Applied:</span>
      {chips.map((c) => (
        <button
          key={c.key}
          onClick={c.clear}
          className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full bg-white border border-[#B9D0DC] text-[#055B75] text-xs font-medium hover:bg-[#F0FAFC] transition-colors"
        >
          {c.label}
          <X className="h-3 w-3" />
        </button>
      ))}
      <button
        onClick={onResetAll}
        className="text-xs font-semibold text-gray-500 hover:text-[#055B75] hover:underline ml-1"
      >
        Clear all
      </button>
    </div>
  );
}

export default React.memo(FlightAppliedFilters);
