import React from 'react';
import { CurrencySelector } from 'jetset13';

/**
 * The closed control. Clicking it opens a list of ten supported currencies;
 * selecting one broadcasts a `currencyChanged` event that every Price on the
 * page listens for. The open state is interaction-driven and is not captured
 * here.
 */
export const Closed = () => (
  <div style={{ padding: 8 }}>
    <CurrencySelector />
  </div>
);

/** Where it actually lives — pinned to the right of a site header. */
export const InHeader = () => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 24,
      padding: '12px 20px',
      background: '#FBF9F4',
      border: '1px solid #F3EEE4',
      borderRadius: 12,
    }}
  >
    <strong style={{ color: '#0C2A33', fontFamily: 'Lato, Inter, sans-serif' }}>Jetsetters</strong>
    <CurrencySelector />
  </div>
);
