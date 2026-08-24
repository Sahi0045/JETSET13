import React from 'react';
import { Price } from 'jetset13';

/**
 * Amounts are always given in USD; the component converts and formats into
 * whichever currency the viewer has selected.
 */
export const Amounts = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontFamily: 'Lato, Inter, sans-serif' }}>
    <Price amount={1299} />
    <Price amount={249.5} />
    <Price amount="89" />
  </div>
);

/**
 * showCode appends the ISO code — but the code is rendered with a hardcoded
 * `text-white`, so it is only legible on a dark surface. Shown here on the
 * brand teal, which is the only context it currently works in.
 */
export const WithCurrencyCode = () => (
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      padding: 20,
      background: '#055B75',
      borderRadius: 12,
      color: '#ffffff',
      fontFamily: 'Lato, Inter, sans-serif',
    }}
  >
    <Price amount={1299} showCode className="text-white" />
    <Price amount={7480} showCode className="text-white" />
  </div>
);

/** In context: styled up as the headline price on a fare card. */
export const InContext = () => (
  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
    <Price amount={1299} className="text-3xl font-bold text-ink" />
    <span style={{ color: '#626363', fontSize: 14 }}>per guest, taxes included</span>
  </div>
);
