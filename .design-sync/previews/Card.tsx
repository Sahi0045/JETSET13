import React from 'react';
import { Card, Button } from 'jetset13';

/** The full compound: Header / Title / Description / Content / Footer. */
export const Composed = () => (
  <Card style={{ maxWidth: 380 }}>
    <Card.Header>
      <Card.Title>Caribbean Explorer</Card.Title>
      <Card.Description>7 nights · Royal Caribbean · departs Miami</Card.Description>
    </Card.Header>
    <Card.Content>
      <p style={{ margin: 0, color: '#626363' }}>
        Round-trip from Miami with stops at Cozumel, Grand Cayman and Falmouth.
        Balcony staterooms include the drinks package and Wi-Fi for two guests.
      </p>
    </Card.Content>
    <Card.Footer>
      <span style={{ fontWeight: 700, color: '#0C2A33' }}>$1,299 / guest</span>
      <Button size="sm">View itinerary</Button>
    </Card.Footer>
  </Card>
);

/** The variant axis — the prop that most changes how a card reads. */
export const Variants = () => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
    <Card variant="default">
      <Card.Title>Default</Card.Title>
      <Card.Description>Flat surface for dense lists.</Card.Description>
    </Card>
    <Card variant="elevated">
      <Card.Title>Elevated</Card.Title>
      <Card.Description>Teal-tinted shadow lifts it off the page.</Card.Description>
    </Card>
    <Card variant="outlined">
      <Card.Title>Outlined</Card.Title>
      <Card.Description>Border instead of shadow.</Card.Description>
    </Card>
  </div>
);

/**
 * `glass` is `bg-white/10` — it is built to sit on a dark or photographic
 * backdrop, so the title and description need light text passed through
 * className. The default dark ink colours are unreadable on it.
 */
export const Glass = () => (
  <div
    style={{
      background: 'linear-gradient(135deg, #0C2A33 0%, #055B75 55%, #65B3CF 100%)',
      padding: 32,
      borderRadius: 16,
    }}
  >
    <Card variant="glass" style={{ maxWidth: 340 }}>
      <Card.Title style={{ color: '#ffffff' }}>Santorini Escape</Card.Title>
      <Card.Description style={{ color: 'rgba(255,255,255,0.82)' }}>
        5 nights · half board · airport transfers
      </Card.Description>
    </Card>
  </div>
);

/** The padding scale, held at one variant so only spacing changes. */
export const Padding = () => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' }}>
    {(['sm', 'md', 'lg'] as const).map((p) => (
      <Card key={p} variant="outlined" padding={p}>
        <Card.Title>padding=&quot;{p}&quot;</Card.Title>
      </Card>
    ))}
  </div>
);
