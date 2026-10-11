import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { inquiryCreate, quoteCreate } = vi.hoisted(() => ({
  inquiryCreate: vi.fn(async (row) => ({ id: 'inq-1', ...row })),
  quoteCreate: vi.fn(async (row) => ({ id: 'q-1', created_at: '2026-10-10T00:00:00Z', ...row })),
}));

vi.mock('../../backend/middleware/auth.middleware.js', () => ({
  protect: (req, _res, next) => {
    req.user = { id: 'user-1', email: 'jane@example.com' };
    return next();
  },
  admin: (_req, _res, next) => next(),
}));
vi.mock('../../backend/models/inquiry.model.js', () => ({ default: { create: inquiryCreate } }));
vi.mock('../../backend/models/quote.model.js', () => ({
  default: { create: quoteCreate, generateQuoteNumber: () => 'Q-1' },
}));
vi.mock('../../backend/models/bookingInfo.model.js', () => ({ default: {} }));
vi.mock('../../backend/controllers/quote.controller.js', () => Object.fromEntries([
  'createQuote', 'getAllQuotes', 'getQuoteById', 'getQuotesByInquiry', 'updateQuote', 'sendQuote',
  'acceptQuote', 'deleteQuote', 'getExpiredQuotes', 'getExpiringSoonQuotes',
].map((name) => [name, (_req, res) => res.status(501).end()])));

/**
 * A quote a customer creates for themselves is paid at whatever total they
 * send. Flights are paid through checkout, which prices the fare with the
 * airline and charges that; a flight quote paid here was a payment for no
 * fare at an amount the payer chose.
 */
const app = async () => {
  const routes = (await import('../../backend/routes/quote.routes.js')).default;
  const server = express();
  server.use(express.json());
  server.use('/api/quotes', routes);
  return server;
};

beforeEach(() => {
  inquiryCreate.mockClear();
  quoteCreate.mockClear();
});

describe('a quote for direct booking', () => {
  it('is refused for a flight, which is paid through checkout', async () => {
    const res = await request(await app())
      .post('/api/quotes?action=create-for-booking')
      .send({ booking_type: 'flight', total_amount: 1 });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('FLIGHT_CHECKOUT_REQUIRED');
    expect(inquiryCreate).not.toHaveBeenCalled();
    expect(quoteCreate).not.toHaveBeenCalled();
  });

  it('is still created for a package', async () => {
    const res = await request(await app())
      .post('/api/quotes?action=create-for-booking')
      .send({ booking_type: 'package', total_amount: 499 });

    expect(res.status).toBe(201);
    expect(quoteCreate).toHaveBeenCalledOnce();
  });
});
