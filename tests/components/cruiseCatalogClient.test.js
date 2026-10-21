import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CRUISE_PHONE, dayMonth, fetchRegions, fetchSailing, fetchSailings, inquiryMail, officeToday, priceLabel, shortDate,
} from '../../frontend/src/Pages/Common/cruise/catalog.js';

const answer = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

afterEach(() => { vi.unstubAllGlobals(); });

describe('the price customers see', () => {
  it('shows the price with the day it was checked', () => {
    expect(priceLabel({ from_price_usd: 1299, price_checked_on: '2026-10-20' }, '2026-10-21'))
      .toEqual({ kind: 'price', amount: 'From $1,299', note: 'per person, port fees included · price checked 20 Oct' });
  });

  it('keeps cents only when there are some', () => {
    expect(priceLabel({ from_price_usd: 849.5, price_checked_on: '2026-10-20' }, '2026-10-21').amount).toBe('From $849.50');
  });

  it("asks for today's price when the price is over 30 days old", () => {
    expect(priceLabel({ from_price_usd: 1299, price_checked_on: '2026-09-20' }, '2026-10-21').kind).toBe('ask');
    expect(priceLabel({ from_price_usd: 1299, price_checked_on: '2026-09-21' }, '2026-10-21').kind).toBe('price');
  });

  it("asks for today's price when there is none", () => {
    expect(priceLabel({ from_price_usd: null, price_checked_on: null }, '2026-10-21'))
      .toEqual({ kind: 'ask', amount: "Ask for today's price", note: 'Our team checks it with the cruise line' });
    expect(priceLabel({ from_price_usd: 0, price_checked_on: '2026-10-20' }, '2026-10-21').kind).toBe('ask');
  });
});

describe('reading the catalog', () => {
  it('returns null for a cruise that is not there', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => answer({ success: false, error: 'Cruise not found' }, 404)));
    expect(await fetchSailing('nope')).toBeNull();
  });

  it('reads sailings, a region and the regions', async () => {
    const fetchStub = vi.fn(async (url) => answer({ success: true, data: [{ url }] }));
    vi.stubGlobal('fetch', fetchStub);
    await fetchSailings('alaska');
    expect(fetchStub.mock.calls[0][0]).toMatch(/cruise-catalog\/sailings\?region=alaska$/);
    await fetchRegions();
    expect(fetchStub.mock.calls[1][0]).toMatch(/cruise-catalog\/regions$/);
    await fetchSailing('western caribbean');
    expect(fetchStub.mock.calls[2][0]).toMatch(/cruise-catalog\/sailings\/western%20caribbean$/);
  });

  it('throws when the catalog cannot be read, so the page can say so', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => answer({ success: false }, 500)));
    await expect(fetchSailings()).rejects.toThrow();
  });
});

describe('words and links', () => {
  it('writes dates the way people read them', () => {
    expect(shortDate('2026-12-05')).toBe('5 Dec 2026');
    expect(dayMonth('2026-10-20')).toBe('20 Oct');
  });

  it('asks about the sailing by email with its title', () => {
    expect(inquiryMail('Western Caribbean')).toBe('mailto:support@jetsetterss.com?subject=Cruise%20inquiry%3A%20Western%20Caribbean');
    expect(CRUISE_PHONE).toEqual({ href: 'tel:+18775387380', text: '(877) 538-7380' });
  });

  it('dates in the office time zone', () => expect(officeToday(new Date('2026-10-22T05:00:00Z'))).toBe('2026-10-21'));
});
