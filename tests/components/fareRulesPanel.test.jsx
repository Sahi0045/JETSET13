import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import FlightFareRules from '../../frontend/src/Pages/Common/flights/FlightFareRules.jsx';

/**
 * The review page's "Baggage & Fare Rules" panel.
 *
 * The bags it is given are the fare's own allowance, one per flight, with no
 * price: they were shown as "+2 checked bags" twice under "Extra baggage the
 * airline sells for this fare". The rules arrive as the airline's headed
 * blocks, and were eight panels titled "Penalties" and "Information".
 */

const offer = {
  itineraries: [{ segments: [
    { id: '1', departure: { iataCode: 'FRA' }, arrival: { iataCode: 'JFK' } },
    { id: '2', departure: { iataCode: 'JFK' }, arrival: { iataCode: 'LAX' } },
  ] }],
};
const ready = (data) => ({ status: 'ready', data });
const bag = (quantity, segment) => ({ quantity, name: 'CHECKED_BAG', price: null, segmentIds: [segment] });

beforeEach(() => {
  localStorage.setItem('userCurrency', 'USD');
});

describe('the baggage', () => {
  it('is the allowance the fare includes, said once when every flight allows the same', () => {
    render(<FlightFareRules flightOffer={offer} rules={ready({ bags: [bag(2, '1'), bag(2, '2')], fareRules: [] })} />);

    expect(screen.getByText('Checked baggage included in this fare')).toBeTruthy();
    expect(screen.getAllByText('2 checked bags on every flight')).toHaveLength(1);
    expect(screen.queryByText(/Extra baggage the airline sells/)).toBeNull();
    expect(screen.queryByText(/\+2 checked bags/)).toBeNull();
  });

  it('names each flight when the allowance differs', () => {
    render(<FlightFareRules flightOffer={offer} rules={ready({ bags: [bag(1, '1'), bag(0, '2')], fareRules: [] })} />);

    expect(screen.getByText('FRA → JFK: 1 checked bag')).toBeTruthy();
    expect(screen.getByText('JFK → LAX: No checked bag')).toBeTruthy();
  });
});

describe('the rules', () => {
  const rules = [
    { title: 'CANCELLATIONS', text: 'ANY TIME\nCANCELLATIONS PERMITTED.\nWAIVED FOR DEATH OF PASSENGER OR FAMILY MEMBER.\n\nREFUND PERMITTED WITHIN TICKET VALIDITY.' },
    { title: 'CHANGES', text: 'CHANGES NOT PERMITTED.\n\nCHARGE EUR 400.00 FOR REISSUE.' },
  ];

  it('say plainly whether each is allowed, and what the rules mean', () => {
    render(<FlightFareRules flightOffer={offer} rules={ready({ bags: [], fareRules: rules })} />);

    expect(screen.getByText('Cancellation & refund')).toBeTruthy();
    expect(screen.getByText('Allowed')).toBeTruthy();
    expect(screen.getByText('Refund available while the ticket is valid')).toBeTruthy();
    expect(screen.getByText('Fees waived if the passenger or a close family member dies')).toBeTruthy();
    expect(screen.getByText('Date & flight changes')).toBeTruthy();
    expect(screen.getByText('Conditions apply')).toBeTruthy();
    expect(screen.queryByText('Penalties')).toBeNull();
  });

  it('say not allowed only when the airline refuses outright', () => {
    render(<FlightFareRules flightOffer={offer} rules={ready({ bags: [], fareRules: [{ title: 'CANCELLATIONS', text: 'CANCELLATIONS NOT PERMITTED.' }] })} />);

    expect(screen.getByText('Not allowed')).toBeTruthy();
  });

  // The policy card above reads fees in US dollars; this panel must not put
  // the airline's euros beside it.
  it('show fees the way the cancellation policy does', () => {
    render(<FlightFareRules flightOffer={offer} rules={ready({ bags: [], fareRules: rules })} />);

    expect(screen.getByText('€400')).toBeTruthy();
    expect(screen.queryByText(/EUR 400/)).toBeNull();
  });

  it('keep the airline\'s full text one click away, readable', () => {
    render(<FlightFareRules flightOffer={offer} rules={ready({ bags: [], fareRules: rules })} />);
    expect(screen.queryByText(/Waived for death of passenger/)).toBeNull();

    fireEvent.click(screen.getAllByText("Read the airline's full rules")[0]);

    expect(screen.getByText('Any time cancellations permitted. Waived for death of passenger or family member.')).toBeTruthy();
    expect(screen.getByText('Refund permitted within ticket validity.')).toBeTruthy();
  });
});

describe('the airline fee table', () => {
  const cell = (allowed, amount = null) => ({ allowed, amount, varies: false });
  const penalties = {
    currency: 'USD',
    bookBy: '2026-11-04',
    change: { before: cell(true, 338), noShowBefore: cell(true, 338), after: cell(false), noShowAfter: cell(false) },
    refund: { before: cell(false), noShowBefore: cell(false), after: cell(false), noShowAfter: cell(false) },
  };

  it('shows cancel and change-date fees by situation when the fare check carries them', () => {
    render(<FlightFareRules flightOffer={offer} rules={ready({ bags: [], fareRules: [], penalties })} />);

    expect(screen.getByText('Cancel or change: airline fees')).toBeTruthy();
    expect(screen.getByText('Before departure')).toBeTruthy();
    expect(screen.getByText('If you miss the flight')).toBeTruthy();
    expect(screen.getByText('After departure')).toBeTruthy();
    expect(screen.getAllByText('Not refundable')).toHaveLength(3);
    expect(screen.getAllByText('US$338')).toHaveLength(2);
    expect(screen.getByText('Not allowed')).toBeTruthy();
  });

  it('shows no fee table without one', () => {
    render(<FlightFareRules flightOffer={offer} rules={ready({ bags: [], fareRules: [{ title: 'CANCELLATIONS', text: 'ANY TIME\nTICKET IS NON-REFUNDABLE.' }], penalties: null })} />);

    expect(screen.queryByText('Cancel or change: airline fees')).toBeNull();
  });
});
