import { describe, expect, it } from 'vitest';
import { penaltyRows } from '../../shared/penaltyTable.js';

const cell = (allowed, amount = null, varies = false) => ({ allowed, amount, varies });
const lufthansa = {
  currency: 'USD',
  bookBy: '2026-11-04',
  change: { before: cell(true, 338), noShowBefore: cell(true, 338), after: cell(false), noShowAfter: cell(false) },
  refund: { before: cell(false), noShowBefore: cell(false), after: cell(false), noShowAfter: cell(false) },
};

describe('penaltyRows', () => {
  it('lists before departure, missed flight and after departure', () => {
    expect(penaltyRows(lufthansa).map((row) => row.label)).toEqual(['Before departure', 'If you miss the flight', 'After departure']);
  });

  it('shows a filed change fee as allowed for that amount', () => {
    expect(penaltyRows(lufthansa)[0].change).toEqual({ tone: 'allowed', text: 'Allowed', amount: 338 });
  });

  it('shows a refusal as not allowed', () => {
    expect(penaltyRows(lufthansa)[0].cancel).toEqual({ tone: 'notAllowed', text: 'Not refundable', amount: null });
    expect(penaltyRows(lufthansa)[2].change).toEqual({ tone: 'notAllowed', text: 'Not allowed', amount: null });
  });

  it('never shows a figure the variants disagree on', () => {
    const rows = penaltyRows({ ...lufthansa, change: { ...lufthansa.change, before: cell(true, null, true) } });
    expect(rows[0].change).toEqual({ tone: 'allowed', text: 'Allowed, fee applies', amount: null });
  });

  it('does not call an allowed situation with no amount free', () => {
    const rows = penaltyRows({ ...lufthansa, change: { ...lufthansa.change, before: cell(true) } });
    expect(rows[0].change.text).toBe('Allowed, fee applies');
  });

  it('says it does not know when the airline filed nothing', () => {
    const rows = penaltyRows({ ...lufthansa, refund: { ...lufthansa.refund, before: cell(null) } });
    expect(rows[0].cancel).toEqual({ tone: 'unknown', text: 'See fare rules', amount: null });
  });

  it('is null without a table', () => {
    expect(penaltyRows(null)).toBeNull();
  });
});
