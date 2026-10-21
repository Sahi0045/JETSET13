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

  // Nothing handles a price-match request: no rules, no form, no refund path.
  it('promises no price match, and says how the ticket arrives', () => {
    expect(landing).not.toMatch(/price match/i);
    expect(landing).toMatch(/'E-ticket emailed in minutes'/);
  });
});

// The home route renders this page, and its copy is repeated in the initial
// HTML for crawlers.
describe('the home page text Google reads', () => {
  const seo = readFileSync(path.resolve(process.cwd(), 'frontend/src/seo/routeSeo.js'), 'utf8');
  const home = seo.slice(seo.indexOf("'/': {"), seo.indexOf("'/cruise': {"));

  it('makes the same promises as the page', () => {
    expect(home).toMatch(/Our lowest fares to the world's most-loved places/);
    expect(home).not.toMatch(/price match/i);
    expect(home).not.toMatch(/no hidden fees/i);
    expect(home).toMatch(/e-tickets emailed in minutes/);
  });
});

describe('the date strip at phone width', () => {
  const results = read('flightsearchpage.jsx');

  // Centred and wider than the screen, its first dates were off the left edge
  // where no scroll could reach.
  it('starts at the left where it does not fit, and brings the searched date into view', () => {
    expect(results).toMatch(/ref=\{dateStripRef\} className="flex flex-1 min-w-0 items-center justify-start md:justify-center/);
    expect(results).toMatch(/selected\.scrollIntoView\(\{ inline: 'center', block: 'nearest' \}\)/);
  });
});
