import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A callback request or a contact message reaches JetCRM, where it opens a
 * lead for staff. Until 14 Nov 2026 these were saved in the site's own tables
 * only, so the CRM's Work list stayed empty.
 */

const insert = vi.fn();
vi.mock('../../frontend/src/lib/supabase', () => ({
  default: { supabaseUrl: 'https://db.example', supabaseKey: 'anon', from: () => ({ insert }) },
}));

const load = async (path) => {
  vi.resetModules();
  vi.stubEnv('VITE_CRM_ENDPOINT', 'https://crm.example');
  vi.stubEnv('VITE_CRM_WEB_KEY', 'web-key');
  return (await import(path)).default;
};

const sentToCrm = (fetch) => fetch.mock.calls
  .filter(([url]) => String(url) === 'https://crm.example/collect')
  .flatMap(([, init]) => JSON.parse(init.body).batch);

let fetch;
let saved;
beforeEach(() => {
  localStorage.clear();
  saved = true;
  fetch = vi.fn((url) => Promise.resolve(String(url).startsWith('https://db.example')
    ? { ok: saved, status: saved ? 201 : 500, text: () => Promise.resolve('') }
    : { ok: true, json: () => Promise.resolve({}), text: () => Promise.resolve('') }));
  vi.stubGlobal('fetch', fetch);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); insert.mockReset(); });

describe('a callback request', () => {
  const request = { name: 'Asha Verma', email: 'asha@example.com', phone: '+1 209 555 0100', preferredTime: '', message: 'Alaska in June' };

  it('tells the CRM who asked, so staff get a lead', async () => {
    const callbackService = await load('../../frontend/src/Services/callbackService.js');
    await callbackService.createCallbackRequest(request);

    await waitFor(() => expect(sentToCrm(fetch)).toHaveLength(2), { timeout: 4000 });
    const [identify, lead] = sentToCrm(fetch);
    expect(identify).toMatchObject({ type: 'identify', traits: { email: 'asha@example.com', name: 'Asha Verma', phone: '+1 209 555 0100' } });
    expect(lead).toMatchObject({ type: 'track', event: 'Callback Requested', properties: { product: 'cruise', message: 'Alaska in June' } });
  });

  it('tells the CRM nothing when the request was not saved', async () => {
    saved = false;
    const callbackService = await load('../../frontend/src/Services/callbackService.js');
    await expect(callbackService.createCallbackRequest(request)).rejects.toThrow();

    await new Promise((resolve) => { setTimeout(resolve, 1800); });
    expect(sentToCrm(fetch)).toEqual([]);
  });
});

describe('a message from the contact form', () => {
  it('reaches the CRM with the sender and what they wrote', async () => {
    insert.mockResolvedValue({ error: null });
    const ContactPopup = await load('../../frontend/src/Pages/Common/ContactPopup.jsx');
    const { container } = render(<ContactPopup onClose={() => {}} />);
    const [name, email] = container.querySelectorAll('input');
    fireEvent.change(name, { target: { value: 'Ben Ortiz' } });
    fireEvent.change(email, { target: { value: 'ben@example.com' } });
    fireEvent.change(container.querySelector('textarea'), { target: { value: 'Do you sell group fares?' } });
    fireEvent.submit(container.querySelector('form'));

    await waitFor(() => expect(sentToCrm(fetch)).toHaveLength(2), { timeout: 4000 });
    const [identify, contacted] = sentToCrm(fetch);
    expect(identify).toMatchObject({ type: 'identify', traits: { email: 'ben@example.com', name: 'Ben Ortiz' } });
    expect(contacted).toMatchObject({ event: 'Support Contacted', properties: { message: 'Do you sell group fares?' } });
  });
});
