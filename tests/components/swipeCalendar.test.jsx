import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { format } from 'date-fns';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CustomFlightCalendar from '../../frontend/src/Pages/Common/flights/CustomFlightCalendar.jsx';
import FlightFareCalendar from '../../frontend/src/Pages/Common/flights/FlightFareCalendar.jsx';
import FlightSearchForm from '../../frontend/src/Pages/Common/flights/flight-search-form.jsx';
import { formatDateToISO } from '../../frontend/src/utils/dateUtils.js';

/**
 * The owner wants the flight calendars to slide on a phone (3 Nov 2026): the
 * calendar rises from the foot of the screen and its months are swiped through
 * sideways, a month to a swipe.
 */

const WIDTH = 360;
const monthAt = (offset) => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + offset, 1);
};
const label = (offset) => format(monthAt(offset), 'MMMM yyyy');
const dayIn = (offset, day) => formatDateToISO(new Date(monthAt(offset).getFullYear(), monthAt(offset).getMonth(), day));
const respond = (body) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
const datePriceCalls = () => fetch.mock.calls.filter(([url]) => String(url).includes('/flights/date-prices'));
const askedDates = () => datePriceCalls().flatMap(([, init]) => JSON.parse(init.body).dates);

const swipeTo = (index) => {
  const track = screen.getByTestId('swipe-months');
  track.scrollLeft = index * WIDTH;
  fireEvent.scroll(track);
};

const onScreen = (width) => {
  window.matchMedia = vi.fn((query) => ({
    matches: query === '(max-width: 639px)' && width < 640,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
};

beforeEach(() => {
  localStorage.setItem('userCurrency', 'USD');
  globalThis.fetch = vi.fn((url, init) => {
    if (!String(url).includes('/flights/date-prices')) return respond({});
    const { dates } = JSON.parse(init.body);
    return respond({ success: true, currency: 'USD', dateWisePrices: Object.fromEntries(dates.map((date) => [date, 100])) });
  });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get() { return this.dataset?.testid === 'swipe-months' ? WIDTH : 0; },
  });
  HTMLElement.prototype.scrollTo = vi.fn(function scrollTo({ left }) {
    this.scrollLeft = left;
    this.dispatchEvent(new Event('scroll'));
  });
  onScreen(390);
});

afterEach(() => {
  delete HTMLElement.prototype.clientWidth;
  delete HTMLElement.prototype.scrollTo;
  delete window.matchMedia;
  document.body.style.overflow = '';
});

describe('the search form calendar on a phone', () => {
  const open = (props = {}) => render(
    <CustomFlightCalendar
      title="Departure date"
      selectedDate={dayIn(2, 10)}
      originCode="DEL"
      destinationCode="BOM"
      onSelect={() => {}}
      onClose={() => {}}
      {...props}
    />,
  );

  it('rises over the whole page with a year of months to swipe, opened on the chosen month', () => {
    const { container, unmount } = open();
    const sheet = screen.getByRole('dialog', { name: 'Departure date' });
    const track = screen.getByTestId('swipe-months');
    const months = within(track).getAllByRole('group');

    expect(container.contains(sheet)).toBe(false);
    expect(sheet.parentElement.parentElement).toBe(document.body);
    expect(months).toHaveLength(12);
    expect(months[0].getAttribute('aria-label')).toBe(label(0));
    expect(months[11].getAttribute('aria-label')).toBe(label(11));
    expect(track.scrollLeft).toBe(2 * WIDTH);
    expect(within(sheet).getByText(label(2))).toBeTruthy();
    expect(document.body.style.overflow).toBe('hidden');

    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('shows the month a swipe settles on, and asks for its fares', async () => {
    open({ selectedDate: dayIn(1, 10) });
    const sheet = screen.getByRole('dialog', { name: 'Departure date' });

    swipeTo(3);

    await waitFor(() => expect(within(sheet).getByText(label(3))).toBeTruthy());
    await waitFor(() => expect(askedDates()).toContain(dayIn(3, 15)));
  });

  it('glides a month along with the arrows, and goes no further back than the first month', () => {
    open({ selectedDate: '' });
    const sheet = screen.getByRole('dialog', { name: 'Departure date' });

    expect(screen.getByRole('button', { name: 'Previous month' }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));

    expect(HTMLElement.prototype.scrollTo).toHaveBeenLastCalledWith({ left: WIDTH, behavior: 'smooth' });
    expect(within(sheet).getByText(label(1))).toBeTruthy();
  });

  it('does not take a glide that is still under way for a swipe back', async () => {
    HTMLElement.prototype.scrollTo = vi.fn(function glide({ left }) {
      const from = this.scrollLeft;
      this.scrollLeft = from + (left - from) * 0.3;
      this.dispatchEvent(new Event('scroll'));
      setTimeout(() => {
        this.scrollLeft = left;
        this.dispatchEvent(new Event('scroll'));
      }, 30);
    });
    open({ selectedDate: '' });
    const sheet = screen.getByRole('dialog', { name: 'Departure date' });

    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(within(sheet).getByText(label(1))).toBeTruthy();
    expect(screen.getByTestId('swipe-months').scrollLeft).toBe(WIDTH);
  });

  it('chooses the day tapped in the search form', () => {
    render(
      <MemoryRouter>
        <FlightSearchForm onSearch={() => {}} initialData={{ from: '', to: '', departDate: '', tripType: 'oneWay', returnDate: '' }} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Select departure date' }));
    const day = screen.getByRole('dialog', { name: 'Departure date' }).querySelector(`[data-date="${dayIn(1, 15)}"]`);

    fireEvent.mouseDown(day);
    fireEvent.mouseUp(day);
    fireEvent.click(day);

    expect(screen.queryByRole('dialog', { name: 'Departure date' })).toBeNull();
    const chosen = new Date(monthAt(1).getFullYear(), monthAt(1).getMonth(), 15);
    expect(screen.getByRole('button', { name: 'Select departure date' }).textContent)
      .toContain(`15 ${format(chosen, "MMM''yy")}${format(chosen, 'EEEE')}`);
  });

  it('shuts on a tap above it', () => {
    const onClose = vi.fn();
    open({ onClose });

    fireEvent.click(screen.getByRole('dialog', { name: 'Departure date' }).previousSibling);

    expect(onClose).toHaveBeenCalled();
  });

  it('stays a drop-down beside the field on a wider screen', () => {
    onScreen(1280);
    const { container } = open();

    expect(container.querySelector('[role="dialog"]')).toBeTruthy();
    expect(screen.queryByTestId('swipe-months')).toBeNull();
    expect(document.body.style.overflow).toBe('');
  });
});

describe('the results page fare calendar on a phone', () => {
  const open = () => render(
    <FlightFareCalendar
      searchParams={{ fromCode: 'DEL', toCode: 'BOM' }}
      initialDate={dayIn(1, 10)}
      selectedDate={dayIn(1, 10)}
      onSelectDate={() => {}}
      onClose={() => {}}
    />,
  );
  const fareOn = (date) => document.querySelector(`[data-date="${date}"]`).textContent;

  it('swipes through a year of months and keeps the fares found as it goes', async () => {
    open();
    const months = within(screen.getByTestId('swipe-months')).getAllByRole('group');
    expect(months).toHaveLength(12);
    expect(screen.getByTestId('swipe-months').scrollLeft).toBe(WIDTH);
    await waitFor(() => expect(fareOn(dayIn(1, 20))).toContain('$100'));

    swipeTo(2);
    await waitFor(() => expect(fareOn(dayIn(2, 20))).toContain('$100'));
    const asked = datePriceCalls().length;

    swipeTo(1);
    await waitFor(() => expect(screen.getByText(label(1))).toBeTruthy());
    expect(fareOn(dayIn(1, 20))).toContain('$100');
    expect(datePriceCalls()).toHaveLength(asked);
  });

  it('marks no day of a month not yet asked about as having no fare', async () => {
    open();
    await waitFor(() => expect(fareOn(dayIn(1, 20))).toContain('$100'));

    expect(fareOn(dayIn(4, 20))).not.toContain('—');
  });
});
