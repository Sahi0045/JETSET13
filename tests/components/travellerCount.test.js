import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { searchFromQuery, searchToQuery } from '../../frontend/src/Pages/Common/flights/searchQuery.js';

/**
 * Who is travelling is chosen on the search: the airline prices an exact group,
 * so the review page cannot add a passenger to a fare. Customers could not tell.
 * The results card labelled a two-adult total "per adult", and the review page
 * only said "please search again", with no way back to the search.
 *
 * Read from source like customerSurfaces.test.js: a label quietly restored or
 * a button quietly unwired is what a helper's unit test cannot see.
 */

// From the working directory: under jsdom, import.meta.url is not a file URL.
const read = (file) => readFileSync(path.resolve(process.cwd(), 'frontend/src/Pages/Common/flights', file), 'utf8');
const card = read('FlightCard.jsx');
const review = read('FlightBookingConfirmation.jsx');
const results = read('flightsearchpage.jsx');
const modifyBar = read('FlightModifyBar.jsx');
const form = read('flight-search-form.jsx');

describe('the results card says who its price is for', () => {
  it('labels the total with the travellers the airline priced, not "per adult"', () => {
    expect(card).not.toMatch(/>per adult</i);
    expect(card).toMatch(/offer\?\.travelerPricings\?\.length/);
    expect(card).toMatch(/\{pricedForLabel\(flight\.originalOffer\)\}/);
  });
});

describe('changing who is travelling', () => {
  it('the review page goes back to the same search with the traveller picker open', () => {
    expect(review).toMatch(/onClick=\{changeTravellers\}/);
    expect(review).toMatch(/Change travellers/);
    expect(review).toMatch(/navigate\(`\/flights\/search\?\$\{searchToQuery\(search\)\}`, \{ state: \{ searchData: search, editTravellers: true \} \}\)/);
  });

  it('the results page opens the picker once, then drops the flag', () => {
    expect(results).toMatch(/const \[openTravellers\] = useState\(\(\) => Boolean\(location\.state\?\.editTravellers\)\)/);
    expect(results).toMatch(/openTravellers=\{openTravellers\}/);
    expect(results).toMatch(/navigate\(`\$\{location\.pathname\}\$\{location\.search\}`, \{ replace: true, state \}\)/);
  });

  it('the modify bar and the search form arrive open on the traveller picker when asked', () => {
    expect(modifyBar).toMatch(/const \[expanded, setExpanded\] = useState\(Boolean\(openTravellers\)\)/);
    expect(modifyBar).toMatch(/<FlightSearchForm initialData=\{searchParams\} onSearch=\{handleSearch\} openTravellers=\{openTravellers\} \/>/);
    expect(form).toMatch(/const \[showTravellers, setShowTravellers\] = useState\(Boolean\(openTravellers\)\)/);
  });

  it('the URL the button builds brings back the same route, date and travellers', () => {
    const search = {
      from: 'New Delhi (DEL)', to: 'JAI', departDate: '2026-09-21', returnDate: '',
      adults: 2, children: 1, infants: 1, travelClass: 'BUSINESS',
    };

    expect(searchFromQuery(`?${searchToQuery(search)}`)).toMatchObject({
      from: 'DEL', to: 'JAI', departDate: '2026-09-21', adults: 2, children: 1, infants: 1, travelClass: 'BUSINESS',
    });
  });
});
