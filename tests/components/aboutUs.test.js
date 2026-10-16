import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (file) => readFileSync(path.resolve(process.cwd(), 'frontend/src/Pages', file), 'utf8');

// Google Play checks an organisation's details against its Dun & Bradstreet
// record (D-U-N-S 12-839-5393: 513 W Bonaventure Ave, Tracy, CA 95391); the
// About page said New York while every other page gave Tracy.
describe('the headquarters on the About page', () => {
  const about = read('AboutUs.jsx');

  it('is the registered address the Contact page gives', () => {
    expect(read('ContactUs.jsx')).toMatch(/513 W Bonaventure Ave/);
    expect(about).toMatch(/513 W Bonaventure Ave/);
    expect(about).toMatch(/Tracy, CA 95391/);
  });

  it('is not New York', () => {
    expect(about).not.toMatch(/city: "New York"/);
  });
});

// The owner, 17 Oct 2026: these figures "are not real". Jetsetters went live
// in October 2026; claims it cannot back are what DDA 11.4 forbids.
describe('the About page makes no claims the company cannot back', () => {
  const about = read('AboutUs.jsx');

  it.each([
    ['travellers served', /2M\+|millions/i],
    ['countries served', /150\+/],
    ['travel experts', /500\+/],
    ['founding year', /2009/],
    ['industry ranking', /leading travel platforms/i],
  ])('no %s figure', (_, claim) => {
    expect(about).not.toMatch(claim);
  });
});
