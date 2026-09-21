import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Signing out of a session whose last call got no reply.
 *
 * `ctx.call` worked out the SequenceNumber it sent and threw it away, keeping
 * only the one in the last REPLY. When a call failed with no reply at all - a
 * read timeout, a reset connection, a reply it could not parse - the session
 * still held the previous reply's number, and the sign-out sent the very number
 * the failed call had just used.
 *
 * Our own capture of 15 Sep 2026 (flow log 10, a Ticket_CancelDocument timeout)
 * shows it, twice in one log:
 *
 *     PNR_Retrieve           Start     -> reply seq 1
 *     Ticket_CancelDocument  seq 2     -> NO REPLY, ECONNABORTED after 25000 ms
 *     Security_SignOut       End seq 2 -> HTTP 500  93|Session|Illogical conversation
 *
 * Amadeus had processed the call that timed out, so 2 was already used; the
 * sign-out was refused, swallowed, and the session - which in the seat check
 * holds the seats just sold - was left open until it expired server-side, still
 * counting against the WSAP's session ceiling.
 *
 * Whether a call with no reply reached Amadeus cannot be known from here. So
 * the sign-out goes at one past the number SENT - right when it reached, as in
 * the capture - and, only if that is refused, once more at one past the number
 * last REPLIED - right when it never left. Both numbers are ones we hold.
 */

const envelope = (sessionXml = '', bodyXml = '<Some_Reply/>') => `<?xml version="1.0"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:awsse="http://xml.amadeus.com/2010/06/Session_v3">
  <soap:Header>${sessionXml}</soap:Header>
  <soap:Body>${bodyXml}</soap:Body>
</soap:Envelope>`;

const sessionXml = (seq, status = 'InSeries') => `<awsse:Session TransactionStatusCode="${status}">
  <awsse:SessionId>04MYMIPAFM</awsse:SessionId>
  <awsse:SequenceNumber>${seq}</awsse:SequenceNumber>
  <awsse:SecurityToken>TOK</awsse:SecurityToken>
</awsse:Session>`;

const ok = (seq) => ({ status: 200, data: envelope(sessionXml(seq)), headers: {} });

/** What Amadeus answered to the sign-out in the capture. */
const illogicalConversation = (seq) => ({
  status: 500,
  headers: {},
  data: envelope(sessionXml(seq, 'End'),
    '<soap:Fault><faultcode>soap:Server</faultcode><faultstring> 93|Session|Illogical conversation</faultstring></soap:Fault>'),
});

const timeout = () => Object.assign(new Error('timeout of 25000ms exceeded'), { code: 'ECONNABORTED' });
const refused = () => Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });

/** SOAPAction and SequenceNumber of every request sent, in order. */
const sent = () => axios.post.mock.calls.map(([, body, options]) => ({
  action: String(options?.headers?.SOAPAction ?? '').split('/').pop(),
  status: body.match(/TransactionStatusCode="(\w+)"/)?.[1] ?? null,
  seq: body.match(/<awsse:SequenceNumber>(\d+)<\/awsse:SequenceNumber>/)?.[1] ?? null,
}));
const signOuts = () => sent().filter((r) => r.status === 'End');

let withSession;

beforeEach(async () => {
  vi.stubEnv('AMADEUS_WS_ENDPOINT', 'https://node.test.invalid/1ASIWTEST');
  vi.stubEnv('AMADEUS_WS_USERNAME', 'WSTEST');
  vi.stubEnv('AMADEUS_WS_PASSWORD', 'pw');
  vi.stubEnv('AMADEUS_WS_OFFICE_ID', 'SCK1S2400');
  vi.resetModules();
  axios.post.mockReset();
  ({ withSession } = await import('../../../backend/services/amadeusSoap/session.js'));
});

/** Retrieve, then a second call that fails with `failure`, as the capture ran. */
const run = (failure) => withSession(async (ctx) => {
  await ctx.call('PNR_Retrieve', '<b/>');
  await ctx.call('Ticket_CancelDocument', '<b/>');
}).catch(() => {});

describe('a call that got no reply', () => {
  // The capture, exactly: reply seq 1, call sent at 2 times out, Amadeus had it.
  it('signs out at one past the number it sent, not the one it already used', async () => {
    axios.post
      .mockResolvedValueOnce(ok(1))
      .mockRejectedValueOnce(timeout())
      .mockResolvedValueOnce(ok(3));

    await run();

    expect(sent()[1].seq).toBe('2');
    expect(signOuts()).toEqual([{ action: expect.any(String), status: 'End', seq: '3' }]);
  });

  // The other way a call gets no reply: it never left, so 2 was never used.
  it('tries once more at one past the last reply when that is refused', async () => {
    axios.post
      .mockResolvedValueOnce(ok(1))
      .mockRejectedValueOnce(refused())
      .mockResolvedValueOnce(illogicalConversation(4))
      .mockResolvedValueOnce(ok(2));

    await run();

    expect(signOuts().map((s) => s.seq)).toEqual(['3', '2']);
  });

  // A reply that arrived but could not be parsed did reach Amadeus.
  it('counts a reply it could not read as a number used', async () => {
    axios.post
      .mockResolvedValueOnce(ok(1))
      .mockResolvedValueOnce({ status: 200, headers: {}, data: '<<not xml' })
      .mockResolvedValueOnce(ok(3));

    await run();

    expect(signOuts()[0].seq).toBe('3');
  });

  // Two tries, not a loop: a session that will not close expires on its own.
  it('gives up after the second refusal', async () => {
    axios.post
      .mockResolvedValueOnce(ok(1))
      .mockRejectedValueOnce(timeout())
      .mockResolvedValueOnce(illogicalConversation(4))
      .mockResolvedValueOnce(illogicalConversation(3));

    await run();

    expect(signOuts()).toHaveLength(2);
  });
});

describe('the call after one that got no reply', () => {
  // The booking chain carries on after a Queue_PlacePNR failure, and the next
  // call is DocIssuance_IssueTicket. Reusing the queue call's number had
  // Amadeus refuse the issuance, so the ticket failed to issue.
  it('is not sent with the number the failed call used', async () => {
    axios.post
      .mockResolvedValueOnce(ok(1))
      .mockRejectedValueOnce(timeout())
      .mockResolvedValueOnce(ok(3))
      .mockResolvedValueOnce(ok(4));

    await withSession(async (ctx) => {
      await ctx.call('PNR_Retrieve', '<b/>');
      await ctx.call('Queue_PlacePNR', '<b/>').catch(() => {});
      await ctx.call('DocIssuance_IssueTicket', '<b/>');
    });

    const seqs = sent().map((r) => r.seq);
    expect(seqs[1]).toBe('2');
    expect(seqs[2]).toBe('3');
    expect(signOuts()[0].seq).toBe('4');
  });
});

describe('a session where every call got its reply', () => {
  // Nothing changes on the ordinary path: one sign-out, one past the last reply.
  it('signs out once, at one past the last reply', async () => {
    axios.post
      .mockResolvedValueOnce(ok(1))
      .mockResolvedValueOnce(ok(2))
      .mockResolvedValueOnce(ok(3));

    await withSession(async (ctx) => {
      await ctx.call('PNR_Retrieve', '<b/>');
      await ctx.call('PNR_Retrieve', '<b/>');
    });

    expect(signOuts()).toEqual([{ action: expect.any(String), status: 'End', seq: '3' }]);
  });

  // A fault is a reply: its own header says where the session is.
  it('follows the session a fault reply carries', async () => {
    axios.post
      .mockResolvedValueOnce(ok(1))
      .mockResolvedValueOnce({
        status: 500,
        headers: {},
        data: envelope(sessionXml(2), '<soap:Fault><faultcode>soap:Server</faultcode><faultstring>1931|Application|NO MATCH FOR RECORD LOCATOR</faultstring></soap:Fault>'),
      })
      .mockResolvedValueOnce(ok(3));

    await run();

    expect(signOuts()).toEqual([{ action: expect.any(String), status: 'End', seq: '3' }]);
  });

  // The first sign-out closing the session must not be followed by another.
  it('does not sign out twice when the first one works', async () => {
    axios.post
      .mockResolvedValueOnce(ok(1))
      .mockRejectedValueOnce(timeout())
      .mockResolvedValueOnce(ok(3));

    await run();

    expect(signOuts()).toHaveLength(1);
  });
});
