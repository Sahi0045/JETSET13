import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = (file) => path.resolve(process.cwd(), file);
const read = (file) => readFileSync(root(file), 'utf8');

const filesUnder = (dir) => readdirSync(root(dir)).flatMap((name) => {
  const rel = `${dir}/${name}`;
  if (statSync(root(rel)).isDirectory()) return filesUnder(rel);
  return /\.(jsx?|json)$/.test(name) ? [rel] : [];
});

const sources = [...filesUnder('frontend/src/Pages/Common/cruise'), 'backend/data/catalog.js', 'backend/services/cruiseCatalog/appFeed.js']
  .map((file) => [file, read(file)]);

describe('the cruise pages make no claims the company cannot back', () => {
  it.each([
    ['traveller counts', /25,000\+|Happy Travelers/i],
    ['star ratings', /(?<![\w-])\d(\.\d)?\/5\b|Guest Rating|from over [\d,]+ reviews/i],
    ['rating and review fields', /"rating"\s*:|"reviews"\s*:|\brating:\s*[\d.]|\breviews:\s*\d/],
    ['invented people', /Sarah Johnson|Michael Chen|Emily Rodriguez|James Wilson/],
    ['endorsement badges', /Verified (traveler|cruise partner|customers)|Authorized (cruise|Worldwide) seller/i],
    ['made-up prices', /From \$\d|Starting from|priceValue|"price"\s*:\s*"|CABIN_TYPES/],
    ['made-up offers', /Buy One Get One|\$50 OFF|Kids sail free|up to 30% off|Best Price Guarantee/i],
    ['past sailing dates', /\b2025\b/],
    ['invented counts and popularity', /Sailings Found|totalSailings|Most-booked|travell?ers love most/i],
    ['partnership claims', /Cruise Line Partners|amadeus\.svg/i],
  ])('no %s', (_, claim) => {
    for (const [file, text] of sources) expect(text, file).not.toMatch(claim);
  });


  it('gives search engines no made-up rating or price for /cruise', () => {
    const seo = read('frontend/src/seo/routeSeo.js');
    const cruise = seo.slice(seo.indexOf("'/cruise': {"), seo.indexOf("'/cruises': {"));
    expect(cruise).not.toMatch(/aggregateRating|AggregateOffer/);
  });
});
