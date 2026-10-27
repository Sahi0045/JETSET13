import React, { useEffect, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { format, isValid, parseISO } from 'date-fns';
import { PlaceSuggestions, comboboxProps, makeRoomBelow, usePlaceSearch } from './PlaceSuggestions';
import CustomFlightCalendar from './CustomFlightCalendar';

export const MAX_LEGS = 6;
export const MIN_LEGS = 2;

export const nextLegAfter = (leg) => ({
  from: leg?.to || '',
  fromCode: leg?.toCode,
  fromCountry: leg?.toCountry,
  to: '',
  departDate: '',
});

const dateParts = (value) => {
  const date = value ? parseISO(value) : null;
  if (!date || !isValid(date)) return null;
  return { day: format(date, 'dd'), month: format(date, 'MMM'), yy: format(date, 'yy'), weekday: format(date, 'EEEE') };
};

function PlaceField({ id, label, name, value, subtitle, error, onType, onPick }) {
  const place = usePlaceSearch(onPick);

  return (
    <label className="relative flex-[1.4] px-5 py-3 cursor-text hover:bg-[#055B75]/[0.03] focus-within:bg-[#055B75]/[0.04] transition-colors block">
      <span className="block text-[10.5px] font-bold uppercase tracking-[0.14em] text-gray-400 mb-1">{name}</span>
      <input
        type="text"
        aria-label={label}
        value={value || ''}
        onChange={(e) => { onType(e.target.value); place.search(e.target.value); }}
        onBlur={place.close}
        onKeyDown={place.onKeyDown}
        onFocus={(e) => makeRoomBelow(e.currentTarget)}
        {...comboboxProps(id, place)}
        placeholder="City or airport"
        autoComplete="off" autoCorrect="off" spellCheck={false}
        className="w-full border-0 p-0 bg-transparent outline-none focus:ring-0 font-grotesk text-[18px] leading-tight font-semibold text-ink placeholder:text-gray-300 placeholder:font-normal placeholder:text-[15px]"
      />
      <span className="block text-xs text-gray-500 mt-1 truncate">{subtitle || ' '}</span>
      <PlaceSuggestions id={id} place={place} />
      {error && <span className="block text-red-500 text-xs mt-1">{error}</span>}
    </label>
  );
}

function DateField({ number, value, minDate, error, onPick }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const parts = dateParts(value);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => { if (ref.current && !ref.current.contains(event.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div ref={ref} className={`relative flex-1 px-5 py-3 border-t lg:border-t-0 lg:border-l border-gray-200 ${open ? 'z-50' : ''}`}>
      <button
        type="button"
        aria-label={`Select date of flight ${number}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        // Enter and Space click with detail 0 and open or shut it; a mouse
        // click only opens, as a double click shut it again.
        onClick={(event) => setOpen((current) => (event.detail === 0 ? !current : true))}
        className="w-full text-left"
      >
        <span className="block text-[10.5px] font-bold uppercase tracking-[0.14em] text-gray-400 mb-1">Date</span>
        {parts ? (
          <>
            <span className="block leading-none"><span className="font-grotesk text-[18px] font-semibold text-ink">{parts.day}</span> <span className="text-[15px] text-gray-600">{parts.month}'{parts.yy}</span></span>
            <span className="block text-xs text-gray-500 mt-1">{parts.weekday}</span>
          </>
        ) : <span className="block font-grotesk text-[18px] font-semibold text-gray-300">Select date</span>}
      </button>
      {open && (
        <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <CustomFlightCalendar
            selectedDate={value}
            minDate={minDate}
            showPrices={false}
            onSelect={(date) => { onPick(date); setOpen(false); }}
            onClose={() => setOpen(false)}
          />
        </div>
      )}
      {error && <span className="block text-red-500 text-xs mt-1">{error}</span>}
    </div>
  );
}

const subtitleOf = (code, country) => (code ? `${code}${country ? `, ${country}` : ''}` : '');

export default function MultiCityLegs({ legs, errors = [], onChange }) {
  const update = (index, patch) => onChange(legs.map((leg, i) => {
    if (i === index) return { ...leg, ...patch };
    // The next flight starts where this one lands, until it is given a start of its own.
    const changed = legs[index];
    if (i === index + 1 && 'to' in patch && (!leg.from || leg.from === changed.to)) {
      return { ...leg, from: patch.to, fromCode: patch.toCode, fromCountry: patch.toCountry };
    }
    return leg;
  }));
  const typed = (index, field, text) => update(index, { [field]: text, [`${field}Code`]: undefined, [`${field}Country`]: undefined });
  const picked = (index, field, city) => update(index, {
    [field]: `${city.name} (${city.code})`,
    [`${field}Code`]: city.code,
    [`${field}Country`]: city.country,
  });

  return (
    <div className="flex flex-col">
      {legs.map((leg, index) => {
        const number = index + 1;
        const previousDate = index > 0 ? legs[index - 1].departDate : '';
        return (
          <div key={index} className="flex flex-col lg:flex-row lg:items-stretch border-b border-gray-100 last:border-b-0">
            <span className="px-5 pt-3 lg:pt-4 lg:w-20 text-xs font-bold text-[#055B75] whitespace-nowrap">{`Flight ${number}`}</span>
            <PlaceField
              id={`leg-${index}-from-places`}
              label={`Flight ${number} from`}
              name="From"
              value={leg.from}
              subtitle={subtitleOf(leg.fromCode, leg.fromCountry)}
              error={errors[index]?.from}
              onType={(text) => typed(index, 'from', text)}
              onPick={(city) => picked(index, 'from', city)}
            />
            <PlaceField
              id={`leg-${index}-to-places`}
              label={`Flight ${number} to`}
              name="To"
              value={leg.to}
              subtitle={subtitleOf(leg.toCode, leg.toCountry)}
              error={errors[index]?.to}
              onType={(text) => typed(index, 'to', text)}
              onPick={(city) => picked(index, 'to', city)}
            />
            <DateField
              number={number}
              value={leg.departDate}
              minDate={previousDate ? parseISO(previousDate) : new Date()}
              error={errors[index]?.departDate}
              onPick={(date) => update(index, { departDate: date })}
            />
            <div className="flex items-center px-5 pb-3 lg:pb-0 lg:w-12">
              {index >= MIN_LEGS && (
                <button
                  type="button"
                  aria-label={`Remove flight ${number}`}
                  onClick={() => onChange(legs.filter((_, i) => i !== index))}
                  className="h-8 w-8 rounded-full flex items-center justify-center text-gray-400 hover:text-[#055B75] hover:bg-[#F1FBFD]"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        );
      })}
      {legs.length < MAX_LEGS && (
        <button
          type="button"
          onClick={() => onChange([...legs, nextLegAfter(legs[legs.length - 1])])}
          className="self-start m-3 inline-flex items-center gap-1.5 rounded-full border border-[#055B75] px-4 py-1.5 text-sm font-semibold text-[#055B75] hover:bg-[#F1FBFD]"
        >
          <Plus className="h-4 w-4" />
          Add another flight
        </button>
      )}
    </div>
  );
}
