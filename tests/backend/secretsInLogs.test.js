import { inspect } from 'node:util';
import { describe, expect, it } from 'vitest';
import { errorSummary } from '../../backend/utils/errorSummary.js';
import { readCode } from '../helpers/source.js';

/**
 * What the logs may not hold.
 *
 * An axios error keeps the request it made, Authorization header included,
 * and three payment handlers logged the error object itself: a network error
 * on a void, a refund or a session create wrote the ARC merchant's API
 * password to the logs. The user model logged whole rows - the password hash
 * and the profile's passport number - on every authenticated request.
 */

// The shape axios gives a failed request: the config it sent rides along.
const axiosLikeError = () => Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:443'), {
  code: 'ECONNREFUSED',
  config: { headers: { Authorization: 'Basic bWVyY2hhbnQuVEVTVDpzZWNyZXQtcGFzc3dvcmQ=' } },
  request: { _header: 'PUT /order HTTP/1.1\r\nAuthorization: Basic bWVyY2hhbnQuVEVTVDpzZWNyZXQtcGFzc3dvcmQ=' },
});

describe('logging an error from ARC', () => {
  it('printed the merchant credential when the error object was logged', () => {
    // The harm, shown on the object itself: this is what console.error printed.
    expect(inspect(axiosLikeError(), { depth: 5 })).toContain('bWVyY2hhbnQuVEVTVDpzZWNyZXQtcGFzc3dvcmQ=');
  });

  it('keeps the message, the code and the gateway status, and nothing it carried', () => {
    const error = axiosLikeError();
    error.response = { status: 400, data: { error: { explanation: 'Order not found' } } };

    const summary = errorSummary(error);

    expect(summary).toMatchObject({ message: 'connect ECONNREFUSED 127.0.0.1:443', code: 'ECONNREFUSED', status: 400, gateway: 'Order not found' });
    expect(JSON.stringify(summary)).not.toContain('bWVyY2hhbnQ');
  });

  it('copes with something that is not an Error', () => {
    expect(errorSummary('boom')).toMatchObject({ message: 'boom', status: null });
    expect(errorSummary(undefined).message).toBe('undefined');
  });
});

describe('the payment handlers', () => {
  const handlers = [
    'backend/routes/payment/checkout.handlers.js',
    'backend/routes/payment/operations.handlers.js',
    'backend/routes/payment/links.handlers.js',
    'backend/routes/payment/agents.handlers.js',
  ];

  it.each(handlers)('%s logs no caught error object whole', (file) => {
    expect(readCode(file)).not.toMatch(/console\.(error|warn|log)\([^;]*,\s*(error|err)\s*\)/);
  });

  it('does not log the payment action query, which carries the payer secret', () => {
    expect(readCode('backend/routes/payment.routes.js')).not.toMatch(/query:\s*req\.query/);
  });
});

describe('the user model', () => {
  it('logs who was found, not their row', () => {
    const code = readCode('backend/models/user.model.js');
    expect(code).not.toMatch(/console\.log\('Found user:',\s*data(\[0\])?\s*\)/);
  });
});

describe('the pages a paid booking passes through', () => {
  it.each([
    ['frontend/src/Pages/Common/flights/FlightCreateOrders.jsx', /console\.\w+\([^;]*,\s*(flightBookingData|orderData|bookingData|sessionData|location(\.state)?)\s*\)/],
    ['frontend/src/Pages/Common/PaymentCallback.jsx', /console\.\w+\([^;]*,\s*bookingData\s*\)/],
  ])('%s prints no traveller payload to the console', (file, pattern) => {
    expect(readCode(file)).not.toMatch(pattern);
  });
});
