import { readFileSync } from 'node:fs';
import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A booked trip's fee table, read from its PNR: retrieve it, ask MiniRules for
 * the fare stored on it (TST), sign out. Nothing in it can change the PNR.
 */

const fixture = (name) => readFileSync(new URL(`../../fixtures/amadeus/${name}`, import.meta.url), 'utf8');
const sessionHeader = (status, sequence) => `<soap:Header><awsse:Session TransactionStatusCode="${status}"><awsse:SessionId>SESS1</awsse:SessionId><awsse:SequenceNumber>${sequence}</awsse:SequenceNumber><awsse:SecurityToken>TOK</awsse:SecurityToken></awsse:Session></soap:Header>`;
const inSession = (xml, sequence) => xml.replace('<soap:Header/>', sessionHeader('InSeries', sequence));
const reply = (xml) => ({ status: 200, data: xml, headers: {} });
const signOut = '<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Header/><soap:Body><Security_SignOutReply><dummy/></Security_SignOutReply></soap:Body></soap:Envelope>';
const replies = (...xmls) => {
  axios.post.mockReset();
  for (const xml of xmls) axios.post.mockResolvedValueOnce(reply(xml));
  axios.post.mockResolvedValue(reply(signOut));
};
const actions = () => axios.post.mock.calls.map(([, , cfg]) => (cfg?.headers?.SOAPAction ?? '').split('/').pop());
const READS = ['PNRRET_21_1_1A', 'TMRXRQ_23_1_1A', 'VLSSOQ_04_1_1A'];

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv('AMADEUS_WS_ENDPOINT', 'https://node.test.invalid/1ASIWJETJEC');
  vi.stubEnv('AMADEUS_WS_WSAP', '1ASIWJETJEC');
  vi.stubEnv('AMADEUS_WS_USERNAME', 'WSTEST');
  vi.stubEnv('AMADEUS_WS_PASSWORD', 'pw');
  vi.stubEnv('AMADEUS_WS_OFFICE_ID', 'SCK1S2400');
  vi.stubEnv('AMADEUS_WS_ENABLED', 'true');
  vi.resetModules();
});

const provider = async () => (await import('../../../backend/services/amadeusSoap/index.js')).default;

describe('getBookedFeeTable', () => {
  it('reads the fees of the fare stored on the PNR, and does nothing else', async () => {
    replies(inSession(fixture('pnr-retrieve-booked.xml'), 1), inSession(fixture('minirules-booked-tst.xml'), 2));
    const table = await (await provider()).getBookedFeeTable('2OY43E');
    expect(actions().slice(0, 2)).toEqual(['PNRRET_21_1_1A', 'TMRXRQ_23_1_1A']);
    expect(actions().every((action) => READS.includes(action))).toBe(true);
    expect(table.change.before).toEqual({ allowed: true, amount: 336, varies: false });
    expect(table.refund.before).toEqual({ allowed: false, amount: 0, varies: false });
  });

  it('asks for the stored fare, not a pricing of this session', async () => {
    replies(inSession(fixture('pnr-retrieve-booked.xml'), 1), inSession(fixture('minirules-booked-tst.xml'), 2));
    await (await provider()).getBookedFeeTable('2OY43E');
    const sent = String(axios.post.mock.calls[1][1]);
    expect(sent).toContain('<referenceType>TST</referenceType><uniqueReference>ALL</uniqueReference>');
  });

  it('never says "book by" of a trip already booked', async () => {
    replies(inSession(fixture('pnr-retrieve-booked.xml'), 1), inSession(fixture('minirules-booked-tst.xml'), 2));
    expect((await (await provider()).getBookedFeeTable('2OY43E')).bookBy).toBeNull();
  });

  it('gives no table when Amadeus has no rules for the record', async () => {
    replies(inSession(fixture('pnr-retrieve-booked.xml'), 1), inSession(fixture('minirules-no-rules.xml'), 2));
    expect(await (await provider()).getBookedFeeTable('2OY43E')).toBeNull();
  });
});
