import { describe, expect, it } from 'vitest';
import {
  interlineNotAllowed,
  interlinePairsOf,
  isInterline,
  marketingCarriersOf,
  parsePairList,
} from '../../../backend/services/amadeusSoap/ticketingCarriers.js';

/**
 * One airline's ticket stock carrying another airline's flight.
 *
 * Proven on PDT, 16 Sep 2026, through the browser and then reproduced: a
 * JetBlue-plated Frankfurt-JFK itinerary (B6 stock, LH900 + B63920) was sold
 * cleanly, priced cleanly at 385.43, the customer's card was charged 390.28,
 * the PNR was committed - and only then did issuance answer
 * `8102 ETKT RJT - NO INTERLINE BETWEEN CARRIERS B6-LH`.
 *
 * There is no earlier signal to read. `Air_SellFromRecommendation` returned OK
 * on both segments and `Fare_PricePNRWithBookingClass` returned the quoted
 * fare, so the pre-payment seat and fare check passed; `DocIssuance_IssueTicket`
 * needs a committed PNR, so the question cannot be asked before the money
 * moves. A bad pair can only be learned from an 8102 and then kept out of
 * search, so it costs one customer rather than every customer.
 *
 * What this must NOT do is refuse interline outright. Plating another airline's
 * flight is normal - Hahn Air (HR) and APG (GP) exist to do nothing else, and
 * on an India search they carry 12 of 50 offers, every one a SpiceJet flight.
 * The first version of this guard blocked them all; the search-route test
 * caught it, which is why the cases below pin both directions.
 */

const offer = ({ plating, segments, operating = {} }) => ({
  validatingAirlineCodes: plating ? [plating] : [],
  itineraries: [{
    segments: segments.map((code, i) => ({
      carrierCode: code,
      number: String(100 + i),
      operating: operating[code] ? { carrierCode: operating[code] } : undefined,
    })),
  }],
});

describe('spotting an interline itinerary', () => {
  it('sees the case that cost a charge: B6 stock carrying a Lufthansa flight', () => {
    const b6lh = offer({ plating: 'B6', segments: ['LH', 'B6'] });

    expect(isInterline(b6lh)).toBe(true);
    expect(interlinePairsOf(b6lh)).toEqual(['B6-LH']);
  });

  it('is not fooled by a codeshare, which is one airline\'s ticket throughout', () => {
    // LH101 operated by LX. The marketing carrier is LH, the plating carrier is
    // LH: one airline's ticket, no interline agreement needed.
    const codeshare = offer({ plating: 'LH', segments: ['LH', 'LH'], operating: { LH: 'LX' } });

    expect(isInterline(codeshare)).toBe(false);
    expect(interlinePairsOf(codeshare)).toEqual([]);
  });

  it('is not interline when one airline markets and plates the whole trip', () => {
    expect(isInterline(offer({ plating: 'LH', segments: ['LH', 'LH'] }))).toBe(false);
  });

  it('names every foreign carrier, not just the first', () => {
    expect(interlinePairsOf(offer({ plating: 'FZ', segments: ['UL', 'FZ', 'AI'] })).sort())
      .toEqual(['FZ-AI', 'FZ-UL']);
  });

  it('says nothing about an offer with no plating carrier', () => {
    expect(isInterline(offer({ plating: null, segments: ['LH'] }))).toBe(false);
  });

  it('reads the carriers the booking chain will sell, when that is all there is', () => {
    const fromAma = { validatingAirlineCodes: ['B6'], _ama: { segments: [{ marketingCarrier: 'LH' }, { marketingCarrier: 'B6' }] } };

    expect(marketingCarriersOf(fromAma).sort()).toEqual(['B6', 'LH']);
    expect(isInterline(fromAma)).toBe(true);
  });
});

describe('the policy', () => {
  const b6lh = offer({ plating: 'B6', segments: ['LH', 'B6'] });
  const plain = offer({ plating: 'LH', segments: ['LH'] });

  it('keeps out the pair that was actually refused', () => {
    expect(interlineNotAllowed(b6lh, { blocked: ['B6-LH'] })).toBe(true);
  });

  it('never touches a single-carrier itinerary', () => {
    expect(interlineNotAllowed(plain, { blocked: ['B6-LH'] })).toBe(false);
  });

  /**
   * The mistake the first version of this guard made. Hahn Air and APG exist to
   * plate other airlines' flights: on an India search they carry 12 of 50
   * offers, every one a SpiceJet flight. Refusing all interline would cost a
   * quarter of that result set to prevent a failure seen in about one offer in
   * sixty.
   */
  it('leaves a plating carrier alone when its pair has never failed', () => {
    const hahnAir = offer({ plating: 'HR', segments: ['SG'] });
    const apg = offer({ plating: 'GP', segments: ['SG', 'SG'] });

    expect(interlineNotAllowed(hahnAir, { blocked: ['B6-LH'] })).toBe(false);
    expect(interlineNotAllowed(apg, { blocked: ['B6-LH'] })).toBe(false);
  });

  it('blocks on any one bad pair, not only when all of them are bad', () => {
    const three = offer({ plating: 'FZ', segments: ['UL', 'FZ', 'AI'] });

    expect(interlineNotAllowed(three, { blocked: ['FZ-AI'] })).toBe(true);
    expect(interlineNotAllowed(three, { blocked: ['LH-B6'] })).toBe(false);
  });

  // For anyone who would rather lose the inventory than risk it.
  it('can refuse every interline itinerary when asked to', () => {
    expect(interlineNotAllowed(b6lh, { blockAll: true })).toBe(true);
    expect(interlineNotAllowed(offer({ plating: 'HR', segments: ['SG'] }), { blockAll: true })).toBe(true);
    expect(interlineNotAllowed(plain, { blockAll: true })).toBe(false);
  });

  it('allows everything when nothing is blocked', () => {
    expect(interlineNotAllowed(b6lh, {})).toBe(false);
  });
});

describe('reading the allowed pairs from the environment', () => {
  it('takes pairs separated by commas or spaces, in any case', () => {
    expect(parsePairList('b6-lh, DL-UA  fz-ul')).toEqual(['B6-LH', 'DL-UA', 'FZ-UL']);
  });

  it('ignores anything that is not a pair of airline codes', () => {
    expect(parsePairList('B6-LH, nonsense, LH, B6-, -LH, B6--LH')).toEqual(['B6-LH']);
  });

  it('is empty when nothing is set', () => {
    expect(parsePairList(undefined)).toEqual([]);
    expect(parsePairList('')).toEqual([]);
  });
});
