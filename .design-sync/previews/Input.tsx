import React from 'react';
import { Input } from 'jetset13';

/** Label + placeholder, the shape most booking forms use. */
export const Basic = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 340 }}>
    <Input label="Leaving from" placeholder="City or airport" defaultValue="San Francisco (SFO)" />
    <Input label="Email address" type="email" placeholder="you@example.com" required />
  </div>
);

/** The variant axis — border treatment, everything else held constant. */
export const Variants = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 340 }}>
    <Input label="Default" variant="default" placeholder="Grand Cayman" />
    <Input label="Filled" variant="filled" placeholder="Grand Cayman" />
    <Input label="Outlined" variant="outlined" placeholder="Grand Cayman" />
  </div>
);

/** Three sizes at one variant. */
export const Sizes = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 340 }}>
    <Input size="sm" placeholder="Small — promo code" />
    <Input size="md" placeholder="Medium — passenger name" />
    <Input size="lg" placeholder="Large — search destinations" />
  </div>
);

/** Error and disabled render statically; both are common in checkout. */
export const States = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 340 }}>
    <Input
      label="Passport number"
      defaultValue="X1234"
      error
      errorMessage="Passport numbers are 9 characters."
    />
    <Input label="Booking reference" defaultValue="JS-40182" disabled />
  </div>
);

/** Icons are inset either side of the field. */
export const WithIcons = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 340 }}>
    <Input label="Search" leftIcon={<span aria-hidden="true">⌕</span>} placeholder="Cruises to Alaska" />
    <Input label="Travellers" rightIcon={<span aria-hidden="true">▾</span>} defaultValue="2 adults" />
  </div>
);
