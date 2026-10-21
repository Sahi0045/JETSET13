import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import Breadcrumbs from '../../frontend/src/Components/Breadcrumbs.jsx';

describe('breadcrumbs on a cruise page', () => {
  it('lead back to the cruise list and name the sailing, not its address', () => {
    render(<MemoryRouter initialEntries={['/cruise/western-caribbean-7-nights-ab12']}><Breadcrumbs /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Cruises' }).getAttribute('href')).toBe('/cruises');
    expect(screen.getByText('Western Caribbean')).toBeTruthy();
    expect(screen.queryByText(/Ab12|7 Nights/)).toBeNull();
  });
});
