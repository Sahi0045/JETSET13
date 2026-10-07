import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../frontend/src/contexts/SupabaseAuthContext', () => ({
  useSupabaseAuth: () => ({ user: null, session: null, isAuthenticated: false }),
}));
vi.mock('../../frontend/src/lib/supabase', () => ({ default: { from: vi.fn() } }));

const { default: FlightCard } = await import('../../frontend/src/Pages/Common/flights/FlightCard.jsx');
const { default: ContactPopup } = await import('../../frontend/src/Pages/Common/ContactPopup.jsx');
const { default: AIChatbot } = await import('../../frontend/src/Pages/Common/AIChatbot.jsx');

/**
 * What a result card and the floating buttons look like on a phone. jsdom has
 * no layout, so these pin the classes the 360 px layout depends on; the widths
 * themselves were measured in a phone-sized browser.
 */

const oneStop = {
  id: '1',
  airline: { code: 'SV', name: 'Saudi Arabian Airlines', logo: '' },
  departure: { time: '20:05', airport: 'DEL', terminal: '3', cityName: 'New Delhi', rawDate: '2026-10-14T20:05:00' },
  arrival: { time: '14:45', airport: 'JFK', cityName: 'New York JFK', rawDate: '2026-10-15T14:45:00' },
  duration: 'PT28H10M',
  stops: 1,
  segments: [
    { departure: { iataCode: 'DEL', at: '2026-10-14T20:05:00' }, arrival: { iataCode: 'JED', at: '2026-10-14T23:00:00' } },
    { departure: { iataCode: 'JED', at: '2026-10-15T08:45:00' }, arrival: { iataCode: 'JFK', at: '2026-10-15T14:45:00' } },
  ],
  price: { amount: 600, total: '600.00', base: '500.00', currency: 'USD' },
  baggage: { checked: null, cabin: null },
  originalOffer: { id: '1', travelerPricings: [{ travelerType: 'ADULT' }] },
};

beforeEach(() => {
  localStorage.setItem('userCurrency', 'USD');
});

describe('a result card at phone width', () => {
  const columns = () => {
    render(<FlightCard flight={oneStop} onViewPrices={() => {}} />);
    const middle = screen.getByText(/1 stop/).closest('.flex-1');
    return { departure: middle.previousElementSibling, middle, arrival: middle.nextElementSibling };
  };

  // The stops pill set the middle's smallest width, so the arrival column was
  // pushed past the card's edge and cut off.
  it('lets the stops column shrink below its pill', () => {
    expect(columns().middle.className).toMatch(/\bmin-w-0\b/);
  });

  it('keeps the departure and arrival columns at their full width', () => {
    const { departure, arrival } = columns();
    expect(departure.className).toMatch(/\bshrink-0\b/);
    expect(arrival.className).toMatch(/\bshrink-0\b/);
  });

  // The pill sat in a centred box as wide as its text, so it ran out of the
  // column and over the arrival city. It wraps instead of hiding the wait.
  it('keeps the stops pill inside its column, wrapping rather than cutting the wait', () => {
    const { middle } = columns();
    const pill = within(middle).getByText(/stop/).parentElement;
    expect(pill.parentElement.className).toMatch(/\bw-full\b/);
    expect(pill.className).toMatch(/\bflex-wrap\b/);
    expect(middle.querySelector('.truncate')).toBeNull();
  });

  // At 320 px the pill broke "9h 45m" across two lines.
  it('never splits the wait across lines', () => {
    const { middle } = columns();
    expect(within(middle).getByText(/9h 45m wait/).className).toMatch(/\bwhitespace-nowrap\b/);
  });

  // "Wed, Oct" on one line and "14" on the next.
  it('keeps each date on one line', () => {
    const { departure, arrival } = columns();
    expect(departure.children[1].className).toMatch(/\bwhitespace-nowrap\b/);
    expect(arrival.children[1].className).toMatch(/\bwhitespace-nowrap\b/);
  });
});

describe('the floating buttons', () => {
  const iconOf = (button) => [...button.querySelectorAll('path, rect, polyline, line')]
    .map((shape) => shape.outerHTML).join('');

  // On a phone Contact Us collapses to a blue circle; it showed the chatbot's
  // speech bubble, so the page looked like it had two chat buttons.
  it('gives Contact Us an icon of its own, not the chatbot bubble', () => {
    const { container } = render(<><ContactPopup /><AIChatbot /></>);
    const contact = screen.getByRole('button', { name: 'Contact us' });
    const chat = container.querySelector('.chat-toggle-button');
    expect(iconOf(contact)).not.toBe(iconOf(chat));
  });
});
