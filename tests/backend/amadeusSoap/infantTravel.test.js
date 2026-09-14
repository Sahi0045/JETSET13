import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildCalendarBody, buildMasterPricerBody } from '../../../backend/services/amadeusSoap/operations/masterPricer.js';
import { buildInformativePricingBody } from '../../../backend/services/amadeusSoap/operations/informativePricing.js';
import { mapMasterPricerReply } from '../../../backend/services/amadeusSoap/mappers/offer.js';
import { applyPricingToOffer } from '../../../backend/services/amadeusSoap/mappers/pricing.js';
import { assignPassengers, buildAddElementsBody } from '../../../backend/services/amadeusSoap/operations/pnr.js';
import { readPricePnrReply } from '../../../backend/services/amadeusSoap/operations/ticketing.js';
import { readTravelers } from '../../../backend/services/amadeusSoap/mappers/flightOrder.js';
import { ERROR_CATALOGUE } from '../../../backend/services/amadeusSoap/codes.js';
import { parseSoap, unwrapEnvelope } from '../../../backend/services/amadeusSoap/parseXml.js';

/**
 * Families and infants, through every Amadeus message a booking uses.
 *
 * Every search with an infant failed with "955 Invalid passenger type code", so
 * nobody could book one, and the PNR price added one fare per passenger TYPE,
 * so any booking for two or more would have failed its fare check after
 * payment. The fixtures were recorded on the live WSAP on 2026-09-15 for two
 * adults, a child and an infant on DEL-BOM: the search, the informative price,
 * and - never committed - the PNR names and the PNR price.
 */

const config = { wsap: '1ASIWJETJEC', officeId: 'SCK1S2400', currency: 'USD' };

const reply = (name) => {
  const xml = readFileSync(new URL(`../../fixtures/amadeus/${name}.xml`, import.meta.url), 'utf8');
  const { body } = unwrapEnvelope(parseSoap(xml));
  return body[Object.keys(body).find((k) => k !== 'Fault')];
};

const familyOffer = () => mapMasterPricerReply(reply('mptbs-infant-family-del-bom'), { config, searchSignature: 'test' }).offers[0];

const family = {
  from: 'DEL', to: 'BOM', departDate: '2026-10-06', adults: 2, children: 1, infants: 1,
};

describe('searching with an infant', () => {
  it('asks for seats, not people: an infant on a lap is not a seat', () => {
    expect(buildMasterPricerBody(family)).toContain('<numberOfUnits>3</numberOfUnits><typeOfUnit>PX</typeOfUnit>');
    expect(buildCalendarBody({ ...family, dayInterval: 3 })).toContain('<numberOfUnits>3</numberOfUnits><typeOfUnit>PX</typeOfUnit>');
  });

  it("gives each infant its adult's reference, marked as an infant", () => {
    const xml = buildMasterPricerBody({ ...family, adults: 2, children: 0, infants: 2 });

    expect(xml).toContain('<paxReference><ptc>INF</ptc>'
      + '<traveller><ref>1</ref><infantIndicator>1</infantIndicator></traveller>'
      + '<traveller><ref>2</ref><infantIndicator>1</infantIndicator></traveller></paxReference>');
  });

  it('numbers adults and children once overall, and infants not at all', () => {
    const xml = buildMasterPricerBody(family);

    expect(xml).toContain('<paxReference><ptc>ADT</ptc><traveller><ref>1</ref></traveller><traveller><ref>2</ref></traveller></paxReference>');
    expect(xml).toContain('<paxReference><ptc>CHD</ptc><traveller><ref>3</ref></traveller></paxReference>');
    expect(xml).not.toContain('<ref>4</ref>');
  });

  it('refuses an infant with no adult to sit on', () => {
    expect(() => buildMasterPricerBody({ ...family, adults: 1, infants: 2 })).toThrow(/infant/);
  });

  it('answers a refused passenger mix as the request it is, not "temporarily unavailable"', () => {
    for (const text of ['955 Invalid passenger type code', '926 Invalid number of passenger']) {
      expect(ERROR_CATALOGUE.find((rule) => rule.match.test(text))?.code).toBe(400);
    }
  });
});

describe('an offer with an infant', () => {
  it('has one pricing per person, each with an id of its own', () => {
    const offer = familyOffer();

    expect(offer.travelerPricings.map((t) => t.travelerType)).toEqual(['ADULT', 'ADULT', 'CHILD', 'HELD_INFANT']);
    expect(new Set(offer.travelerPricings.map((t) => t.travelerId)).size).toBe(4);
  });

  it("keeps the infant's adult, and the infant's own fare", () => {
    const offer = familyOffer();
    const infant = offer.travelerPricings.find((t) => t.travelerType === 'HELD_INFANT');
    const adult = offer.travelerPricings.find((t) => t.travelerType === 'ADULT');

    expect(infant.associatedAdultId).toBe('1');
    expect(Number(infant.price.total)).toBeLessThan(Number(adult.price.total));
    expect(offer._ama.paxRefs).toContainEqual({ ref: '1', ptc: 'INF' });
  });
});

describe('pricing an infant', () => {
  it("prices the infant on its adult's reference, as an infant without a seat", () => {
    const offer = familyOffer();
    const xml = buildInformativePricingBody({ paxRefs: offer._ama.paxRefs, segments: offer._ama.segments, currency: 'USD' });

    expect(xml).toContain('<travellersID><travellerDetails><measurementValue>1</measurementValue></travellerDetails></travellersID>'
      + '<discountPtc><valueQualifier>INF</valueQualifier><fareDetails><qualifier>766</qualifier></fareDetails></discountPtc>');
  });

  // Matched by reference alone, the infant found its adult's group and was
  // shown the adult fare.
  it('gives the infant the infant fare, and adds up to the priced total', () => {
    const { offer } = applyPricingToOffer(reply('informative-pricing-infant-family'), familyOffer());
    const fare = (type) => offer.travelerPricings.filter((t) => t.travelerType === type).map((t) => t.price.total);

    expect(fare('ADULT')).toEqual(['80.20', '80.20']);
    expect(fare('CHILD')).toEqual(['67.60']);
    expect(fare('HELD_INFANT')).toEqual(['23.90']);
    expect(offer.price.total).toBe('251.90');
    expect(offer.travelerPricings.reduce((n, t) => n + Number(t.price.total), 0)).toBeCloseTo(251.9, 2);
  });
});

describe('booking an infant', () => {
  const travelers = [
    { firstName: 'John', lastName: 'Smith', ptc: 'ADULT', gender: 'MALE', dateOfBirth: '1990-01-01' },
    { firstName: 'Mary', lastName: 'Smith', ptc: 'ADULT', gender: 'FEMALE', dateOfBirth: '1992-01-01' },
    { firstName: 'Amy', lastName: 'Smith', ptc: 'CHILD', gender: 'FEMALE', dateOfBirth: '2018-05-05' },
    {
      firstName: 'Baby', lastName: 'Smith', ptc: 'HELD_INFANT', gender: 'FEMALE', dateOfBirth: '2025-10-01',
      documents: [{ number: 'P1234567', nationality: 'IN', issuanceCountry: 'IN', expiryDate: '2030-01-01' }],
    },
  ];

  it("puts the infant on the first adult's name, with its own name, type and date of birth", () => {
    const xml = buildAddElementsBody({ travelers, officeId: 'SCK1S2400' });

    expect(xml).toContain('<traveller><surname>SMITH</surname><quantity>2</quantity></traveller>'
      + '<passenger><firstName>JOHN MR</firstName><infantIndicator>3</infantIndicator></passenger>');
    expect(xml).toContain('<passengerData><travellerInformation><traveller><surname>SMITH</surname></traveller>'
      + '<passenger><firstName>BABY MISS</firstName><type>INF</type></passenger></travellerInformation>'
      + '<dateOfBirth><dateAndTimeDetails><date>01OCT25</date></dateAndTimeDetails></dateOfBirth></passengerData>');
  });

  it('numbers only the passengers with seats', () => {
    const xml = buildAddElementsBody({ travelers, officeId: 'SCK1S2400' });

    expect(xml.match(/<travellerInfo>/g)).toHaveLength(3);
    expect(xml).toContain('<qualifier>PR</qualifier><number>3</number>');
    expect(xml).not.toContain('<elementManagementPassenger><reference><qualifier>PR</qualifier><number>4</number>');
  });

  it("files the infant's travel document on its adult, marked as the infant's", () => {
    const xml = buildAddElementsBody({ travelers, officeId: 'SCK1S2400' });
    const infantDocs = xml.split('<dataElementsIndiv>').find((element) => element.includes('/FI/'));

    expect(infantDocs).toContain('<referenceForDataElement><reference><qualifier>PR</qualifier><number>1</number>');
  });

  it('pairs infants with adults in order, skipping children', () => {
    const pairs = assignPassengers([
      { firstName: 'A', lastName: 'X', ptc: 'ADULT' },
      { firstName: 'C', lastName: 'X', ptc: 'CHILD' },
      { firstName: 'B', lastName: 'X', ptc: 'ADULT' },
      { firstName: 'I1', lastName: 'X', ptc: 'HELD_INFANT' },
      { firstName: 'I2', lastName: 'X', ptc: 'HELD_INFANT' },
    ]);

    expect(pairs.map((p) => [p.traveler.firstName, p.paxNumber, p.infant?.firstName ?? null])).toEqual([
      ['A', 1, 'I1'], ['C', 2, null], ['B', 3, 'I2'],
    ]);
  });

  it('refuses more infants than adults, and an infant without a date of birth', () => {
    expect(() => buildAddElementsBody({ travelers: [travelers[0], travelers[3], travelers[3]], officeId: 'X' }))
      .toThrow(/infants need as many adults/);
    expect(() => buildAddElementsBody({ travelers: [travelers[0], { ...travelers[3], dateOfBirth: '' }], officeId: 'X' }))
      .toThrow(/date of birth/);
  });

  it('reads the infant back from the PNR, on its adult', () => {
    const people = readTravelers(reply('pnr-add-elements-infant-family'));

    expect(people).toHaveLength(4);
    expect(people).toContainEqual({ id: '2', name: { firstName: 'PROBE', lastName: 'PARENT' } });
    expect(people).toContainEqual({
      id: '2-INF', travelerType: 'HELD_INFANT', associatedAdultId: '2', name: { firstName: 'BABY', lastName: 'PARENT' },
    });
  });

  // Amadeus states each PNR fare per passenger: two adults share one fare.
  it('prices the PNR for every passenger on each fare', () => {
    const priced = readPricePnrReply(reply('price-pnr-infant-family'));

    expect(priced.fares.map((f) => f.passengers).sort()).toEqual([1, 1, 2]);
    expect(priced.total).toBeCloseTo(251.9, 2);
  });
});
