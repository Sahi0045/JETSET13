import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { searchFromQuery, searchToQuery } from '../../frontend/src/Pages/Common/flights/searchQuery.js';

/**
 * Who is travelling decides the fare: the airline prices an exact group, so a
 * traveller cannot simply be added to a fare. Customers could not tell. The
 * results card labelled a two-adult total "per adult", and the review page only
 * said "please search again", with no way back to the search.
 *
 * The review page now changes the group itself, the way Amadeus prices it -
 * the same fare searched again for the new group - and can still go back to
 * the results.
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

describe('adding or removing travellers on the review page', () => {
  it('re-searches the same route for the new group and takes only the same fare', () => {
    expect(review).toMatch(/const search = searchForGroup\(reviewState\?\.searchData, offer, group\)/);
    expect(review).toMatch(/fetch\(apiConfig\.endpoints\.flights\.search,/);
    expect(review).toMatch(/const match = findSameFare\(offer, body\.data\)/);
  });

  it('changes nothing, and says so, when the group cannot have this fare', () => {
    expect(review).toMatch(/if \(!match\?\.originalOffer\) \{\s*setGroupChange\(\{ busy: false, problem: null, unavailable: \{ group, search \} \}\);\s*return;/);
  });

  it('swaps in the new offer, checks its price again and keeps what was typed', () => {
    expect(review).toMatch(/setPassengerData\(\(current\) => rebuildTravellers\(current, match\.originalOffer\.travelerPricings, blankTraveller\)\)/);
    expect(review).toMatch(/setPricedFare\(null\);/);
    expect(review).toMatch(/state: \{ \.\.\.\(routerLocation\.state \|\| \{\}\), flightData, searchData:/);
    expect(review).toMatch(/contact: previous\.contact/);
  });

  it('refuses a group Amadeus cannot book before searching, and cannot pay mid-change', () => {
    expect(review).toMatch(/const problem = travellerGroupProblem\(group\)/);
    expect(review).toMatch(/if \(checkingOut \|\| groupChange\.busy\) return;/);
  });
});

describe('going back to the results to change who is travelling', () => {
  it('the review page goes back to the same search with the traveller picker open', () => {
    expect(review).toMatch(/onSearchAgain=\{changeTravellers\}/);
    expect(review).toMatch(/navigate\(`\/flights\/search\?\$\{searchToQuery\(search\)\}`, \{ state: \{ searchData: search, editTravellers: true \} \}\)/);
  });

  it('the results page opens the picker once, then drops the flag', () => {
    expect(results).toMatch(/const \[openTravellers\] = useState\(\(\) => Boolean\(location\.state\?\.editTravellers\)\)/);
    expect(results).toMatch(/openTravellers=\{openTravellers\}/);
    expect(results).toMatch(/navigate\(`\$\{location\.pathname\}\$\{location\.search\}`, \{ replace: true, state \}\)/);
  });

  it('the modify bar and the search form arrive open on the traveller picker when asked', () => {
    // `openTravellers` still opens the bar. Pinned as "does the initial state
    // read openTravellers" rather than as one exact expression: the bar also
    // opens for a results page with no search at all, and the literal form of
    // the line is not what this test is about.
    expect(modifyBar).toMatch(/const \[expanded, setExpanded\] = useState\([^)]*Boolean\(openTravellers\)/);
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
