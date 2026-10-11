import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../backend/middleware/errorHandler.js';

/**
 * The cancellation and change fees read from filed rules arranged as the
 * airline headed them (CANCELLATIONS, CHANGES). Each fee is tied to the heading
 * before it, so the heading has to be read with the text.
 */

const filed = (descriptions) => ({
  success: true,
  data: { type: 'flight-offers-pricing', flightOffers: [] },
  included: { bags: {}, 'detailed-fare-rules': { 1: { fareNotes: { descriptions } } } },
});

const offer = { id: '1', price: { total: '400.00', grandTotal: '400.00', currency: 'USD' }, _ama: { segments: [{}] } };

const app = async (priced) => {
  vi.doMock('../../backend/services/flightProvider.js', () => ({
    default: { getFiledFareRules: vi.fn(async () => priced), priceFlightOffer: vi.fn() },
    providerStatus: () => ({ enabled: true, bookingEnabled: false }),
  }));
  const routes = (await import('../../backend/routes/flight.routes.js')).default;
  const server = express();
  server.use(express.json());
  server.use('/api/flights', routes);
  server.use(errorHandler);
  return server;
};

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.doUnmock('../../backend/services/flightProvider.js');
});

describe('fees in headed rule blocks', () => {
  it('belong to the heading they are filed under', async () => {
    const server = await app(filed([
      { descriptionType: 'CANCELLATIONS', text: 'BEFORE DEPARTURE\nCHARGE USD 200.00 FOR CANCEL/REFUND.' },
      { descriptionType: 'CHANGES', text: 'ANY TIME\nCHARGE USD 70.00 FOR REISSUE.' },
    ]));

    const res = await request(server).post('/api/flights/fare-rules').send({ flightOffer: offer });

    expect(res.status).toBe(200);
    expect(res.body.cancellation).toMatchObject({ cancelFee: 200, changeFee: 70, currency: 'USD' });
    expect(res.body.fareRules.map((r) => r.title)).toEqual(['CANCELLATIONS', 'CHANGES']);
  });
});

describe('the airline fee table', () => {
  const penalties = {
    currency: 'USD',
    bookBy: '2026-11-04',
    change: { before: { allowed: true, amount: 338, varies: false } },
    refund: { before: { allowed: false, amount: null, varies: false } },
  };
  const withPenalties = (table) => ({ ...filed([{ descriptionType: 'CANCELLATIONS', text: 'ANY TIME\nTICKET IS NON-REFUNDABLE.' }]), penalties: table });

  it('comes with the price check', async () => {
    const server = await app(withPenalties(penalties));
    const res = await request(server).post('/api/flights/price').send({ flightOffer: offer, withFareRules: true });
    expect(res.status).toBe(200);
    expect(res.body.fareRules.penalties).toEqual(penalties);
  });

  it('comes with the fare rules', async () => {
    const server = await app(withPenalties(penalties));
    const res = await request(server).post('/api/flights/fare-rules').send({ flightOffer: offer });
    expect(res.body.penalties).toEqual(penalties);
  });

  // MiniRules files 0.00 as filler; the filed rule text naming a charge is the
  // stronger word, so the table gives no figure rather than "No airline fee".
  it('never calls a fee nothing when the filed rules name a charge', async () => {
    const free = { allowed: true, amount: 0, varies: false };
    const server = await app({
      ...filed([
        { descriptionType: 'CANCELLATIONS', text: 'BEFORE DEPARTURE\nCHARGE USD 200.00 FOR CANCEL/REFUND.' },
        { descriptionType: 'CHANGES', text: 'ANY TIME\nCHARGE USD 70.00 FOR REISSUE.' },
      ]),
      penalties: { currency: 'USD', bookBy: null, change: { before: free, after: free }, refund: { before: free, noShowBefore: free } },
    });
    const res = await request(server).post('/api/flights/fare-rules').send({ flightOffer: offer });
    const unknownFee = { allowed: true, amount: null, varies: false };
    expect(res.body.penalties.refund).toEqual({ before: unknownFee, noShowBefore: unknownFee });
    expect(res.body.penalties.change).toEqual({ before: unknownFee, after: unknownFee });
  });

  it('keeps a fee of nothing the filed rules do not contradict', async () => {
    const free = { allowed: true, amount: 0, varies: false };
    const table = { currency: 'USD', bookBy: null, change: { before: free }, refund: { before: free } };
    const server = await app({ ...filed([{ descriptionType: 'CANCELLATIONS', text: 'ANY TIME\nFREE OF CHARGE.' }]), penalties: table });
    const res = await request(server).post('/api/flights/fare-rules').send({ flightOffer: offer });
    expect(res.body.penalties).toEqual(table);
  });

  it('is null when MiniRules gave none', async () => {
    const server = await app(withPenalties(null));
    const res = await request(server).post('/api/flights/price').send({ flightOffer: offer, withFareRules: true });
    expect(res.body.fareRules.penalties).toBeNull();
  });
});
