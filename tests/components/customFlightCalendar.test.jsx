import React from 'react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CustomFlightCalendar from '../../frontend/src/Pages/Common/flights/CustomFlightCalendar.jsx';
import FlightFareCalendar from '../../frontend/src/Pages/Common/flights/FlightFareCalendar.jsx';
import { formatDateToISO } from '../../frontend/src/utils/dateUtils.js';

/**
 * The search form's date picker shows real fares or none.
 *
 * It drew an invented "estimated" curve around ₹3,500 with a green "Cheapest"
 * day whenever fewer than two real prices were known, printed real USD totals
 * behind a hard-coded "₹", and asked /cheapest-dates without the departure date
 * the provider needs - so the estimates were nearly all anyone ever saw.
 */

const inDays = (n) => {
  const date = new Date();
  date.setDate(date.getDate() + n);
  return formatDateToISO(date);
};

const respond = (body) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });

let datePrices;
const datePriceCalls = () => fetch.mock.calls.filter(([url]) => String(url).includes('/flights/date-prices'));

const renderCalendar = (props = {}) => render(
  <CustomFlightCalendar
    selectedDate={inDays(10)}
    originCode="DEL"
    destinationCode="BOM"
    onSelect={() => {}}
    onClose={() => {}}
    {...props}
  />,
);

beforeEach(() => {
  localStorage.setItem('userCurrency', 'USD');
  datePrices = () => respond({ success: false, dateWisePrices: {}, lowestPrice: null, error: 'No prices available' });
  globalThis.fetch = vi.fn((url) => (String(url).includes('/flights/date-prices') ? datePrices() : respond({})));
});

describe('CustomFlightCalendar', () => {
  it('asks for real fares, for the passengers and cabin being searched', async () => {
    const selected = inDays(10);
    datePrices = () => respond({ success: true, dateWisePrices: { [selected]: 82.3 }, lowestPrice: 82.3, currency: 'USD' });

    renderCalendar({ selectedDate: selected, adults: 2, children: 1, travelClass: 'BUSINESS' });

    await waitFor(() => expect(screen.getByTestId('calendar-fare').textContent).toBe('$82.30'));
    const first = JSON.parse(datePriceCalls()[0][1].body);
    expect(first).toEqual({
      from: 'DEL', to: 'BOM', dates: expect.arrayContaining([selected]), adults: 2, children: 1, infants: 0, travelClass: 'BUSINESS',
    });
    expect(first.dates.length).toBeLessThanOrEqual(7);
  });

  it('shows no price at all when no fare is known', async () => {
    const { container } = renderCalendar();

    await waitFor(() => expect(datePriceCalls().length).toBeGreaterThan(0));
    await waitFor(() => expect(container.querySelector('.animate-spin')).toBeNull());

    expect(screen.queryAllByTestId('calendar-fare')).toHaveLength(0);
    expect(container.textContent).not.toMatch(/₹/);
    expect(screen.queryByText(/cheapest|lowest fare/i)).toBeNull();
  });

  it('shows no price at all when the request fails', async () => {
    datePrices = () => Promise.reject(new TypeError('Failed to fetch'));
    const { container } = renderCalendar();

    await waitFor(() => expect(datePriceCalls().length).toBeGreaterThan(0));
    await waitFor(() => expect(container.querySelector('.animate-spin')).toBeNull());
    expect(screen.queryAllByTestId('calendar-fare')).toHaveLength(0);
  });

  it('marks the lowest of the real fares, and only when there are two to compare', async () => {
    datePrices = () => respond({
      success: true, dateWisePrices: { [inDays(11)]: 120, [inDays(12)]: 95.5 }, lowestPrice: 95.5, currency: 'USD',
    });
    renderCalendar();

    // Wait for the fares themselves, not just for two fare slots to exist. On
    // CI's slower runner the slots rendered before their prices had finished
    // formatting, no slot read '$95.50' yet, and the test failed on main.
    await waitFor(() => expect(screen.getAllByTestId('calendar-fare').map((el) => el.textContent)).toEqual(expect.arrayContaining(['$120.00', '$95.50'])));
    const lowest = screen.getAllByTestId('calendar-fare').find((el) => el.textContent === '$95.50');
    expect(lowest.className).toMatch(/text-green-600/);
    expect(screen.getByText('Lowest fare shown')).toBeTruthy();
  });

  // At 8 px "₹6,852" could not be read on a phone.
  it('prints fares large enough to read on a phone', async () => {
    datePrices = () => respond({ success: true, dateWisePrices: { [inDays(11)]: 120 }, lowestPrice: 120, currency: 'USD' });
    renderCalendar();

    const fare = await screen.findByTestId('calendar-fare');
    expect(fare.className).toMatch(/(^|\s)text-\[10px\]/);
    expect(fare.className).toMatch(/whitespace-nowrap/);
  });

  // One-way fares from the origin are not what a return date costs.
  it('prices nothing on the return-date calendar', async () => {
    renderCalendar({ showPrices: false });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(datePriceCalls()).toHaveLength(0);
  });

  // The days were clickable divs: no keyboard could choose one.
  it('draws days as buttons the keyboard can move between and choose', () => {
    const onSelect = vi.fn();
    const { container } = renderCalendar({ onSelect });
    const day = (iso) => container.querySelector(`[data-date="${iso}"]`);

    const chosen = day(inDays(10));
    expect(chosen.tagName).toBe('BUTTON');
    expect(chosen.getAttribute('aria-pressed')).toBe('true');
    expect(chosen.tabIndex).toBe(0);
    expect(day(inDays(11)).tabIndex).toBe(-1);
    expect(chosen.textContent).toMatch(new RegExp(String(new Date(`${inDays(10)}T12:00:00`).getFullYear())));

    chosen.focus();
    fireEvent.keyDown(chosen, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(day(inDays(11)));
    fireEvent.keyDown(document.activeElement, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(day(inDays(18)));

    fireEvent.click(document.activeElement);
    expect(onSelect).toHaveBeenCalledWith(inDays(18));
  });

  // `new Date("2026-10-04")` is midnight UTC - the evening before, west of
  // UTC - so the calendar highlighted the day before the one chosen there.
  it('highlights the chosen day by its date, in any time zone', () => {
    const { container } = renderCalendar({ selectedDate: inDays(12) });

    const pressed = container.querySelectorAll('[aria-pressed="true"]');
    expect(pressed).toHaveLength(1);
    expect(pressed[0].getAttribute('data-date')).toBe(inDays(12));

    const source = readFileSync(path.resolve(process.cwd(), 'frontend/src/Pages/Common/flights/CustomFlightCalendar.jsx'), 'utf8');
    expect(source).not.toMatch(/new Date\(selectedDate\)/);
  });

  it('names its month buttons', () => {
    renderCalendar();
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Next month' })).toBeTruthy();
  });

  it('has no invented or interpolated prices left in the source', () => {
    const source = readFileSync(
      path.resolve(process.cwd(), 'frontend/src/Pages/Common/flights/CustomFlightCalendar.jsx'),
      'utf8',
    );
    expect(source).not.toMatch(/estimatePrice/);
    expect(source).not.toMatch(/₹\{/);
    expect(source).not.toMatch(/getCheapestFlightDates/);
    expect(source).not.toMatch(/interpDate/);
  });
});

/**
 * It priced only the seven days around the chosen date. Opened before a date
 * was chosen - the usual way - that was today to three days on, and every
 * other day of both months stayed blank.
 */
describe('pricing every day it shows', () => {
  const monthOf = (offset) => {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() + offset);
    return date;
  };
  const daysOf = (month, from = '') => {
    const last = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    return Array.from({ length: last }, (_, i) => formatDateToISO(new Date(month.getFullYear(), month.getMonth(), i + 1)))
      .filter((date) => date >= from);
  };
  const priceFor = (date) => 100 + Number(date.slice(-2));
  const requested = () => datePriceCalls().map(([, init]) => JSON.parse(init.body).dates);
  const answerEveryDate = () => {
    datePrices = (url, init) => {
      const { dates } = JSON.parse(init.body);
      return respond({ success: true, dateWisePrices: Object.fromEntries(dates.map((date) => [date, priceFor(date)])), currency: 'USD' });
    };
  };
  const cellText = (container, date) => container.querySelector(`[data-date="${date}"]`).textContent;

  beforeEach(() => {
    globalThis.fetch = vi.fn((url, init) => (String(url).includes('/flights/date-prices') ? datePrices(url, init) : respond({})));
  });

  it('prices every day of both months, before a date is chosen', async () => {
    answerEveryDate();
    const { container } = renderCalendar({ selectedDate: '' });
    const shown = [...daysOf(monthOf(0), inDays(0)), ...daysOf(monthOf(1))];

    await waitFor(() => {
      for (const date of shown) expect(cellText(container, date)).toContain(String(priceFor(date)));
    });
  });

  it('asks a week at a time, so the server prices each day it is asked for', async () => {
    answerEveryDate();
    const { container } = renderCalendar({ selectedDate: '' });

    await waitFor(() => expect(container.querySelector('.animate-spin')).toBeNull());
    expect(requested().flat().sort()).toEqual([...daysOf(monthOf(0), inDays(0)), ...daysOf(monthOf(1))]);
    for (const dates of requested()) expect(dates.length).toBeLessThanOrEqual(7);
  });

  it("asks for the same weeks as the results page's fare calendar, so one fills the other's cache", async () => {
    answerEveryDate();
    const picker = renderCalendar({ selectedDate: '' });
    await waitFor(() => expect(picker.container.querySelector('.animate-spin')).toBeNull());
    const nextMonth = daysOf(monthOf(1));
    const pickerWeeks = requested().filter((dates) => nextMonth.includes(dates[0]));
    picker.unmount();
    fetch.mockClear();

    const results = render(
      <FlightFareCalendar searchParams={{ from: 'DEL', to: 'BOM', adults: 1 }} initialDate={nextMonth[9]} selectedDate={nextMonth[9]} onSelectDate={() => {}} onClose={() => {}} />,
    );
    await waitFor(() => expect(results.container.querySelector('.animate-spin')).toBeNull());

    expect(requested()).toEqual(pickerWeeks);
  });

  it('keeps the fares it has when the month changes, and asks only for the new month', async () => {
    answerEveryDate();
    const { container } = renderCalendar({ selectedDate: '' });
    await waitFor(() => expect(container.querySelector('.animate-spin')).toBeNull());
    fetch.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));

    const comingMonth = daysOf(monthOf(2));
    await waitFor(() => expect(cellText(container, comingMonth.at(-1))).toContain(String(priceFor(comingMonth.at(-1)))));
    expect(requested().flat().sort()).toEqual(comingMonth);
    const nextMonth = daysOf(monthOf(1));
    expect(cellText(container, nextMonth[0])).toContain(String(priceFor(nextMonth[0])));
  });

  it('asks for the chosen week first', async () => {
    answerEveryDate();
    const chosen = daysOf(monthOf(1))[20];
    renderCalendar({ selectedDate: chosen });

    await waitFor(() => expect(requested().length).toBeGreaterThan(0));
    expect(requested()[0]).toContain(chosen);
  });
});

/**
 * A phone shows one month: the first. It was always this month, so with a
 * date already chosen in a later one - reopening the field, or Modify on the
 * results page - the phone showed this month's days, greyed out late in the
 * month, and not the date chosen (27 Oct: October, 26 of its 31 days past).
 */
describe('the month it opens on', () => {
  const firstOfMonth = (offset) => {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() + offset);
    return date;
  };
  const dayOf = (offset, day) => {
    const month = firstOfMonth(offset);
    return formatDateToISO(new Date(month.getFullYear(), month.getMonth(), day));
  };
  const monthName = (offset) => firstOfMonth(offset).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const firstMonthShown = (container) => container.querySelector('[data-calendar-grid] .text-center.py-2\\.5').textContent;

  it('is the month of the date already chosen', () => {
    const { container } = renderCalendar({ selectedDate: dayOf(2, 13) });

    expect(firstMonthShown(container)).toBe(monthName(2));
    expect(container.querySelector(`[data-date="${dayOf(2, 13)}"]`).getAttribute('aria-pressed')).toBe('true');
  });

  it('is the first month that can be chosen from when the chosen date is before it', () => {
    const { container } = renderCalendar({ selectedDate: dayOf(1, 3), minDate: new Date(`${dayOf(2, 10)}T00:00:00`), showPrices: false });

    expect(firstMonthShown(container)).toBe(monthName(2));
  });

  it('is this month when no date is chosen', () => {
    const { container } = renderCalendar({ selectedDate: '' });

    expect(firstMonthShown(container)).toBe(monthName(0));
  });
});

/**
 * The calendar opens under the field that was clicked, 640 px wide from that
 * field's left edge. From the Return field it ran off the right of the screen
 * on every laptop width: 233 px at 1024, 104 px at 1366, 67 px at 1440
 * (measured on jetsetterss.com), with November cut off. jsdom has no layout,
 * so these give the calendar the rectangle a browser measured.
 */
describe('keeping the calendar on screen', () => {
  const place = ({ left, width = 640, page, scale = 1 }) => {
    const drawn = width * scale;
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function rect() {
      if (!this.hasAttribute('data-calendar-grid')) return new DOMRect(0, 0, 0, 0);
      return new DOMRect(left + (width - drawn) / 2, 300, drawn, 400);
    });
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(width);
    Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: page });
  };
  const calendar = () => screen.getByRole('dialog', { name: 'Choose a date' });

  afterEach(() => {
    vi.restoreAllMocks();
    delete document.documentElement.clientWidth;
  });

  it('moves left until its right edge is 16 px inside the page', () => {
    place({ left: 830, page: 1366 });
    renderCalendar({ showPrices: false });
    expect(calendar().style.left).toBe('-120px');
  });

  // It opens with a zoom from 95%, so the first measurement is of a smaller,
  // centred box; reading its left edge as-is left it 16 px off the page.
  it('measures through the opening zoom', () => {
    place({ left: 830, page: 1366, scale: 0.95 });
    renderCalendar({ showPrices: false });
    expect(calendar().style.left).toBe('-120px');
  });

  it('stays where it opened when it fits', () => {
    place({ left: 635, page: 1366 });
    renderCalendar({ showPrices: false });
    expect(calendar().style.left).toBe('');
  });

  it('keeps its left edge on the page when the page is narrower than it', () => {
    place({ left: 24, page: 600 });
    renderCalendar({ showPrices: false });
    expect(calendar().style.left).toBe('-8px');
  });
});

/**
 * On a 1920 x 1080 ThinkPad at 125% the page is 1536 x 730 and the Departure
 * field ends at 734, so the calendar opened at 745: wholly below the screen,
 * and clicking the date seemed to do nothing. At 1366 x 768, 23 px of it
 * showed (both measured on jetsetterss.com).
 */
describe('opening near the bottom of the screen', () => {
  const realInnerHeight = window.innerHeight;
  const realScrollBy = window.scrollBy;

  const place = ({ top, screen: screenHeight, height = 456, scale = 1 }) => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function rect() {
      if (!this.hasAttribute('data-calendar-grid')) return new DOMRect(0, 0, 0, 0);
      return new DOMRect(720 + (640 - 640 * scale) / 2, top + (height - height * scale) / 2, 640 * scale, height * scale);
    });
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(640);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(height);
    Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: 1536 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: screenHeight });
    window.scrollBy = vi.fn();
  };

  afterEach(() => {
    vi.restoreAllMocks();
    delete document.documentElement.clientWidth;
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: realInnerHeight });
    window.scrollBy = realScrollBy;
  });

  it('scrolls the page up until its foot is 16 px above the bottom', () => {
    place({ top: 745, screen: 730 });
    renderCalendar({ showPrices: false });
    expect(window.scrollBy).toHaveBeenCalledTimes(1);
    expect(window.scrollBy).toHaveBeenCalledWith({ top: 487, behavior: 'smooth' });
  });

  it('measures through the opening zoom', () => {
    place({ top: 745, screen: 730, scale: 0.95 });
    renderCalendar({ showPrices: false });
    expect(window.scrollBy).toHaveBeenCalledWith({ top: 487, behavior: 'smooth' });
  });

  it('keeps its top on screen when the screen is shorter than it', () => {
    place({ top: 745, screen: 400 });
    renderCalendar({ showPrices: false });
    expect(window.scrollBy).toHaveBeenCalledWith({ top: 729, behavior: 'smooth' });
  });

  it('leaves the page alone when it fits', () => {
    place({ top: 300, screen: 994 });
    renderCalendar({ showPrices: false });
    expect(window.scrollBy).not.toHaveBeenCalled();
  });
});

// On a phone the calendar spans the screen, and the WhatsApp, Contact Us and
// chat buttons covered its Sunday column and its Done button. They hide while
// a calendar is open (FloatingHelp.css, AIChatbot.css).
describe('the floating buttons while the calendar is open', () => {
  it('marks the page while it is open, and clears the mark when it closes', () => {
    const { unmount } = renderCalendar({ showPrices: false });
    expect(document.body.classList.contains('date-picker-open')).toBe(true);
    unmount();
    expect(document.body.classList.contains('date-picker-open')).toBe(false);
  });

  it('is what the floating buttons hide on', async () => {
    const { readFileSync } = await import('node:fs');
    const css = (file) => readFileSync(`${process.cwd()}/frontend/src/Pages/Common/${file}`, 'utf8');
    expect(css('FloatingHelp.css')).toMatch(/body\.date-picker-open \.floating-help\s*\{[^}]*visibility:\s*hidden/);
    expect(css('AIChatbot.css')).toMatch(/body\.date-picker-open \.ai-chatbot-container\s*\{[^}]*visibility:\s*hidden/);
  });
});
