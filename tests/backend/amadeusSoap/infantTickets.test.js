import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { attributeTickets, readTickets, readTravelers } from '../../../backend/services/amadeusSoap/mappers/flightOrder.js';
import { parseSoap, unwrapEnvelope } from '../../../backend/services/amadeusSoap/parseXml.js';

/**
 * A ticket number for every traveller, the infant on a lap included.
 *
 * An infant is not a passenger of its own on a PNR: it rides on its adult's
 * name element, and its ticket's FA element points at the adult and says INF.
 * The ticket was read as the adult's, so the booking held two tickets naming
 * one passenger; the pages gave the adult whichever came first and the infant
 * whatever ticket sat at its position.
 *
 * Worse, the reference is a tattoo, not the order the passengers were sent in.
 * The live family PNR recorded on 2026-09-15 (never committed) numbers the
 * child 5, the man 2 - the infant on him - and the woman 4. So tickets are tied
 * to the booking's travellers through the PNR's own passenger list, by name.
 */

const runBookingChain = vi.fn();
vi.mock('../../../backend/services/amadeusSoap/bookingChain.js', () => ({
  runBookingChain: (...args) => runBookingChain(...args),
  cancelBooking: vi.fn(),
  retrieveBooking: vi.fn(),
}));

const pnrReply = (edit = (xml) => xml) => {
  const xml = edit(readFileSync(new URL('../../fixtures/amadeus/pnr-add-elements-infant-family.xml', import.meta.url), 'utf8'));
  const { body } = unwrapEnvelope(parseSoap(xml));
  return body[Object.keys(body).find((k) => k !== 'Fault')];
};

/** The fixture's two adults are both PROBE PARENT; give the woman a name of her own. */
const distinctNames = (xml) => xml.replace('PROBE MS', 'EVE MS');

/** An FA element as PNR_Reply carries a ticket. */
const fa = (freetext, passengerRef) => ({
  elementManagementData: { segmentName: 'FA' },
  referenceForDataElement: { reference: [{ qualifier: 'PT', number: passengerRef }, { qualifier: 'ST', number: '1' }] },
  otherDataFreetext: { longFreetext: freetext },
});

/** The family ticketed: the man (2), the infant on his lap (2, INF), the woman (4), the child (5). */
const familyTickets = () => [
  fa('PAX 057-1000000001/ETAI/USD120.00/15SEP26/SCK1S2400/12345678', '2'),
  fa('INF 057-3000000003/ETAI/USD12.00/15SEP26/SCK1S2400/12345678', '2'),
  fa('PAX 057-2000000002/ETAI/USD120.00/15SEP26/SCK1S2400/12345678', '4'),
  fa('PAX 057-5000000005/ETAI/USD90.00/15SEP26/SCK1S2400/12345678', '5'),
];

const withTickets = (reply) => ({ ...reply, dataElementsMaster: { dataElementsIndiv: familyTickets() } });

/** The booking's travellers, as the review page listed them: the infant second. */
const family = [
  { id: '1', firstName: 'Probe', lastName: 'Parent', ptc: 'ADULT' },
  { id: '2', firstName: 'Baby', lastName: 'Parent', ptc: 'HELD_INFANT' },
  { id: '3', firstName: 'Eve', lastName: 'Parent', ptc: 'ADULT' },
  { id: '4', firstName: 'Kid', lastName: 'Parent', ptc: 'CHILD' },
];

const numberFor = (tickets, travelerId) => tickets.find((t) => t.travelerId === travelerId)?.number ?? null;

describe('the live PNR numbers its passengers by tattoo', () => {
  it('in its own order, not the order they were sent', () => {
    expect(readTravelers(pnrReply()).map((t) => t.id)).toEqual(['5', '2', '2-INF', '4']);
  });
});

describe('reading an infant ticket', () => {
  it("names the infant, not the adult whose reference it carries", () => {
    const tickets = readTickets(withTickets(pnrReply()));

    const infant = tickets.find((t) => t.number === '057-3000000003');
    expect(infant).toMatchObject({ travelerId: '2-INF', travelerType: 'HELD_INFANT', associatedAdultId: '2' });
    expect(tickets.find((t) => t.number === '057-1000000001')).toMatchObject({ travelerId: '2' });
    expect(tickets.find((t) => t.number === '057-1000000001').travelerType).toBeUndefined();
  });
});

describe('attributeTickets', () => {
  it('gives every traveller their own ticket, the infant included', () => {
    const reply = withTickets(pnrReply(distinctNames));

    const tickets = attributeTickets(readTickets(reply), readTravelers(reply), family);

    expect(numberFor(tickets, '1')).toBe('057-1000000001');
    expect(numberFor(tickets, '2')).toBe('057-3000000003');
    expect(numberFor(tickets, '3')).toBe('057-2000000002');
    expect(numberFor(tickets, '4')).toBe('057-5000000005');
    // The PNR's own reference stays with the ticket.
    expect(tickets.find((t) => t.number === '057-3000000003').pnrTravelerId).toBe('2-INF');
  });

  // The fixture as recorded: two adults called PROBE PARENT. Either ticket could
  // be either's, so neither is given - and the page shows the number as pending.
  it('gives a ticket to nobody when two travellers share its name', () => {
    const reply = withTickets(pnrReply());
    const twins = family.map((t) => (t.id === '3' ? { ...t, firstName: 'Probe' } : t));

    const tickets = attributeTickets(readTickets(reply), readTravelers(reply), twins);

    expect(tickets.find((t) => t.number === '057-1000000001').travelerId).toBeNull();
    expect(tickets.find((t) => t.number === '057-2000000002').travelerId).toBeNull();
    // The infant and the child still have names of their own.
    expect(numberFor(tickets, '2')).toBe('057-3000000003');
    expect(numberFor(tickets, '4')).toBe('057-5000000005');
  });

  it('does not give an adult an infant ticket, nor an infant an adult one', () => {
    const reply = withTickets(pnrReply(distinctNames));
    // Named like the man, but booked as an infant: not his ticket, not the infant's.
    const confused = family.map((t) => (t.id === '2' ? { ...t, firstName: 'Probe' } : t));

    const tickets = attributeTickets(readTickets(reply), readTravelers(reply), confused);

    expect(numberFor(tickets, '1')).toBe('057-1000000001');
    expect(tickets.find((t) => t.number === '057-3000000003').travelerId).toBeNull();
  });

  it('gives nobody a ticket whose passenger the PNR does not list', () => {
    const reply = pnrReply(distinctNames);
    const tickets = attributeTickets([{ number: '057-9000000009', travelerId: '17' }], readTravelers(reply), family);

    expect(tickets[0]).toMatchObject({ travelerId: null, pnrTravelerId: '17' });
  });

  it('survives having no passenger list to match against', () => {
    expect(attributeTickets([{ number: '057-1', travelerId: '2' }], undefined, family)[0].travelerId).toBeNull();
    expect(attributeTickets(undefined, [], family)).toEqual([]);
  });
});

describe('the booking the order route saves', () => {
  beforeEach(() => {
    vi.stubEnv('AMADEUS_WS_ENDPOINT', 'https://node.test.invalid/1ASIWTEST');
    vi.stubEnv('AMADEUS_WS_USERNAME', 'WSTEST');
    vi.stubEnv('AMADEUS_WS_PASSWORD', 'pw');
    vi.stubEnv('AMADEUS_WS_OFFICE_ID', 'SCK1S2400');
    vi.resetModules();
    runBookingChain.mockReset();
  });

  it('carries each ticket against the traveller id the booking stores', async () => {
    const reply = withTickets(pnrReply(distinctNames));
    runBookingChain.mockResolvedValue({
      pnr: 'ABC123',
      order: { travelers: readTravelers(reply) },
      ticketed: true,
      queued: false,
      tickets: readTickets(reply),
      tstRefs: [],
      priced: { total: 342, currency: 'USD' },
      sessionId: 'S1',
    });
    const provider = (await import('../../../backend/services/amadeusSoap/index.js')).default;

    const order = await provider.createFlightOrder({
      data: {
        flightOffers: [{ price: { total: '342.00', currency: 'USD' } }],
        travelers: family.map(({ id, firstName, lastName, ptc }) => ({ id, name: { firstName, lastName }, ptc })),
      },
    }, { bookingReference: 'FLT1' });

    expect(numberFor(order.tickets, '2')).toBe('057-3000000003');
    expect(numberFor(order.tickets, '3')).toBe('057-2000000002');
  });
});
