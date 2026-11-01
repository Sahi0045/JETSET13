import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FlightFareCalendar from '../../frontend/src/Pages/Common/flights/FlightFareCalendar.jsx';
import { formatDateToISO } from '../../frontend/src/utils/dateUtils.js';

const ahead = new Date();
ahead.setMonth(ahead.getMonth() + 2, 10);
const daysInMonth = new Date(ahead.getFullYear(), ahead.getMonth() + 1, 0).getDate();
const iso = (day) => formatDateToISO(new Date(ahead.getFullYear(), ahead.getMonth(), day));
const monthDates = Array.from({ length: daysInMonth }, (_, i) => iso(i + 1));

const priceFor = (date) => 100 + Number(date.slice(-2));
const requested = () => fetch.mock.calls.map(([, init]) => JSON.parse(init.body).dates);

const answerEveryDate = ({ failWeekWith } = {}) => {
  globalThis.fetch = vi.fn((url, init) => {
    const { dates } = JSON.parse(init.body);
    if (failWeekWith && dates.includes(failWeekWith)) return Promise.reject(new Error('network'));
    const dateWisePrices = Object.fromEntries(dates.map((date) => [date, priceFor(date)]));
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ success: true, dateWisePrices, currency: 'USD' }) });
  });
};

const open = (props = {}) => render(
  <FlightFareCalendar
    searchParams={{ from: 'DEL', to: 'BOM', adults: 1 }}
    initialDate={iso(10)}
    selectedDate={iso(10)}
    onSelectDate={() => {}}
    onClose={() => {}}
    {...props}
  />,
);

const cellText = (container, date) => container.querySelector(`[data-date="${date}"]`).textContent;

beforeEach(() => {
  localStorage.setItem('userCurrency', 'USD');
});

describe('the fare calendar', () => {
  it('prices every day of the month, not a sample of it', async () => {
    answerEveryDate();
    const { container } = open();

    await waitFor(() => {
      for (const date of monthDates) expect(cellText(container, date)).toContain(String(priceFor(date)));
    });
  });

  it('asks a week at a time, so the server prices each day it is asked for', async () => {
    answerEveryDate();
    open();

    await waitFor(() => expect(requested().flat().sort()).toEqual(monthDates));
    for (const dates of requested()) expect(dates.length).toBeLessThanOrEqual(7);
  });

  it("shows the searched day's price at once, from the results already on the page", () => {
    globalThis.fetch = vi.fn(() => new Promise(() => {}));
    const { container } = open({ knownPrices: { [iso(10)]: 88.5 } });

    expect(cellText(container, iso(10))).toContain('88.5');
  });

  it('keeps the other weeks when one week cannot be priced', async () => {
    answerEveryDate({ failWeekWith: iso(1) });
    const { container } = open();

    await waitFor(() => expect(cellText(container, iso(daysInMonth))).toContain(String(priceFor(iso(daysInMonth)))));
    expect(cellText(container, iso(1))).not.toContain(String(priceFor(iso(1))));
  });
});
