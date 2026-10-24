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
    expect(config.tools).toBeUndefined();
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
    generateContent.mockResolvedValueOnce(callTool(complete())).mockResolvedValueOnce(say(''));
    searchAnswers(503, { success: false, error: 'Flight search failed' });

    const res = await send('Delhi to Mumbai one way, 2 adults');

    expect(res.body.message).toBe("I couldn't search flights just now. You can search on our flights page: /flights");
    expect(res.body.flightResults).toBeUndefined();
  });

  it('says so when no flights are found', async () => {
    generateContent.mockResolvedValueOnce(callTool(complete())).mockResolvedValueOnce(say('I found no flights that day. Shall I try the day before or after?'));
    searchAnswers(200, { success: true, data: [] });

    const res = await send('Delhi to Mumbai one way, 2 adults');

    expect(functionResponse().response.result).toEqual({ total: 0, summary: '' });
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
    for (let i = 0; i < 11; i += 1) {
      generateContent.mockResolvedValueOnce(callTool(complete())).mockResolvedValueOnce(say('Here you go.'));
      await send('Delhi to Mumbai one way, 2 adults', { sessionId: 'limit-session', ip: '192.0.2.77' });
    }

    expect(axios.post).toHaveBeenCalledTimes(10);
    expect(functionResponse(21).response.result.limited).toBe(true);
  });

  it("uses the customer's date only when it is close to the server's", async () => {
    const serverDay = new Date().toISOString().slice(0, 10);
    generateContent.mockResolvedValueOnce(say('Hello.')).mockResolvedValueOnce(say('Hello.'));

    await send('hi', { clientDate: inDays(2) });
    await send('hi', { clientDate: inDays(1) });

    const promptOf = (index) => generateContent.mock.calls[index][0].contents.at(-1).parts[0].text;
    expect(promptOf(0)).toContain(`Today is ${serverDay}.`);
    expect(promptOf(1)).toContain(`Today is ${inDays(1)}.`);
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
