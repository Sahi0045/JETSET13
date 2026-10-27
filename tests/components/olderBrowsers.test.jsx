import React from 'react';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CustomFlightCalendar from '../../frontend/src/Pages/Common/flights/CustomFlightCalendar.jsx';
import { returnLegOf } from '../../frontend/src/utils/reviewTrip.js';

/**
 * Phones and browsers a few years old: Safari before 15.4 (iOS 15.3 and
 * earlier), Chrome before 92. They have no `Array.prototype.at`, and the build
 * adds no polyfills. The date picker called `.at(-1)` as it opened, so on those
 * phones tapping the date blanked the whole page ("at is not a function",
 * reproduced on jetsetterss.com with `.at` removed, 27 Oct).
 */

const native = Object.getOwnPropertyDescriptor(Array.prototype, 'at');

beforeEach(() => {
  globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) }));
  delete Array.prototype.at;
});

afterEach(() => {
  Object.defineProperty(Array.prototype, 'at', native);
});

describe('in a browser without Array.prototype.at', () => {
  it('opens the date picker', () => {
    render(<CustomFlightCalendar selectedDate="" originCode="DEL" destinationCode="BOM" onSelect={() => {}} onClose={() => {}} />);
    expect(screen.getByRole('dialog', { name: 'Choose a date' })).toBeTruthy();
  });

  it('shows the flight home on the review page', () => {
    const segment = (from, to, at) => ({ carrierCode: 'AI', number: '101', departure: { iataCode: from, at }, arrival: { iataCode: to, at }, duration: 'PT2H' });
    const offer = {
      itineraries: [
        { duration: 'PT2H', segments: [segment('DEL', 'BOM', '2026-11-13T06:00:00')] },
        { duration: 'PT2H', segments: [segment('BOM', 'DEL', '2026-11-20T15:00:00')] },
      ],
    };
    expect(returnLegOf({ originalOffer: offer })?.segments).toHaveLength(1);
  });
});

describe("the customer pages' code", () => {
  const filesUnder = (dir) => readdirSync(dir).flatMap((name) => {
    const file = path.join(dir, name);
    if (statSync(file).isDirectory()) return /admin/i.test(name) ? [] : filesUnder(file);
    return /\.(jsx?|tsx?)$/.test(name) ? [file] : [];
  });

  it('calls no .at(), which those browsers do not have', () => {
    const callers = [...filesUnder(path.resolve(process.cwd(), 'frontend/src')), ...filesUnder(path.resolve(process.cwd(), 'shared'))]
      .filter((file) => /\.at\(/.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(process.cwd(), file));
    expect(callers).toEqual([]);
  });
});
