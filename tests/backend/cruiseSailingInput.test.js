import { describe, expect, it } from 'vitest';
import { makeSlug, sailingInput, stampPrice, todayInOffice } from '../../backend/services/cruiseCatalog/sailingInput.js';

const today = '2026-10-21';
const photo = (name = 'a.jpg') => `${process.env.SUPABASE_URL}/storage/v1/object/public/cruise-photos/sailings/${name}`;

const days = (numbers, ports = {}) => numbers.map((day, i) => ({
  day,
  portId: day in ports ? ports[day] : (i === 1 ? null : `port-${i}`),
  arrive: null,
  depart: null,
}));

const valid = (overrides = {}) => ({
  title: 'Western Caribbean',
  headline: 'Leave Miami at four.',
  region: 'caribbean',
  lineId: '11111111-1111-1111-1111-111111111111',
  shipId: null,
  nights: 3,
  inclusions: '',
  status: 'draft',
  days: days([1, 2, 3, 4]),
  dates: ['2026-11-01'],
  fromPriceUsd: 849,
  recheckedToday: false,
  photos: [{ url: photo(), credit: 'Royal Caribbean' }],
  ...overrides,
});

const errorFor = (overrides, options = { today }) => sailingInput(valid(overrides), options).error;

describe('a sailing staff save', () => {
  it('passes a valid draft through in database names', () => {
    const result = sailingInput(valid(), { today });
    expect(result.ok).toBe(true);
    expect(result.sailing).toMatchObject({ title: 'Western Caribbean', region: 'caribbean', line_id: '11111111-1111-1111-1111-111111111111', nights: 3, status: 'draft' });
    expect(result.days[1]).toEqual({ day: 2, port_id: null, arrive_time: null, depart_time: null });
    expect(result.dates).toEqual(['2026-11-01']);
    expect(result.price).toBe(849);
  });

  it('needs a title of 3 to 120 characters', () => {
    expect(errorFor({ title: 'ab' })).toBe('The title must be 3 to 120 characters.');
    expect(errorFor({ title: 'x'.repeat(121) })).toBe('The title must be 3 to 120 characters.');
  });

  it('needs a region from the list', () => expect(errorFor({ region: 'atlantis' })).toBe('Pick a region from the list.'));

  it('needs a cruise line', () => expect(errorFor({ lineId: '' })).toBe('Pick the cruise line.'));

  it('needs whole nights from 1 to 60', () => {
    for (const nights of [0, 61, 2.5, 'seven']) expect(errorFor({ nights }), String(nights)).toBe('Nights must be a whole number from 1 to 60.');
  });

  it('refuses days that skip or repeat', () => {
    expect(errorFor({ days: days([1, 2, 2, 4]) })).toBe('The itinerary must list every day from 1 to 4, once each.');
    expect(errorFor({ days: days([1, 2, 3]) })).toBe('The itinerary must list every day from 1 to 4, once each.');
  });

  it('starts and ends in port', () => {
    expect(errorFor({ days: days([1, 2, 3, 4], { 1: null }) })).toBe('The first and last day must be a port, not a day at sea.');
    expect(errorFor({ days: days([1, 2, 3, 4], { 4: null }) })).toBe('The first and last day must be a port, not a day at sea.');
  });

  it('reads times as 24-hour clock', () => {
    const withTime = days([1, 2, 3, 4]);
    withTime[0].depart = '4pm';
    expect(errorFor({ days: withTime })).toBe('Times must look like 16:00.');
    withTime[0].depart = '16:00';
    expect(sailingInput(valid({ days: withTime }), { today }).days[0].depart_time).toBe('16:00');
  });

  it('needs a positive dollar price, or none', () => {
    for (const fromPriceUsd of [-5, 0, 849.555, 'a lot']) {
      expect(errorFor({ fromPriceUsd }), String(fromPriceUsd)).toBe('The price must be a positive amount in dollars, like 849 or 849.50.');
    }
    expect(sailingInput(valid({ fromPriceUsd: null }), { today }).price).toBeNull();
    expect(sailingInput(valid({ fromPriceUsd: 849.5 }), { today }).price).toBe(849.5);
  });

  it('needs every photo uploaded here, with a credit', () => {
    const message = 'Each photo needs a credit, and must be uploaded here.';
    expect(errorFor({ photos: [{ url: photo(), credit: '' }] })).toBe(message);
    expect(errorFor({ photos: [{ url: 'https://www.royalcaribbean.com/ship.jpg', credit: 'RC' }] })).toBe(message);
    expect(errorFor({ photos: Array.from({ length: 13 }, (_, i) => ({ url: photo(`${i}.jpg`), credit: 'RC' })) })).toBe(message);
  });

  it('needs real sailing dates, each once', () => {
    const message = 'Sailing dates must be real dates, each listed once (52 at most).';
    expect(errorFor({ dates: ['2026-02-30'] })).toBe(message);
    expect(errorFor({ dates: ['2026-11-01', '2026-11-01'] })).toBe(message);
    expect(errorFor({ dates: Array.from({ length: 53 }, (_, i) => `2027-${String(1 + Math.floor(i / 28)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`) })).toBe(message);
  });

  it('publishing needs a date from today on', () => {
    expect(errorFor({ status: 'published', dates: ['2026-10-20'] })).toBe('To publish, add at least one sailing date from today on.');
    expect(sailingInput(valid({ status: 'draft', dates: ['2026-10-20'] }), { today }).ok).toBe(true);
    expect(sailingInput(valid({ status: 'published', dates: ['2026-10-21'] }), { today }).ok).toBe(true);
  });

  it('publishing needs two different ports', () => {
    const oneport = days([1, 2, 3, 4], { 1: 'port-a', 2: null, 3: null, 4: 'port-a' });
    expect(errorFor({ status: 'published', days: oneport })).toBe('To publish, the itinerary needs at least two ports.');
  });

  it('refuses a status it does not know', () => {
    expect(sailingInput(valid({ status: 'live' }), { today }).ok).toBe(false);
  });
});

describe('stampPrice', () => {
  it('keeps the old date when the price is unchanged', () => {
    expect(stampPrice({ previousPrice: 849, previousCheckedOn: '2026-09-01', price: 849, recheckedToday: false, today }))
      .toEqual({ from_price_usd: 849, price_checked_on: '2026-09-01' });
  });

  it('restamps when re-checked or changed', () => {
    expect(stampPrice({ previousPrice: 849, previousCheckedOn: '2026-09-01', price: 849, recheckedToday: true, today }).price_checked_on).toBe(today);
    expect(stampPrice({ previousPrice: 849, previousCheckedOn: '2026-09-01', price: 899, recheckedToday: false, today }).price_checked_on).toBe(today);
    expect(stampPrice({ previousPrice: null, previousCheckedOn: null, price: 899, recheckedToday: false, today }).price_checked_on).toBe(today);
  });

  it('clears both when the price is removed', () => {
    expect(stampPrice({ previousPrice: 849, previousCheckedOn: '2026-09-01', price: null, recheckedToday: true, today }))
      .toEqual({ from_price_usd: null, price_checked_on: null });
  });

  it('treats "849.00" from the database as the same price as 849', () => {
    expect(stampPrice({ previousPrice: '849.00', previousCheckedOn: '2026-09-01', price: 849, recheckedToday: false, today }).price_checked_on).toBe('2026-09-01');
  });
});

describe('slugs and the office date', () => {
  it('slugs the title', () => expect(makeSlug('Western Caribbean!', 7, 'a1b2')).toBe('western-caribbean-7-nights-a1b2'));
  it('dates in the office time zone', () => expect(todayInOffice(new Date('2026-10-22T05:00:00Z'))).toBe('2026-10-21'));
});
