import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MapPin, Plane, X } from 'lucide-react';
import AirportService from '../../../Services/AirportService';

const LIST_ROOM = 320;
const isPhone = () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(max-width: 639px)').matches);

/**
 * Scroll the page up when the list would open below the bottom of the screen.
 * On a 1366 x 768 laptop the To box sits at the foot of the screen and its list
 * showed one half-row; the rest could not be seen or clicked.
 */
export function makeRoomBelow(element) {
  if (!element || typeof window === 'undefined') return;
  const short = element.getBoundingClientRect().bottom + LIST_ROOM - window.innerHeight;
  if (short > 0) window.scrollBy?.({ top: short + 16, behavior: 'smooth' });
}

/**
 * The suggestions for one From or To box: the API's ranked list for what was
 * typed, the top match highlighted for Enter. The list for the last text stays
 * up until the next one arrives.
 *
 * @param {(place: object) => void} onPick
 */
export function usePlaceSearch(onPick) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [searching, setSearching] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const timer = useRef(null);
  const latest = useRef('');

  useEffect(() => () => clearTimeout(timer.current), []);

  const show = (places) => {
    setSuggestions(places);
    setActive(places.length > 0 ? 0 : -1);
    setSearching(false);
  };

  const search = (text) => {
    latest.current = text;
    clearTimeout(timer.current);
    setOpen(true);
    if (!text.trim()) {
      show([]);
      return;
    }
    const cached = AirportService.cachedAirports(text);
    if (cached) {
      show(cached);
      return;
    }
    setSearching(true);
    timer.current = setTimeout(async () => {
      const found = await AirportService.searchAirports(text);
      // The answer to an earlier search, after the customer typed on.
      if (latest.current !== text) return;
      show(found);
    }, 120);
  };

  const close = () => {
    setOpen(false);
    setActive(-1);
  };

  const closeSheet = () => {
    close();
    setSheetOpen(false);
  };

  const pick = (place) => {
    clearTimeout(timer.current);
    latest.current = '';
    closeSheet();
    onPick(place);
  };

  // On a phone the box opens a search page of its own, as on booking.com: a
  // list under the box was half hidden by the keyboard.
  const onFocus = (event) => {
    if (isPhone()) {
      event.currentTarget.blur();
      show([]);
      setSheetOpen(true);
      return;
    }
    makeRoomBelow(event.currentTarget);
  };

  const onKeyDown = (event) => {
    if (!open || suggestions.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => (index + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
    } else if (event.key === 'Enter' && active >= 0) {
      event.preventDefault();
      pick(suggestions[active]);
    } else if (event.key === 'Escape') {
      close();
    }
  };

  return {
    suggestions, isOpen: open && (suggestions.length > 0 || searching), searching, active, setActive, search, pick, close, onKeyDown,
    sheetOpen, closeSheet, onFocus,
  };
}

/** What the box needs to act as a combobox over its list. */
export const comboboxProps = (listId, place) => ({
  role: 'combobox',
  'aria-autocomplete': 'list',
  'aria-expanded': place.isOpen,
  'aria-controls': listId,
  'aria-activedescendant': place.isOpen && place.active >= 0 ? `${listId}-${place.active}` : undefined,
});

/** The rows of the list, as booking.com lays them: the code, the place, and under it the country or the distance. */
function PlaceRows({ id, place }) {
  const { suggestions, active, setActive, pick, searching } = place;
  return (
    <>
      {suggestions.length === 0 && searching && (
        <li className="px-4 py-3 text-sm text-gray-500">Searching airports…</li>
      )}
      {suggestions.map((city, index) => {
        const isCity = city.type === 'CITY';
        const Icon = isCity ? MapPin : Plane;
        const below = city.subtitle || city.country;
        return (
          <li
            key={`${city.code}-${city.type}-${city.parent || ''}`}
            id={`${id}-${index}`}
            role="option"
            aria-selected={index === active}
            onMouseMove={() => { if (index !== active) setActive(index); }}
            onMouseDown={(event) => { if (event.button === 0) pick(city); }}
            onClick={() => pick(city)}
            className={`flex items-start gap-3 py-2.5 pr-4 cursor-pointer ${city.parent ? 'pl-10' : 'pl-4'} ${index === active ? 'bg-[#F0FAFC]' : ''}`}
          >
            <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#055B75]" />
            <div className="min-w-0 flex-1">
              <div className="text-sm leading-snug text-gray-800">
                <span className="font-bold text-[#034457]">{city.code}</span> {city.title || city.name}{isCity && ' All airports'}
              </div>
              {below && <div className="mt-0.5 text-xs text-gray-500 truncate">{below}</div>}
            </div>
          </li>
        );
      })}
    </>
  );
}

/** A From or To search filling the screen of a phone. */
function PlaceSheet({ id, place, title, value, onType }) {
  useEffect(() => {
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = overflow; };
  }, []);

  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-[1200] flex flex-col bg-white">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <h2 className="font-grotesk text-xl font-bold text-gray-900">{title}</h2>
        <button type="button" onClick={place.closeSheet} aria-label="Close" className="-mr-2 rounded-full p-2 text-gray-600 hover:bg-gray-100">
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <div className="px-4 pb-3">
        <label htmlFor={`${id}-search`} className="mb-1.5 block text-sm text-gray-600">Airport or city</label>
        <input
          id={`${id}-search`}
          type="text"
          autoFocus
          value={value || ''}
          onChange={(event) => onType(event.target.value)}
          onKeyDown={(event) => (event.key === 'Escape' ? place.closeSheet() : place.onKeyDown(event))}
          onFocus={(event) => event.target.select()}
          {...comboboxProps(id, place)}
          placeholder="City or airport"
          autoComplete="off" autoCorrect="off" spellCheck={false}
          className="w-full rounded-lg border-2 border-[#055B75] px-3 py-3 text-base text-gray-900 outline-none focus:border-[#055B75] focus:ring-2 focus:ring-[#65B3CF]/40 placeholder:text-gray-400"
        />
      </div>
      <ul id={id} role="listbox" onMouseDown={(event) => event.preventDefault()} className="flex-1 overflow-auto border-t border-gray-100 py-1">
        <PlaceRows id={id} place={place} />
      </ul>
    </div>
  );
}

/**
 * The list under a From or To box, laid out as booking.com lays it out: a city
 * with several airports, then its airports under it - or, on a phone, a page
 * of its own. A row is picked when it is pressed: the list can change as the
 * API answers, and picked on release a row that moved under the pointer was
 * picked instead. Pressing keeps the box focused, so the list does not close
 * first.
 *
 * @param {string} title - The heading of the phone page ("Leaving from")
 * @param {(text: string) => void} onType - What typing in the phone page does
 */
export function PlaceSuggestions({ id, place, title, value, onType }) {
  const { active, isOpen, sheetOpen } = place;

  // Keeps the highlighted row in view inside the list only: scrollIntoView
  // moved the page too, and cut short the scroll that makes room for the list.
  useEffect(() => {
    const list = document.getElementById(id);
    const row = active >= 0 ? document.getElementById(`${id}-${active}`) : null;
    if (!list || !row) return;
    if (row.offsetTop < list.scrollTop) list.scrollTop = row.offsetTop;
    else if (row.offsetTop + row.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = row.offsetTop + row.offsetHeight - list.clientHeight;
  }, [id, active]);

  if (sheetOpen && onType) {
    return createPortal(<PlaceSheet id={id} place={place} title={title} value={value} onType={onType} />, document.body);
  }
  if (!isOpen) return null;

  return (
    <ul
      id={id}
      role="listbox"
      onMouseDown={(event) => event.preventDefault()}
      className="absolute z-[60] left-3 top-full mt-1 w-[360px] max-w-[calc(100vw-2rem)] bg-white rounded-xl shadow-xl border border-gray-200 max-h-80 overflow-auto py-1"
    >
      <PlaceRows id={id} place={place} />
    </ul>
  );
}
