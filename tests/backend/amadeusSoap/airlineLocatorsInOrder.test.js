import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const envelope = (name, inner, session) => `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:awsse="http://xml.amadeus.com/2010/06/Session_v3">
  <soap:Header>${session ? `<awsse:Session TransactionStatusCode="${session.status}"><awsse:SessionId>${session.id}</awsse:SessionId><awsse:SequenceNumber>${session.seq}</awsse:SequenceNumber><awsse:SecurityToken>TOK</awsse:SecurityToken></awsse:Session>` : ''}</soap:Header>
  <soap:Body><${name}>${inner}</${name}></soap:Body>
</soap:Envelope>`;
const reply = (xml) => ({ status: 200, data: xml, headers: {} });
const SESSION = { status: 'InSeries', id: 'SESS1', seq: '1' };

const sellOk = envelope('Air_SellFromRecommendationReply',
  '<itineraryDetails><segmentInformation><actionDetails><quantity>1</quantity><statusCode>OK</statusCode></actionDetails></segmentInformation></itineraryDetails>', SESSION);
const addOk = envelope('PNR_Reply', '<dummy/>', SESSION);
const fopOk = envelope('FOP_CreateFormOfPaymentReply', '<dummy/>', SESSION);
const priceOk = envelope('Fare_PricePNRWithBookingClassReply',
  '<fareList><fareReference><uniqueReference>1</uniqueReference></fareReference><paxSegReference><refDetails><refQualifier>PA</refQualifier><refNumber>1</refNumber></refDetails></paxSegReference><fareDataInformation><fareDataSupInformation><fareDataQualifier>712</fareDataQualifier><fareAmount>76.00</fareAmount><fareCurrency>USD</fareCurrency></fareDataSupInformation></fareDataInformation></fareList>', SESSION);
const tstOk = envelope('Ticket_CreateTSTFromPricingReply', '<tstList><tstReference><uniqueReference>1</uniqueReference></tstReference></tstList>', SESSION);
const pnrHeaderXml = '<pnrHeader><reservationInfo><reservation><companyId>1A</companyId><controlNumber>ABC123</controlNumber><date>040926</date></reservation></reservationInfo></pnrHeader>'
  + '<travellerInfo><elementManagementPassenger><reference><qualifier>PT</qualifier><number>2</number></reference></elementManagementPassenger>'
  + '<passengerData><travellerInformation><traveller><surname>SMITH</surname></traveller><passenger><firstName>JOHN MR</firstName></passenger></travellerInformation></passengerData></travellerInfo>';
const segment = '<itineraryInfo><elementManagementItinerary><segmentName>AIR</segmentName></elementManagementItinerary>'
  + '<relatedProduct><quantity>1</quantity><status>HK</status></relatedProduct>'
  + '<itineraryReservationInfo><reservation><companyId>AA</companyId><controlNumber>KJQ7TB</controlNumber></reservation></itineraryReservationInfo>'
  + '</itineraryInfo>';
const committed = envelope('PNR_Reply', `${pnrHeaderXml}<originDestinationDetails>${segment}</originDestinationDetails>`, SESSION);
const ticketed = envelope('PNR_Reply', `${pnrHeaderXml}<originDestinationDetails>${segment}</originDestinationDetails>`
  + '<dataElementsMaster><dataElementsIndiv><elementManagementData><segmentName>FA</segmentName></elementManagementData>'
  + '<otherDataFreetext><freetextDetail><subjectQualifier>3</subjectQualifier><type>P06</type></freetextDetail><longFreetext>PAX 001-7491175288/ETAA/USD76.00/01NOV26/SCK1S2400/00000000</longFreetext></otherDataFreetext>'
  + '<referenceForDataElement><reference><qualifier>PT</qualifier><number>2</number></reference></referenceForDataElement>'
  + '</dataElementsIndiv></dataElementsMaster>', SESSION);
const queueOk = envelope('Queue_PlacePNRReply', '<dummy/>', SESSION);
const issueOk = envelope('DocIssuance_IssueTicketReply', '<processingStatus><statusCode>O</statusCode></processingStatus>', SESSION);
const signOutOk = envelope('Security_SignOutReply', '<dummy/>');

const offer = () => ({
  id: '1',
  source: 'GDS',
  price: { total: '76.00', currency: 'USD' },
  validatingAirlineCodes: ['AA'],
  travelerPricings: [{ travelerId: '1', travelerType: 'ADULT' }],
  itineraries: [{ segments: [{ id: '1' }] }],
  _ama: {
    wsap: '1ASIWJETJEC',
    officeId: 'SCK1S2400',
    searchedAt: new Date().toISOString(),
    paxRefs: [{ ref: '1', ptc: 'ADT' }],
    segments: [{
      legIndex: 0, boardPoint: 'JFK', offPoint: 'LAX', departureDate: '011126', arrivalDate: '011126', marketingCarrier: 'AA', flightNumber: '1', rbd: 'S',
    }],
  },
});

const book = async ({ autoTicket }) => {
  vi.stubEnv('AMADEUS_WS_ENDPOINT', 'https://node.test.invalid/1ASIWJETJEC');
  vi.stubEnv('AMADEUS_WS_WSAP', '1ASIWJETJEC');
  vi.stubEnv('AMADEUS_WS_USERNAME', 'WSTEST');
  vi.stubEnv('AMADEUS_WS_PASSWORD', 'pw');
  vi.stubEnv('AMADEUS_WS_OFFICE_ID', 'SCK1S2400');
  vi.stubEnv('AMADEUS_WS_BOOKING_ENABLED', 'true');
  vi.stubEnv('AMADEUS_WS_AUTO_TICKET', autoTicket ? 'true' : 'false');
  vi.stubEnv('AMADEUS_WS_MIN_PAYMENT_RATIO', '0');
  vi.stubEnv('AMADEUS_WS_AIRLINE_LOCATOR_WAIT_MS', '0');
  vi.stubEnv('AMADEUS_WS_TICKET_RETRIEVE_INITIAL_MS', '0');
  vi.stubEnv('AMADEUS_WS_TICKET_RETRIEVE_RETRIES', '0');
  vi.stubEnv('AMADEUS_WS_TICKET_RETRIEVE_DELAY_MS', '0');
  vi.resetModules();
  axios.post.mockReset();
  const script = autoTicket
    ? [sellOk, addOk, fopOk, priceOk, tstOk, committed, queueOk, issueOk, ticketed]
    : [sellOk, addOk, fopOk, priceOk, tstOk, committed, queueOk];
  for (const xml of script) axios.post.mockResolvedValueOnce(reply(xml));
  axios.post.mockResolvedValue(reply(signOutOk));
  const provider = (await import('../../../backend/services/amadeusSoap/index.js')).default;
  return provider.createFlightOrder({
    data: { flightOffers: [offer()], travelers: [{ id: '1', name: { firstName: 'John', lastName: 'Smith' }, gender: 'MALE' }] },
  }, { bookingReference: 'FLT1', expectedTotal: 76 });
};

describe("the airline's booking code in the booking result", () => {
  beforeEach(() => vi.unstubAllEnvs());

  it('comes back with a ticketed booking', async () => {
    const order = await book({ autoTicket: true });

    expect(order.ticketed).toBe(true);
    expect(order.pnr).toBe('ABC123');
    expect(order.airlineLocators).toEqual([{ carrierCode: 'AA', locator: 'KJQ7TB' }]);
  });

  it('comes back with a booking left for a person to ticket', async () => {
    const order = await book({ autoTicket: false });

    expect(order.ticketed).toBe(false);
    expect(order.airlineLocators).toEqual([{ carrierCode: 'AA', locator: 'KJQ7TB' }]);
  });
});
