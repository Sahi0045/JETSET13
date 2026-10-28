import React, { useEffect, useRef, useState } from 'react';
import { Building2, Plane } from 'lucide-react';
import AirportService from '../../../Services/AirportService';

const LIST_ROOM = 320;

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

  const pick = (place) => {
    clearTimeout(timer.current);
    latest.current = '';
    close();
    onPick(place);
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

/**
 * The list under a From or To box, laid out as booking.com lays it out: a city
 * with several airports, then its airports under it. A row is picked when it is
 * pressed: the list can change as the API answers, and picked on release a row
 * that moved under the pointer was picked instead. Pressing keeps the box
 * focused, so the list does not close first.
 */
export function PlaceSuggestions({ id, place }) {
  const { suggestions, active, setActive, pick, isOpen, searching } = place;

  // Keeps the highlighted row in view inside the list only: scrollIntoView
  // moved the page too, and cut short the scroll that makes room for the list.
  useEffect(() => {
    const list = document.getElementById(id);
    const row = active >= 0 ? document.getElementById(`${id}-${active}`) : null;
    if (!list || !row) return;
    if (row.offsetTop < list.scrollTop) list.scrollTop = row.offsetTop;
    else if (row.offsetTop + row.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = row.offsetTop + row.offsetHeight - list.clientHeight;
  }, [id, active]);

  if (!isOpen) return null;

  return (
    <ul
      id={id}
      role="listbox"
      onMouseDown={(event) => event.preventDefault()}
      className="absolute z-[60] left-3 top-full mt-1 w-[360px] max-w-[calc(100vw-2rem)] bg-white rounded-xl shadow-xl border border-gray-200 max-h-80 overflow-auto py-1"
    >
      {suggestions.length === 0 && searching && (
        <li className="px-4 py-3 text-sm text-gray-500">Searching airports…</li>
      )}
      {suggestions.map((city, index) => {
        const isCity = city.type === 'CITY';
        const Icon = isCity ? Building2 : Plane;
        return (
          <li
            key={`${city.code}-${city.type}-${city.parent || ''}`}
            id={`${id}-${index}`}
            role="option"
            aria-selected={index === active}
            onMouseMove={() => { if (index !== active) setActive(index); }}
            onMouseDown={(event) => { if (event.button === 0) pick(city); }}
            onClick={() => pick(city)}
            className={`flex items-center gap-3 py-2.5 pr-4 cursor-pointer ${city.parent ? 'pl-10' : 'pl-4'} ${index === active ? 'bg-[#F0FAFC]' : ''}`}
          >
            <Icon aria-hidden="true" className={`flex-shrink-0 text-[#055B75] ${city.parent ? 'h-3.5 w-3.5' : 'h-4 w-4'}`} />
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-gray-800 text-sm truncate">{city.title || city.name}</div>
              {(city.subtitle || city.country) && <div className="text-xs text-gray-500 truncate">{city.subtitle || city.country}</div>}
            </div>
            <span className="text-xs font-bold text-[#055B75] flex-shrink-0">{city.code}</span>
          </li>
        );
      })}
    </ul>
  );
}
