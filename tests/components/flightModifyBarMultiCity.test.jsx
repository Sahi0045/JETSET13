import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import FlightModifyBar from '../../frontend/src/Pages/Common/flights/FlightModifyBar.jsx';

describe('the modify bar on a multi-city search', () => {
  it('shows every stop of the route and every date', () => {
    render(
      <MemoryRouter>
        <FlightModifyBar
          searchParams={{
            tripType: 'multiCity',
            legs: [
              { from: 'DEL', to: 'DXB', departDate: '2026-11-24' },
              { from: 'DXB', to: 'LHR', departDate: '2026-11-28' },
              { from: 'LHR', to: 'DEL', departDate: '2026-12-05' },
            ],
            from: 'DEL', to: 'DEL', departDate: '2026-11-24', adults: 1,
          }}
          cityMap={{ DEL: 'Delhi', DXB: 'Dubai', LHR: 'London' }}
        />
      </MemoryRouter>,
    );

    expect(screen.getAllByText('DEL')).toHaveLength(2);
    expect(screen.getByText('DXB')).toBeTruthy();
    expect(screen.getByText('LHR')).toBeTruthy();
    expect(screen.getByText(/24 Nov.*28 Nov.*05 Dec/)).toBeTruthy();
  });
});
