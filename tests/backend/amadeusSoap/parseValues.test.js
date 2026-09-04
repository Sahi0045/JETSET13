import { describe, expect, it } from 'vitest';
import { atTxt, num, parseSoap, txt } from '../../../backend/services/amadeusSoap/parseXml.js';

/**
 * Values Amadeus sends as strings must stay strings.
 *
 * `parseTagValue: false` is set for one load-bearing reason: a flight number
 * like `0614` is not the number 614, and a `refNumber` is an identifier rather
 * than an integer. Flip that flag and searches keep working while flight
 * numbers quietly lose their leading zero, so the failure surfaces as a
 * customer holding a boarding pass for a flight that does not exist.
 *
 * This needs a test rather than a comment because none of the recorded
 * fixtures happens to contain a leading-zero flight number — the case the
 * setting exists for was the one case nothing covered.
 */
const parse = (inner) => parseSoap(`<?xml version="1.0"?><R>${inner}</R>`).R;

describe('the parser does not coerce values', () => {
  it('keeps a leading-zero flight number as a string', () => {
    const r = parse('<flightOrtrainNumber>0614</flightOrtrainNumber>');

    expect(r.flightOrtrainNumber).toBe('0614');
    expect(r.flightOrtrainNumber).not.toBe(614);
  });

  it('keeps a leading-zero time as a string', () => {
    // 0610 as a number is 610, which formats as 6:10 by luck and 06:10 by
    // intent — the luck runs out at 0005.
    expect(parse('<timeOfArrival>0005</timeOfArrival>').timeOfArrival).toBe('0005');
  });

  it('keeps reference numbers as identifiers, not integers', () => {
    expect(parse('<refNumber>01</refNumber>').refNumber).toBe('01');
  });

  it('keeps a numeric-looking carrier code intact', () => {
    // Real two-character carrier codes include 0B (Blue Air) and 9W.
    expect(txt(parse('<companyId>0B</companyId>').companyId)).toBe('0B');
  });

  it('leaves amounts as strings, to be converted deliberately', () => {
    const r = parse('<amount>291.00</amount>');

    expect(r.amount).toBe('291.00');
    expect(num(r.amount)).toBe(291);
  });

  it('does not coerce attributes either', () => {
    const r = parse('<seg number="0614"/>');
    expect(r.seg['@number']).toBe('0614');
  });

  it('reads a nested value through atTxt without coercion', () => {
    const r = parse('<flightIdentification><flightNumber>0007</flightNumber></flightIdentification>');
    expect(atTxt(r, 'flightIdentification.flightNumber')).toBe('0007');
  });
});
