import { describe, expect, it } from 'vitest';
import { readRecordLocator } from '../../../backend/services/amadeusSoap/mappers/flightOrder.js';

/**
 * Reading the PNR back from a commit.
 *
 * This had a fallback to `companyId`, which is not a record locator — it is
 * the owning system's code, and on this WSAP it is always the literal `1A`.
 * When a commit came back without a control number the function returned
 * "1A", and "1A" is truthy: the booking chain's `if (!pnr) throw` guard let it
 * through, set `committed = true`, and reported a successful booking with a
 * fabricated reference. The customer had already paid by then, and every
 * subsequent retrieve or cancel failed with INVALID RECORD LOCATOR.
 *
 * Found by a queue probe that printed `PNR 1A`.
 */

const commit = (reservation) => ({ pnrHeader: { reservationInfo: { reservation } } });

describe('readRecordLocator', () => {
  it('reads a real record locator', () => {
    expect(readRecordLocator(commit({ controlNumber: 'CL8RHY' }))).toBe('CL8RHY');
  });

  it('never returns the owning system code as a PNR', () => {
    // The exact shape that fabricated a booking.
    expect(readRecordLocator(commit({ companyId: '1A' }))).toBe('');
  });

  it('rejects anything that is not six alphanumeric characters', () => {
    for (const bad of ['1A', 'ABC', 'TOOLONG1', 'AB 123', '', '  ']) {
      expect(readRecordLocator(commit({ controlNumber: bad }))).toBe('');
    }
  });

  it('returns empty rather than throwing on a reply with no header', () => {
    expect(readRecordLocator({})).toBe('');
    expect(readRecordLocator(undefined)).toBe('');
  });

  it('trims surrounding whitespace the WSAP sometimes pads with', () => {
    expect(readRecordLocator(commit({ controlNumber: ' CL8RHY ' }))).toBe('CL8RHY');
  });
});
