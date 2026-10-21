import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = (file) => path.resolve(process.cwd(), file);
const read = (file) => readFileSync(root(file), 'utf8');

describe('the cruise checkout is gone from the web', () => {
  it('has no checkout pages', () => {
    expect(existsSync(root('frontend/src/Pages/Common/cruise/CruiseBookingSummary.jsx'))).toBe(false);
    expect(existsSync(root('frontend/src/Pages/Common/cruise/CruiseBookingSuccess.jsx'))).toBe(false);
  });

  it('sends old checkout links to the cruise list', () => {
    const app = read('frontend/src/app.jsx');
    expect(app).not.toMatch(/CruiseBookingSummary|CruiseBookingSuccess/);
    expect(app).toMatch(/<Route path="\/cruise-booking-summary" element={<Navigate to="\/cruises" replace \/>} \/>/);
    expect(app).toMatch(/<Route path="\/cruise-booking-success" element={<Navigate to="\/cruises" replace \/>} \/>/);
  });

  it('lands a cruise paid on an older page in My Trips', () => {
    expect(read('frontend/src/Pages/Common/PaymentCallback.jsx')).toMatch(/cruise: '\/my-trips'/);
  });

  it('asks the customer to call or email instead of booking', () => {
    const itinerary = read('frontend/src/Pages/Common/cruise/Itinerary.jsx');
    const contacts = read('frontend/src/Pages/Common/cruise/catalog.js');
    expect(itinerary).not.toMatch(/cruise-booking-summary|bookingUrl/);
    expect(itinerary).toMatch(/CRUISE_PHONE\.href/);
    expect(itinerary).toMatch(/inquiryMail\(/);
    expect(contacts).toContain('tel:+18775387380');
    expect(contacts).toContain("CRUISE_EMAIL = 'support@jetsetterss.com'");
  });
});
