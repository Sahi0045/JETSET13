import { describe, expect, it } from 'vitest';
import { priceStep, seatsLeftLabel } from '../../frontend/src/Pages/Common/flights/searchResults.js';

describe('priceStep', () => {
  // It moved in 500s whatever the fares: under $500 the slider had two positions.
  it('gives about fifty steps across the range, on a round number', () => {
    expect(priceStep(400)).toBe(10);
    expect(priceStep(1200)).toBe(25);
    expect(priceStep(5000)).toBe(100);
    expect(priceStep(50000)).toBe(1000);
    expect(priceStep(0)).toBe(1);
  });
});

describe('seatsLeftLabel', () => {
  // Amadeus reports at most 9, so 9 is "9 or more", not "9 seats left" in red.
  it('reads 9 as 9+, without urgency', () => {
    expect(seatsLeftLabel(9)).toEqual({ text: '9+ seats', urgent: false });
  });

  it('counts down fewer, urgently', () => {
    expect(seatsLeftLabel(3)).toEqual({ text: '3 seats left', urgent: true });
    expect(seatsLeftLabel(1)).toEqual({ text: '1 seat left', urgent: true });
  });

  it('says nothing when the fare does not say', () => {
    expect(seatsLeftLabel(null)).toBeNull();
    expect(seatsLeftLabel(0)).toBeNull();
  });
});
