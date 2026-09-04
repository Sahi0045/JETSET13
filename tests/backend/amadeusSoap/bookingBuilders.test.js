import { describe, expect, it } from 'vitest';
import { buildAirSellBody, readAirSellReply } from '../../../backend/services/amadeusSoap/operations/airSell.js';
import {
  buildAddElementsBody,
  buildCancelBody,
  buildCommitBody,
  buildRetrieveBody,
  sanitizeName,
} from '../../../backend/services/amadeusSoap/operations/pnr.js';
import {
  buildCreateTstBody,
  buildFopBody,
  buildIssueTicketBody,
  buildPricePnrBody,
  buildQueuePlaceBody,
  buildVoidTicketBody,
  readPricePnrReply,
} from '../../../backend/services/amadeusSoap/operations/ticketing.js';

/**
 * The booking request shapes.
 *
 * Every assertion below is a fact established by a failed call against the live
 * WSAP, with the error it produced. Amadeus reports a malformed booking request
 * as "Unknown item found or found at the wrong position", "Invalid length for
 * data element" or a bare "3973 INVALID EDIFACT FORMAT" - none of which name
 * the element - and the request that provokes it is one the customer has
 * already paid for.
 */

const segments = [
  {
    legIndex: 0, boardPoint: 'DEL', offPoint: 'BOM', departureDate: '250926', departureTime: '2330',
    arrivalDate: '260926', arrivalTime: '0155', dateVariation: '1', marketingCarrier: 'AI',
    flightNumber: '9484', rbd: 'S',
  },
];

const roundTrip = [
  { ...segments[0] },
  {
    legIndex: 1, boardPoint: 'BOM', offPoint: 'DEL', departureDate: '300926', departureTime: '0800',
    arrivalDate: '300926', marketingCarrier: 'AI', flightNumber: '9485', rbd: 'S',
  },
];

const travelers = [{ firstName: 'John', lastName: 'Smith', gender: 'MALE', ptc: 'ADULT' }];

describe('Air_SellFromRecommendation', () => {
  it('sells in the booking class the fare was found in, not the cabin', () => {
    const xml = buildAirSellBody({ segments, seats: 1 });
    expect(xml).toContain('<flightNumber>9484</flightNumber><bookingClass>S</bookingClass>');
  });

  // MasterPricer spells it offPointDetails; this schema uses one 'f', as
  // Fare_InformativePricingWithoutPNR does.
  it('spells offpointDetails the way this schema does', () => {
    const xml = buildAirSellBody({ segments, seats: 1 });
    expect(xml).toContain('<offpointDetails><trueLocationId>BOM</trueLocationId></offpointDetails>');
    expect(xml).not.toContain('offPointDetails');
  });

  it('carries dateVariation so an overnight arrival is not rejected', () => {
    const xml = buildAirSellBody({ segments, seats: 1 });
    expect(xml).toContain('<arrivalDate>260926</arrivalDate><dateVariation>1</dateVariation>');
  });

  it('asks for the seats with status NN', () => {
    const xml = buildAirSellBody({ segments, seats: 2 });
    expect(xml).toContain('<quantity>2</quantity><statusCode>NN</statusCode>');
  });

  it('groups segments into one itineraryDetails per leg', () => {
    const xml = buildAirSellBody({ segments: roundTrip, seats: 1 });
    expect(xml.match(/<itineraryDetails>/g)).toHaveLength(2);
    expect(xml).toContain('<origin>DEL</origin><destination>BOM</destination>');
    expect(xml).toContain('<origin>BOM</origin><destination>DEL</destination>');
  });

  it('refuses to sell nothing', () => {
    expect(() => buildAirSellBody({ segments: [], seats: 1 })).toThrow(/segments are required/);
    expect(() => buildAirSellBody({ segments, seats: 0 })).toThrow(/at least 1/);
  });
});

describe('reading the sell reply', () => {
  // This WSAP answers a successful sell with OK in actionDetails/statusCode,
  // not the KK/HK/SS the segment-status vocabulary suggests. Without OK in the
  // accepted set every successful booking was thrown away as unsold - and the
  // seats stayed held.
  it('accepts OK as sold', () => {
    const reply = { itineraryDetails: { segmentInformation: { actionDetails: { quantity: '1', statusCode: 'OK' } } } };
    expect(readAirSellReply(reply).sold).toBe(true);
  });

  it('accepts the conventional confirmed statuses too', () => {
    for (const code of ['KK', 'HK', 'SS']) {
      const reply = { itineraryDetails: { segmentInformation: { actionDetails: { statusCode: code } } } };
      expect(readAirSellReply(reply).sold).toBe(true);
    }
  });

  // UC between search and sell is normal: the fare class sold out in the
  // seconds since the customer chose it.
  it('reports UC as refused rather than sold', () => {
    const reply = { itineraryDetails: { segmentInformation: { actionDetails: { statusCode: 'UC' } } } };
    const result = readAirSellReply(reply);
    expect(result.sold).toBe(false);
    expect(result.refused).toContain('UC');
  });

  // A half-held itinerary is a failed booking, not a partial success.
  it('treats a partly confirmed itinerary as unsold', () => {
    const reply = {
      itineraryDetails: [
        { segmentInformation: { actionDetails: { statusCode: 'OK' } } },
        { segmentInformation: { actionDetails: { statusCode: 'UC' } } },
      ],
    };
    expect(readAirSellReply(reply).sold).toBe(false);
  });

  it('treats a reply with no statuses at all as unsold', () => {
    expect(readAirSellReply({}).sold).toBe(false);
  });
});

describe('PNR_AddMultiElements', () => {
  it('keeps the mandatory marker1 even though it is empty', () => {
    const xml = buildAddElementsBody({ travelers, officeId: 'SCK1S2400' });
    expect(xml).toContain('<dataElementsMaster><marker1/>');
  });

  // Remarks have their own element. Sent as free text they pass XML validation
  // and are then rejected by the host as "3973 INVALID EDIFACT FORMAT".
  it('files a remark through miscellaneousRemark, not freetextData', () => {
    const xml = buildAddElementsBody({ travelers, officeId: 'SCK1S2400', bookingReference: 'ARC123' });
    expect(xml).toContain('<miscellaneousRemark><remarks><type>RM</type><freetext>ARC ARC123</freetext></remarks></miscellaneousRemark>');
  });

  it('sends the contact phone and email as AP elements', () => {
    const xml = buildAddElementsBody({
      travelers, officeId: 'SCK1S2400', contact: { phone: '15555550100', email: 'a@b.com' },
    });
    expect(xml).toContain('<longFreetext>15555550100</longFreetext>');
    // P02 marks the second AP as an address rather than a number.
    expect(xml).toContain('<type>P02</type></freetextDetail><longFreetext>a@b.com</longFreetext>');
  });

  it('always files a received-from element', () => {
    const xml = buildAddElementsBody({ travelers, officeId: 'SCK1S2400' });
    expect(xml).toContain('<segmentName>RF</segmentName>');
    expect(xml).toContain('<longFreetext>JETSETTERS</longFreetext>');
  });

  it('sets a ticketing time limit when one is known', () => {
    const xml = buildAddElementsBody({
      travelers, officeId: 'SCK1S2400', ticketing: { date: '250926', time: '2359' },
    });
    expect(xml).toContain('<indicator>TL</indicator><date>250926</date><time>2359</time>');
  });

  it('omits the time limit entirely when it is not', () => {
    const xml = buildAddElementsBody({ travelers, officeId: 'SCK1S2400' });
    expect(xml).not.toContain('<segmentName>TK</segmentName>');
  });

  // A child booked on an adult fare is a fare the airline can reject at
  // check-in, so the type has to travel with the name.
  it('marks a child with its passenger type and leaves adults unmarked', () => {
    const xml = buildAddElementsBody({
      travelers: [
        { firstName: 'John', lastName: 'Smith', ptc: 'ADULT' },
        { firstName: 'Amy', lastName: 'Smith', ptc: 'CHILD' },
      ],
      officeId: 'SCK1S2400',
    });
    expect(xml).toContain('<type>CHD</type>');
    expect(xml).not.toContain('<type>ADT</type>');
  });

  it('titles passengers by gender and age group', () => {
    const xml = buildAddElementsBody({
      travelers: [
        { firstName: 'John', lastName: 'Smith', gender: 'MALE', ptc: 'ADULT' },
        { firstName: 'Amy', lastName: 'Smith', gender: 'FEMALE', ptc: 'CHILD' },
      ],
      officeId: 'SCK1S2400',
    });
    expect(xml).toContain('<firstName>JOHN MR</firstName>');
    expect(xml).toContain('<firstName>AMY MISS</firstName>');
  });

  it('refuses a passenger it cannot name', () => {
    expect(() => buildAddElementsBody({
      travelers: [{ firstName: '', lastName: 'Smith' }], officeId: 'X',
    })).toThrow(/missing a usable name/);
  });

  it('commits with end-and-retrieve, never end-transaction', () => {
    // ET (10) commits but returns no body, which loses the record locator.
    expect(buildCommitBody()).toContain('<optionCode>11</optionCode>');
  });
});

describe('name sanitising', () => {
  // A name the GDS mangles is a name that will not match the passport at
  // check-in.
  it('strips accents to their base letters rather than dropping them', () => {
    expect(sanitizeName('José')).toBe('JOSE');
    expect(sanitizeName('Müller')).toBe('MULLER');
  });

  it('removes punctuation Amadeus will not accept', () => {
    expect(sanitizeName("O'Brien")).toBe('OBRIEN');
    expect(sanitizeName('Smith, Jr.')).toBe('SMITH JR');
  });

  it('keeps hyphens, which are legal in a name', () => {
    expect(sanitizeName('Anne-Marie')).toBe('ANNE-MARIE');
  });
});

describe('Fare_PricePNRWithBookingClass', () => {
  it('pins the currency and the plating carrier', () => {
    const xml = buildPricePnrBody({ currency: 'USD', validatingCarrier: 'AI' });
    expect(xml).toContain('<currencyQualifier>FCO</currencyQualifier><currencyIsoCode>USD</currencyIsoCode>');
    expect(xml).toContain('<otherCompany>AI</otherCompany>');
  });

  it('reads the fare references the TST step needs', () => {
    const reply = {
      fareList: {
        fareReference: { uniqueReference: '1' },
        fareDataInformation: {
          fareDataSupInformation: [
            { fareDataQualifier: 'B', fareAmount: '60.00', fareCurrency: 'USD' },
            { fareDataQualifier: '712', fareAmount: '76.00', fareCurrency: 'USD' },
          ],
        },
      },
    };
    const priced = readPricePnrReply(reply);
    expect(priced.fares[0].reference).toBe('1');
    expect(priced.total).toBe(76);
    expect(priced.currency).toBe('USD');
  });

  // An office filing fares in one currency and converting to another returns
  // both; adding them gives a total wrong by an exchange rate.
  it('never sums amounts across currencies', () => {
    const reply = {
      fareList: [
        {
          fareReference: { uniqueReference: '1' },
          fareDataInformation: {
            fareDataSupInformation: [
              { fareDataQualifier: '712', fareAmount: '76.00', fareCurrency: 'USD' },
            ],
          },
        },
        {
          fareReference: { uniqueReference: '2' },
          fareDataInformation: {
            fareDataSupInformation: [
              { fareDataQualifier: '712', fareAmount: '6300.00', fareCurrency: 'INR' },
            ],
          },
        },
      ],
    };
    expect(readPricePnrReply(reply).total).toBe(76);
  });

  // This is the deadline after which the airline cancels an unticketed
  // booking. It gets stored on the booking and shown to the customer, and it
  // used to be written as bare D/M/YYYY - "11/9/2026" reads as 11 September or
  // 9 November depending on where you are, a two-month error on a deadline.
  // Search already emits this field as ISO; both producers must agree.
  it('returns the ticketing deadline as an unambiguous ISO date', () => {
    const reply = {
      fareList: {
        fareReference: { uniqueReference: '1' },
        lastTktDate: { dateTime: { year: '2026', month: '9', day: '11' } },
        fareDataInformation: {
          fareDataSupInformation: [
            { fareDataQualifier: '712', fareAmount: '76.00', fareCurrency: 'USD' },
          ],
        },
      },
    };
    expect(readPricePnrReply(reply).fares[0].lastTicketingDate).toBe('2026-09-11');
  });

  it('returns empty rather than a half-built date when Amadeus omits it', () => {
    const reply = {
      fareList: {
        fareReference: { uniqueReference: '1' },
        fareDataInformation: {
          fareDataSupInformation: [
            { fareDataQualifier: '712', fareAmount: '76.00', fareCurrency: 'USD' },
          ],
        },
      },
    };
    expect(readPricePnrReply(reply).fares[0].lastTicketingDate).toBe('');
  });
});

describe('Ticket_CreateTSTFromPricing', () => {
  it('takes the pricing reference, which is not a TST number', () => {
    const xml = buildCreateTstBody(['1']);
    expect(xml).toContain('<referenceType>TST</referenceType><uniqueReference>1</uniqueReference>');
  });

  it('refuses to create a TST with nothing to price from', () => {
    expect(() => buildCreateTstBody([])).toThrow(/pricing reference is required/);
  });
});

describe('FOP_CreateFormOfPayment', () => {
  // fopReference is ElementManagementSegmentType: one `reference` child holding
  // qualifier + number. It is mandatory, and the referenceType/uniqueReference
  // pair used elsewhere in this WSAP is rejected here as an unknown item.
  it('wraps the FP tattoo in a reference element', () => {
    const xml = buildFopBody({ fopCode: 'CA' });
    expect(xml).toContain('<fopReference><reference><qualifier>FP</qualifier><number>1</number></reference></fopReference>');
  });

  // fopDetails accepts only fopCode, fopMapTable, fopBillingCode and fopStatus.
  it('carries no free text, because the schema has nowhere to put it', () => {
    const xml = buildFopBody({ fopCode: 'CA' });
    expect(xml).toContain('<fopCode>CA</fopCode>');
    expect(xml).not.toContain('fopFreeflow');
  });
});

describe('DocIssuance_IssueTicket', () => {
  it('asks for electronic ticketing for every passenger', () => {
    const xml = buildIssueTicketBody();
    expect(xml).toContain('<indicator>ET</indicator>');
    // No paxSelection means all passengers.
    expect(xml).not.toContain('paxSelection');
  });
});

describe('Queue_PlacePNR', () => {
  // `option` is AlphaNumericString_Length1To3, so the four-letter BLPC a human
  // types at a terminal is rejected on length alone.
  it('uses a placement code the schema can hold', () => {
    const xml = buildQueuePlaceBody({ recordLocator: 'ABC123', queueOffice: 'SCK1S2400', queueNumber: '50' });
    expect(xml).toContain('<option>BLP</option>');
    expect(xml.match(/<option>(.*?)<\/option>/)[1].length).toBeLessThanOrEqual(3);
  });

  it('names the target office with the mandatory sourceType first', () => {
    const xml = buildQueuePlaceBody({ recordLocator: 'ABC123', queueOffice: 'SCK1S2400', queueNumber: '50' });
    expect(xml).toContain('<targetOffice><sourceType><sourceQualifier1>OT</sourceQualifier1></sourceType>');
    expect(xml).toContain('<inHouseIdentification1>SCK1S2400</inHouseIdentification1>');
    expect(xml).toContain('<queueDetails><number>50</number></queueDetails>');
  });
});

describe('PNR_Cancel and PNR_Retrieve', () => {
  // entryType is AMA_EDICodesetType_Length1 - exactly one character. 'ITI', the
  // terminal entry, fails on length.
  it('cancels the itinerary with a single-character entry type', () => {
    const xml = buildCancelBody('ABC123');
    expect(xml).toContain('<cancelElements><entryType>I</entryType></cancelElements>');
  });

  it('commits the cancellation', () => {
    expect(buildCancelBody('ABC123')).toContain('<optionCode>11</optionCode>');
  });

  it('retrieves by record locator', () => {
    const xml = buildRetrieveBody('ABC123');
    expect(xml).toContain('<retrieve><type>2</type></retrieve>');
    expect(xml).toContain('<controlNumber>ABC123</controlNumber>');
  });

  it('refuses to retrieve without a locator', () => {
    expect(() => buildRetrieveBody('')).toThrow(/record locator is required/);
  });
});

describe('Ticket_CancelDocument', () => {
  it('sends the plating carrier, which is mandatory despite looking incidental', () => {
    const xml = buildVoidTicketBody({ documentNumbers: ['0572412345678'], validatingCarrier: 'AI' });
    expect(xml).toContain('<stockProviderDetails><companyDetails><marketingCompany>AI</marketingCompany>');
  });

  it('refuses to void without one', () => {
    expect(() => buildVoidTicketBody({ documentNumbers: ['0572412345678'] })).toThrow(/validating carrier/);
  });
});
