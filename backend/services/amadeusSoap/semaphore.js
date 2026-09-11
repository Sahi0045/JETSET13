/**
 * Counting semaphore bounding concurrent Amadeus conversations.
 *
 * A WSAP has a fixed ceiling on simultaneous sessions and sockets; exceeding it
 * produces intermittent failures under load that look like unrelated bugs.
 *
 * For a stateful sequence the permit is taken by `withSession` and held until
 * after sign-out, because the SESSION is what Amadeus counts - not the calls.
 * Bounding calls instead lets any number of chains sit holding open sessions
 * between their steps, which is the overrun this is here to prevent. Calls made
 * inside a session therefore pass `bypassSemaphore`.
 *
 * A stateless call takes its own permit in `postEnvelope`: there, one call is
 * one conversation.
 *
 * Waiting is bounded: an unbounded queue converts a slow Amadeus into a pile of
 * timed-out requests holding sockets. Past the bound the caller gets a 503 and
 * a Retry-After, which is the honest answer.
 *
 * Bookings go first. By the time a booking reaches Amadeus the customer has
 * already paid, and losing its slot race to searches means a refund - while a
 * shed search costs nothing but a retry. So calls made inside
 * `withBookingPriority` jump the queue, and `reserved` permits are kept back
 * that only bookings may take, so a flood of searches can never occupy every
 * slot. Searches still get `limit - reserved` permits and at least one.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

const bookingLane = new AsyncLocalStorage();

/**
 * Run `fn` with every Amadeus call inside it - stateless or a whole session -
 * in the booking lane. Carried by async context rather than a parameter so it
 * reaches the permit taken deep inside transport and withSession unchanged.
 */
export const withBookingPriority = (fn) => bookingLane.run(true, fn);

/** No permit came free in time. Nothing was sent to Amadeus. */
export class SlotTimeoutError extends Error {
  constructor(priority) {
    super('Timed out waiting for an Amadeus slot');
    this.name = 'SlotTimeoutError';
    this.code = 503;
    this.retryAfter = 2;
    // Read by the order route: a booking that never got a slot sold nothing,
    // so it can be queued and retried instead of refunded.
    this.slotTimeout = true;
    this.priority = priority;
  }
}

export class Semaphore {
  constructor(limit, queueTimeoutMs = 8000, { reserved = 0, priorityTimeoutMs = queueTimeoutMs } = {}) {
    this.limit = Math.max(1, limit);
    this.queueTimeoutMs = queueTimeoutMs;
    this.priorityTimeoutMs = priorityTimeoutMs;
    // Never reserve every permit: searches must always be able to run.
    this.reserved = Math.min(Math.max(0, reserved), this.limit - 1);
    this.active = 0;
    this.waiters = [];
    this.priorityWaiters = [];
  }

  /** How many permits a non-booking call may hold between them. */
  get normalCap() {
    return this.limit - this.reserved;
  }

  acquire({ priority = bookingLane.getStore() === true } = {}) {
    if (this.active < (priority ? this.limit : this.normalCap)) {
      this.active += 1;
      return Promise.resolve();
    }

    const queue = priority ? this.priorityWaiters : this.waiters;
    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject };
      waiter.timer = setTimeout(() => {
        const i = queue.indexOf(waiter);
        if (i !== -1) queue.splice(i, 1);
        reject(new SlotTimeoutError(priority));
      }, priority ? this.priorityTimeoutMs : this.queueTimeoutMs);
      queue.push(waiter);
    });
  }

  release() {
    // A freed permit passes straight to the next holder, so `active` is
    // unchanged. Bookings are served first.
    const next = this.priorityWaiters.shift();
    if (next) {
      clearTimeout(next.timer);
      next.resolve();
      return;
    }
    // A search inherits the permit only while searches are within their cap;
    // otherwise the permit is left free for the next booking.
    if (this.waiters.length > 0 && this.active <= this.normalCap) {
      const waiter = this.waiters.shift();
      clearTimeout(waiter.timer);
      waiter.resolve();
      return;
    }
    this.active = Math.max(0, this.active - 1);
  }

  /** Run `fn` holding one permit; always released, including on throw. */
  async run(fn) {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  get stats() {
    return {
      active: this.active,
      waiting: this.waiters.length,
      waitingBookings: this.priorityWaiters.length,
      limit: this.limit,
      reserved: this.reserved,
    };
  }
}

/**
 * The process-wide semaphore, built on first use.
 *
 * A singleton because the ceiling belongs to the WSAP, not to any one request -
 * a per-request semaphore would bound nothing.
 */
let instance = null;
export const getSemaphore = (config) => {
  if (!instance) {
    instance = new Semaphore(config.maxConcurrency, config.queueTimeoutMs, {
      reserved: config.bookingReservedSlots,
      priorityTimeoutMs: config.bookingQueueTimeoutMs,
    });
  }
  return instance;
};

/** Tests only: drop the singleton so a fresh limit takes effect. */
export const _resetSemaphore = () => { instance = null; };
