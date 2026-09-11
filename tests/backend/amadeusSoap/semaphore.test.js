import { describe, expect, it } from 'vitest';
import { Semaphore, SlotTimeoutError, withBookingPriority } from '../../../backend/services/amadeusSoap/semaphore.js';

/**
 * By the time a booking asks for an Amadeus slot the customer has paid, and a
 * booking that loses the race for a slot is refunded. A search that loses it
 * costs a retry. So bookings go first, and some slots are theirs alone.
 */

const settled = async (promise) => {
  let state = 'pending';
  promise.then(() => { state = 'resolved'; }, () => { state = 'rejected'; });
  await new Promise((r) => setTimeout(r, 0));
  return state;
};

describe('without reserved slots', () => {
  it('behaves as a plain counting semaphore', async () => {
    const sem = new Semaphore(2, 1000);
    await sem.acquire();
    await sem.acquire();
    const third = sem.acquire();
    expect(await settled(third)).toBe('pending');

    sem.release();
    expect(await settled(third)).toBe('resolved');
    expect(sem.stats.active).toBe(2);
  });

  it('times out a waiter with a 503 the route recognises', async () => {
    const sem = new Semaphore(1, 20);
    await sem.acquire();

    const err = await sem.acquire().catch((e) => e);
    expect(err).toBeInstanceOf(SlotTimeoutError);
    expect(err).toMatchObject({ code: 503, retryAfter: 2, slotTimeout: true, priority: false });
    expect(err.message).toBe('Timed out waiting for an Amadeus slot');
  });
});

describe('the booking lane', () => {
  it('keeps reserved slots out of reach of searches', async () => {
    const sem = new Semaphore(3, 1000, { reserved: 1 });
    await sem.acquire();
    await sem.acquire();

    const search = sem.acquire();
    expect(await settled(search)).toBe('pending');

    // ...but a booking can still take the reserved one.
    const booking = sem.acquire({ priority: true });
    expect(await settled(booking)).toBe('resolved');
    expect(sem.stats.active).toBe(3);
    // The search only gets in once holders are back under its cap of 2.
    sem.release();
    expect(await settled(search)).toBe('pending');
    sem.release();
    expect(await settled(search)).toBe('resolved');
  });

  it('serves a waiting booking before searches that queued earlier', async () => {
    const sem = new Semaphore(1, 1000);
    await sem.acquire();

    const search = sem.acquire();
    const booking = sem.acquire({ priority: true });

    sem.release();
    expect(await settled(booking)).toBe('resolved');
    expect(await settled(search)).toBe('pending');

    sem.release();
    expect(await settled(search)).toBe('resolved');
  });

  it('does not hand a freed reserved slot to a search', async () => {
    const sem = new Semaphore(3, 1000, { reserved: 1 });
    await sem.acquire();
    await sem.acquire();
    await sem.acquire({ priority: true });
    const search = sem.acquire();

    // 3 held, searches capped at 2: freeing one leaves 2 held, which is the cap,
    // so the search must still wait.
    sem.release();
    expect(await settled(search)).toBe('pending');
    expect(sem.stats.active).toBe(2);

    sem.release();
    expect(await settled(search)).toBe('resolved');
  });

  it('never reserves every slot', () => {
    const sem = new Semaphore(2, 1000, { reserved: 5 });
    expect(sem.stats.reserved).toBe(1);
    expect(sem.normalCap).toBe(1);
  });

  it('gives bookings their own, longer wait', async () => {
    const sem = new Semaphore(1, 10, { priorityTimeoutMs: 60 });
    await sem.acquire();

    const started = Date.now();
    const err = await sem.acquire({ priority: true }).catch((e) => e);
    expect(err).toMatchObject({ slotTimeout: true, priority: true });
    expect(Date.now() - started).toBeGreaterThanOrEqual(50);
  });

  // The lane is carried by async context, so it reaches the permit taken deep
  // inside transport and withSession without any signature changing.
  it('puts every call inside withBookingPriority in the lane', async () => {
    const sem = new Semaphore(2, 1000, { reserved: 1 });
    await sem.acquire();

    const search = sem.acquire();
    expect(await settled(search)).toBe('pending');
    const inLane = withBookingPriority(async () => {
      await Promise.resolve();
      return sem.acquire();
    });
    expect(await settled(inLane)).toBe('resolved');

    sem.release();
    sem.release();
    expect(await settled(search)).toBe('resolved');
  });
});
