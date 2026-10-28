import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FlightSearchForm from '../../frontend/src/Pages/Common/flights/flight-search-form.jsx';
import { clearCache, searchLocalAirports, toPlace } from '../../frontend/src/Services/AirportService.js';

/**
 * The From and To boxes. The list was built from the local airports, then
 * replaced by the API's answer 300 ms later in a different order, so the row
 * under the cursor changed as it was clicked. It closed 200 ms after the box
 * lost focus, so a slow click landed on nothing. And on a 1366 x 768 laptop it
 * opened below the bottom of the screen.
 *
 * Then the built-in list came first, India first, and the API's ranked answer
 * only after it: "new" opened on New Delhi and "ny" found no New York (28 Oct).
 * The list is now the API's answer, as on booking.com.
 */

const codes = (list) => list.map((place) => place.code);

const reply = (body) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });

const airport = (code, name, cityName, countryCode, parent) => ({ code, type: 'AIRPORT', name, cityName, countryCode, ...(parent ? { parent } : {}) });
const MUMBAI = [airport('BOM', 'Chhatrapati Shivaji Maharaj International Airport', 'Mumbai', 'IN')];
const DUB = [airport('DUB', 'Dublin Airport', 'Dublin', 'IE'), airport('DXB', 'Dubai International Airport', 'Dubai', 'AE')];

let airportAnswers;
beforeEach(() => {
  localStorage.setItem('userCurrency', 'USD');
  clearCache();
  airportAnswers = { mumbai: () => reply({ success: true, data: MUMBAI }), dub: () => reply({ success: true, data: DUB }) };
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

describe('a row of the list', () => {
  it('names a city with several airports, and says it searches them all', () => {
    expect(toPlace({ code: 'NYC', type: 'CITY', name: 'New York', countryCode: 'US' }))
      .toMatchObject({ name: 'New York', title: 'New York', subtitle: 'All airports · United States' });
  });

  it("names an airport under its city by the airport, and puts it in the box without 'International Airport'", () => {
    expect(toPlace(airport('MXP', 'Milan Malpensa International Airport', 'Ferno (VA)', 'IT', 'MIL'), 'Milan'))
      .toMatchObject({ name: 'Milan Malpensa', title: 'Milan Malpensa International Airport', subtitle: 'Milan, Italy', parent: 'MIL' });
  });

  it('names an airport on its own by its city, without what OurAirports adds to it', () => {
    expect(toPlace(airport('CDG', 'Charles de Gaulle International Airport', "Paris (Roissy-en-France, Val-d'Oise)", 'FR')))
      .toMatchObject({ name: 'Paris', subtitle: 'Charles de Gaulle International Airport · France' });
    expect(toPlace(airport('HKG', 'Hong Kong International Airport', 'Hong Kong', 'HK')).subtitle).toMatch(/· Hong Kong$/);
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
  it("lists the API's answer in its order, a city's airports under it", async () => {
    vi.useFakeTimers();
    airportAnswers['new york'] = () => reply({ success: true, data: [
      { code: 'NYC', type: 'CITY', name: 'New York', cityName: 'New York', countryCode: 'US' },
      airport('JFK', 'John F. Kennedy International Airport', 'New York', 'US', 'NYC'),
      airport('EWR', 'Newark Liberty International Airport', 'Newark', 'US', 'NYC'),
      airport('LGA', 'LaGuardia Airport', 'New York', 'US', 'NYC'),
      airport('DEL', 'Indira Gandhi International Airport', 'New Delhi', 'IN'),
    ] });
    renderForm();

    typeInto('to', 'new york');
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });

    expect(options()).toEqual([
      'New YorkAll airports · United StatesNYC',
      'John F. Kennedy International AirportNew York, United StatesJFK',
      'Newark Liberty International AirportNew York, United StatesEWR',
      'LaGuardia AirportNew York, United StatesLGA',
      'New DelhiIndira Gandhi International Airport · IndiaDEL',
    ]);
    expect(screen.getAllByRole('option')[1].className).toMatch(/pl-10/);
  });

  it('says it is searching until the first answer comes', async () => {
    vi.useFakeTimers();
    renderForm();

    typeInto('to', 'mumbai');
    expect(screen.getByText('Searching airports…')).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });

    expect(screen.queryByText('Searching airports…')).toBeNull();
    expect(options()[0]).toMatch(/^Mumbai/);
  });

  it('uses the built-in list when the API cannot be reached', async () => {
    vi.useFakeTimers();
    airportAnswers.mumbai = () => Promise.reject(new TypeError('Failed to fetch'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderForm();

    typeInto('to', 'mumbai');
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });

    expect(options().some((text) => text.includes('Mumbai'))).toBe(true);
  });

  it('picks the row under the pointer when it is pressed, before the list can change', async () => {
    vi.useFakeTimers();
    renderForm();
    const input = typeInto('to', 'mumbai');
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });

    fireEvent.mouseDown(screen.getAllByRole('option')[0]);

    expect(input.value).toBe('Mumbai (BOM)');
    expect(screen.queryAllByRole('option')).toHaveLength(0);
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
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });

    const row = screen.getAllByRole('option').find((option) => option.textContent.includes('Mumbai'));
    expect(fireEvent.mouseDown(row)).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    fireEvent.click(row);

    expect(input.value).toBe('Mumbai (BOM)');
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });

  it('picks with the arrow keys and Enter, the top match first', async () => {
    vi.useFakeTimers();
    renderForm();

    const input = typeInto('to', 'dub');
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(input.value).toBe('Dublin (DUB)');

    typeInto('to', 'dub');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(input.value).toBe('Dubai (DXB)');
  });
});

describe('a multi-city flight box', () => {
  afterEach(() => vi.useRealTimers());

  it('keeps its box focused when a row is pressed, and picks the place', async () => {
    vi.useFakeTimers();
    render(
      <MemoryRouter>
        <FlightSearchForm onSearch={() => {}} initialData={{ tripType: 'multiCity', legs: [{ from: 'New Delhi (DEL)', fromCode: 'DEL', to: '', departDate: '' }, { from: '', to: '', departDate: '' }] }} />
      </MemoryRouter>,
    );
    const input = screen.getByLabelText('Flight 1 to');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'mumbai' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });

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
