import React, { useState } from 'react';
import { ChevronDown, ChevronUp, SlidersHorizontal } from 'lucide-react';
import currencyService from '../../../Services/CurrencyService';
import Price from '../../../Components/Price';
import { WHOLE_DAY, clockLabel, hoursLabel, priceStep } from './searchResults';
import { DualRange, SingleRange } from './RangeSlider';

const STOP_LABELS = ['Direct', '1 stop', '2+ stops'];

const BAGGAGE_OPTIONS = [
  { value: 'included', label: 'Checked bag included' },
  { value: 'cabin_only', label: 'Cabin bag only' },
];

const snapToQuarterHour = (minutes) => (minutes >= WHOLE_DAY[1] - 7 ? WHOLE_DAY[1] : Math.round(minutes / 15) * 15);

const toggled = (list, value) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

function Section({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b border-gray-100 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
      >
        <span className="text-[15px] font-bold text-gray-900">{title}</span>
        {open ? <ChevronUp className="h-4 w-4 text-gray-500" /> : <ChevronDown className="h-4 w-4 text-gray-500" />}
      </button>
      {open && <div className="px-5 pb-5 -mt-1">{children}</div>}
    </section>
  );
}

function Check({ checked, disabled, onChange, label, sub }) {
  return (
    <label className={`flex items-start gap-3 py-1.5 ${disabled ? 'cursor-not-allowed' : 'cursor-pointer group'}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        aria-label={label}
        className="mt-0.5 h-[18px] w-[18px] flex-shrink-0 rounded border-gray-300 accent-[#055B75] cursor-pointer disabled:cursor-not-allowed"
      />
      <span className="min-w-0">
        <span className={`block text-sm ${disabled ? 'text-gray-400' : 'text-gray-800 group-hover:text-[#055B75]'}`}>{label}</span>
        {sub && <span className="block text-xs text-gray-500 mt-0.5">{sub}</span>}
      </span>
    </label>
  );
}

function TimeRange({ title, value, onChange }) {
  return (
    <div className="mb-4 last:mb-0">
      <div className="text-sm text-gray-700">{title}</div>
      <div className="text-sm font-semibold text-gray-900 mb-2">{clockLabel(value[0])} - {clockLabel(value[1])}</div>
      <DualRange
        min={WHOLE_DAY[0]} max={WHOLE_DAY[1]} step={1} value={value} snap={snapToQuarterHour}
        labels={[`${title}: earliest departure`, `${title}: latest departure`]}
        onChange={onChange}
      />
    </div>
  );
}

function LimitRange({ range, value, onChange, label }) {
  const min = Math.floor(range.min / 15) * 15;
  const max = Math.ceil(range.max / 15) * 15;
  const current = value == null ? max : Math.min(Math.max(value, min), max);
  return (
    <>
      <div className="text-sm font-semibold text-gray-900 mb-2">{hoursLabel(min)} - {hoursLabel(current)}</div>
      <SingleRange
        min={min} max={max} step={15} value={current} label={label}
        onChange={(v) => onChange(v >= max ? null : v)}
      />
    </>
  );
}

/**
 * The filter column on the results page, and the phone drawer's contents.
 *
 * Laid out the way the big comparison sites do it: one column of sections
 * that open and close, tick boxes that say what each keeps and what it costs
 * from, and sliders for times and lengths.
 */
function FlightFilterSidebar({
  filters,
  priceRangeBounds,
  airlines,
  airlineStats,
  airportStats,
  stopsStats = [],
  journeyRange = null,
  layoverRange = null,
  isRoundTrip = false,
  onFilterChange,
  onToggleAirline,
  onToggleAirport,
  onResetAll,
  variant = 'desktop',
}) {
  const currencySymbol = currencyService.getCurrencySymbol();
  const isMobile = variant === 'mobile';
  const step = priceStep(priceRangeBounds.max);

  return (
    <aside
      aria-label="Filters"
      className={isMobile ? 'w-full' : 'hidden xl:block w-[280px] flex-shrink-0'}
    >
      <div className={isMobile
        ? 'bg-white'
        : 'bg-white rounded-xl border border-gray-200 shadow-sm sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent'}
      >
        {!isMobile && (
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <span className="inline-flex items-center gap-2 text-sm font-bold text-gray-900">
            <SlidersHorizontal className="h-4 w-4 text-[#055B75]" />
            Filters
          </span>
          <button
            type="button"
            onClick={onResetAll}
            className="text-xs font-semibold text-[#055B75] hover:text-[#034457] hover:underline"
          >
            Reset all
          </button>
        </div>
        )}

        <Section title="Stops">
          {stopsStats.map(({ value, count, minPrice }) => (
            <Check
              key={value}
              label={STOP_LABELS[value]}
              checked={filters.stops.includes(value)}
              disabled={count === 0}
              onChange={() => onFilterChange('stops', toggled(filters.stops, value))}
              sub={count === 0 ? 'None' : <>from <Price amount={minPrice} /></>}
            />
          ))}
        </Section>

        <Section title="Baggage">
          {BAGGAGE_OPTIONS.map((opt) => (
            <Check
              key={opt.value}
              label={opt.label}
              checked={filters.baggage === opt.value}
              onChange={() => onFilterChange('baggage', filters.baggage === opt.value ? 'any' : opt.value)}
            />
          ))}
        </Section>

        <Section title="Departure times">
          <TimeRange
            title="Outbound"
            value={filters.outboundTimes}
            onChange={(range) => onFilterChange('outboundTimes', range)}
          />
          {isRoundTrip && (
            <TimeRange
              title="Return"
              value={filters.returnTimes}
              onChange={(range) => onFilterChange('returnTimes', range)}
            />
          )}
        </Section>

        {journeyRange && journeyRange.max > journeyRange.min && (
          <Section title="Journey duration">
            <LimitRange
              range={journeyRange}
              value={filters.maxJourney}
              label="Longest journey"
              onChange={(v) => onFilterChange('maxJourney', v)}
            />
          </Section>
        )}

        {layoverRange && layoverRange.max > layoverRange.min && (
          <Section title="Layovers">
            <div className="text-sm text-gray-700">Layover duration</div>
            <LimitRange
              range={layoverRange}
              value={filters.maxLayover}
              label="Longest layover"
              onChange={(v) => onFilterChange('maxLayover', v)}
            />
          </Section>
        )}

        <Section title="Airlines">
          {airlines.length > 0 ? (
            <>
              <div className="flex items-center gap-3 mb-2 text-xs">
                <button
                  type="button"
                  onClick={() => airlines.forEach((a) => { if (!filters.airlines.includes(a)) onToggleAirline(a); })}
                  className="font-semibold text-[#055B75] hover:underline"
                >
                  Select all
                </button>
                <span className="h-3 w-px bg-gray-300" />
                <button
                  type="button"
                  onClick={() => onFilterChange('airlines', [])}
                  className="font-semibold text-gray-500 hover:text-[#055B75] hover:underline"
                >
                  Clear all
                </button>
              </div>
              <div className="max-h-64 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
                {airlines.map((airline) => {
                  const minPrice = airlineStats.get(airline)?.minPrice ?? null;
                  return (
                    <Check
                      key={airline}
                      label={airline}
                      checked={filters.airlines.includes(airline)}
                      onChange={() => onToggleAirline(airline)}
                      sub={minPrice !== null ? <>from <Price amount={minPrice} /></> : null}
                    />
                  );
                })}
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-400">No airlines to filter</p>
          )}
        </Section>

        {airportStats && (airportStats.origins?.length > 1 || airportStats.dests?.length > 1) && (
          <Section title="Airports">
            {airportStats.origins?.length > 1 && (
              <div className="mb-3">
                <div className="text-xs font-semibold text-gray-500 mb-1">Departing from</div>
                {airportStats.origins.map((a) => (
                  <Check
                    key={a.code}
                    label={`${a.code} · ${a.city}`}
                    checked={filters.originAirports?.includes(a.code) || false}
                    onChange={() => onToggleAirport('origin', a.code)}
                  />
                ))}
              </div>
            )}
            {airportStats.dests?.length > 1 && (
              <div>
                <div className="text-xs font-semibold text-gray-500 mb-1">Arriving at</div>
                {airportStats.dests.map((a) => (
                  <Check
                    key={a.code}
                    label={`${a.code} · ${a.city}`}
                    checked={filters.destAirports?.includes(a.code) || false}
                    onChange={() => onToggleAirport('dest', a.code)}
                  />
                ))}
              </div>
            )}
          </Section>
        )}

        <Section title="Price">
          <div className="text-sm font-semibold text-gray-900 mb-2">
            {currencySymbol}{Math.round(filters.price[0]).toLocaleString()} - {currencySymbol}{Math.round(filters.price[1]).toLocaleString()}
          </div>
          <DualRange
            min={priceRangeBounds.min} max={priceRangeBounds.max} step={step} value={filters.price}
            labels={['Lowest price', 'Highest price']}
            onChange={(range) => onFilterChange('price', range)}
          />
        </Section>

        <Section title="Fare type">
          <label className="flex items-center justify-between gap-3 cursor-pointer py-1">
            <span className="text-sm text-gray-800">Refundable only</span>
            <input
              type="checkbox"
              role="switch"
              checked={filters.refundable === 'yes'}
              onChange={() => onFilterChange('refundable', filters.refundable === 'yes' ? 'any' : 'yes')}
              className="peer sr-only"
            />
            <span className="relative h-6 w-11 flex-shrink-0 rounded-full bg-gray-300 transition-colors peer-checked:bg-[#055B75] after:absolute after:top-0.5 after:left-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-5" />
          </label>
        </Section>
      </div>
    </aside>
  );
}

export default React.memo(FlightFilterSidebar);
