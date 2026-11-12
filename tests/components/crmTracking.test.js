import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Reporting to JetCRM from the website: off unless configured, batched in the
 * background, and never able to break a page.
 */
const load = async (env) => {
  vi.resetModules();
  vi.stubEnv('VITE_CRM_ENDPOINT', env.endpoint ?? '');
  vi.stubEnv('VITE_CRM_WEB_KEY', env.key ?? '');
  return import('../../frontend/src/lib/crm.js');
};

beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('website reporting to the CRM', () => {
  it('sends nothing when the CRM is not configured', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const crm = await load({});
    crm.crmTrack('Flight Searched', { route: 'DEL-BOM' });
    crm.crmIdentify('u1', { email: 'a@example.com' });
    vi.advanceTimersByTime(5000);
    expect(crm.crmEnabled()).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sends one batch, with the same visitor id on every event and the customer once known', async () => {
    const fetch = vi.fn(() => Promise.resolve({ ok: true }));
    vi.stubGlobal('fetch', fetch);
    const crm = await load({ endpoint: 'https://crm.example/', key: 'web-key' });
    crm.crmPage('/flights');
    crm.crmTrack('Flight Searched', { route: 'DEL-BOM' });
    crm.crmIdentify('u1', { email: 'a@example.com', name: '' });
    crm.crmTrack('Review Opened', { totalUsd: 89.83 });
    vi.advanceTimersByTime(2000);

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://crm.example/collect');
    expect(init.headers['x-jetcrm-key']).toBe('web-key');
    const { batch } = JSON.parse(init.body);
    expect(batch.map((e) => e.event ?? e.type)).toEqual(['page', 'Flight Searched', 'identify', 'Review Opened']);
    expect(new Set(batch.map((e) => e.anonymousId)).size).toBe(1);
    expect(new Set(batch.map((e) => e.messageId)).size).toBe(4);
    expect(batch[1].userId).toBeUndefined();
    expect(batch[2]).toMatchObject({ userId: 'u1', traits: { email: 'a@example.com' } });
    expect(batch[3].userId).toBe('u1');
  });

  it('never throws into the page when sending fails', async () => {
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('offline'); }));
    const crm = await load({ endpoint: 'https://crm.example', key: 'web-key' });
    expect(() => { crm.crmTrack('Flight Searched', {}); vi.advanceTimersByTime(2000); }).not.toThrow();
  });
});
