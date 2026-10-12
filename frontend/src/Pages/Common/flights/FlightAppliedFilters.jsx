import React from 'react';
import { X } from 'lucide-react';
import currencyService from '../../../Services/CurrencyService';
import { WHOLE_DAY, clockLabel, hoursLabel } from './searchResults';

const STOP_LABELS = ['Direct', '1 stop', '2+ stops'];
const BAGGAGE_LABELS = { included: 'Checked bag included', cabin_only: 'Cabin bag only' };
const REFUND_LABELS = { yes: 'Refundable', no: 'Non-refundable' };

const isNarrowed = (range) => Array.isArray(range) && (range[0] > WHOLE_DAY[0] || range[1] < WHOLE_DAY[1]);

function FlightAppliedFilters({ filters, priceRangeBounds, onFilterChange, onToggleAirline, onToggleAirport, onResetAll }) {
  const sym = currencyService.getCurrencySymbol();
  const chips = [];

  (filters.stops || []).forEach((value) => {
    chips.push({ key: `stops-${value}`, label: STOP_LABELS[value], clear: () => onFilterChange('stops', filters.stops.filter((v) => v !== value)) });
  });
  if (isNarrowed(filters.outboundTimes)) {
    chips.push({
      key: 'outbound',
      label: `Departs ${clockLabel(filters.outboundTimes[0])}–${clockLabel(filters.outboundTimes[1])}`,
      clear: () => onFilterChange('outboundTimes', [...WHOLE_DAY]),
    });
  }
  if (isNarrowed(filters.returnTimes)) {
    chips.push({
      key: 'return',
      label: `Return ${clockLabel(filters.returnTimes[0])}–${clockLabel(filters.returnTimes[1])}`,
      clear: () => onFilterChange('returnTimes', [...WHOLE_DAY]),
    });
  }
  if (filters.maxJourney != null) {
    chips.push({ key: 'journey', label: `Journey up to ${hoursLabel(filters.maxJourney)}`, clear: () => onFilterChange('maxJourney', null) });
  }
  if (filters.maxLayover != null) {
    chips.push({ key: 'layover', label: `Layover up to ${hoursLabel(filters.maxLayover)}`, clear: () => onFilterChange('maxLayover', null) });
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
