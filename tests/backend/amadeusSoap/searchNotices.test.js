import { readFileSync } from 'node:fs';
import express from 'express';
import request from 'supertest';
import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../../backend/middleware/errorHandler.js';

/**
 * A search reply that carries fares is a successful search, whatever notices
 * come with it.
 *
 * On 22 Oct 2026 production started answering Master Pricer with a top-level
 * `errorMessage` 9209 NO NDC OFFER FROM SOME NDC PROVIDERS, plus `warningInfo`
 * entries (325, 367, 911, 11), next to 235-705 KB of recommendations. The
 * reply was read as a refusal - 911 matched "This fare can no longer be sold" -
 * so 31 of 45 searches that day showed "We couldn't search these flights", and
 * the date strip, which prices each day through the same search, went blank.
 */

const fixture = (name) => readFileSync(new URL(`../../fixtures/amadeus/${name}.xml`, import.meta.url), 'utf8');
const reply = (xml) => ({ status: 200, data: xml, headers: {} });
const inDays = (n) => new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const NDC_NOTICE = '<errorMessage><applicationError><applicationErrorDetail><error>9209</error></applicationErrorDetail></applicationError>'
  + '<errorMessageText><freeTextQualification><textSubjectQualifier>1</textSubjectQualifier></freeTextQualification>'
  + '<description>NO NDC OFFER FROM SOME NDC PROVIDERS</description></errorMessageText></errorMessage>';

const WARNINGS = ['325', '367', '911', '11'].map((code) => '<warningInfo><globalMessageMarker/>'
  + `<applicationError><applicationErrorDetail><error>${code}</error></applicationErrorDetail></applicationError>`
  + '<globalMessage><freeTextQualification><textSubjectQualifier>3</textSubjectQualifier></freeTextQualification></globalMessage>'
  + '</warningInfo>').join('');

const withNdcNotices = (xml) => xml
  .replace('</replyStatus>', `</replyStatus>${NDC_NOTICE}`)
  .replace('<serviceFeesGrp>', `${WARNINGS}<serviceFeesGrp>`);

const search = async (xml) => {
  const routes = (await import('../../../backend/routes/flight.routes.js')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/flights', routes);
  app.use(errorHandler);
  axios.post.mockReset();
  axios.post.mockResolvedValue(reply(xml));
  return request(app)
    .post('/api/flights/search')
    .send({ from: 'DEL', to: 'BOM', departDate: inDays(30), adults: 1 });
};

beforeEach(() => {
  vi.stubEnv('AMADEUS_WS_ENDPOINT', 'https://nodeD2.test.webservices.amadeus.com/1ASIWJETJEC');
  vi.stubEnv('AMADEUS_WS_WSAP', '1ASIWJETJEC');
  vi.stubEnv('AMADEUS_WS_USERNAME', 'WSTEST');
  vi.stubEnv('AMADEUS_WS_PASSWORD', 'pw');
  vi.stubEnv('AMADEUS_WS_OFFICE_ID', 'SCK1S2400');
  vi.stubEnv('AMADEUS_WS_ENABLED', 'true');
  vi.stubEnv('AMADEUS_WS_UNTICKETABLE_CARRIERS', '');
  vi.resetModules();
});

describe('a search reply with fares and NDC notices', () => {
  it('lists the same fares as the reply without the notices', async () => {
    const plain = await search(fixture('mptbs-family-del-bom'));
    expect(plain.status).toBe(200);
    expect(plain.body.data.length).toBeGreaterThan(0);

    vi.resetModules();
    const noticed = await search(withNdcNotices(fixture('mptbs-family-del-bom')));

    expect(noticed.status).toBe(200);
    expect(noticed.body.success).toBe(true);
    expect(noticed.body.data.map((card) => card.id)).toEqual(plain.body.data.map((card) => card.id));
  });

  it('is still a failed search when the notice comes with no fares', async () => {
    const noFares = fixture('mptbs-no-results')
      .replace(/<errorMessage>[\s\S]*<\/errorMessage>/, NDC_NOTICE);

    const res = await search(noFares);

    expect(res.body.success).toBe(false);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
