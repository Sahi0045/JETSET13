import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deviceOf, visitSource } from '../../frontend/src/lib/crm.js';

/**
 * Every event tells JetCRM where the visit came from and on what device, so
 * the CRM can show which sources bring people who search and book. Until
 * 14 Nov 2026 nothing was sent, and that report had nothing to count.
 */

describe('where a visit came from', () => {
  const from = (search, referrer = '') => visitSource({ search, referrer, host: 'www.jetsetterss.com' });

  it.each([
    ['?utm_source=newsletter&utm_medium=email&utm_campaign=nov-fares', 'https://mail.google.com/', { source: 'newsletter', medium: 'email', campaign: 'nov-fares' }],
    ['?gclid=abc123', '', { source: 'Google Ads' }],
    ['?fbclid=abc123', 'https://l.facebook.com/', { source: 'Facebook' }],
    ['', 'https://www.google.co.in/search?q=cheap+flights', { source: 'Google search' }],
    ['', 'https://www.bing.com/search?q=flights', { source: 'Bing search' }],
    ['', 'https://www.instagram.com/', { source: 'Instagram' }],
    ['', 'https://t.co/abc', { source: 'X (Twitter)' }],
    ['', 'https://blog.example.com/best-fares?ref=secret', { source: 'blog.example.com' }],
    ['', 'https://www.jetsetterss.com/flights', { source: 'Direct' }],
    ['', '', { source: 'Direct' }],
  ])('reads %s from %s', (search, referrer, expected) => {
    expect(from(search, referrer)).toEqual(expected);
  });

  it('names a device by the width of its screen', () => {
    expect([390, 820, 1440].map(deviceOf)).toEqual(['phone', 'tablet', 'desktop']);
  });
});

describe('events sent to the CRM', () => {
  let fetch;
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    sessionStorage.clear();
    vi.stubEnv('VITE_CRM_ENDPOINT', 'https://crm.example');
    vi.stubEnv('VITE_CRM_WEB_KEY', 'web-key');
    fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));
    vi.stubGlobal('fetch', fetch);
    vi.useFakeTimers();
  });
  const location = globalThis.location;
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); globalThis.location = location; });

  const sent = () => fetch.mock.calls.flatMap(([, init]) => JSON.parse(init.body).batch);

  it('carry the source and device of the visit, and keep its first source on later pages', async () => {
    globalThis.location = { hostname: 'www.jetsetterss.com', pathname: '/flights', search: '?utm_source=newsletter' };
    const first = await import('../../frontend/src/lib/crm.js');
    first.crmTrack('Flight Searched', { route: 'DEL-BOM' });
    vi.advanceTimersByTime(2000);

    globalThis.location = { hostname: 'www.jetsetterss.com', pathname: '/flights/search', search: '' };
    vi.resetModules();
    const later = await import('../../frontend/src/lib/crm.js');
    later.crmTrack('Review Opened');
    vi.advanceTimersByTime(2000);

    expect(sent().map((event) => event.context)).toEqual([
      { source: 'newsletter', device: 'desktop', landing: '/flights' },
      { source: 'newsletter', device: 'desktop', landing: '/flights' },
    ]);
  });
});
