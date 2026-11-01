import { describe, expect, it } from 'vitest';
import { readTickets } from '../../backend/services/amadeusSoap/mappers/flightOrder.js';
import { printedTicketNumber } from '../../shared/ticketNumber.js';

const replyWithFa = (freetext) => ({
  dataElementsMaster: {
    dataElementsIndiv: [{
      elementManagementData: { segmentName: 'FA' },
      otherDataFreetext: [{ longFreetext: freetext }],
      referenceForDataElement: { reference: [{ qualifier: 'PT', number: '2' }] },
    }],
  },
});

describe('a conjunction ticket', () => {
  // PDT, 25 Oct 2026, PNR 2IZOI8: six Air France flights on one fare, more
  // coupons than one ticket holds, issued as 057-7513754072 and 057-7513754073.
  it('keeps the last number of the set beside the first', () => {
    const [ticket] = readTickets(replyWithFa('PAX 057-7513754072-73/ETAF/USD702.50/24OCT26/SCK1S2400/05511704'));

    expect(ticket).toMatchObject({ number: '057-7513754072', conjunctionTo: '057-7513754073', validatingCarrier: 'AF', issuedOn: '2026-10-24', travelerId: '2' });
  });

  it('carries into the next hundred', () => {
    const [ticket] = readTickets(replyWithFa('PAX 057-7513754099-01/ETAF/USD702.50/24OCT26/SCK1S2400/05511704'));

    expect(ticket.conjunctionTo).toBe('057-7513754101');
  });

  it('a single ticket has no set', () => {
    const [ticket] = readTickets(replyWithFa('PAX 057-7513754072/ETAF/USD702.50/24OCT26/SCK1S2400/05511704'));

    expect(ticket.conjunctionTo).toBeUndefined();
  });

  it('is printed as one run of digits, with the last of the set after a slash', () => {
    expect(printedTicketNumber({ number: '057-7513754072', conjunctionTo: '057-7513754073' })).toBe('0577513754072/73');
    expect(printedTicketNumber({ number: '057-7513754072' })).toBe('0577513754072');
    expect(printedTicketNumber({ number: '0577513754072' })).toBe('0577513754072');
  });
});

describe('the ticket email for a conjunction ticket', () => {
  it('prints the whole set', async () => {
    const { generateTicketIssuedTemplate } = await import('../../backend/services/email/templates.js');

    const html = generateTicketIssuedTemplate({
      customerName: 'Test Traveller',
      bookingReference: 'FLT1',
      tickets: [{ number: '057-7513754072', conjunctionTo: '057-7513754073', travelerName: 'TEST TRAVELLER' }],
    });

    expect(String(html?.html ?? html)).toContain('0577513754072/73');
  });
});
