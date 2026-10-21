import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import DestinationSection from '../../frontend/src/Pages/Common/cruise/DestinationSection.jsx';
import CruiseLineSection from '../../frontend/src/Pages/Common/cruise/CruiseLineSection.jsx';

const broken = /undefined|NaN|\$\s*(?!\d)/;

describe('cruise sections with the made-up fields gone', () => {
  it('renders the destinations with nothing missing', () => {
    const { container } = render(<MemoryRouter><DestinationSection /></MemoryRouter>);
    expect(container.textContent.length).toBeGreaterThan(0);
    expect(container.textContent).not.toMatch(broken);
  });

  it('renders the cruise lines with nothing missing', async () => {
    const { container } = render(<MemoryRouter><CruiseLineSection /></MemoryRouter>);
    await screen.findAllByText(/Royal Caribbean/);
    expect(container.textContent).not.toMatch(broken);
  });
});
