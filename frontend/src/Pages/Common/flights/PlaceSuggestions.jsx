import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, MapPin, Plane, X } from 'lucide-react';
import AirportService from '../../../Services/AirportService';

const LIST_ROOM = 320;
const MAX_CHOSEN = 6;
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
 * With `multi`, places can be ticked, as on booking.com, and searched together:
 * the pick is then one place standing for all of them ("JFK,EWR").
 *
 * @param {(place: object) => void} onPick
 * @param {{ multi?: boolean }} options
 */
export function usePlaceSearch(onPick, { multi = false } = {}) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [searching, setSearching] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [chosen, setChosen] = useState([]);
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

  const hide = () => {
    setOpen(false);
    setActive(-1);
    setSheetOpen(false);
  };

  const pick = (place) => {
    clearTimeout(timer.current);
    latest.current = '';
    setChosen([]);
    hide();
    onPick(place);
  };

  const isChosen = (place) => chosen.some((other) => other.code === place.code);

  const toggle = (place) => setChosen((current) => (current.some((other) => other.code === place.code)
    ? current.filter((other) => other.code !== place.code)
    : current.length < MAX_CHOSEN ? [...current, place] : current));

  /** The ticked places, picked as one. */
  const pickChosen = () => {
    if (chosen.length === 1) return pick(chosen[0]);
    const codes = chosen.map((place) => place.code);
    const countries = [...new Set(chosen.map((place) => place.country))];
    return pick({
      code: codes.join(','),
      name: codes.join(', '),
      label: codes.join(', '),
      type: 'MULTI',
      country: countries.length === 1 ? countries[0] : '',
      places: chosen,
    });
  };

  // Leaving the box keeps what was ticked: losing ticks to a stray click is worse.
  const close = () => (chosen.length > 0 ? pickChosen() : hide());
  const closeSheet = close;

  const choose = (place) => (multi && chosen.length > 0 ? toggle(place) : pick(place));

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
    } else if (event.key === 'Enter' && chosen.length > 0) {
      event.preventDefault();
      pickChosen();
    } else if (event.key === 'Enter' && active >= 0) {
      event.preventDefault();
      pick(suggestions[active]);
    } else if (event.key === 'Escape') {
      close();
    }
  };

  return {
    suggestions, isOpen: open && (suggestions.length > 0 || searching || chosen.length > 0), searching, active, setActive,
    search, pick, choose, close, onKeyDown, sheetOpen, closeSheet, onFocus,
    multi, chosen, isChosen, toggle, pickChosen,
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
  const { suggestions, active, setActive, choose, searching, multi, isChosen, toggle } = place;
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
            onMouseDown={(event) => { if (event.button === 0) choose(city); }}
            onClick={() => choose(city)}
            className={`flex items-start gap-3 py-2.5 pr-4 cursor-pointer ${city.parent ? 'pl-10' : 'pl-4'} ${index === active ? 'bg-[#F0FAFC]' : ''}`}
          >
            <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#055B75]" />
            <div className="min-w-0 flex-1">
              <div className="text-sm leading-snug text-gray-800">
                <span className="font-bold text-[#034457]">{city.code}</span> {city.title || city.name}{isCity && ' All airports'}
              </div>
              {below && <div className="mt-0.5 text-xs text-gray-500 truncate">{below}</div>}
            </div>
            {multi && (
              <button
                type="button"
                role="checkbox"
                tabIndex={-1}
                aria-checked={isChosen(city)}
                aria-label={`Search ${city.code} too`}
                onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); if (event.button === 0) toggle(city); }}
                onClick={(event) => event.stopPropagation()}
                className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-2 ${isChosen(city) ? 'border-[#055B75] bg-[#055B75] text-white' : 'border-gray-300 bg-white'}`}
              >
                {isChosen(city) && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
              </button>
            )}
          </li>
        );
      })}
    </>
  );
}

/** The ticked places, each removable, and the button that searches them. */
function ChosenBar({ place, action, wide = false }) {
  if (!place.multi || place.chosen.length === 0) return null;
  return (
    <div className={`flex items-center gap-2 border-t border-gray-100 bg-white px-4 py-2.5 ${wide ? 'flex-col items-stretch' : ''}`}>
      <div className="flex min-w-0 flex-1 flex-wrap gap-1.5" aria-label="Airports to search">
        {place.chosen.map((chosen) => (
          <span key={chosen.code} className="inline-flex items-center gap-1 rounded-full bg-[#F1FBFD] px-2.5 py-1 text-xs font-bold text-[#034457] ring-1 ring-[#65B3CF]/50">
            {chosen.code}
            <button
              type="button"
              aria-label={`Remove ${chosen.code}`}
              onMouseDown={(event) => { event.preventDefault(); place.toggle(chosen); }}
              className="text-[#055B75] hover:text-[#034457]"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </span>
        ))}
      </div>
      <button
        type="button"
        onMouseDown={(event) => { event.preventDefault(); place.pickChosen(); }}
        className={`rounded-full bg-[#055B75] px-4 py-2 text-sm font-semibold text-white hover:bg-[#034457] ${wide ? 'w-full py-3 text-base' : ''}`}
      >
        {action}
      </button>
    </div>
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
      <ul id={id} role="listbox" aria-multiselectable={place.multi || undefined} onMouseDown={(event) => event.preventDefault()} className="flex-1 overflow-auto border-t border-gray-100 py-1">
        <PlaceRows id={id} place={place} />
      </ul>
      <ChosenBar place={place} action="Apply" wide />
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
    <div className="absolute z-[60] left-3 top-full mt-1 w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
      <ul
        id={id}
        role="listbox"
        aria-multiselectable={place.multi || undefined}
        onMouseDown={(event) => event.preventDefault()}
        className="max-h-80 overflow-auto py-1"
      >
        <PlaceRows id={id} place={place} />
      </ul>
      <ChosenBar place={place} action="Done" />
    </div>
  );
}
