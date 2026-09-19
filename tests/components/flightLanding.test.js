import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The flights landing page and the results page's date strip, read from source
 * like customerSurfaces.test.js: layout and a request quietly put back are what
 * a unit test of a helper cannot see.
 */

// From the working directory: under jsdom, import.meta.url is not a file URL.
const read = (file) => readFileSync(path.resolve(process.cwd(), 'frontend/src/Pages/Common/flights', file), 'utf8');

describe('a search from the landing page', () => {
  const landing = read('flightlanding.jsx');

  // It ran the search itself, then the results page - which ignores that
  // answer - ran it again.
  it('runs once: the landing page only goes to the results', () => {
    expect(landing).not.toMatch(/endpoints\.flights\.search/);
    expect(landing).not.toMatch(/apiResponse/);
    expect(landing).toMatch(/navigate\(`\/flights\/search\?\$\{searchToQuery\(searchData\)\}`, \{ state: \{ searchData \} \}\)/);
  });

  // Result prices leave out the service fee added before payment.
  it('promises no "no hidden fees"', () => {
    expect(landing).not.toMatch(/No hidden fees/);
    expect(landing).toMatch(/Service fee shown before you pay/);
  });
});

describe('the date strip at phone width', () => {
  const results = read('flightsearchpage.jsx');

  // Centred and wider than the screen, its first dates were off the left edge
  // where no scroll could reach.
  it('starts at the left where it does not fit, and brings the searched date into view', () => {
    expect(results).toMatch(/ref=\{dateStripRef\} className="flex flex-1 min-w-0 items-end justify-start md:justify-center/);
    expect(results).toMatch(/selected\.scrollIntoView\(\{ inline: 'center', block: 'nearest' \}\)/);
  });
});
