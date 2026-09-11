import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A coupon may not give away more than the agency can afford.
 *
 * The airline is paid the FULL fare through ARC whatever the customer paid, and
 * the agency earns the service fee (~2.5%). A percentage coupon is unbounded in
 * money terms - 20% of a $1,200 ticket is $240 - so `max_discount_amount` caps
 * what any one booking can take off.
 */

const makeApp = async () => {
  const routes = (await import('../../backend/routes/coupon.routes.js')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/coupons', routes);
  return app;
};

/** The coupon row POST /validate reads, plus whatever the test overrides. */
const useCoupon = async (overrides = {}) => {
  const supabase = (await import('../../backend/config/supabase.js')).default;
  const coupon = {
    id: 'c1',
    code: 'FLY20',
    description: '20% off flights',
    discount_type: 'percentage',
    discount_value: 20,
    min_order_value: 0,
    max_uses: null,
    current_uses: 0,
    valid_from: null,
    valid_until: null,
    is_active: true,
    applicable_to: 'all',
    max_discount_amount: null,
    ...overrides,
  };
  supabase.from.mockImplementation(() => {
    const chain = {};
    for (const m of ['select', 'insert', 'update', 'eq', 'is', 'or', 'order', 'limit']) chain[m] = vi.fn(() => chain);
    chain.maybeSingle = vi.fn().mockResolvedValue({ data: coupon, error: null });
    chain.single = chain.maybeSingle;
    return chain;
  });
};

const validate = async (app, orderTotal) => request(app)
  .post('/api/coupons/validate')
  .send({ code: 'FLY20', orderTotal });

beforeEach(() => {
  vi.resetModules();
});

describe('the per-booking discount cap', () => {
  it('caps a percentage coupon at the configured amount', async () => {
    await useCoupon({ max_discount_amount: 25 });
    const app = await makeApp();

    // 20% of a $1,200 international ticket would be $240.
    const res = await validate(app, 1200);

    expect(res.status).toBe(200);
    expect(res.body.discountAmount).toBe(25);
    expect(res.body.finalTotal).toBe(1175);
  });

  it('leaves a discount below the cap alone', async () => {
    await useCoupon({ max_discount_amount: 25 });
    const app = await makeApp();

    const res = await validate(app, 80); // 20% = $16, under the cap
    expect(res.body.discountAmount).toBe(16);
    expect(res.body.finalTotal).toBe(64);
  });

  // Existing coupons have no cap, and must keep working exactly as before.
  it('applies no cap when the coupon has none', async () => {
    await useCoupon({ max_discount_amount: null });
    const app = await makeApp();

    const res = await validate(app, 1200);
    expect(res.body.discountAmount).toBe(240);
  });

  it('caps a fixed-amount coupon too', async () => {
    await useCoupon({ discount_type: 'fixed', discount_value: 100, max_discount_amount: 40 });
    const app = await makeApp();

    const res = await validate(app, 500);
    expect(res.body.discountAmount).toBe(40);
  });

  // The cap must never turn into a discount larger than the booking itself.
  it('still never discounts more than the order total', async () => {
    await useCoupon({ discount_type: 'fixed', discount_value: 500, max_discount_amount: 400 });
    const app = await makeApp();

    const res = await validate(app, 120);
    expect(res.body.discountAmount).toBe(120);
    expect(res.body.finalTotal).toBe(0);
  });

  it('tells the caller what the cap was', async () => {
    await useCoupon({ max_discount_amount: 25 });
    const app = await makeApp();

    const res = await validate(app, 1200);
    expect(res.body.coupon.maxDiscountAmount).toBe(25);
  });
});
