import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FlightFareOptions from '../../frontend/src/Pages/Common/flights/FlightFareOptions.jsx';
import { STATES, alignedFareInclusions, fareInclusions } from '../../shared/fareInclusions.js';
import { formatCheckedBag } from '../../frontend/src/utils/baggage.js';

/**
 * "Choose your fare" next to Booking.com's (31 Oct). On Air India DEL-HYD our
 * cards read "15 K check-in", "Refunds: see fare rules" and "Seat selection";
 * the airline had said each fare's refund and date change come at a fee, or
 * are included, and Booking.com showed that on every fare.
 */

const service = (text, status) => ({ text, status });
const amenity = (description, isChargeable) => ({ description, isChargeable });

// Air India Eco Value and Eco Flex as the live upsell returned them (31 Oct).
const ecoValue = {
  id: 'eco-value',
  brandedFareLabel: 'ECO VALUE',
  price: { amount: 123, total: '123.00', currency: 'USD' },
  baggageDetails: { checked: { weight: 15, weightUnit: 'K' }, cabin: null },
  amenities: [
    amenity('PRE RESERVED SEAT ASSIGNMENT', false),
    amenity('FREE CHECKED BAGGAGE ALLOWANCE', false),
    amenity('CHANGEABLE TICKET', true),
    amenity('REFUNDABLE TICKET', true),
    amenity('UPGRADE', true),
  ],
  originalOffer: { id: 'eco-value', travelerPricings: [{ travelerType: 'ADULT', price: { total: '123.00' } }] },
};
const ecoFlex = {
  ...ecoValue,
  id: 'eco-flex',
  brandedFareLabel: 'ECO FLEX',
  price: { amount: 139.8, total: '139.80', currency: 'USD' },
  baggageDetails: { checked: { weight: 25, weightUnit: 'KG' }, cabin: null },
  amenities: [
    amenity('PRE RESERVED SEAT ASSIGNMENT', false),
    amenity('CHANGEABLE TICKET', false),
    amenity('FREE CHECKED BAGGAGE ALLOWANCE', false),
    amenity('REFUNDABLE TICKET', true),
  ],
  originalOffer: { id: 'eco-flex', travelerPricings: [{ travelerType: 'ADULT', price: { total: '139.80' } }] },
};

// Lufthansa Economy Light, from Fare_GetFareFamilyDescription (PDT, 5 Oct).
const economyLight = {
  baggageDetails: { checked: { quantity: 0 }, cabin: { weight: 8, weightUnit: 'KG' } },
  fareServices: [
    service('PERSONAL ITEM', 'included'),
    service('1 CABIN BAG UP TO 8KG', 'included'),
    service('MILEAGE ACCRUAL', 'included'),
    service('IN FLIGHT ENTERTAINMENT', 'included'),
    service('1ST BAG UPTO50LB23KG 62LI158CM', 'charged'),
    service('UPGRADE ELIGIBILITY', 'charged'),
    service('STANDARD SEAT RESERVATION', 'charged'),
    service('PREFERRED SEAT RESERVATION', 'charged'),
    service('LOUNGE ACCESS', 'charged'),
    service('CHANGE BEFORE DEPARTURE', 'notOffered'),
    service('CHANGE AFTER DEPARTURE', 'notOffered'),
    service('REFUND BEFORE DEPARTURE', 'notOffered'),
    service('REFUND AFTER DEPARTURE', 'notOffered'),
  ],
};

const row = (fare, key) => fareInclusions(fare).rows[key];

describe('what a fare includes', () => {
  it('says what Air India said: refund and date change at a fee, seat and bag included', () => {
    expect(row(ecoValue, 'checkedBag')).toEqual({ state: STATES.INCLUDED, label: '15 kg checked bag' });
    expect(row(ecoValue, 'cancel')).toEqual({ state: STATES.FEE, label: 'Cancellation for a fee' });
    expect(row(ecoValue, 'change')).toEqual({ state: STATES.FEE, label: 'Date change for a fee' });
    expect(row(ecoValue, 'seat')).toEqual({ state: STATES.INCLUDED, label: 'Free seat selection' });
    expect(row(ecoFlex, 'change')).toEqual({ state: STATES.INCLUDED, label: 'Date change included' });
  });

  it('says what a fare does not offer, when the airline says so', () => {
    expect(row(economyLight, 'cancel')).toEqual({ state: STATES.NO, label: 'Non-refundable' });
    expect(row(economyLight, 'change')).toEqual({ state: STATES.NO, label: 'No date changes' });
    expect(row(economyLight, 'checkedBag')).toEqual({ state: STATES.FEE, label: 'Checked bag for a fee' });
    expect(row(economyLight, 'seat')).toEqual({ state: STATES.FEE, label: 'Seat selection for a fee' });
    expect(row(economyLight, 'cabinBag')).toEqual({ state: STATES.INCLUDED, label: '1 cabin bag up to 8 kg' });
    expect(row(economyLight, 'personalItem')).toEqual({ state: STATES.INCLUDED, label: 'Personal item' });
    expect(fareInclusions(economyLight).extras).toEqual(['Earns miles', 'In-flight entertainment']);
  });

  it('invents nothing: a fare that states nothing reads "see fare rules"', () => {
    const silent = { baggageDetails: { checked: null } };
    expect(row(silent, 'checkedBag')).toEqual({ state: STATES.UNKNOWN, label: 'Checked bag: see fare rules' });
    expect(row(silent, 'cancel')).toEqual({ state: STATES.UNKNOWN, label: 'Cancellation: see fare rules' });
    expect(row(silent, 'seat')).toBeNull();
    expect(row(silent, 'cabinBag')).toBeNull();
  });

  it('lines the fares up: a row one fare states is on every fare', () => {
    const [silent, light] = alignedFareInclusions([{ baggageDetails: { checked: null } }, economyLight]);
    expect(silent.rows.map((r) => r.key)).toEqual(light.rows.map((r) => r.key));
    expect(silent.rows.find((r) => r.key === 'seat')).toEqual({ key: 'seat', state: STATES.UNKNOWN, label: 'Seat selection: not stated' });
  });

  it('writes "15 K" as kilograms everywhere a bag is shown', () => {
    expect(formatCheckedBag({ weight: 15, weightUnit: 'K' })).toBe('15 KG');
  });
});

describe('the choose-your-fare window', () => {
  const flight = {
    id: 'clicked',
    airline: { code: 'AI', name: 'Air India Limited', logo: '' },
    departure: { time: '09:40', airport: 'DEL', terminal: '3', date: 'Fri, 6 Nov' },
    arrival: { time: '11:55', airport: 'HYD', terminal: '' },
    duration: '2h 15m',
    stops: 0,
    flightNumber: 'AI-2542',
    aircraft: 'Airbus A320neo',
    fareBasis: 'UU1YXSII',
    bookingClass: 'U',
    price: { amount: 123, total: '123.00', currency: 'USD' },
    baggage: { checked: { weight: 15, weightUnit: 'KG' }, cabin: null },
    originalOffer: { id: 'clicked', travelerPricings: [{ travelerType: 'ADULT', price: { total: '123.00' } }] },
  };

  beforeEach(() => {
    localStorage.setItem('userCurrency', 'USD');
    globalThis.fetch = vi.fn((url) => Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(String(url).includes('upsell')
        ? { success: true, data: [{ ...ecoValue, fareBasis: 'UU1YXSII', bookingClass: 'U' }, ecoFlex] }
        : { success: true }),
    }));
  });

  it('names the flight in full: date, terminal, flight number, aircraft and time in the air', async () => {
    render(<FlightFareOptions flight={flight} onClose={() => {}} onSelect={() => {}} />);
    await screen.findByText('Eco Flex');

    const trip = screen.getByTestId('fare-options-trip');
    expect(trip.textContent).toContain('Fri, 6 Nov');
    expect(trip.textContent).toContain('DEL T3 09:40');
    expect(trip.textContent).toContain('2h 15m · Non stop · AI 2542 · Airbus A320neo');
  });

  it('shows every fare the same rows, and what each dearer fare costs over the cheapest', async () => {
    render(<FlightFareOptions flight={flight} onClose={() => {}} onSelect={() => {}} />);
    await screen.findByText('Eco Flex');

    const [value, flex] = screen.getAllByTestId('fare-option');
    expect(within(value).getByText('15 kg checked bag')).toBeTruthy();
    expect(within(value).getByText('Cancellation for a fee')).toBeTruthy();
    expect(within(value).getByText('Date change for a fee')).toBeTruthy();
    expect(within(flex).getByText('Date change included')).toBeTruthy();
    expect(within(flex).getByText('25 kg checked bag')).toBeTruthy();
    expect(flex.textContent).toMatch(/\+\$16\.80/);
    expect(value.textContent).not.toMatch(/\+\$/);
    expect(screen.queryByText(/see fare rules/i)).toBeNull();
    expect(screen.getByText(/exact fees for cancelling or changing are in the fare rules/i)).toBeTruthy();
  });

  // The review page shows the chosen fare's terms from what is handed on.
  it('hands the chosen fare on with what it includes', async () => {
    const flexServices = [service('CHANGEABLE TICKET', 'included'), service('REFUNDABLE TICKET', 'charged')];
    globalThis.fetch = vi.fn((url) => Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(String(url).includes('upsell')
        ? { success: true, data: [{ ...ecoValue, fareBasis: 'UU1YXSII', bookingClass: 'U' }, { ...ecoFlex, fareServices: flexServices }] }
        : { success: true }),
    }));
    const onSelect = vi.fn();
    render(<FlightFareOptions flight={flight} onClose={() => {}} onSelect={onSelect} />);
    await screen.findByText('Eco Flex');

    fireEvent.click(screen.getAllByRole('button', { name: 'BOOK' })[1]);
    await waitFor(() => expect(onSelect).toHaveBeenCalled());
    expect(onSelect.mock.calls[0][0].originalOffer.id).toBe('eco-flex');
    expect(onSelect.mock.calls[0][0].fareServices).toEqual(flexServices);
  });

  it('does not lend the clicked fare\'s "non-refundable" to another family', async () => {
    const onSelect = vi.fn();
    render(<FlightFareOptions flight={{ ...flight, refundable: false }} onClose={() => {}} onSelect={onSelect} />);
    await screen.findByText('Eco Flex');

    fireEvent.click(screen.getAllByRole('button', { name: 'BOOK' })[1]);
    await waitFor(() => expect(onSelect).toHaveBeenCalled());
    expect(onSelect.mock.calls[0][0].refundable).toBeNull();
  });
});
