import { describe, expect, it, vi } from 'vitest';
import { crmEventsOf } from '../../backend/jobs/crmFeed.job.js';
import { crmConfig, sendCrmEvents } from '../../backend/services/crmClient.js';

/** What the booking backend tells JetCRM, read from the booking rows. */
const booked = (over = {}) => ({
  booking_reference: 'JS123', user_id: 'user-1', travel_type: 'flight', status: 'confirmed', payment_status: 'paid', total_amount: 89.83,
  created_at: '2026-11-12T10:00:00Z', updated_at: '2026-11-12T10:05:00Z',
  booking_details: { pnr: 'ABC123', customer_email: 'asha@example.com', paid_at: '2026-11-12T10:01:00Z', gds_chain: { state: 'finished', finishedAt: '2026-11-12T10:04:00Z' }, tickets: [{ number: '098-1' }] },
  ...over,
});

describe('a booking row as CRM events', () => {
  it('is a payment, a booking and a ticket once it is paid, booked and issued', () => {
    const events = crmEventsOf(booked());
    expect(events.map((e) => e.event)).toEqual(['Payment Succeeded', 'Booked', 'Ticketed']);
    expect(events[0]).toMatchObject({ userId: 'user-1', traits: { email: 'asha@example.com' }, timestamp: '2026-11-12T10:01:00Z', properties: { amountUsd: 89.83, bookingRef: 'JS123', pnr: 'ABC123' } });
  });

  it('has the same message ids every time, so a re-send counts once', () => {
    const ids = (row) => crmEventsOf(row).map((e) => e.messageId);
    expect(ids(booked())).toEqual(ids(booked()));
    expect(new Set(ids(booked())).size).toBe(3);
    expect(ids(booked())[1]).toBe('booking:JS123:booked');
  });

  it('is a cancellation and a refund when money went back', () => {
    const row = booked({ status: 'cancelled', booking_details: { customer_email: 'asha@example.com', cancellation: { cancelledAt: '2026-11-12T12:00:00Z', paymentAction: 'REFUND', refundAmount: 84.6 } } });
    const events = crmEventsOf(row);
    expect(events.map((e) => e.event)).toEqual(['Cancelled', 'Refunded']);
    expect(events[1].properties.amountUsd).toBe(84.6);
  });

  it('belongs to a guest by the email on the booking', () => {
    const [first] = crmEventsOf(booked({ user_id: null }));
    expect(first.userId).toBeUndefined();
    expect(first.traits.email).toBe('asha@example.com');
  });

  it('is nothing for an unpaid booking, or one with nobody to attach it to', () => {
    expect(crmEventsOf(booked({ payment_status: 'pending' }))).toEqual([]);
    expect(crmEventsOf(booked({ user_id: null, booking_details: { pnr: 'ABC123', gds_chain: { state: 'finished' } } }))).toEqual([]);
  });

  it('carries no card or traveller documents', () => {
    const row = booked();
    row.booking_details.travelers = [{ passportNumber: 'Z1234567', dateOfBirth: '1990-01-01' }];
    row.booking_details.card = { last4: '6411' };
    expect(JSON.stringify(crmEventsOf(row))).not.toMatch(/Z1234567|1990-01-01|6411/);
  });
});

describe('the CRM client', () => {
  it('is off without an endpoint and a server key', async () => {
    const fetchImpl = vi.fn();
    expect(crmConfig({})).toBeNull();
    expect(await sendCrmEvents([{ event: 'Booked' }], { env: {}, fetchImpl })).toEqual({ sent: 0, skipped: 'CRM not configured' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('posts a batch with the server key', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ accepted: 2 }) }));
    const result = await sendCrmEvents([{ event: 'Booked' }, { event: 'Ticketed' }], { env: { CRM_ENDPOINT: 'https://crm.example/', CRM_SERVER_KEY: 'srv' }, fetchImpl });
    expect(result).toEqual({ sent: 2 });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://crm.example/collect');
    expect(init.headers['x-jetcrm-key']).toBe('srv');
  });
});
