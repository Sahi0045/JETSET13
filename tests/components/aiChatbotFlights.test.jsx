import React from 'react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AIChatbot from '../../frontend/src/Pages/Common/AIChatbot.jsx';

vi.mock('../../frontend/src/contexts/SupabaseAuthContext', () => ({
  useSupabaseAuth: () => ({ user: null, session: null, isAuthenticated: false }),
}));
vi.mock('../../frontend/src/Pages/Common/chat/ChatFlightCards', () => ({
  default: ({ results }) => <div data-testid="chat-cards">{results.offers.length}</div>,
}));

const reply = (body) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
const flightResults = { offers: [{ id: '1' }, { id: '2' }], total: 2, search: {}, searchedAt: new Date().toISOString() };

const renderChat = () => render(<MemoryRouter><AIChatbot isOpen onClose={() => {}} /></MemoryRouter>);

const type = (text) => {
  fireEvent.change(screen.getByPlaceholderText('Type your message...'), { target: { value: text } });
  fireEvent.submit(screen.getByPlaceholderText('Type your message...').closest('form'));
};

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  globalThis.fetch = vi.fn(() => reply({ sessionId: 'chat-session-1', message: 'Hello there.' }));
});

describe('the chat bot and flights', () => {
  it("sends the customer's date", async () => {
    renderChat();
    type('flights to Mumbai');

    await screen.findByText('Hello there.');
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.clientDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('draws cards under a reply that has flight results', async () => {
    fetch.mockImplementation(() => reply({ sessionId: 'chat-session-1', message: 'Here are some.', flightResults }));
    renderChat();
    type('Delhi to Mumbai one way, 2 adults');

    expect((await screen.findByTestId('chat-cards')).textContent).toBe('2');
  });

  it('cannot send while a reply is pending', async () => {
    fetch.mockImplementation(() => new Promise(() => {}));
    renderChat();
    type('first');
    type('second');

    await act(async () => {});
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps the conversation after a remount', async () => {
    fetch.mockImplementation(() => reply({ sessionId: 'chat-session-1', message: 'Here are some.', flightResults }));
    const first = renderChat();
    type('Delhi to Mumbai one way, 2 adults');
    await screen.findByTestId('chat-cards');
    first.unmount();

    renderChat();

    expect(screen.getByText('Delhi to Mumbai one way, 2 adults')).toBeTruthy();
    expect(screen.getByTestId('chat-cards')).toBeTruthy();
    expect(screen.getAllByText(/I'm the Jetsetters AI assistant/)).toHaveLength(1);
  });

  it('loads the flight cards only when a reply has them', () => {
    const source = readFileSync(path.resolve(process.cwd(), 'frontend/src/Pages/Common/AIChatbot.jsx'), 'utf8');

    expect(source).not.toMatch(/^import ChatFlightCards/m);
    expect(source).toMatch(/lazy\(\(\) => import\('\.\/chat\/ChatFlightCards'\)/);
  });

  it('links to the flights page when the search could not run', async () => {
    fetch.mockImplementation(() => reply({ sessionId: 'chat-session-1', message: "I couldn't search flights just now.", searchLink: '/flights' }));
    renderChat();
    type('Delhi to Mumbai one way, 2 adults');

    const link = await screen.findByRole('link', { name: 'Search flights' });
    expect(link.getAttribute('href')).toBe('/flights');
  });

  it("does not show another person's saved chat", () => {
    sessionStorage.setItem('jetsetters.chat.v1', JSON.stringify({ owner: 'user-1', messages: [{ type: 'user', content: 'my PNR ABC123' }] }));
    renderChat();

    expect(screen.queryByText('my PNR ABC123')).toBeNull();
    expect(screen.getAllByText(/I'm the Jetsetters AI assistant/)).toHaveLength(1);
  });

  it('does not retry a message request', async () => {
    fetch.mockImplementation(() => Promise.reject(new TypeError('Failed to fetch')));
    renderChat();
    type('hello');

    await waitFor(() => expect(screen.getByText(/having trouble connecting/)).toBeTruthy());
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
