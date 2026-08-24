import React from 'react';
import { FullPageBanner } from 'jetset13';

/**
 * A full-viewport splash shown on first load that dismisses itself after
 * VITE_FULL_BANNER_MS (4s by default), or when the visitor hits Skip.
 *
 * The stage sets `transform` so the component's `position: fixed` resolves
 * against it rather than the viewport. As with ContactBanner, the artwork is a
 * host-app asset the design system does not ship, so what renders here is the
 * overlay chrome and the Skip control over the brand blue field.
 */
export const Splash = () => (
  <div style={{ position: 'relative', transform: 'translateZ(0)', height: 420, minWidth: 640 }}>
    <FullPageBanner />
  </div>
);
