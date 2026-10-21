import { describe, expect, it } from 'vitest';
import { cruises } from '../../backend/data/catalog.js';

describe('the cruise catalog the app and pages read', () => {
  it('still lists cruise lines', () => {
    expect(cruises.length).toBeGreaterThan(0);
  });

  it('carries no made-up price, rating or review count', () => {
    for (const cruise of cruises) {
      for (const key of ['price', 'priceValue', 'price_per_person', 'rating', 'reviews']) {
        expect(cruise, `${cruise.name}.${key}`).not.toHaveProperty(key);
      }
    }
  });
});
