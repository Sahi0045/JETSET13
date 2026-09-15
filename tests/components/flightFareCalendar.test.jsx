import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FlightFareCalendar from '../../frontend/src/Pages/Common/flights/FlightFareCalendar.jsx';
import { formatDateToISO } from '../../frontend/src/utils/dateUtils.js';

/**
 * The results page's fare calendar, from the keyboard.
 *
 * Its days were buttons, but nothing moved between them: a keyboard user had
 * to Tab through every day of the month to reach one.
 */

// A month well ahead, so no day in it is past.
const ahead = new Date();
ahead.setMonth(ahead.getMonth() + 2, 10);
const iso = (day) => formatDateToISO(new Date(ahead.getFullYear(), ahead.getMonth(), day));

beforeEach(() => {
  localStorage.setItem('userCurrency', 'USD');
  globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ dateWisePrices: {} }) }));
});

describe('FlightFareCalendar from the keyboard', () => {
  it('reaches the chosen day with Tab, moves with the arrow keys and chooses with a press', () => {
    const onSelectDate = vi.fn();
    const onClose = vi.fn();
    const { container } = render(
      <FlightFareCalendar
        searchParams={{ from: 'DEL', to: 'BOM' }}
        initialDate={iso(10)}
        selectedDate={iso(10)}
        onSelectDate={onSelectDate}
        onClose={onClose}
      />,
    );
    const day = (n) => container.querySelector(`[data-date="${iso(n)}"]`);

    expect(day(10).getAttribute('aria-pressed')).toBe('true');
    expect(day(10).tabIndex).toBe(0);
    expect(day(11).tabIndex).toBe(-1);

    day(10).focus();
    fireEvent.keyDown(day(10), { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(day(9));
    fireEvent.keyDown(document.activeElement, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(day(16));

    fireEvent.click(document.activeElement);
    expect(onSelectDate).toHaveBeenCalledWith(iso(16));
  });

  it('names its buttons', () => {
    render(<FlightFareCalendar searchParams={{}} initialDate={iso(10)} selectedDate={iso(10)} onSelectDate={() => {}} onClose={() => {}} />);

    expect(screen.getByRole('button', { name: 'Close fare calendar' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Next month' })).toBeTruthy();
  });
});
