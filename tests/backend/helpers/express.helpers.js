/**
 * tests/backend/helpers/express.helpers.js
 * Lightweight mock req/res factory — no extra npm install needed.
 * Drop-in replacement for supertest for pure controller unit tests.
 */

/**
 * Create a mock Express request object.
 * @param {object} overrides - Partial req fields: { body, params, query, user, headers }
 */
export function createRequest(overrides = {}) {
  return {
    body:    {},
    params:  {},
    query:   {},
    headers: {},
    user:    null,
    ip:      '127.0.0.1',
    ...overrides,
  };
}

/**
 * Create a mock Express response object with jest/vitest spy methods.
 * Tracks statusCode and body so tests can assert on them.
 */
export function createResponse() {
  const res = {
    statusCode: 200,
    body:       null,
    cookies:    {},
    _headers:   {},
    /**
     * Real Express sets this once a response is sent, and throws
     * ERR_HTTP_HEADERS_SENT on a second one. This double had no such property,
     * so `if (res.headersSent) return;` - which guards flight.routes.js and
     * middleware/errorHandler.js - read permanently false, and a handler that
     * answered twice was indistinguishable from one that answered once: the
     * test simply saw the last write. A money path that returns 200 and then
     * falls through to a 403 would ship green.
     */
    headersSent: false,

    status(code) {
      this.statusCode = code;
      return this;
    },

    json(data) {
      this._sent();
      this.body = data;
      return this;
    },

    send(data) {
      this._sent();
      this.body = data;
      return this;
    },

    /** Answered once already: say so the way Node says it. */
    _sent() {
      if (this.headersSent) {
        const error = new Error('Cannot set headers after they are sent to the client');
        error.code = 'ERR_HTTP_HEADERS_SENT';
        throw error;
      }
      this.headersSent = true;
    },

    setHeader(key, value) {
      this._headers[key.toLowerCase()] = value;
      return this;
    },

    getHeader(key) {
      return this._headers[key.toLowerCase()];
    },

    redirect(url) {
      this._redirectUrl = url;
      return this;
    },

    // Auth sets httpOnly session cookies (jt_access / jt_refresh / jt_csrf).
    // Without these the controller throws and the handler's catch turns a
    // successful login into a 500, which is not the behaviour under test.
    cookie(name, value, options = {}) {
      this.cookies[name] = { value, options };
      return this;
    },

    clearCookie(name, options = {}) {
      this.cookies[name] = { value: '', options, cleared: true };
      return this;
    },
  };

  return res;
}
