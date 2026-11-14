import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { carriers } = require('../../backend/data/airports/airlines.min.json');

describe('the airline names search results show', () => {
  it.each([
    ['H1', 'Hahn Air Systems'],
    ['HR', 'Hahn Air'],
    ['GP', 'APG Airlines'],
    ['QP', 'Akasa Air'],
    ['SG', 'SpiceJet'],
    ['AI', 'Air India'],
    ['6E', 'IndiGo'],
    ['9I', 'Alliance Air'],
    ['S5', 'Star Air'],
    ['OV', 'SalamAir'],
    ['XY', 'flynas'],
    ['TR', 'Scoot'],
    ['OD', 'Batik Air Malaysia'],
    ['VJ', 'VietJet Air'],
    ['9G', 'Sun PhuQuoc Airways'],
    ['QH', 'Bamboo Airways'],
    ['VU', 'Vietravel Airlines'],
    ['W2', 'FlexFlight'],
    ['A1', 'APG Distribution System'],
    ['W1', 'WorldTicket'],
  ])('names %s %s', (code, name) => {
    expect(carriers[code]).toBe(name);
  });
});
