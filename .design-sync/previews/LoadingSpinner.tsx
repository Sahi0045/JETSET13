import React from 'react';
import { LoadingSpinner } from 'jetset13';

/** Inline — the form most screens use, sized by its container. */
export const Inline = () => (
  <div style={{ maxWidth: 420 }}>
    <LoadingSpinner />
  </div>
);

/** The status text doubles as the accessible label. */
export const CustomText = () => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
    <div style={{ flex: '1 1 260px' }}>
      <LoadingSpinner text="Searching 400+ airlines…" />
    </div>
    <div style={{ flex: '1 1 260px' }}>
      <LoadingSpinner text="Confirming your cabin…" />
    </div>
  </div>
);
