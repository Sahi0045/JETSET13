import axios from 'axios';
import express from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import offers from '../fixtures/flights/searchOffers.json';

const { generateContent, chatModelMock } = vi.hoisted(() => ({
  generateContent: vi.fn(),
  chatModelMock: {
    getSession: vi.fn(),
    createSession: vi.fn(),
    addMessage: vi.fn(),
    getHistory: vi.fn(),
    logAnalytics: vi.fn(),
    searchSimilar: vi.fn(),
  },
}));

vi.mock('@google/genai', async (importOriginal) => ({
  ...(await importOriginal()),
  GoogleGenAI: class {
    constructor() {
      this.models = {
        generateContent,
        embedContent: vi.fn().mockResolvedValue({ embeddings: [{ values: [0] }] }),
      };
    }
  },
}));
vi.mock('../../backend/models/chat.model.js', () => ({ default: chatModelMock }));
vi.mock('../../backend/services/booking-data.service.js', () => ({
  default: { getBookingContext: vi.fn().mockResolvedValue({}) },
}));
vi.mock('../../backend/middleware/auth.middleware.js', async (importOriginal) => ({
  ...(await importOriginal()),
  optionalProtect: (_req, _res, next) => next(),
}));

let chatController;
let chatRoutes;

beforeAll(async () => {
  process.env.GEMINI_API_KEY = 'test-gemini-key';
  ({ default: chatController } = await import('../../backend/controllers/chat.controller.js'));
  ({ default: chatRoutes } = await import('../../backend/api/chat/index.js'));
});

const inDays = (days) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
const complete = () => ({ from: 'DEL', to: 'BOM', departDate: inDays(30), tripType: 'oneWay', adults: 2 });

const callTool = (args) => ({
  functionCalls: [{ name: 'search_flights', args }],
  candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'search_flights', args } }] } }],
});
const say = (text) => ({ text, candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP' }] });

const searchAnswers = (status, data) => axios.post.mockResolvedValue({ status, data });
const found = () => searchAnswers(200, { success: true, data: offers, meta: { searchParams: { from: 'DEL', to: 'BOM', departDate: inDays(30), adults: 2, children: 0, infants: 0 } } });

let visitor = 0;

async function send(message, { sessionId, ip, clientDate } = {}) {
  visitor += 1;
  chatModelMock.createSession.mockResolvedValue({ id: sessionId || `chat-session-${visitor}` });
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  await chatController.processMessage({
    body: { message, ...(clientDate ? { clientDate } : {}) },
    ip: ip || `198.51.100.${visitor % 250}`,
    user: undefined,
    get: () => undefined,
  }, res);
  return res;
}

const functionResponse = (callIndex = 1) => {
  const { contents } = generateContent.mock.calls[callIndex][0];
  return contents[contents.length - 1].parts[0].functionResponse;
};

beforeEach(() => {
  vi.clearAllMocks();
  generateContent.mockReset();
  axios.post.mockReset();
  chatModelMock.getSession.mockResolvedValue(null);
  chatModelMock.getHistory.mockResolvedValue([]);
  chatModelMock.addMessage.mockResolvedValue({ id: 'message-1' });
  chatModelMock.logAnalytics.mockResolvedValue(undefined);
  chatModelMock.searchSimilar.mockResolvedValue([]);
});

describe('the bot searches flights', () => {
  it('searches and returns cards', async () => {
    generateContent.mockResolvedValueOnce(callTool(complete())).mockResolvedValueOnce(say('Here are some good options.'));
    found();

    const res = await send('Delhi to Mumbai one way next month, 2 adults');

    expect(res.body.message).toBe('Here are some good options.');
    expect(res.body.flightResults.offers.length).toBeGreaterThanOrEqual(1);
    expect(res.body.flightResults.total).toBe(offers.length);
    expect(res.body.flightResults.search.from).toBe('DEL');
    expect(new Date(res.body.flightResults.searchedAt).toString()).not.toBe('Invalid Date');
  });

  it('the first Gemini call offers the search tool', async () => {
    generateContent.mockResolvedValueOnce(say('Where would you like to fly?'));

    await send('hi');

    const { config } = generateContent.mock.calls[0][0];
    expect(config.tools[0].functionDeclarations[0].name).toBe('search_flights');
  });

  it('the second Gemini call carries the function response', async () => {
    const first = callTool(complete());
    generateContent.mockResolvedValueOnce(first).mockResolvedValueOnce(say('Here you go.'));
    found();

    await send('Delhi to Mumbai one way, 2 adults');

    const { contents, config } = generateContent.mock.calls[1][0];
    expect(contents[contents.length - 2]).toBe(first.candidates[0].content);
    expect(functionResponse().name).toBe('search_flights');
    expect(functionResponse().response.result.summary).toContain('+ service fee');
    expect(functionResponse().response.result.searched).toEqual({ from: 'DEL', to: 'BOM', departDate: inDays(30) });
    expect(config.tools[0].functionDeclarations[0].name).toBe('search_flights');
    expect(config.toolConfig.functionCallingConfig.mode).toBe('NONE');
  });

  it('answers every function call in the turn and searches once', async () => {
    const goa = { ...complete(), to: 'GOI' };
    const both = {
      functionCalls: [{ name: 'search_flights', args: complete() }, { name: 'search_flights', args: goa }],
      candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'search_flights', args: complete() } }, { functionCall: { name: 'search_flights', args: goa } }] } }],
    };
    generateContent.mockResolvedValueOnce(both).mockResolvedValueOnce(say('Here is Mumbai. Ask me for Goa next.'));
    found();

    const res = await send('Delhi to Mumbai or Goa, one way, 2 adults');

    const parts = generateContent.mock.calls[1][0].contents.at(-1).parts;
    expect(parts).toHaveLength(2);
    expect(parts[0].functionResponse.response.result.summary).toContain('+ service fee');
    expect(parts[1].functionResponse.response.result).toEqual({ skipped: 'one search per message' });
    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(res.body.flightResults.offers.length).toBeGreaterThan(0);
  });

  it('a failed second call still shows the cards', async () => {
    generateContent.mockResolvedValueOnce(callTool(complete())).mockRejectedValue(new Error('500 INTERNAL'));
    found();

    const res = await send('Delhi to Mumbai one way, 2 adults');

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe('Here are the best flights I found. Prices are the airline fare plus our service fee, confirmed at checkout.');
    expect(res.body.flightResults.offers.length).toBeGreaterThan(0);
  });

  it('ignores a tool it does not know', async () => {
    generateContent
      .mockResolvedValueOnce({ functionCalls: [{ name: 'book_flight', args: {} }], candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'book_flight', args: {} } }] } }] })
      .mockResolvedValueOnce(say('I can search flights for you.'));

    await send('book it');

    expect(axios.post).not.toHaveBeenCalled();
    expect(functionResponse().response.result).toEqual({ error: 'unknown tool' });
  });

  it('tells Gemini when the filters leave nothing', async () => {
    generateContent.mockResolvedValueOnce(callTool({ ...complete(), airlines: ['ZZ'] })).mockResolvedValueOnce(say('No ZZ flights that day.'));
    found();

    const res = await send('only ZZ airline');

    expect(functionResponse().response.result).toMatchObject({ total: offers.length, matching: 0, summary: '' });
    expect(res.body.flightResults).toBeUndefined();
  });

  it('asks for what is missing without searching', async () => {
    const { adults, ...noTravellers } = complete();
    generateContent.mockResolvedValueOnce(callTool(noTravellers)).mockResolvedValueOnce(say('How many people are travelling?'));

    const res = await send('Delhi to Mumbai one way');

    expect(axios.post).not.toHaveBeenCalled();
    expect(functionResponse().response.result.needs).toEqual(['adults']);
    expect(res.body.flightResults).toBeUndefined();
  });

  it('asks which airport when the search answers UNKNOWN_PLACE', async () => {
    generateContent.mockResolvedValueOnce(callTool({ ...complete(), to: 'Springfield' })).mockResolvedValueOnce(say('Which Springfield do you mean?'));
    searchAnswers(400, { success: false, code: 'UNKNOWN_PLACE', error: 'We could not find "Springfield".' });

    const res = await send('Delhi to Springfield');

    expect(functionResponse().response.result.failed).toBe('UNKNOWN_PLACE');
    expect(res.body.flightResults).toBeUndefined();
    expect(res.body.message).toBe('Which Springfield do you mean?');
  });

  it('apologises and shows no cards when the search fails', async () => {
    generateContent.mockResolvedValueOnce(callTool(complete())).mockResolvedValueOnce(say('Let me look at other dates for you.'));
    searchAnswers(503, { success: false, error: 'timeout of 20000ms exceeded' });

    const res = await send('Delhi to Mumbai one way, 2 adults');

    expect(res.body.message).toBe("I couldn't search flights just now. You can search on our flights page.");
    expect(res.body.searchLink).toBe('/flights');
    expect(res.body.flightResults).toBeUndefined();
    expect(functionResponse().response.result.message).toBe('The flight search is busy right now.');
  });

  it('says so when no flights are found', async () => {
    generateContent.mockResolvedValueOnce(callTool(complete())).mockResolvedValueOnce(say('I found no flights that day. Shall I try the day before or after?'));
    searchAnswers(200, { success: true, data: [] });

    const res = await send('Delhi to Mumbai one way, 2 adults');

    expect(functionResponse().response.result).toMatchObject({ total: 0, matching: 0, summary: '' });
    expect(res.body.flightResults).toBeUndefined();
  });

  it('falls back to a fixed sentence when Gemini says nothing usable', async () => {
    generateContent.mockResolvedValueOnce(callTool(complete())).mockResolvedValueOnce(say('Usually about $999.'));
    found();

    const res = await send('Delhi to Mumbai one way, 2 adults');

    expect(res.body.message).toBe('Here are the best flights I found. Prices are the airline fare plus our service fee, confirmed at checkout.');
    expect(res.body.flightResults.offers.length).toBeGreaterThanOrEqual(1);
  });

  it('keeps a card price the bot repeats', async () => {
    generateContent.mockResolvedValueOnce(callTool(complete())).mockResolvedValueOnce(say(`The nonstop is USD ${offers[0].price.total}.`));
    found();

    const res = await send('Delhi to Mumbai one way, 2 adults');

    expect(res.body.message).toBe(`The nonstop is USD ${offers[0].price.total}.`);
  });

  it("stops searching after the session's limit", async () => {
    found();
    let last;
    for (let i = 0; i < 11; i += 1) {
      generateContent.mockResolvedValueOnce(callTool(complete())).mockResolvedValueOnce(say('Here you go.'));
      last = await send('Delhi to Mumbai one way, 2 adults', { sessionId: 'limit-session', ip: '192.0.2.77' });
    }

    expect(axios.post).toHaveBeenCalledTimes(10);
    expect(functionResponse(21).response.result.limited).toBe(true);
    expect(last.body.searchLink).toBe('/flights');
  });

  it("uses the customer's date only when it is close to the server's", async () => {
    const serverDay = new Date().toISOString().slice(0, 10);
    generateContent.mockResolvedValueOnce(say('Hello.')).mockResolvedValueOnce(say('Hello.'));

    await send('hi', { clientDate: inDays(2) });
    await send('hi', { clientDate: inDays(1) });

    const promptOf = (index) => generateContent.mock.calls[index][0].contents.at(-1).parts[0].text;
    const weekday = (day) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
    expect(promptOf(0)).toContain(`Today is ${weekday(serverDay)} ${serverDay}.`);
    expect(promptOf(1)).toContain(`Today is ${weekday(inDays(1))} ${inDays(1)}.`);
    expect(promptOf(0)).toContain('say which airports and date you searched');
  });
});

describe('the chat event route', () => {
  const app = () => {
    const server = express();
    server.use(express.json());
    server.use('/api/chat', chatRoutes);
    return server;
  };

  it('event route logs known events', async () => {
    const res = await request(app()).post('/api/chat/event').send({ sessionId: 'chat-session-9', event: 'flight_book_clicked', offerId: '4-1' });

    expect(res.status).toBe(204);
    expect(chatModelMock.logAnalytics).toHaveBeenCalledWith('chat-session-9', 'flight_book_clicked', { offerId: '4-1' });
  });

  it('event route refuses others', async () => {
    const res = await request(app()).post('/api/chat/event').send({ sessionId: 'chat-session-9', event: 'drop_table' });

    expect(res.status).toBe(400);
    expect(chatModelMock.logAnalytics).not.toHaveBeenCalled();
  });
});
