import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Session discipline.
 *
 * The prototype opened a server-side session on every search and never closed
 * it, consuming WSAP session quota until each expired. These tests pin the two
 * modes so that cannot come back, and they are the foundation the booking chain
 * is built on: a sequence that loses its session mid-way leaves a half-created
 * PNR behind.
 */

const envelope = (sessionXml = '', bodyXml = '<Some_Reply/>') => `<?xml version="1.0"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:awsse="http://xml.amadeus.com/2010/06/Session_v3">
  <soap:Header>${sessionXml}</soap:Header>
  <soap:Body>${bodyXml}</soap:Body>
</soap:Envelope>`;

const withSessionXml = (id, seq) => `<awsse:Session TransactionStatusCode="InSeries">
  <awsse:SessionId>${id}</awsse:SessionId>
  <awsse:SequenceNumber>${seq}</awsse:SequenceNumber>
  <awsse:SecurityToken>TOK-${seq}</awsse:SecurityToken>
</awsse:Session>`;

const ok = (xml) => ({ status: 200, data: xml, headers: {} });

/** The Session element sent on the nth request, or null when omitted. */
const sentSession = (n) => {
  const body = axios.post.mock.calls[n]?.[1] ?? '';
  const match = body.match(/<awsse:Session[^>]*>[\s\S]*?<\/awsse:Session>|<awsse:Session[^>]*\/>/);
  return match ? match[0] : null;
};

let callStateless;
let withSession;

beforeEach(async () => {
  vi.stubEnv('AMADEUS_WS_ENDPOINT', 'https://node.test.invalid/1ASIWTEST');
  vi.stubEnv('AMADEUS_WS_USERNAME', 'WSTEST');
  vi.stubEnv('AMADEUS_WS_PASSWORD', 'pw');
  vi.stubEnv('AMADEUS_WS_OFFICE_ID', 'SCK1S2400');
  vi.resetModules();
  ({ callStateless, withSession } = await import('../../../backend/services/amadeusSoap/session.js'));
});

describe('stateless calls', () => {
  it('omits the Session header entirely', async () => {
    axios.post.mockResolvedValue(ok(envelope()));

    await callStateless('Fare_MasterPricerTravelBoardSearch', '<b/>');

    expect(sentSession(0)).toBeNull();
    expect(axios.post.mock.calls[0][1]).not.toContain('TransactionStatusCode');
  });

  // If Amadeus opens a session despite no header, leaving it open would consume
  // quota. The client signs it out instead.
  it('signs out a session opened despite the omitted header', async () => {
    axios.post
      .mockResolvedValueOnce(ok(envelope(withSessionXml('SESS1', '1'))))
      .mockResolvedValue(ok(envelope()));

    await callStateless('Fare_MasterPricerTravelBoardSearch', '<b/>');
    await new Promise((r) => setImmediate(r));   // sign-out is fire-and-forget

    const signOut = axios.post.mock.calls.find(([, body]) => body.includes('Security_SignOut'));
    expect(signOut).toBeDefined();
    expect(signOut[1]).toContain('TransactionStatusCode="End"');
    expect(signOut[1]).toContain('<awsse:SessionId>SESS1</awsse:SessionId>');
  });

  // A retried sell double-books; the guard is structural, not a convention.
  it('refuses to send a state-mutating operation statelessly', async () => {
    await expect(callStateless('Air_SellFromRecommendation', '<b/>'))
      .rejects.toThrow(/must run inside withSession/);
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('rejects an unknown operation before building an envelope', async () => {
    await expect(callStateless('Not_An_Operation', '<b/>')).rejects.toThrow(/Unknown operation/);
    expect(axios.post).not.toHaveBeenCalled();
  });
});

describe('stateful sequences', () => {
  it('opens with Start then continues InSeries, echoing the reply values', async () => {
    axios.post
      .mockResolvedValueOnce(ok(envelope(withSessionXml('SESS9', '1'))))
      .mockResolvedValueOnce(ok(envelope(withSessionXml('SESS9', '2'))))
      .mockResolvedValue(ok(envelope()));

    await withSession(async (ctx) => {
      await ctx.call('Air_SellFromRecommendation', '<a/>');
      await ctx.call('PNR_AddMultiElements', '<b/>');
    });

    expect(sentSession(0)).toContain('TransactionStatusCode="Start"');
    expect(sentSession(0)).not.toContain('SessionId');

    // SequenceNumber comes from the reply (1) incremented, never counted locally.
    expect(sentSession(1)).toContain('TransactionStatusCode="InSeries"');
    expect(sentSession(1)).toContain('<awsse:SessionId>SESS9</awsse:SessionId>');
    expect(sentSession(1)).toContain('<awsse:SequenceNumber>2</awsse:SequenceNumber>');
    expect(sentSession(1)).toContain('<awsse:SecurityToken>TOK-1</awsse:SecurityToken>');
  });

  it('signs out at the end of a successful sequence', async () => {
    axios.post
      .mockResolvedValueOnce(ok(envelope(withSessionXml('SESS9', '1'))))
      .mockResolvedValue(ok(envelope()));

    await withSession(async (ctx) => { await ctx.call('Air_SellFromRecommendation', '<a/>'); });

    const last = axios.post.mock.calls.at(-1)[1];
    expect(last).toContain('Security_SignOut');
    expect(last).toContain('TransactionStatusCode="End"');
  });

  // A sequence that throws half-way must still release the session, or the WSAP
  // leaks one per failed booking - exactly when failures cluster.
  it('signs out even when the body throws, and rethrows the original error', async () => {
    axios.post
      .mockResolvedValueOnce(ok(envelope(withSessionXml('SESS9', '1'))))
      .mockResolvedValue(ok(envelope()));

    await expect(withSession(async (ctx) => {
      await ctx.call('Air_SellFromRecommendation', '<a/>');
      throw new Error('sell rejected');
    })).rejects.toThrow('sell rejected');

    const signedOut = axios.post.mock.calls.some(([, body]) => body.includes('Security_SignOut'));
    expect(signedOut).toBe(true);
  });

  it('does not let a failing sign-out mask the real error', async () => {
    axios.post
      .mockResolvedValueOnce(ok(envelope(withSessionXml('SESS9', '1'))))
      .mockRejectedValue(new Error('sign-out network failure'));

    await expect(withSession(async (ctx) => {
      await ctx.call('Air_SellFromRecommendation', '<a/>');
      throw new Error('the real problem');
    })).rejects.toThrow('the real problem');
  });

  it('does not sign out when no session was ever opened', async () => {
    axios.post.mockResolvedValue(ok(envelope()));

    await withSession(async (ctx) => { await ctx.call('Air_SellFromRecommendation', '<a/>'); });

    expect(axios.post.mock.calls.some(([, b]) => b.includes('Security_SignOut'))).toBe(false);
  });

  it('rejects a nested session rather than corrupting the sequence', async () => {
    axios.post.mockResolvedValue(ok(envelope(withSessionXml('SESS9', '1'))));

    await expect(withSession(async (ctx) => {
      await ctx.call('Air_SellFromRecommendation', '<a/>');
      await withSession(async (inner) => inner.call('PNR_Cancel', '<c/>'));
    })).rejects.toThrow();
  });

  it('returns the body result to the caller', async () => {
    axios.post.mockResolvedValue(ok(envelope()));
    await expect(withSession(async () => 'done')).resolves.toBe('done');
  });
});
