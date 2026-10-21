import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = (file) => path.resolve(process.cwd(), file);
const read = (file) => readFileSync(root(file), 'utf8');

describe('the cruise pages customers reach', () => {
  const app = read('frontend/src/app.jsx');

  it('are the catalog pages', () => {
    expect(app).toMatch(/<Route path="\/cruises" element={<CruisesPage \/>} \/>/);
    expect(app).toMatch(/<Route path="\/cruise\/:slug" element={<CruiseSailingPage \/>} \/>/);
  });

  it('send the old cruise addresses to the cruise list', () => {
    for (const old of ['cruise', 'itinerary', 'cruise-booking-summary', 'cruise-booking-success']) {
      expect(app, old).toMatch(new RegExp(`<Route path="/${old}" element={<Navigate to="/cruises" replace />} />`));
    }
  });

  it('leave no old cruise page, checkout or static data behind', () => {
    for (const file of ['Homepage.jsx', 'cruise-cards.jsx', 'Itinerary.jsx', 'CruiseBookingSummary.jsx', 'CruiseBookingSuccess.jsx', 'HeroSection.jsx', 'data/cruiselines.json']) {
      expect(existsSync(root(`frontend/src/Pages/Common/cruise/${file}`)), file).toBe(false);
    }
    expect(existsSync(root('backend/data/cruiselines.data.js'))).toBe(false);
    expect(app).not.toMatch(/CruiseHomepage|CruiseCards|cruise\/Itinerary/);
  });

  it('take no cruise payment on the web', () => {
    expect(read('frontend/src/Pages/Common/PaymentCallback.jsx')).not.toMatch(/cruises\/bookings/);
    expect(read('backend/routes/cruise.routes.js')).not.toMatch(/router\.post\('\/bookings'/);
  });
});
