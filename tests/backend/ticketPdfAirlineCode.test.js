import { describe, expect, it } from 'vitest';
import { buildTicketPdf } from '../../backend/services/ticketPdf.js';

const booking = (over = {}) => ({
  type: 'flight',
  bookingReference: 'FLT1115A9FBE31647',
  status: 'confirmed',
  payment_status: 'paid',
  paymentStatus: 'paid',
  pnr: 'Q7XK2M',
  totalAmount: 291,
  currency: 'USD',
  travelers: [{ id: '1', type: 'ADULT', firstName: 'Jane', lastName: 'Doe' }],
  tickets: [{ number: '016-7491175288', travelerId: '1', validatingCarrier: 'UA', issuedOn: '2026-10-24' }],
  itineraries: [{
    direction: 'outbound',
    duration: 'PT6H30M',
    origin: 'SFO',
    destination: 'EWR',
    departureDate: '2026-12-01',
    arrivalDate: '2026-12-01',
    stops: 0,
    segments: [{
      flightNumber: 'UA20', carrierCode: 'UA', operatingCarrier: '', aircraft: '789', cabin: 'ECONOMY',
      origin: 'SFO', destination: 'EWR', departureDate: '2026-12-01', departureTime: '10:00', arrivalDate: '2026-12-01', arrivalTime: '18:30',
    }],
  }],
  ...over,
});

const textOf = async (data) => Buffer.from(await buildTicketPdf(data, { compress: false })).toString('latin1');

describe('the booking code on the e-ticket', () => {
  it("calls the airline's own code, the one shown at the airport, the airline PNR", async () => {
    const pdf = await textOf(booking({ airlineLocators: [{ carrierCode: 'UA', locator: 'H8KQ2P' }] }));

    expect(pdf).toContain('AIRLINE PNR');
    expect(pdf).toContain('H8KQ2P');
    expect(pdf).toContain('GDS PNR Q7XK2M');
    expect(pdf).not.toContain('Amadeus');
    expect(pdf).not.toContain('AIRLINE BOOKING CODE');
  });

  it('names one airline PNR per airline when each airline sent its own', async () => {
    const pdf = await textOf(booking({ airlineLocators: [{ carrierCode: 'UA', locator: 'H8KQ2P' }, { carrierCode: 'LH', locator: 'LH4X9Z' }] }));

    expect(pdf).toContain('AIRLINE PNRS');
    expect(pdf).toContain('UA H8KQ2P');
  });

  it('is called a PNR, not the airline code, while the airline has not sent its own', async () => {
    const pdf = await textOf(booking());

    expect(pdf).toContain('BOOKING CODE \\(PNR\\)');
    expect(pdf).not.toContain('AIRLINE PNR');
    expect(pdf).toContain('Q7XK2M');
  });
});

describe('checking in, on the e-ticket', () => {
  it("names the airline's check-in page and the code to use", async () => {
    const pdf = await textOf(booking({ airlineLocators: [{ carrierCode: 'UA', locator: 'H8KQ2P' }] }));

    expect(pdf).toContain('Check in online with United at united.com/en/us/checkin, using airline PNR H8KQ2P');
    expect(pdf).toContain('Opens 24 hours before');
  });

  it('keeps the general advice for an airline whose check-in page we do not know', async () => {
    const unknown = booking();
    unknown.itineraries[0].segments[0] = { ...unknown.itineraries[0].segments[0], carrierCode: 'ZZ', flightNumber: 'ZZ20' };
    const pdf = await textOf(unknown);

    expect(pdf).toContain('website or app with your booking code or ticket number');
    expect(pdf).not.toContain('Check in online with');
  });
});
