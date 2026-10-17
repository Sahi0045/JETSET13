import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = (file) => path.resolve(process.cwd(), file);
const read = (file) => readFileSync(root(file), 'utf8');

// PR #222 fixed AboutUs.jsx, which no route rendered: /about redirects to
// /company. These tests read the page the redirect actually lands on.
describe('the About page visitors reach', () => {
  it('is Company.jsx at /company', () => {
    const redirects = JSON.parse(read('vercel.json')).redirects;
    expect(redirects).toContainEqual(expect.objectContaining({ source: '/about', destination: '/company' }));
    expect(read('frontend/src/app.jsx')).toMatch(/<Route path="\/company" element={<Company \/>} \/>/);
    expect(existsSync(root('frontend/src/Pages/AboutUs.jsx'))).toBe(false);
  });
});

// Google Play checks an organisation's details against its Dun & Bradstreet
// record (D-U-N-S 12-839-5393: 513 W Bonaventure Ave, Tracy, CA 95391).
describe('the headquarters on the About page', () => {
  const company = read('frontend/src/Pages/Company.jsx');

  it('is the registered address the Contact page gives', () => {
    expect(read('frontend/src/Pages/ContactUs.jsx')).toMatch(/513 W Bonaventure Ave/);
    expect(company).toMatch(/513 W Bonaventure Ave/);
    expect(company).toMatch(/Tracy, CA 95391/);
  });
});

// The owner, 17 Oct 2026: these figures "are not real". Jetsetters went live
// in October 2026; claims it cannot back are what DDA 11.4 forbids.
describe('the About page makes no claims the company cannot back', () => {
  const company = read('frontend/src/Pages/Company.jsx');

  it.each([
    ['travellers served', /2M\+|2 million|millions/i],
    ['countries served', /150\+|50 countries/],
    ['years of experience', /15\+|Years of Experience/],
    ['customer rating', /4\.9\/5|Customer Rating/],
    ['founding year', /2009|Founded in/],
    ['industry ranking', /top 10|industry leader/i],
    ['made-up milestones', /First Million|garage|carbon-neutral|AI-powered/i],
    ['made-up leadership team', /Sarah Mitchell|Michael Chen|Emily Rodriguez|David Thompson|Leadership Team/],
  ])('no %s', (_, claim) => {
    expect(company).not.toMatch(claim);
  });
});
