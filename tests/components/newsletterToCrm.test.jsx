import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A newsletter sign-up reaches JetCRM. The CRM sends offers only to people it
 * has a "Newsletter Subscribed" event for; until 13 Nov 2026 the site saved a
 * sign-up in its own table and never told the CRM, so nobody could be emailed.
 */

const insert = vi.fn();
vi.mock('../../frontend/src/lib/supabase', () => ({ default: { from: () => ({ insert }) } }));

const open = async () => {
  vi.resetModules();
  vi.stubEnv('VITE_CRM_ENDPOINT', 'https://crm.example');
  vi.stubEnv('VITE_CRM_WEB_KEY', 'web-key');
  const { default: Footer } = await import('../../frontend/src/Pages/Common/Footer.jsx');
  render(<MemoryRouter><Footer /></MemoryRouter>);
};

const subscribe = (address) => {
  fireEvent.change(screen.getByPlaceholderText(/email/i), { target: { value: address } });
  fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }));
};

const sentToCrm = (fetch) => fetch.mock.calls
  .filter(([url]) => String(url) === 'https://crm.example/collect')
  .flatMap(([, init]) => JSON.parse(init.body).batch);

let fetch;
beforeEach(() => {
  localStorage.clear();
  fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));
  vi.stubGlobal('fetch', fetch);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); insert.mockReset(); });

describe('a newsletter sign-up in the footer', () => {
  it('tells the CRM who subscribed and where', async () => {
    insert.mockResolvedValue({ error: null });
    await open();
    subscribe('asha@example.com');

    await waitFor(() => expect(sentToCrm(fetch)).toHaveLength(2), { timeout: 4000 });
    const [identify, subscribed] = sentToCrm(fetch);
    expect(identify).toMatchObject({ type: 'identify', traits: { email: 'asha@example.com' } });
    expect(subscribed).toMatchObject({ type: 'track', event: 'Newsletter Subscribed', properties: { source: 'footer' } });
    expect(subscribed.anonymousId).toBe(identify.anonymousId);
  });

  it('tells the CRM about someone who had already subscribed before the CRM existed', async () => {
    insert.mockResolvedValue({ error: { code: '23505' } });
    await open();
    subscribe('asha@example.com');

    expect(await screen.findByText('This email is already subscribed.')).toBeTruthy();
    await waitFor(() => expect(sentToCrm(fetch).map((each) => each.event ?? each.type)).toEqual(['identify', 'Newsletter Subscribed']), { timeout: 4000 });
  });

  it('tells the CRM nothing when the sign-up was not saved', async () => {
    insert.mockResolvedValue({ error: { code: '500' } });
    await open();
    subscribe('asha@example.com');

    expect(await screen.findByText('Failed to subscribe. Please try again.')).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 1800));
    expect(sentToCrm(fetch)).toEqual([]);
  });
});
