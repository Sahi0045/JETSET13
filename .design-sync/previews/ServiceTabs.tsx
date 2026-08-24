import React from 'react';
import { ServiceTabs, MemoryRouter } from 'jetset13';

/** Tapping a tab navigates, so the component needs a router in scope. */
const Stage = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter initialEntries={['/cruise']}>{children}</MemoryRouter>
);

/** The active prop is the only axis — it moves the underline and the ink colour. */
export const ActiveStates = () => (
  <Stage>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 560 }}>
      {(['cruise', 'flight', 'packages', 'hotels'] as const).map((k) => (
        <div key={k} style={{ borderBottom: '1px solid #e5e7eb', paddingBottom: 6 }}>
          <ServiceTabs active={k} />
        </div>
      ))}
    </div>
  </Stage>
);

/** Sitting under a landing-page header, which is where it is dropped in. */
export const OnLanding = () => (
  <Stage>
    <div style={{ maxWidth: 560, background: '#fff', borderRadius: 12, boxShadow: '0 4px 25px -5px rgba(5,91,117,0.08)' }}>
      <div style={{ padding: '16px 20px 4px', fontFamily: 'Lato, Inter, sans-serif' }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#0C2A33' }}>Plan your trip</div>
      </div>
      <ServiceTabs active="cruise" />
    </div>
  </Stage>
);
