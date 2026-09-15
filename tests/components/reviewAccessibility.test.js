import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The review page's traveller form, for a screen reader and a keyboard.
 *
 * No label was tied to its input, so a screen reader announced each field as
 * "edit text"; the date of birth and passport expiry fields had no name at all.
 * The Male and Female buttons said which was chosen only by colour. Read from
 * source, like the other review page checks (customerSurfaces.test.js).
 */

// From the working directory: under jsdom, import.meta.url is not a file URL.
const review = readFileSync(path.resolve(process.cwd(), 'frontend/src/Pages/Common/flights/FlightBookingConfirmation.jsx'), 'utf8');

const FIELDS = ['firstName', 'lastName', 'dateOfBirth', 'mobile', 'email', 'passportNumber', 'passportExpiry', 'nationality'];

describe('the traveller form', () => {
  it.each(FIELDS)('ties the %s label to its field', (field) => {
    const id = `\\{\`traveller-\\$\\{passenger\\.id\\}-${field}\`\\}`;
    expect(review).toMatch(new RegExp(`htmlFor=${id}`));
    expect(review).toMatch(new RegExp(`\\bid=${id}`));
  });

  it('names the date fields, which had no accessible name', () => {
    expect(review).toMatch(/id=\{`traveller-\$\{passenger\.id\}-dateOfBirth`\}\s*type="date"/);
    expect(review).toMatch(/id=\{`traveller-\$\{passenger\.id\}-passportExpiry`\}\s*type="date"/);
  });

  it('says which gender is chosen, in a group named by its label', () => {
    expect(review).toMatch(/role="group" aria-labelledby=\{`traveller-\$\{passenger\.id\}-gender`\}/);
    expect(review).toMatch(/type="button"\s*aria-pressed=\{passenger\.gender === 'male'\}/);
    expect(review).toMatch(/type="button"\s*aria-pressed=\{passenger\.gender === 'female'\}/);
  });
});
