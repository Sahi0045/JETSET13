import { describe, expect, it } from 'vitest';
import {
  NIGHT_RANGES, criteriaFrom, lineCards, lineLogo, matchesSearch, monthName, regionCards, searchOptions, searchQuery,
} from '../../frontend/src/Pages/Common/cruise/searchSailings.js';

const TODAY = '2026-10-21';
const photo = (name) => ({ url: `https://cdn.example/${name}.jpg`, credit: 'Line' });

const SAILINGS = [
  {
    slug: 'western-caribbean', title: 'Western Caribbean', region: 'caribbean', nights: 7,
    from_price_usd: 849, price_checked_on: '2026-10-20', photo: photo('wc'),
    line_name: 'Royal Caribbean', ship_name: 'Wonder of the Seas',
    port_names: ['Miami', 'Roatán', 'Cozumel'], dates: ['2026-12-05', '2027-01-09'], next_date: '2026-12-05', date_count: 2,
  },
  {
    slug: 'eastern-caribbean', title: 'Eastern Caribbean', region: 'caribbean', nights: 4,
    from_price_usd: 499, price_checked_on: '2026-08-01', photo: null,
    line_name: 'Carnival Cruise Line', ship_name: null,
    port_names: ['Port Canaveral', 'Nassau'], dates: ['2026-11-14'], next_date: '2026-11-14', date_count: 1,
  },
  {
    slug: 'inside-passage', title: 'Inside Passage', region: 'alaska', nights: 10,
    from_price_usd: null, price_checked_on: null, photo: photo('ak'),
    line_name: 'Royal Caribbean', ship_name: 'Ovation of the Seas',
    port_names: ['Seattle', 'Juneau', 'Skagway'], dates: ['2027-05-02'], next_date: '2027-05-02', date_count: 1,
  },
];

describe('what the search can offer', () => {
  it('offers only the regions, lines, ports and months that have a sailing', () => {
    expect(searchOptions(SAILINGS)).toEqual({
      regions: [{ key: 'alaska', name: 'Alaska' }, { key: 'caribbean', name: 'Caribbean' }],
      lines: ['Carnival Cruise Line', 'Royal Caribbean'],
      ports: ['Miami', 'Port Canaveral', 'Seattle'],
      months: ['2026-11', '2026-12', '2027-01', '2027-05'],
    });
  });

  it('offers nothing when nothing is published', () => {
    expect(searchOptions([])).toEqual({ regions: [], lines: [], ports: [], months: [] });
  });

  it('names months the way people read them', () => {
    expect(monthName('2026-12')).toBe('Dec 2026');
  });
});

describe('matching a search', () => {
  const slugs = (criteria) => SAILINGS.filter((s) => matchesSearch(s, criteria)).map((s) => s.slug);

  it('matches everything when nothing is chosen', () => {
    expect(slugs({})).toEqual(['western-caribbean', 'eastern-caribbean', 'inside-passage']);
  });

  it('matches on region, line, departure port and length together', () => {
    expect(slugs({ region: 'caribbean' })).toEqual(['western-caribbean', 'eastern-caribbean']);
    expect(slugs({ region: 'caribbean', line: 'Royal Caribbean' })).toEqual(['western-caribbean']);
    expect(slugs({ port: 'Seattle' })).toEqual(['inside-passage']);
    expect(slugs({ length: '1-5' })).toEqual(['eastern-caribbean']);
    expect(slugs({ length: '10+' })).toEqual(['inside-passage']);
  });

  it('matches a month on any date the sailing leaves, not only the next one', () => {
    expect(slugs({ month: '2027-01' })).toEqual(['western-caribbean']);
  });

  it('covers every length a sailing can have', () => {
    for (const nights of [1, 5, 6, 9, 10, 60]) {
      expect(NIGHT_RANGES.filter((r) => nights >= r.min && nights <= r.max)).toHaveLength(1);
    }
  });
});

describe('the search in the address bar', () => {
  it('writes only what was chosen', () => {
    expect(searchQuery({ region: 'caribbean', line: '', month: '2026-12', length: undefined })).toBe('region=caribbean&month=2026-12');
  });

  it('reads it back, including the links older pages used', () => {
    expect(criteriaFrom(new URLSearchParams('region=alaska&line=Royal%20Caribbean&port=Seattle&month=2027-05&length=10%2B')))
      .toEqual({ region: 'alaska', line: 'Royal Caribbean', port: 'Seattle', month: '2027-05', length: '10+' });
    expect(criteriaFrom(new URLSearchParams('cruiseLine=Carnival%20Cruise%20Line&destination=Caribbean')))
      .toEqual({ region: 'caribbean', line: 'Carnival Cruise Line', port: '', month: '', length: '' });
  });

  it('drops a region or length nobody can match', () => {
    expect(criteriaFrom(new URLSearchParams('destination=Atlantis&length=99'))).toMatchObject({ region: '', length: '' });
  });
});

describe('the destination and cruise line cards', () => {
  it('makes one card per region with sailings, biggest first, with its lowest current price', () => {
    const cards = regionCards(SAILINGS, TODAY);
    expect(cards.map((c) => [c.key, c.name, c.count])).toEqual([['caribbean', 'Caribbean', 2], ['alaska', 'Alaska', 1]]);
    expect(cards[0].price.amount).toBe('From $849');
    expect(cards[0].photo.url).toBe('https://cdn.example/wc.jpg');
    expect(cards[1].price.kind).toBe('ask');
  });

  it('makes one card per cruise line with sailings, with a photo when one was uploaded', () => {
    const cards = lineCards(SAILINGS, TODAY);
    expect(cards.map((c) => [c.name, c.count])).toEqual([['Royal Caribbean', 2], ['Carnival Cruise Line', 1]]);
    expect(cards[0].photo.url).toBe('https://cdn.example/wc.jpg');
    expect(cards[1].photo).toBeNull();
  });

  it('shows a logo only for the lines we have one for', () => {
    expect(lineLogo('Royal Caribbean International')).toBe('/images/logos/royal_caribbean.webp');
    expect(lineLogo('Norwegian Cruise Line')).toBe('/images/logos/norwegian.webp');
    expect(lineLogo('Azamara')).toBeNull();
  });
});
