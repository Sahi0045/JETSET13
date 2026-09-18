import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The redesigned flights home page, read from source the way flightLanding.test.js
 * reads it: section order and the promises printed on a page are not something a
 * unit test of a helper can see.
 */

const read = (file) => readFileSync(path.resolve(process.cwd(), 'frontend/src/Pages/Common/flights', file), 'utf8');

describe('the flights home page', () => {
  const landing = read('flightlanding.jsx');

  // Someone landing here is shopping for a fare. The picture gallery used to
  // come first and the prices were three screens down.
  it('shows the fares above the destination gallery', () => {
    const fares = landing.indexOf('<CheapestFlights');
    const gallery = landing.indexOf('<PopularDestinations');
    expect(fares).toBeGreaterThan(-1);
    expect(gallery).toBeGreaterThan(-1);
    expect(fares).toBeLessThan(gallery);
  });

  // The festival band sells the seat hold, which checkout really does, and not
  // a discount that no rule applies - the trap noUnfulfilledDiscounts guards.
  it('advertises no festival discount', () => {
    expect(landing).toMatch(/Flying home for the festival\?/);
    expect(landing).not.toMatch(/\d+%\s*(off|OFF)/);
    expect(landing).toMatch(/confirm the seat with the airline before your card is charged/);
  });

  // Every section on one ground: a band change mid-page read as a hard seam.
  it('runs on a single background', () => {
    expect(landing).not.toMatch(/bg-sand\b/);
  });

  // The search still leaves through the same door.
  it('keeps the one-search navigation', () => {
    expect(landing).toMatch(/navigate\(`\/flights\/search\?\$\{searchToQuery\(searchData\)\}`, \{ state: \{ searchData \} \}\)/);
  });
});

describe('the cheapest fares block', () => {
  const fares = read('cheapest-flight.jsx');

  // Six small cards repeated the shape of the gallery below them.
  it('shows three fares, not six', () => {
    expect(fares).toMatch(/flights\.slice\(0, 3\)\.map/);
  });

  // The panel wrapper made the section an island on the page.
  it('sits on the page rather than in a glass panel', () => {
    expect(fares).not.toMatch(/bg-white\/55 backdrop-blur-sm rounded-\[1\.5rem\]/);
  });

  // Whatever the styling, the fare still comes from the cached feed and the
  // card still books through the page's handler.
  it('keeps its data and its booking handler', () => {
    expect(fares).toMatch(/cheapestFares_/);
    expect(fares).toMatch(/onBookFlight && onBookFlight\(flight\.destination\)/);
  });
});
