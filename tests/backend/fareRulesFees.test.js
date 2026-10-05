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
