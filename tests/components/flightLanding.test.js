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
    expect(landing).toMatch(/Platform fee shown before you pay/);
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

// The owner had "Self-Service Portal Coming Soon" taken off the home page
// (31 Oct). The phone number and email beside it were hidden on a phone.
describe('the contact strip above the home page hero', () => {
  const landing = read('flightlanding.jsx');
  const classOf = (href) => (landing.match(new RegExp(`<a href="${href.replace(/[+.]/g, '\\$&')}" className="([^"]*)"`)) || [])[1];

  it('promises no self-service portal', () => {
    expect(landing).not.toMatch(/self-service portal/i);
  });

  it('shows the phone number and email at every width, and both can be tapped', () => {
    for (const href of ['tel:+18775387380', 'mailto:support@jetsetterss.com']) {
      expect(classOf(href)).toBeTruthy();
      expect(classOf(href)).not.toMatch(/(^|\s)hidden(\s|$)/);
    }
  });
});
