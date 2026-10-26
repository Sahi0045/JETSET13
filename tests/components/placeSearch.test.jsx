import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FlightSearchForm from '../../frontend/src/Pages/Common/flights/flight-search-form.jsx';
import { mergeAirportResults, searchLocalAirports } from '../../frontend/src/Services/AirportService.js';

/**
 * The From and To boxes. The list was built from the local airports, then
 * replaced by the API's answer 300 ms later in a different order, so the row
 * under the cursor changed as it was clicked. It closed 200 ms after the box
 * lost focus, so a slow click landed on nothing. And on a 1366 x 768 laptop it
 * opened below the bottom of the screen.
 */

const codes = (list) => list.map((place) => place.code);

const reply = (body) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });

let airportAnswers;
beforeEach(() => {
  localStorage.setItem('userCurrency', 'USD');
  airportAnswers = {};
  globalThis.fetch = vi.fn((url, init) => {
    if (String(url).includes('/airports/search')) {
      const { keyword } = JSON.parse(init.body);
      return airportAnswers[keyword] ? airportAnswers[keyword]() : reply({ success: true, data: [] });
    }
    return reply({});
  });
});

afterEach(() => vi.useRealTimers());

describe('the local airport list', () => {
  it('puts an exact airport code first', () => {
    expect(codes(searchLocalAirports('del'))[0]).toBe('DEL');
    expect(codes(searchLocalAirports('BOM'))[0]).toBe('BOM');
  });

  it('matches the start of a name, not a letter of the country', () => {
    const found = searchLocalAirports('d');
    expect(found.every((place) => /\bd/i.test(place.name) || /^d/i.test(place.code))).toBe(true);
    expect(codes(found)).not.toContain('BOM');
  });

  it('finds Dubai and Dublin for "dub"', () => {
    expect(codes(searchLocalAirports('dub'))).toEqual(expect.arrayContaining(['DXB', 'DUB']));
  });
});

describe("merging the API's answer", () => {
  const local = [{ code: 'DUB', name: 'Dublin' }, { code: 'DXB', name: 'Dubai' }];

  it('keeps what is already listed where it is, and adds new places after it', () => {
    const merged = mergeAirportResults(local, [
      { code: 'DBV', name: 'Dubrovnik Airport', cityName: 'Dubrovnik' },
      { code: 'DXB', name: 'Dubai International Airport', cityName: 'Dubai' },
    ], 'dub');

    expect(codes(merged)).toEqual(['DUB', 'DXB', 'DBV']);
    expect(merged[1].name).toBe('Dubai');
  });

  it('leaves out places that do not match what was typed', () => {
    const merged = mergeAirportResults(local, [
      { code: 'TZL', name: 'Tuzla International Airport', cityName: 'Tuzla' },
      { code: 'DBV', name: 'Dubrovnik Airport', cityName: 'Dubrovnik' },
    ], 'dub');

    expect(codes(merged)).not.toContain('TZL');
  });

  it('matches a city by its city name, for airports named after a person', () => {
    const merged = mergeAirportResults([], [
      { code: 'JFK', name: 'John F. Kennedy International Airport', cityName: 'New York' },
    ], 'new york');

    expect(codes(merged)).toEqual(['JFK']);
  });
});

const renderForm = () => render(
  <MemoryRouter>
    <FlightSearchForm onSearch={() => {}} />
  </MemoryRouter>,
);

const typeInto = (name, text) => {
  const input = document.querySelector(`input[name="${name}"]`);
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: text } });
  return input;
};

const options = () => screen.queryAllByRole('option').map((option) => option.textContent);

describe('the To box', () => {
  it("does not reorder the list when the API's answer comes in", async () => {
    vi.useFakeTimers();
    airportAnswers.dub = () => reply({ success: true, data: [
      { code: 'DUB', name: 'Dublin Airport', cityName: 'Dublin' },
      { code: 'DBV', name: 'Dubrovnik Airport', cityName: 'Dubrovnik' },
      { code: 'DXB', name: 'Dubai International Airport', cityName: 'Dubai' },
    ] });
    renderForm();

    typeInto('to', 'dub');
    const before = options();
    expect(before.length).toBeGreaterThan(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    const after = options();

    expect(after.slice(0, before.length)).toEqual(before);
    expect(after.some((text) => text.includes('Dubrovnik'))).toBe(true);
  });

  it('ignores an answer for what the box said before', async () => {
    vi.useFakeTimers();
    let answerLondon;
    airportAnswers.lo = () => new Promise((resolve) => { answerLondon = () => resolve({ ok: true, status: 200, json: () => Promise.resolve({ success: true, data: [{ code: 'LGB', name: 'Long Beach Airport', cityName: 'Long Beach' }] }) }); });
    renderForm();

    typeInto('to', 'lo');
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    typeInto('to', 'mumbai');
    await act(async () => { answerLondon(); await vi.advanceTimersByTimeAsync(400); });

    expect(options().some((text) => text.includes('Long Beach'))).toBe(false);
    expect(options().some((text) => text.includes('Mumbai'))).toBe(true);
  });

  it('keeps the box focused when a row is pressed, so a slow click still picks it', async () => {
    vi.useFakeTimers();
    renderForm();
    const input = typeInto('to', 'mumbai');

    const row = screen.getAllByRole('option').find((option) => option.textContent.includes('Mumbai'));
    expect(fireEvent.mouseDown(row)).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    fireEvent.click(row);

    expect(input.value).toBe('Mumbai (BOM)');
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });

  it('picks with the arrow keys and Enter, the top match first', () => {
    renderForm();
    const [first, second] = searchLocalAirports('dub');

    const input = typeInto('to', 'dub');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(input.value).toBe(`${first.name} (${first.code})`);

    typeInto('to', 'dub');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(input.value).toBe(`${second.name} (${second.code})`);
  });
});

describe('a multi-city flight box', () => {
  it('keeps its box focused when a row is pressed, and picks the place', () => {
    render(
      <MemoryRouter>
        <FlightSearchForm onSearch={() => {}} initialData={{ tripType: 'multiCity', legs: [{ from: 'New Delhi (DEL)', fromCode: 'DEL', to: '', departDate: '' }, { from: '', to: '', departDate: '' }] }} />
      </MemoryRouter>,
    );
    const input = screen.getByLabelText('Flight 1 to');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'mumbai' } });

    const row = screen.getAllByRole('option').find((option) => option.textContent.includes('Mumbai'));
    expect(fireEvent.mouseDown(row)).toBe(false);
    fireEvent.click(row);

    expect(input.value).toBe('Mumbai (BOM)');
  });
});

describe('opening the list near the bottom of the screen', () => {
  afterEach(() => vi.restoreAllMocks());

  it('scrolls the page up so the list fits below the box', () => {
    renderForm();
    const input = document.querySelector('input[name="to"]');
    vi.spyOn(input, 'getBoundingClientRect').mockReturnValue({ top: 650, bottom: 692, left: 300, right: 500, width: 200, height: 42 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 768 });
    const scrollBy = vi.fn();
    window.scrollBy = scrollBy;

    fireEvent.focus(input);

    expect(scrollBy).toHaveBeenCalledTimes(1);
    expect(scrollBy.mock.calls[0][0].top).toBeGreaterThan(200);
  });

  it('leaves the page alone when there is room', () => {
    renderForm();
    const input = document.querySelector('input[name="to"]');
    vi.spyOn(input, 'getBoundingClientRect').mockReturnValue({ top: 200, bottom: 242, left: 300, right: 500, width: 200, height: 42 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });
    const scrollBy = vi.fn();
    window.scrollBy = scrollBy;

    fireEvent.focus(input);

    expect(scrollBy).not.toHaveBeenCalled();
  });
});
