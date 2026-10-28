import { describe, expect, it } from 'vitest';
import { buildTicketPdf } from '../../backend/services/ticketPdf.js';

const segment = (flightNumber, origin, destination, date, departureTime, arrivalTime, extra = {}) => ({
  flightNumber, carrierCode: flightNumber.slice(0, 2), operatingCarrier: '', aircraft: '320', cabin: 'ECONOMY',
  origin, destination, departureDate: date, departureTime, departureTerminal: '3', arrivalDate: date, arrivalTime, arrivalTerminal: '2E',
  ...extra,
});

const leg = (direction, segments) => ({
  direction,
  duration: 'PT4H15M',
  origin: segments[0].origin,
  destination: segments[segments.length - 1].destination,
  departureDate: segments[0].departureDate,
  arrivalDate: segments[segments.length - 1].arrivalDate,
  stops: segments.length - 1,
  segments,
});

const ticketed = () => ({
  type: 'flight',
  bookingReference: 'FLT1115A9FBE31647',
  status: 'confirmed',
  payment_status: 'paid',
  paymentStatus: 'paid',
  pnr: '2IZOI8',
  bookingDate: '2026-10-25T04:06:21Z',
  transactionId: '629804190414',
  totalAmount: 710.53,
  currency: 'USD',
  refundable: false,
  brandedFareLabel: 'Light',
  cabinClass: 'ECONOMY',
  baggageDetails: { checked: { quantity: 0 }, cabin: { weight: 12, weightUnit: 'KG' } },
  chargeBreakdown: { fare: 702.5, serviceFee: 8.03, discount: 0, walletAmount: 0, total: 710.53, currency: 'USD' },
  travelers: [{ id: '1', type: 'ADULT', firstName: 'Test', lastName: 'Traveller' }],
  tickets: [{ number: '057-7513754072', conjunctionTo: '057-7513754073', travelerId: '1', validatingCarrier: 'AF', issuedOn: '2026-10-24' }],
  itineraries: [
    leg('onward', [segment('AF1219', 'FRA', 'CDG', '2026-11-24', '15:05', '16:35', { operatingCarrier: 'A5' }), segment('AF1180', 'CDG', 'LHR', '2026-11-24', '18:00', '18:20')]),
    leg('onward', [segment('AF1581', 'LHR', 'CDG', '2026-11-27', '11:30', '13:50'), segment('AF1822', 'CDG', 'MUC', '2026-11-27', '15:25', '17:00')]),
    leg('onward', [segment('AF1423', 'MUC', 'CDG', '2026-12-01', '10:05', '11:55'), segment('AF1218', 'CDG', 'FRA', '2026-12-01', '13:00', '14:20')]),
  ],
});

const textOf = async (booking) => Buffer.from(await buildTicketPdf(booking, { compress: false })).toString('latin1');

describe('the e-ticket PDF', () => {
  it('is a real PDF with searchable text', async () => {
    const pdf = await textOf(ticketed());

    expect(pdf.startsWith('%PDF-')).toBe(true);
    expect(pdf).toContain('E-TICKET');
    expect(pdf).toContain('2IZOI8');
    expect(pdf).toContain('FLT1115A9FBE31647');
  });

  it('names each traveller with their whole ticket number', async () => {
    const pdf = await textOf(ticketed());

    expect(pdf).toContain('TEST TRAVELLER');
    expect(pdf).toContain('0577513754072/73');
    expect(pdf).not.toContain('057-7513754072');
  });

  it('lists every flight, the operating airline and the connections', async () => {
    const pdf = await textOf(ticketed());

    for (const flight of ['AF 1219', 'AF 1180', 'AF 1581', 'AF 1822', 'AF 1423', 'AF 1218']) expect(pdf).toContain(flight);
    expect(pdf).toContain('Operated by');
    expect(pdf).toContain('Connection in');
    expect(pdf).toMatch(/Flight 3/);
    expect(pdf).toContain('Frankfurt');
    expect(pdf).toContain('Air France');
  });

  it('shows what was paid and how', async () => {
    const pdf = await textOf(ticketed());

    expect(pdf).toContain('702.50');
    expect(pdf).toContain('8.03');
    expect(pdf).toContain('710.53');
    expect(pdf).toContain('629804190414');
    expect(pdf).toContain('ARC Pay');
  });

  it('carries the notices, the support contacts and a page count', async () => {
    const pdf = await textOf(ticketed());

    expect(pdf).toContain('conditions of carriage');
    expect(pdf).toContain('Montreal Convention');
    expect(pdf).toContain('hazardous materials');
    expect(pdf).toContain('support@jetsetterss.com');
    expect(pdf).toContain('+1 877 538 7380');
    expect(pdf).toMatch(/Page 1 of \d/);
    expect(pdf).not.toMatch(/ARC 05511704|Bonaventure/);
  });

  it('has the faint logo watermark and a QR code to the live booking', async () => {
    const pdf = await textOf(ticketed());

    expect(pdf).toMatch(/\/ca 0\.0\d/);
    expect((pdf.match(/\/Subtype \/Image/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(pdf).toContain('jetsetterss.com/manage-booking/FLT1115A9FBE31647');
  });

  it('runs on to more pages for a long trip', async () => {
    const long = ticketed();
    long.itineraries = [...long.itineraries, ...long.itineraries];

    expect(await textOf(long)).toMatch(/Page 2 of \d/);
  });

  it('a booking held without a ticket is a confirmation, not a ticket', async () => {
    const pdf = await textOf({ ...ticketed(), tickets: [] });

    expect(pdf).toContain('BOOKING CONFIRMATION');
    expect(pdf).not.toContain('E-TICKET');
    expect(pdf).toContain('not a ticket');
  });

  it('a cancelled booking has no document to carry', async () => {
    await expect(buildTicketPdf({ ...ticketed(), status: 'cancelled', payment_status: 'refunded', paymentStatus: 'refunded' }))
      .rejects.toMatchObject({ code: 'NO_DOCUMENT' });
  });

  it('refuses a booking the airline does not hold', async () => {
    await expect(buildTicketPdf({ ...ticketed(), pnr: null, tickets: [] })).rejects.toMatchObject({ code: 'NO_DOCUMENT' });
  });
});
