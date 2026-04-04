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
    _headers:   {},

    status(code) {
      this.statusCode = code;
      return this;
    },

    json(data) {
      this.body = data;
      return this;
    },

    send(data) {
      this.body = data;
      return this;
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
  };

  return res;
}
