import { describe, expect, it } from 'vitest';
import { buildInformativePricingBody } from '../../../backend/services/amadeusSoap/operations/informativePricing.js';
import { buildCalendarBody, buildMasterPricerBody } from '../../../backend/services/amadeusSoap/operations/masterPricer.js';

/**
 * Request shapes.
 *
 * Amadeus rejects a malformed request with a message that names neither the
 * element nor the reason - "Unknown item found or found at the wrong position",
 * or simply zero results. Each assertion here stands for a fact that took a
 * live call to establish, and that an innocent-looking edit could undo.
 */

const paxRefs = [{ ref: '1', ptc: 'ADULT' }, { ref: '2', ptc: 'ADULT' }, { ref: '3', ptc: 'CHILD' }];
const segments = [
  {
    boardPoint: 'DEL', offPoint: 'BOM', departureDate: '201126', departureTime: '1000',
    arrivalDate: '201126', marketingCarrier: 'AI', flightNumber: '2995', rbd: 'T',
  },
];

describe('MasterPricer', () => {
  // CabinIdentificationType orders cabinQualifier before cabin. Reversed, the
  // reply is "[name = cabinId] [Error = Unknown item found or found at the
  // wrong position]".
  it('orders cabinQualifier before cabin', () => {
    const xml = buildMasterPricerBody({
      from: 'JFK', to: 'LHR', departDate: '2026-11-15', adults: 1, travelClass: 'BUSINESS',
    });

    expect(xml).toContain('<cabinId><cabinQualifier>RC</cabinQualifier><cabin>C</cabin></cabinId>');
  });

  // Omitting conversionType returns "Bad value (coded) - conversionRate/
  // fareSelect" and zero recommendations, with nothing pointing at the cause.
  it('sends conversionType alongside the currency', () => {
    const xml = buildMasterPricerBody({ from: 'JFK', to: 'LHR', departDate: '2026-11-15', adults: 1 });

    expect(xml).toContain('<conversionType>FC</conversionType>');
    expect(xml).toContain('<currency>USD</currency>');
  });

  // travelFlightInfo sits before itinerary in the root sequence.
  it('places travelFlightInfo before itinerary', () => {
    const xml = buildMasterPricerBody({
      from: 'JFK', to: 'LHR', departDate: '2026-11-15', adults: 1, nonStop: true,
    });

    expect(xml.indexOf('<travelFlightInfo>')).toBeLessThan(xml.indexOf('<itinerary>'));
  });

  it('emits one itinerary per leg, numbered from 1', () => {
    const oneWay = buildMasterPricerBody({ from: 'JFK', to: 'LHR', departDate: '2026-11-15', adults: 1 });
    const roundTrip = buildMasterPricerBody({
      from: 'JFK', to: 'LHR', departDate: '2026-11-15', returnDate: '2026-11-22', adults: 1,
    });

    expect(oneWay.match(/<itinerary>/g)).toHaveLength(1);
    expect(roundTrip.match(/<itinerary>/g)).toHaveLength(2);
    expect(roundTrip).toContain('<segRef>2</segRef>');
    // The return leg reverses the route.
    expect(roundTrip.indexOf('<locationId>LHR</locationId><airportCityQualifier>A</airportCityQualifier></depMultiCity>')).toBeGreaterThan(0);
  });

  // A metro code searches every airport in the city and must be qualified 'C'.
  it('qualifies a city code as C and an airport as A', () => {
    const city = buildMasterPricerBody({
      from: 'LON', to: 'NYC', departDate: '2026-11-15', adults: 1, fromIsCity: true, toIsCity: true,
    });
    const airport = buildMasterPricerBody({ from: 'LHR', to: 'JFK', departDate: '2026-11-15', adults: 1 });

    expect(city).toContain('<locationId>LON</locationId><airportCityQualifier>C</airportCityQualifier>');
    expect(airport).toContain('<locationId>LHR</locationId><airportCityQualifier>A</airportCityQualifier>');
  });

  it('groups travellers by passenger type and numbers them once overall', () => {
    const xml = buildMasterPricerBody({
      from: 'DEL', to: 'BOM', departDate: '2026-11-20', adults: 2, children: 1,
    });

    expect(xml).toContain('<ptc>ADT</ptc>');
    expect(xml).toContain('<ptc>CHD</ptc>');
    // Three travellers, referenced 1..3 across the groups.
    expect(xml.match(/<traveller>/g)).toHaveLength(3);
    expect(xml).toContain('<ref>3</ref>');
    expect(xml).toContain('<numberOfUnits>3</numberOfUnits><typeOfUnit>PX</typeOfUnit>');
  });

  it('uses dates in Date_DDMMYY, never ISO', () => {
    const xml = buildMasterPricerBody({ from: 'JFK', to: 'LHR', departDate: '2026-11-15', adults: 1 });

    expect(xml).toContain('<date>151126</date>');
    expect(xml).not.toContain('2026-11-15');
  });

  it('rejects an incomplete request before building anything', () => {
    expect(() => buildMasterPricerBody({ from: 'JFK', departDate: '2026-11-15' })).toThrow(/required/);
  });
});

describe('MasterPricerCalendar', () => {
  it('is the calendar message with a date range', () => {
    const xml = buildCalendarBody({ from: 'JFK', to: 'LHR', departDate: '2026-11-15', adults: 1, dayInterval: 3 });

    expect(xml).toContain('<Fare_MasterPricerCalendar');
    expect(xml).toContain('<rangeOfDate><rangeQualifier>C</rangeQualifier><dayInterval>3</dayInterval></rangeOfDate>');
    // rangeOfDate follows firstDateTimeDetail inside timeDetails.
    expect(xml.indexOf('<firstDateTimeDetail>')).toBeLessThan(xml.indexOf('<rangeOfDate>'));
  });
});

describe('InformativePricing', () => {
  // Verified against the live WSAP: the field names are the reverse of what
  // they suggest. Swapped, Amadeus returns error 477.
  it('sends quantity as the SEGMENT count and numberOfUnits as the PASSENGER count', () => {
    const xml = buildInformativePricingBody({ paxRefs, segments, currency: 'USD' });

    // Two adults over one segment.
    expect(xml).toContain('<segmentControlDetails><quantity>1</quantity><numberOfUnits>2</numberOfUnits></segmentControlDetails>');
  });

  // travellersID is max=1 per group and holds one travellerDetails per
  // passenger; one travellersID each returns 477.
  it('wraps every traveller of a group in a single travellersID', () => {
    const xml = buildInformativePricingBody({ paxRefs, segments, currency: 'USD' });
    const adultGroup = xml.slice(xml.indexOf('<passengersGroup>'), xml.indexOf('</passengersGroup>'));

    expect(adultGroup.match(/<travellersID>/g)).toHaveLength(1);
    expect(adultGroup.match(/<travellerDetails>/g)).toHaveLength(2);
  });

  it('groups by passenger type and marks only the non-adult groups', () => {
    const xml = buildInformativePricingBody({ paxRefs, segments, currency: 'USD' });

    expect(xml.match(/<passengersGroup>/g)).toHaveLength(2);
    expect(xml).toContain('<discountPtc><valueQualifier>CHD</valueQualifier></discountPtc>');
    expect(xml).not.toContain('<valueQualifier>ADT</valueQualifier>');
  });

  // CurrenciesType -> firstCurrencyDetails, with a mandatory currencyQualifier.
  it('shapes the currency option as CurrenciesType', () => {
    const xml = buildInformativePricingBody({ paxRefs, segments, currency: 'USD' });

    expect(xml).toContain('<firstCurrencyDetails><currencyQualifier>FCO</currencyQualifier><currencyIsoCode>USD</currencyIsoCode></firstCurrencyDetails>');
  });

  // MasterPricer spells it offPointDetails; this schema uses one 'f'.
  it('spells offpointDetails the way this schema does', () => {
    const xml = buildInformativePricingBody({ paxRefs, segments, currency: 'USD' });

    expect(xml).toContain('<offpointDetails>');
    expect(xml).not.toContain('<offPointDetails>');
  });

  it('carries the booking class each segment was found in', () => {
    const xml = buildInformativePricingBody({ paxRefs, segments, currency: 'USD' });

    expect(xml).toContain('<flightNumber>2995</flightNumber><bookingClass>T</bookingClass>');
  });

  it('refuses to price without segments or passengers', () => {
    expect(() => buildInformativePricingBody({ paxRefs, segments: [] })).toThrow(/segments are required/);
    expect(() => buildInformativePricingBody({ paxRefs: [], segments })).toThrow(/paxRefs are required/);
  });
});
