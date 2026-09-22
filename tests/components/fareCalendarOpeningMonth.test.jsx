import React from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FlightFareCalendar from '../../frontend/src/Pages/Common/flights/FlightFareCalendar.jsx';

/**
 * The month the results page's fare calendar opens on.
 *
 * It opened on `new Date(initialDate)`, and a bare 'YYYY-MM-DD' parses as UTC
 * midnight - the evening before in New York. A search departing on the 1st
 * opened the calendar on the month before, with the searched date nowhere on
 * screen. The site settles in USD; its customers are west of UTC.
 */

let savedTz;
beforeEach(() => {
  savedTz = process.env.TZ;
  localStorage.setItem('userCurrency', 'USD');
  globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ dateWisePrices: {} }) }));
});
afterEach(() => {
  if (savedTz === undefined) delete process.env.TZ;
  else process.env.TZ = savedTz;
});

// Two months ahead, so never a past month.
const dateAhead = (day) => {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth() + 2, day);
  return {
    isoDate: `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    heading: `${target.toLocaleDateString('en-US', { month: 'long' })} ${target.getFullYear()}`,
  };
};

const opensOn = (tz, day) => {
  process.env.TZ = tz;
  const { isoDate, heading } = dateAhead(day);
  const { container } = render(
    <FlightFareCalendar
      searchParams={{ from: 'JFK', to: 'LHR' }}
      initialDate={isoDate}
      selectedDate={isoDate}
      onSelectDate={() => {}}
      onClose={() => {}}
    />,
  );
  expect(container.querySelector(`[data-date="${isoDate}"]`)).not.toBeNull();
  expect(screen.getByText(heading)).toBeTruthy();
};

describe('the fare calendar opens on the month of the searched date', () => {
  it('for a search on the 1st, in New York', () => opensOn('America/New_York', 1));

  it('for a mid-month search, in New York', () => opensOn('America/New_York', 15));

  it('for a search on the 1st, in UTC', () => opensOn('UTC', 1));
});
