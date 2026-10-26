import React, { useEffect, useRef, useState } from 'react';
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
 * The suggestions for one From or To box: local airports at once, the API's
 * answer added after them, the top match highlighted for Enter.
 *
 * @param {(place: object) => void} onPick
 */
export function usePlaceSearch(onPick) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const timer = useRef(null);
  const latest = useRef('');

  useEffect(() => () => clearTimeout(timer.current), []);

  const search = (text) => {
    latest.current = text;
    const local = AirportService.searchLocalAirports(text);
    setSuggestions(local);
    setActive(local.length > 0 ? 0 : -1);
    setOpen(true);
    clearTimeout(timer.current);
    if (text.trim().length < 2) return;
    timer.current = setTimeout(async () => {
      let found = [];
      try {
        found = await AirportService.searchAirports(text);
      } catch (error) {
        console.warn('Airport search API error:', error);
      }
      // The answer to an earlier search, after the customer typed on.
      if (latest.current !== text) return;
      const merged = AirportService.mergeAirportResults(local, found, text);
      setSuggestions(merged);
      if (local.length === 0 && merged.length > 0) setActive(0);
    }, 250);
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

  return { suggestions, isOpen: open && suggestions.length > 0, active, setActive, search, pick, close, onKeyDown };
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
 * The list under a From or To box. Pressing a row keeps the box focused, so the
 * box never blurs and closes the list before the click lands - with a slow
 * click it did, and nothing was picked.
 */
export function PlaceSuggestions({ id, place }) {
  const { suggestions, active, setActive, pick, isOpen } = place;

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
      className="absolute z-[60] left-3 top-full mt-1 w-[300px] max-w-[88vw] bg-white rounded-xl shadow-xl border border-gray-200 max-h-72 overflow-auto py-1"
    >
      {suggestions.map((city, index) => {
        const where = [city.cityName && city.cityName !== city.name ? city.cityName : '', city.country].filter(Boolean).join(', ');
        return (
          <li
            key={`${city.code}-${city.name}`}
            id={`${id}-${index}`}
            role="option"
            aria-selected={index === active}
            onMouseMove={() => { if (index !== active) setActive(index); }}
            onClick={() => pick(city)}
            className={`px-4 py-2.5 cursor-pointer border-b last:border-0 border-gray-100 ${index === active ? 'bg-[#F0FAFC]' : ''}`}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-semibold text-gray-800 text-sm truncate">{city.name}</span>
              <span className="text-xs font-bold text-[#055B75] flex-shrink-0">{city.code}</span>
            </div>
            {where && <div className="text-xs text-gray-500 truncate">{where}</div>}
          </li>
        );
      })}
    </ul>
  );
}
