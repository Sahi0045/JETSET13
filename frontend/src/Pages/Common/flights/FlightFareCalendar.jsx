import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import Price from '../../../Components/Price';
import { getSafeDate } from '../../../utils/dateUtils';
import { moveDayFocus } from './calendarKeys';
import { fareWeeks, monthDatesFrom, priceFareWeeks } from './fareWeeks';
import SwipeMonths, { monthsFrom, usePhoneWidth } from './SwipeMonths';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const iso = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const todayISO = () => {
  const t = new Date();
  return iso(t.getFullYear(), t.getMonth(), t.getDate());
};

const MONTHS_ON_A_PHONE = 12;

const monthCells = (year, month, today) => {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = iso(year, month, d);
    cells.push({ day: d, isoDate: dateStr, isPast: dateStr < today });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
};

const extractCode = (str) => {
  if (!str) return '';
  const m = String(str).match(/\(([A-Z]{3})\)$/);
  if (m) return m[1];
  if (/^[A-Z]{3}(\s*,\s*[A-Z]{3})*$/.test(String(str).trim())) return String(str).trim().replace(/\s+/g, '');
  return str;
};

/**
 * The results page's fare calendar. On a phone it rises from the foot of the
 * screen and its months are swiped through sideways, a year from this month.
 * Fares already found stay on their days while the months are swiped back and
 * forth; a day to come shows "—" only once it was asked for and had no fare.
 */
function FlightFareCalendar({ searchParams = {}, initialDate, selectedDate, knownPrices, onSelectDate, onClose }) {
  const isPhone = usePhoneWidth();
  // A local date: new Date('YYYY-MM-DD') is UTC midnight, the day before west
  // of UTC, so a search on the 1st opened on the month before.
  const start = initialDate ? getSafeDate(initialDate) : new Date();
  const [viewYear, setViewYear] = useState(start.getFullYear());
  const [viewMonth, setViewMonth] = useState(start.getMonth());
  const [prices, setPrices] = useState({});
  const [pending, setPending] = useState(() => new Set());
  const asked = useRef({ search: null, dates: new Set() });

  const today = todayISO();
  const monthDates = useMemo(() => monthDatesFrom(viewYear, viewMonth, today), [viewYear, viewMonth, today]);

  const months = useMemo(() => {
    const [year, month] = today.split('-').map(Number);
    const toView = (viewYear - year) * 12 + viewMonth - (month - 1) + 1;
    return monthsFrom(new Date(year, month - 1, 1), Math.max(MONTHS_ON_A_PHONE, toView));
  }, [today, viewYear, viewMonth]);
  const slide = Math.max(0, months.findIndex((month) => month.getFullYear() === viewYear && month.getMonth() === viewMonth));

  const search = useMemo(() => {
    const fromCode = searchParams.fromCode || extractCode(searchParams.from);
    const toCode = searchParams.toCode || extractCode(searchParams.to);
    if (!fromCode || !toCode) return null;
    return JSON.stringify({
      from: fromCode,
      to: toCode,
      adults: parseInt(searchParams.adults) || parseInt(searchParams.travelers) || 1,
      children: parseInt(searchParams.children) || 0,
      infants: parseInt(searchParams.infants) || 0,
      travelClass: searchParams.travelClass || 'ECONOMY',
    });
  }, [searchParams]);

  useEffect(() => {
    if (asked.current.search !== search) {
      asked.current = { search, dates: new Set() };
      setPrices({});
    }
    const known = Object.fromEntries(Object.entries(knownPrices || {})
      .filter(([date, amount]) => monthDates.includes(date) && Number(amount) > 0));
    setPrices((current) => ({ ...current, ...known }));
    const weeks = fareWeeks(monthDates).filter((dates) => dates.some((date) => !asked.current.dates.has(date)));
    if (!search || weeks.length === 0) { setPending(new Set()); return undefined; }

    const controller = new AbortController();
    setPending(new Set(weeks.flat().filter((date) => !(date in known))));
    priceFareWeeks({
      weeks,
      search: JSON.parse(search),
      signal: controller.signal,
      onWeek: (dates, found) => {
        dates.forEach((date) => asked.current.dates.add(date));
        setPrices((current) => ({ ...current, ...found }));
        setPending((current) => {
          const next = new Set(current);
          dates.forEach((date) => next.delete(date));
          return next;
        });
      },
    });

    return () => controller.abort();
  }, [monthDates, search, knownPrices]);

  const goMonth = (delta) => {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    // Don't navigate before the current month
    const firstOfTarget = iso(y, m, new Date(y, m + 1, 0).getDate());
    if (firstOfTarget < today) return;
    if (isPhone && slide + delta >= months.length) return;
    setViewYear(y);
    setViewMonth(m);
  };

  const canGoPrev = iso(viewYear, viewMonth, new Date(viewYear, viewMonth + 1, 0).getDate()) > today;
  const canGoNext = !isPhone || slide < months.length - 1;

  // One day is reached with Tab - the chosen day in this month, else its first
  // day still to come - and the arrow keys move from there (calendarKeys.js).
  const tabbableDate = monthDates.includes(selectedDate) ? selectedDate : monthDates[0];

  const weekdayRow = (
    <div className="grid grid-cols-7 gap-1 mb-1">
      {WEEKDAYS.map((w) => (
        <div key={w} className="text-center text-[11px] font-semibold text-gray-400 py-1">{w}</div>
      ))}
    </div>
  );

  const renderGrid = (month) => {
    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    const shown = iso(year, monthIndex, 1).slice(0, 7);
    const amounts = Object.entries(prices).filter(([date]) => date.startsWith(shown)).map(([, amount]) => amount);
    const lowestPrice = amounts.length > 0 ? Math.min(...amounts) : null;
    return (
      <div className="grid grid-cols-7 gap-1" data-calendar-grid="">
        {monthCells(year, monthIndex, today).map((cell, i) => {
          if (!cell) return <div key={i} />;
          const price = prices[cell.isoDate];
          const isPending = price == null && pending.has(cell.isoDate);
          const isSelected = cell.isoDate === selectedDate;
          const isLowest = price != null && lowestPrice != null && price === lowestPrice;
          return (
            <button
              type="button"
              key={i}
              data-date={cell.isoDate}
              disabled={cell.isPast}
              aria-pressed={isSelected}
              tabIndex={cell.isoDate === tabbableDate ? 0 : -1}
              onKeyDown={moveDayFocus}
              onClick={() => { onSelectDate(cell.isoDate); onClose(); }}
              className={`flex flex-col items-center justify-center h-14 rounded-lg border text-center transition-colors ${
                isSelected
                  ? 'bg-[#055B75] text-white border-[#055B75]'
                  : cell.isPast
                    ? 'opacity-30 cursor-not-allowed border-transparent'
                    : isLowest
                      ? 'border-emerald-300 bg-emerald-50 hover:border-emerald-500'
                      : 'border-gray-200 hover:border-[#65B3CF]'
              }`}
            >
              <span className="sr-only">{getSafeDate(cell.isoDate).toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
              <span aria-hidden="true" className={`text-sm font-semibold ${isSelected ? 'text-white' : 'text-gray-700'}`}>{cell.day}</span>
              {price != null ? (
                <span className={`text-[10px] font-medium ${isSelected ? 'text-white/80' : isLowest ? 'text-emerald-600' : 'text-gray-500'}`}>
                  <Price amount={price} />
                </span>
              ) : isPending ? (
                <Loader2 aria-hidden="true" className={`h-3 w-3 animate-spin ${isSelected ? 'text-white' : 'text-[#65B3CF]'}`} />
              ) : asked.current.dates.has(cell.isoDate) || cell.isPast ? (
                <span className="text-[10px] text-gray-300">—</span>
              ) : null}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full sm:max-w-2xl bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90vh] animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200 max-sm:animate-sheet-up motion-reduce:animate-none">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3 className="font-bold text-gray-900 text-sm">Fare Calendar</h3>
            <p className="text-xs text-gray-500">Lowest one-way fares per day</p>
          </div>
          <button type="button" aria-label="Close fare calendar" onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Month nav */}
        <div className="flex items-center justify-between px-5 py-3">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => goMonth(-1)}
            disabled={!canGoPrev}
            className="p-1.5 rounded-full hover:bg-gray-100 text-gray-600 disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="font-bold text-gray-800">{MONTHS[viewMonth]} {viewYear}</span>
          <button type="button" aria-label="Next month" onClick={() => goMonth(1)} disabled={!canGoNext} className="p-1.5 rounded-full hover:bg-gray-100 text-gray-600 disabled:opacity-30 disabled:hover:bg-transparent">
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {/* Grid */}
        <div className="px-3 sm:px-5 pb-5 overflow-y-auto relative">
          {isPhone ? (
            <SwipeMonths
              months={months}
              index={slide}
              onIndexChange={(i) => { setViewYear(months[i].getFullYear()); setViewMonth(months[i].getMonth()); }}
              renderMonth={(month) => <>{weekdayRow}{renderGrid(month)}</>}
            />
          ) : <>{weekdayRow}{renderGrid(new Date(viewYear, viewMonth, 1))}</>}
          <div className="flex items-center gap-4 mt-4 text-[11px] text-gray-500">
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-emerald-50 border border-emerald-300" /> Lowest fare</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-[#055B75]" /> Selected</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default FlightFareCalendar;
