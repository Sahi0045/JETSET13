import React from 'react';
import { Button } from 'jetset13';

/** Every variant, in the order a booking flow tends to reach for them. */
export const Variants = () => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
    <Button variant="primary">Search flights</Button>
    <Button variant="secondary">Modify search</Button>
    <Button variant="outline">View itinerary</Button>
    <Button variant="ghost">Skip for now</Button>
    <Button variant="success">Confirm booking</Button>
    <Button variant="danger">Cancel trip</Button>
  </div>
);

/** The three sizes, all primary so the scale is the only thing changing. */
export const Sizes = () => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
    <Button size="sm">Add bag</Button>
    <Button size="md">Continue to payment</Button>
    <Button size="lg">Book this cruise</Button>
  </div>
);

/** Statically renderable states. `loading` also blocks interaction. */
export const States = () => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
    <Button>Continue</Button>
    <Button loading>Processing payment</Button>
    <Button disabled>Sold out</Button>
    <Button variant="outline" disabled>Unavailable</Button>
  </div>
);

/** Icons sit either side of the label; fullWidth stretches to the container. */
export const IconsAndFullWidth = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 320 }}>
    <Button leftIcon={<span aria-hidden="true">✈</span>}>Add a flight</Button>
    <Button variant="outline" rightIcon={<span aria-hidden="true">→</span>}>
      Choose your cabin
    </Button>
    <Button variant="primary" fullWidth>
      Pay $1,299.00
    </Button>
  </div>
);
