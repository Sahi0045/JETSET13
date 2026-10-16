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
