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
  readVoidTicketReply,
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

  /**
   * A connection is ONE itineraryDetails holding both segments, and its
   * origin/destination span the whole journey rather than either flight.
   *
   * This is the shape of Amadeus's own "selling connecting flights" example:
   * one itineraryDetails for STO -> NYC, containing ARN -> AMS and AMS -> JFK.
   * Getting it wrong would sell the two flights as separate journeys, and with
   * `additionalMessageFunction M1` a failure on either is meant to roll back
   * both — which only holds if they are in the same group.
   *
   * Round-trip legs were covered above; the connecting case was not, and it is
   * the one where a mistake holds the wrong seats.
   */
  it('sells a connection as one leg spanning both segments', () => {
    const connection = [
      { ...segments[0], legIndex: 0, boardPoint: 'DEL', offPoint: 'BLR', flightNumber: '9484' },
      {
        legIndex: 0, boardPoint: 'BLR', offPoint: 'BOM', departureDate: '260926',
        departureTime: '0700', arrivalDate: '260926', marketingCarrier: 'AI',
        flightNumber: '9601', rbd: 'S',
      },
    ];
    const xml = buildAirSellBody({ segments: connection, seats: 1 });

    expect(xml.match(/<itineraryDetails>/g)).toHaveLength(1);
    expect(xml.match(/<segmentInformation>/g)).toHaveLength(2);
    // The leg is DEL -> BOM, not DEL -> BLR.
    expect(xml).toContain('<origin>DEL</origin><destination>BOM</destination>');
    // Both flights are present, in order.
    expect(xml.indexOf('9484')).toBeLessThan(xml.indexOf('9601'));
  });

  it('asks Amadeus to roll back every segment if one cannot be sold', () => {
    // M1 is the optimisation algorithm that cancels all flights when a sell
    // fails. Without it a connection can be half-sold, leaving the customer
    // holding one leg of a journey they cannot complete.
    const xml = buildAirSellBody({ segments: roundTrip, seats: 1 });

    expect(xml).toContain('<messageFunction>183</messageFunction><additionalMessageFunction>M1</additionalMessageFunction>');
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
  /**
   * `fopReference` is an OUTPUT field, and sending it populated is what made
   * every form of payment fail with `2228 CHECK DATA FIELDS` for months.
   *
   * The request sends it empty; the reply fills it in with the identifier of
   * the FOP that was created. Confirmed twice over — Amadeus's own worked
   * example sends `<fopReference></fopReference>` and gets back
   * `qualifier FPT, number 28`, and our own live call now gets back
   * `qualifier FPT, number 13`.
   *
   * The previous version of this test asserted the populated form and passed,
   * which is how the bug survived: the builder was tested against what we
   * believed rather than against what the WSAP accepts.
   */
  it('sends fopReference empty, because the reply is what fills it in', () => {
    const xml = buildFopBody({ fopCode: 'CASH' });

    expect(xml).toContain('<fopReference></fopReference>');
    expect(xml).not.toContain('<qualifier>FP</qualifier>');
  });

  it('defaults to CASH, the code for an agency-collected sale', () => {
    // We are the merchant of record - the card is charged at ARC Pay before
    // the GDS is involved - so the airline sees an agency collection settling
    // through ARC. `CA` is refused by the WSAP; `CASH` is accepted.
    expect(buildFopBody()).toContain('<fopCode>CASH</fopCode>');
  });

  it('associates the payment with the TSTs it pays for', () => {
    // Per Amadeus's "form of payment associated to a TST" example. Without
    // this the FP element is linked to nothing, and a PNR carrying several
    // TSTs cannot say which payment covers which fare.
    const xml = buildFopBody({ fopCode: 'CASH', tstRefs: ['1', '2'] });

    expect(xml).toContain('<pnrElementAssociation><referenceDetails><type>TST</type><value>1</value></referenceDetails></pnrElementAssociation>');
    expect(xml).toContain('<value>2</value>');
  });

  it('omits the association when there is no TST to point at', () => {
    expect(buildFopBody({ fopCode: 'CASH' })).not.toContain('pnrElementAssociation');
  });

  // fopDetails accepts only fopCode, fopMapTable, fopBillingCode and fopStatus.
  it('carries no free text, because the schema has nowhere to put it', () => {
    const xml = buildFopBody({ fopCode: 'CASH' });
    expect(xml).toContain('<fopCode>CASH</fopCode>');
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
  // `QEQ`, from Amadeus's own "placing a PNR in a specified category of a
  // specified queue" example. `BLPC` is the cryptic entry a human types; it is
  // too long for AlphaNumericString_Length1To3, and truncating it to `BLP` was
  // a guess. The WSAP answered `91A INACTIVE QUEUE BANK` either way, which
  // reads like an office problem and was very nearly reported as one.
  it('uses the documented placement option', () => {
    const xml = buildQueuePlaceBody({ recordLocator: 'ABC123', queueOffice: 'SCK1S2400', queueNumber: '50' });

    expect(xml).toContain('<option>QEQ</option>');
    expect(xml.match(/<option>(.*?)<\/option>/)[1].length).toBeLessThanOrEqual(3);
  });

  it('names the target office with the mandatory sourceType first', () => {
    const xml = buildQueuePlaceBody({ recordLocator: 'ABC123', queueOffice: 'SCK1S2400', queueNumber: '50' });
    // `3` means "the queue belongs to the requesting office", per Amadeus's
    // own example. `OT` was a guess: the WSAP refuses it with 91D CHECK
    // FORMAT, and accepts `3`.
    expect(xml).toContain('<targetOffice><sourceType><sourceQualifier1>3</sourceQualifier1></sourceType>');
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
  /**
   * The void request was invalid and could never have been accepted.
   *
   * We sent `stockProviderDetails/companyDetails/marketingCompany` with the
   * validating carrier. `stockProviderDetails` is OfficeSettingsDetailsType,
   * whose ONLY child is `officeSettingsDetails` — `companyDetails` is not an
   * element of that type at all. Amadeus's own "ticket voiding" example
   * carries the office's MARKET (country) code there, not a carrier.
   *
   * The consequence was a complete failure of the same-day void path: a
   * customer cancelling a ticketed booking on the day of issue hit a schema
   * rejection, `cancelBooking` rethrew rather than cancelling the itinerary on
   * top of a live ticket, and they were left with neither a refund nor a
   * cancellation. Never caught because the void has never been exercised — the
   * old tests asserted the invalid shape and passed.
   */
  it('identifies the stock by the office market code, not by a carrier', () => {
    const xml = buildVoidTicketBody({ documentNumbers: ['0572412345678'], marketIataCode: 'US' });

    expect(xml).toContain('<stockProviderDetails><officeSettingsDetails><marketIataCode>US</marketIataCode></officeSettingsDetails></stockProviderDetails>');
    expect(xml).not.toContain('companyDetails');
    expect(xml).not.toContain('marketingCompany');
  });

  it('refuses to build without a market code', () => {
    expect(() => buildVoidTicketBody({ documentNumbers: ['0572412345678'] })).toThrow(/market code/i);
  });

  it('refuses to build without a document number', () => {
    expect(() => buildVoidTicketBody({ marketIataCode: 'US' })).toThrow(/document number/i);
  });

  it('voids several documents in one request', () => {
    const xml = buildVoidTicketBody({
      documentNumbers: ['0572412345678', '0572412345679'], marketIataCode: 'US',
    });

    expect(xml.match(/<documentNumberDetails>/g)).toHaveLength(2);
  });

  it('names the target office when one is given', () => {
    const xml = buildVoidTicketBody({
      documentNumbers: ['0572412345678'], marketIataCode: 'US', targetOffice: 'SCK1S2400',
    });

    expect(xml).toContain('<targetOfficeDetails><originatorDetails><inHouseIdentification2>SCK1S2400</inHouseIdentification2>');
  });
});

describe('readVoidTicketReply', () => {
  // responseType X means the ticket was voided. Treating "the reply parsed" as
  // "the ticket was voided" would let the itinerary be cancelled out from
  // under a live ticket.
  it('reads a confirmed void', () => {
    expect(readVoidTicketReply({
      transactionResults: { responseDetails: { responseType: 'X', statusCode: 'O' } },
    }).voided).toBe(true);
  });

  it('does not treat any other response as a void', () => {
    expect(readVoidTicketReply({
      transactionResults: { responseDetails: { responseType: 'R', statusCode: 'O' } },
    }).voided).toBe(false);
    expect(readVoidTicketReply({}).voided).toBe(false);
  });
});

