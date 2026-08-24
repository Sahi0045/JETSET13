import React from 'react';
import { Breadcrumbs, MemoryRouter } from 'jetset13';

/**
 * Breadcrumbs takes no props — it derives the whole trail from the current
 * route, so each cell is the component under a different route.
 */
const AtRoute = ({ path }: { path: string }) => (
  <MemoryRouter initialEntries={[path]}>
    <Breadcrumbs />
  </MemoryRouter>
);

/** A typical booking-flow depth. */
export const BookingFlow = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
    <AtRoute path="/cruise/booking" />
    <AtRoute path="/flights/search" />
    <AtRoute path="/hotels/details" />
  </div>
);

/** Known labels are overridden so URL slugs read properly ("faqs" → "FAQs"). */
export const LabelOverrides = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
    <AtRoute path="/faqs" />
    <AtRoute path="/my-trips" />
  </div>
);

/** Numeric and UUID segments collapse to a generic "Details" crumb. */
export const DynamicSegments = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
    <AtRoute path="/cruises/40182" />
    <AtRoute path="/visa/track/9f2c1b4a8d7e" />
  </div>
);
