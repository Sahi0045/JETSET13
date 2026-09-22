import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import currencyService from '../../../Services/CurrencyService';
import Price from '../../../Components/Price';
import { priceStep } from './searchResults';

/**
 * The filters, as a row above the results rather than a column beside them.
 *
 * The rail took a third of the page for controls that are used once and then
 * ignored, and pushed the flights into a narrow column. Everything here calls
 * exactly the same handlers the sidebar does - this is where the filters are
 * shown, not what they do. The sidebar stays for the phone drawer.
 */

const DEPARTURE_TIMES = [
  { value: 'early_morning', label: 'Before 6 am' },
  { value: 'morning', label: '6 am – 12 pm' },
  { value: 'afternoon', label: '12 pm – 6 pm' },
  { value: 'evening', label: '6 pm – 9 pm' },
];

const STOP_OPTIONS = [
  { value: 'any', label: 'Any number of stops' },
  { value: '0', label: 'Non-stop only' },
  { value: '1', label: 'Up to 1 stop' },
  { value: '2', label: '2+ stops' },
];

const BAGGAGE_OPTIONS = [
  { value: 'any', label: 'Any fare' },
  { value: 'included', label: 'Check-in bag included' },
  { value: 'cabin_only', label: 'Cabin bag only' },
];

function Pill({ id, label, active, openId, setOpenId, children, wide }) {
  const isOpen = openId === id;
  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={(e) => { e.stopPropagation(); setOpenId(isOpen ? null : id); }}
        className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-[13.5px] transition-colors ${
          active
            ? 'bg-[#055B75] border-[#055B75] text-white font-bold'
            : 'bg-white border-[#E6DFD2] text-ink hover:border-[#055B75]'
        }`}
      >
        {label}
        <ChevronDown className={`h-3.5 w-3.5 ${active ? 'text-white/70' : 'text-gray-400'}`} />
      </button>

      {isOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          className={`absolute top-[calc(100%+8px)] left-0 z-50 ${wide ? 'w-[340px]' : 'w-[300px]'} max-w-[88vw]
                      rounded-2xl border border-[#E6DFD2] bg-white p-4 shadow-[0_26px_50px_-28px_rgba(12,42,51,0.55)]`}
        >
          {children}
        </div>
      )}
    </div>
  );
}

const Heading = ({ children }) => (
  <h4 className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-gray-400">{children}</h4>
);

function FlightFilterBar({
  filters,
  priceRangeBounds,
  airlines = [],
  airlineStats,
  onFilterChange,
  onToggleAirline,
  onResetAll,
  resultCount,
}) {
  const [openId, setOpenId] = useState(null);
  const barRef = useRef(null);
  const currencySymbol = currencyService.getCurrencySymbol();
  const step = priceStep(priceRangeBounds.max);

  // One panel at a time, and a click anywhere else closes it.
  useEffect(() => {
    const away = () => setOpenId(null);
    const escape = (e) => { if (e.key === 'Escape') setOpenId(null); };
    document.addEventListener('click', away);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('click', away);
      document.removeEventListener('keydown', escape);
    };
  }, []);

  const stopsActive = filters.stops !== 'any';
  const timeActive = filters.departureTime !== 'any';
  const priceActive = filters.price[0] > priceRangeBounds.min || filters.price[1] < priceRangeBounds.max;
  const airlinesActive = filters.airlines.length > 0;
  const bagActive = filters.baggage !== 'any';
  const refundActive = filters.refundable === 'yes';
  const anyActive = stopsActive || timeActive || priceActive || airlinesActive || bagActive || refundActive;

  const stopsLabel = STOP_OPTIONS.find((o) => o.value === filters.stops)?.label || 'Stops';
  const timeLabel = timeActive
    ? DEPARTURE_TIMES.find((t) => t.value === filters.departureTime)?.label
    : 'Departure time';

  return (
    <div ref={barRef} className="mb-4 hidden md:flex flex-wrap items-center gap-2">
      <Pill id="stops" label={stopsActive ? stopsLabel : 'Stops'} active={stopsActive} openId={openId} setOpenId={setOpenId}>
        <Heading>Stops on the way</Heading>
        <div className="flex flex-col">
          {STOP_OPTIONS.map((opt) => (
            <label key={opt.value} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-sm hover:bg-[#F6F8F8]">
              <input
                type="radio"
                name="stops-filter"
                className="h-4 w-4 accent-[#055B75]"
                checked={filters.stops === opt.value}
                onChange={() => onFilterChange('stops', opt.value)}
              />
              {opt.label}
            </label>
          ))}
        </div>
      </Pill>

      <Pill id="times" label={timeLabel} active={timeActive} openId={openId} setOpenId={setOpenId}>
        <Heading>Leaves</Heading>
        <div className="grid grid-cols-2 gap-2">
          {DEPARTURE_TIMES.map((t) => {
            const on = filters.departureTime === t.value;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => onFilterChange('departureTime', on ? 'any' : t.value)}
                className={`rounded-xl border px-3 py-2.5 text-left text-[13px] font-semibold transition-colors ${
                  on ? 'border-[#055B75] bg-[#055B75]/[0.06] text-[#055B75]' : 'border-[#E6DFD2] text-ink hover:border-[#65B3CF]'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
        {timeActive && (
          <button
            type="button"
            onClick={() => onFilterChange('departureTime', 'any')}
            className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-[#055B75]"
          >
            <X className="h-3.5 w-3.5" /> Any time
          </button>
        )}
      </Pill>

      <Pill
        id="airlines"
        label={airlinesActive ? `${filters.airlines.length} airline${filters.airlines.length > 1 ? 's' : ''}` : 'Airlines'}
        active={airlinesActive}
        openId={openId}
        setOpenId={setOpenId}
      >
        <Heading>Flying this route</Heading>
        {airlines.length > 0 ? (
          <div className="max-h-64 space-y-0.5 overflow-y-auto pr-1">
            {airlines.map((airline) => {
              const minPrice = airlineStats?.get(airline)?.minPrice ?? null;
              return (
                <label key={airline} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-sm hover:bg-[#F6F8F8]">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[#055B75]"
                    checked={filters.airlines.includes(airline)}
                    onChange={() => onToggleAirline(airline)}
                  />
                  <span className="min-w-0 truncate">{airline}</span>
                  {minPrice !== null && (
                    <span className="ml-auto whitespace-nowrap text-[12.5px] text-gray-500">
                      from <b className="text-ink"><Price amount={minPrice} /></b>
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-gray-400">No airlines to filter</p>
        )}
      </Pill>

      <Pill id="price" label={priceActive ? `Up to ${currencySymbol}${filters.price[1].toLocaleString()}` : 'Price'} active={priceActive} openId={openId} setOpenId={setOpenId}>
        <Heading>Total for this search</Heading>
        <input
          type="range"
          min={priceRangeBounds.min}
          max={priceRangeBounds.max}
          step={step}
          value={filters.price[1]}
          onChange={(e) => onFilterChange('price', [filters.price[0], Math.max(parseInt(e.target.value, 10) || priceRangeBounds.max, filters.price[0] + step)])}
          className="w-full accent-[#055B75]"
          aria-label="Maximum price"
        />
        <div className="mt-1 flex justify-between text-[12.5px] tabular-nums text-gray-500">
          <span>{currencySymbol}{priceRangeBounds.min.toLocaleString()} cheapest</span>
          <span>up to <b className="text-ink">{currencySymbol}{filters.price[1].toLocaleString()}</b></span>
        </div>
        {priceActive && (
          <button
            type="button"
            onClick={() => onFilterChange('price', [priceRangeBounds.min, priceRangeBounds.max])}
            className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-[#055B75]"
          >
            <X className="h-3.5 w-3.5" /> Any price
          </button>
        )}
      </Pill>

      <Pill id="bags" label={bagActive ? BAGGAGE_OPTIONS.find((b) => b.value === filters.baggage)?.label : 'Baggage'} active={bagActive} openId={openId} setOpenId={setOpenId}>
        <Heading>Included in the fare</Heading>
        <div className="flex flex-col">
          {BAGGAGE_OPTIONS.map((opt) => (
            <label key={opt.value} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-sm hover:bg-[#F6F8F8]">
              <input
                type="radio"
                name="bag-filter"
                className="h-4 w-4 accent-[#055B75]"
                checked={filters.baggage === opt.value}
                onChange={() => onFilterChange('baggage', opt.value)}
              />
              {opt.label}
            </label>
          ))}
        </div>
      </Pill>

      <button
        type="button"
        onClick={() => onFilterChange('refundable', refundActive ? 'any' : 'yes')}
        className={`rounded-full border px-4 py-2 text-[13.5px] transition-colors ${
          refundActive
            ? 'border-[#055B75] bg-[#055B75] font-bold text-white'
            : 'border-[#E6DFD2] bg-white text-ink hover:border-[#055B75]'
        }`}
      >
        Refundable
      </button>

      {typeof resultCount === 'number' && (
        <span className="ml-1 text-[13px] text-gray-500">
          {resultCount} {resultCount === 1 ? 'flight' : 'flights'}
        </span>
      )}

      {anyActive && (
        <button
          type="button"
          onClick={onResetAll}
          className="ml-auto text-[13px] font-bold text-[#055B75] hover:underline"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}

export default React.memo(FlightFilterBar);
