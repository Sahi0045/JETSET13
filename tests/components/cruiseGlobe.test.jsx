import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CruiseGlobe from '../../frontend/src/Pages/Common/cruise/map/CruiseGlobe.jsx';

const REGIONS = [
  { key: 'caribbean', name: 'Caribbean', lat: 17, lon: -72, count: 4 },
  { key: 'alaska', name: 'Alaska', lat: 58, lon: -136, count: 1 },
];

describe('the cruise globe', () => {
  it('lists every region as a button with its sailing count', () => {
    render(<CruiseGlobe regions={REGIONS} selectedKey="caribbean" onSelect={() => {}} />);
    expect(screen.getByRole('button', { name: 'Caribbean · 4 sailings' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Alaska · 1 sailing' })).toBeTruthy();
  });

  it('marks the selected region', () => {
    render(<CruiseGlobe regions={REGIONS} selectedKey="alaska" onSelect={() => {}} />);
    expect(screen.getByRole('button', { name: 'Alaska · 1 sailing' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Caribbean · 4 sailings' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('selects a region from its button', () => {
    const onSelect = vi.fn();
    render(<CruiseGlobe regions={REGIONS} selectedKey="caribbean" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: 'Alaska · 1 sailing' }));
    expect(onSelect).toHaveBeenCalledWith('alaska');
  });

  it('shows the still globe without WebGL', () => {
    const { container } = render(<CruiseGlobe regions={REGIONS} selectedKey="caribbean" onSelect={() => {}} />);
    expect(container.querySelector('img[src="/images/cruise/globe-still.webp"]')).toBeTruthy();
    expect(container.querySelector('canvas')).toBeNull();
  });
});
