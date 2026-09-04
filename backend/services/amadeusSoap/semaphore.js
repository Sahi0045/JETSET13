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
 */
export class Semaphore {
  constructor(limit, queueTimeoutMs = 8000) {
    this.limit = Math.max(1, limit);
    this.queueTimeoutMs = queueTimeoutMs;
    this.active = 0;
    this.waiters = [];
  }

  acquire() {
    if (this.active < this.limit) {
      this.active += 1;
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject };
      waiter.timer = setTimeout(() => {
        const i = this.waiters.indexOf(waiter);
        if (i !== -1) this.waiters.splice(i, 1);
        const err = new Error('Timed out waiting for an Amadeus slot');
        err.code = 503;
        err.retryAfter = 2;
        reject(err);
      }, this.queueTimeoutMs);
      this.waiters.push(waiter);
    });
  }

  release() {
    const waiter = this.waiters.shift();
    if (waiter) {
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
    return { active: this.active, waiting: this.waiters.length, limit: this.limit };
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
  if (!instance) instance = new Semaphore(config.maxConcurrency, config.queueTimeoutMs);
  return instance;
};

/** Tests only: drop the singleton so a fresh limit takes effect. */
export const _resetSemaphore = () => { instance = null; };
