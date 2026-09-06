import { describe, expect, it } from 'vitest';
import * as T from '../../backend/services/email/templates.js';
import { dataGrid, figureBlock, humanDuration, progressSteps, stayCard, stepList } from '../../backend/services/emailTemplate.js';

/**
 * Email templates.
 *
 * These render straight into a customer's inbox with no review step, so the
 * failure mode that matters is not "it looks wrong" — it is a template that
 * throws on a field the caller happened not to pass, or that interpolates
 * `undefined` into the message and sends it anyway. Both have happened: the
 * generators are called from controllers, routes and background jobs, each
 * with a slightly different data shape, and half the fields are optional.
 *
 * So the contract asserted here is deliberately blunt and applies to every
 * template: given nothing, do not throw; given nothing, do not print the word
 * "undefined" at the customer.
 */

/** Every generator this module exports. */
const generators = Object.entries(T).filter(([name]) => name.startsWith('generate'));

/** Strings that mean a value leaked through a template hole. */
const LEAKS = ['undefined', 'null', 'NaN', '[object Object]', 'Invalid Date'];

const leaksIn = (html) => LEAKS.filter((token) => html.includes(token));

describe('every template', () => {
  it('exports the full set the app sends', () => {
    // A generator that is deleted or renamed breaks a caller at runtime, in a
    // background job nobody watches. Pin the count so that is a test failure.
    expect(generators.length).toBeGreaterThanOrEqual(27);
  });

  it.each(generators)('%s survives an empty payload', (name, fn) => {
    // Callers pass wildly different shapes; a template that only works when
    // fully populated is a live incident waiting for a sparse record.
    const html = fn({});
    expect(html).toContain('<!DOCTYPE html');
    expect(leaksIn(html)).toEqual([]);
  });

  it.each(generators)('%s renders a complete document with the brand footer', (name, fn) => {
    const html = fn({});
    expect(html.trimEnd().endsWith('</html>')).toBe(true);
    expect(html).toContain('support@jetsetterss.com');
    // Preheader text is what shows beside the subject in the inbox list. An
    // empty one leaks the first words of the body instead.
    expect(html).toMatch(/<div style="display:none[^>]*>\s*\S/);
  });
});

describe('booking confirmation', () => {
  const base = {
    customerName: 'Jane Doe', bookingReference: 'JTS-1234', paymentAmount: 540.86,
    passengers: 2, travelDate: '2026-11-15',
  };

  it('shows a flight as a segment card with the times, not just the route', () => {
    const html = T.generateBookingConfirmationTemplate({
      ...base, bookingType: 'flight',
      bookingDetails: {
        origin: 'DEL', destination: 'BOM', departureTime: '19:25', arrivalTime: '21:40',
        Airline: 'Air India', Flight: 'AI 9486', duration: '2h 15m', stops: 0,
      },
    });

    // The times are the thing a traveller checks on the morning of the flight,
    // and the first version of this card omitted them entirely.
    expect(html).toContain('19:25');
    expect(html).toContain('21:40');
    expect(html).toContain('Non-stop');
    expect(html).toContain('JTS-1234');
  });

  it('shows a hotel as a stay card rather than an origin/destination strip', () => {
    const html = T.generateBookingConfirmationTemplate({
      ...base, bookingType: 'hotel',
      bookingDetails: { hotelName: 'The Leela Palace', checkIn: '2026-12-02', checkOut: '2026-12-06', nights: 4 },
    });

    expect(html).toContain('Check-in');
    expect(html).toContain('Check-out');
    expect(html).toContain('4 nights');
  });

  it('gives each booking type its own arrival advice', () => {
    const advice = (bookingType) => T.generateBookingConfirmationTemplate({ ...base, bookingType });

    expect(advice('flight')).toContain('Check-in opens 24-48 hours');
    expect(advice('hotel')).toContain('check-out by 11am');
    expect(advice('cruise')).toContain('valid for six months');
  });

  it('itemises the fare when the parts are known and still totals when they are not', () => {
    const itemised = T.generateBookingConfirmationTemplate({
      ...base, bookingDetails: { baseFare: 410, taxes: 130.86 },
    });
    expect(itemised).toContain('Base fare');
    expect(itemised).toContain('$410.00');
    expect(itemised).toContain('$540.86');

    // Amadeus does not always give a base/tax split. The total still has to
    // render — a confirmation with no price is worse than one without detail.
    const totalOnly = T.generateBookingConfirmationTemplate({ ...base, bookingDetails: {} });
    expect(totalOnly).not.toContain('Base fare');
    expect(totalOnly).toContain('$540.86');
  });
});

describe('cancellation', () => {
  it('leads with the refund and states a real timeframe', () => {
    const html = T.generateCancellationTemplate({
      customerName: 'Jane', bookingReference: 'JTS-1234', refundAmount: 465.86, cancellationFee: 75,
    });

    // The refund is why the email gets opened, so it belongs above the fee.
    expect(html.indexOf('$465.86')).toBeLessThan(html.indexOf('Cancellation fee'));
    expect(html).toContain('Refund breakdown');
    // "shortly" is not a commitment; a bank window is.
    expect(html).toContain('5-10 business days');
    expect(html).not.toMatch(/refunded shortly/i);
  });
});

describe('inquiry status', () => {
  it('marks the tracker at the stage the status names', () => {
    const filled = (status) => (T.generateInquiryStatusTemplate({ status }).match(/&#9679;/g) || []).length;

    // One filled dot for "received", three by the time a quote has gone out.
    expect(filled('pending')).toBe(1);
    expect(filled('quoted')).toBe(3);
    expect(filled('booked')).toBe(4);
  });

  it('falls back to the middle of the tracker for a status it does not know', () => {
    // An unmapped status must not render an empty or over-complete tracker.
    const html = T.generateInquiryStatusTemplate({ status: 'something_new' });
    expect((html.match(/&#9679;/g) || []).length).toBe(2);
  });
});

describe('login notification', () => {
  it('answers both questions the reader has', () => {
    const html = T.generateLoginNotificationTemplate({
      customerName: 'Jane Doe', email: 'jane@example.com',
      loginTime: 'Sep 5, 2026, 4:30 PM', deviceInfo: 'Chrome on Linux',
    });

    expect(html).toContain('If this was you, there is nothing to do');
    expect(html).toContain('If it was not you');
    expect(html).toContain('Chrome on Linux');
    // A security notice that does not say how to reach a human is not one.
    expect(html).toContain('(877) 538-7380');
  });
});

describe('callback dispatch', () => {
  it('routes each request type to its own template', () => {
    const data = { name: 'Jane', phone: '+1 555 0100' };

    expect(T.generateCallbackTemplate(data, 'cruise')).toContain('cruise specialist');
    expect(T.generateCallbackTemplate(data, 'rental')).toContain('We check live availability');
    expect(T.generateCallbackTemplate(data, 'hotel')).toContain('We check live availability');
    expect(T.generateCallbackTemplate(data, 'package')).toContain('build the itinerary');
    // An unrecognised type must still send something, not throw.
    expect(T.generateCallbackTemplate(data, 'nonsense')).toContain('<!DOCTYPE html');
    expect(T.generateCallbackTemplate(data, undefined)).toContain('<!DOCTYPE html');
  });

  it('hides form defaults instead of printing them as answers', () => {
    // The forms post "Not specified" rather than omitting the field, and the
    // old templates rendered that as though the customer had said it.
    const html = T.generateCruiseCallbackTemplate({
      name: 'Jane', phone: '+1 555 0100', preferredTime: 'Not specified', message: 'None',
    });

    expect(html).not.toContain('Preferred time');
    expect(html).not.toContain('>None<');
  });
});

describe('shared components', () => {
  it('figureBlock drops empty figures rather than rendering a blank column', () => {
    expect(figureBlock([{ label: 'Total', value: '' }, { label: 'Ref', value: null }])).toBe('');
    expect(figureBlock([{ label: 'Total', value: '$10' }])).toContain('$10');
  });

  it('dataGrid pads an odd row so the last cell keeps its half-width', () => {
    const html = dataGrid([['A', '1'], ['B', '2'], ['C', '3']]);
    // Three values across two rows: four half-width cells, the last one empty.
    // Without the pad, "C" stretches to the full width and breaks the grid.
    expect((html.match(/width="50%"/g) || []).length).toBe(4);
    expect(html).toContain('<td width="50%">&nbsp;</td>');
  });

  it('progressSteps refuses to draw a tracker with fewer than two stops', () => {
    expect(progressSteps(['Only one'], 0)).toBe('');
    expect(progressSteps([], 0)).toBe('');
  });

  it('stepList numbers from one and keeps the detail optional', () => {
    const html = stepList('Next', [['Do this', 'because'], 'Then this']);
    expect(html).toContain('>1<');
    expect(html).toContain('>2<');
    expect(html).toContain('because');
  });

  it('stayCard needs at least one date', () => {
    expect(stayCard({ property: 'Hotel' })).toBe('');
    expect(stayCard({ checkIn: 'Mon 1 Dec' })).toContain('Check-in');
  });

  it('draws the connector as one bordered rule, not two filled cells', () => {
    // Backgrounds on a 1px-high <td> collapse inconsistently between Gmail and
    // Outlook, which showed as a broken, segmented line down the middle of
    // every itinerary. A single border-top renders identically everywhere.
    const html = T.generateBookingConfirmationTemplate({
      bookingType: 'flight', bookingReference: 'X',
      bookingDetails: { origin: 'DEL', destination: 'BOM', departureTime: '10:00', arrivalTime: '12:00' },
    });

    expect(html).toContain('border-top:1px solid');
    expect(html).not.toMatch(/height:1px;\s*background:/);
  });
});

/**
 * The booking confirmation against a real stored booking row.
 *
 * Both defects here were found by completing an actual booking and reading the
 * email that arrived, not by inspection:
 *
 *   - `booking_details` is stored snake_case and some callers hand the row
 *     over as-is, but the template read camelCase only. Every time, terminal
 *     and city came back undefined — and that is not a blank space, because
 *     `segmentCard` falls back to `time || code`. The airport code printed
 *     where the time belongs, and again beneath it: "DEL / DEL", "BOM / BOM".
 *   - The `/order` caller compounded it by passing three hand-picked fields
 *     instead of the row, so there was nothing to render in the first place.
 *   - Durations are stored ISO 8601, so the traveller read "PT2H35M".
 */
describe('booking confirmation, from a stored booking row', () => {
  // Shaped exactly as `booking_details` comes back from Supabase.
  const row = {
    origin: 'DEL', destination: 'BOM',
    airline_name: 'AI', flight_number: 'AI2425', cabin_class: 'ECONOMY',
    departure_time: '10:30 AM', arrival_time: '01:05 PM',
    departure_terminal: '3', arrival_terminal: '2',
    departure_date: '2026-09-27', arrival_date: '2026-09-27',
    duration: 'PT2H35M', stops: 0, pnr: 'CPVKBU',
  };

  const html = T.generateBookingConfirmationTemplate({
    customerName: 'LOCAL TESTER',
    bookingReference: 'FLTMTPN6NTW',
    bookingType: 'flight',
    paymentAmount: 83.3,
    currency: 'USD',
    travelDate: '2026-09-27',
    passengers: 1,
    bookingDetails: row,
  });

  it('shows the times, not the airport code twice', () => {
    expect(html).toContain('10:30 AM');
    expect(html).toContain('01:05 PM');
    // The regression signature: the code rendered as its own departure time.
    expect(html).not.toMatch(/>\s*DEL\s*<\/div>\s*<div[^>]*>\s*DEL\b/);
  });

  it('reads snake_case fields the row actually stores', () => {
    expect(html).toContain('Terminal 3');
    expect(html).toContain('Terminal 2');
    expect(html).toContain('AI2425');
    expect(html).toContain('ECONOMY');
  });

  it('renders the duration for a human, not as ISO 8601', () => {
    expect(html).toContain('2h 35m');
    expect(html).not.toContain('PT2H35M');
  });

  it('still reads a camelCase caller, which other call sites pass', () => {
    const camel = T.generateBookingConfirmationTemplate({
      bookingReference: 'X', bookingType: 'flight', bookingDetails: {
        origin: 'JFK', destination: 'LHR', departureTime: '19:25', arrivalTime: '06:10',
        departureTerminal: '4', duration: 'PT7H45M',
      },
    });

    expect(camel).toContain('19:25');
    expect(camel).toContain('Terminal 4');
    expect(camel).toContain('7h 45m');
  });
});

describe('humanDuration', () => {
  it('converts an ISO 8601 duration', () => {
    expect(humanDuration('PT2H35M')).toBe('2h 35m');
    expect(humanDuration('PT45M')).toBe('45m');
    expect(humanDuration('PT7H')).toBe('7h');
  });

  it('passes through what is already formatted, and empties safely', () => {
    // Some callers format before they get here; do not mangle their string.
    expect(humanDuration('2h 35m')).toBe('2h 35m');
    expect(humanDuration('')).toBe('');
    expect(humanDuration(null)).toBe('');
    expect(humanDuration(undefined)).toBe('');
  });
});
