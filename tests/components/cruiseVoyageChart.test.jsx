import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('world-atlas/land-50m.json', () => ({
  default: { type: 'Topology', objects: { land: { type: 'GeometryCollection', geometries: [] } }, arcs: [] },
}));

import VoyageChart from '../../frontend/src/Pages/Common/cruise/map/VoyageChart.jsx';
import RouteThumb from '../../frontend/src/Pages/Common/cruise/map/RouteThumb.jsx';
import { chartFrame, nearestRouteIndex } from '../../frontend/src/Pages/Common/cruise/map/geometry.js';

const MIAMI = { name: 'Miami', country: 'United States', lat: 25.78, lon: -80.18 };
const NASSAU = { name: 'Nassau', country: 'Bahamas', lat: 25.08, lon: -77.34 };
const DAYS = [
  { day: 1, port: MIAMI, arrive: null, depart: '16:00' },
  { day: 2, port: null, arrive: null, depart: null },
  { day: 3, port: NASSAU, arrive: '08:00', depart: '17:00' },
  { day: 4, port: MIAMI, arrive: '07:00', depart: null },
];
const ROUTE = { type: 'LineString', coordinates: [[-80.18, 25.78], [-79, 25.6], [-77.34, 25.08], [-79, 25.4], [-80.18, 25.78]] };

describe('the voyage chart', () => {
  it('draws a labelled dot per port and marks the active one', () => {
    const { container } = render(<VoyageChart route={ROUTE} days={DAYS} activeDay={3} onPickDay={() => {}} />);
    expect(screen.getAllByText('Miami')).toHaveLength(1);
    expect(screen.getByText('Nassau')).toBeTruthy();
    const active = container.querySelectorAll('[data-active="true"]');
    expect(active).toHaveLength(1);
    expect(active[0].textContent).toContain('Nassau');
    expect(container.querySelector('[data-route]')).toBeTruthy();
    expect(container.querySelector('[data-ship]')).toBeTruthy();
  });

  it('crosses the 180° line without throwing', () => {
    const route = { type: 'LineString', coordinates: [[-157.86, 21.3], [179.5, 30], [-179.5, 31], [139.64, 35.45]] };
    const days = [
      { day: 1, port: { name: 'Honolulu', country: 'United States', lat: 21.3, lon: -157.86 }, arrive: null, depart: '20:00' },
      { day: 2, port: null, arrive: null, depart: null },
      { day: 3, port: { name: 'Yokohama', country: 'Japan', lat: 35.45, lon: 139.64 }, arrive: '07:00', depart: null },
    ];
    expect(() => render(<VoyageChart route={route} days={days} activeDay={2} onPickDay={() => {}} />)).not.toThrow();
    expect(screen.getByText('Yokohama')).toBeTruthy();
  });

  it('draws the ports alone when there is no route', () => {
    const { container } = render(<VoyageChart route={null} days={DAYS} activeDay={1} onPickDay={() => {}} />);
    expect(container.querySelector('[data-route]')).toBeNull();
    expect(container.querySelectorAll('[data-port]')).toHaveLength(2);
  });

  it('picks a day from a port with the mouse, and leaves keyboard users to the day list', () => {
    const onPickDay = vi.fn();
    const { container } = render(<VoyageChart route={ROUTE} days={DAYS} activeDay={1} onPickDay={onPickDay} />);
    fireEvent.click(container.querySelector('[data-port-name="Nassau"]'));
    expect(onPickDay).toHaveBeenCalledWith(3);
    expect(container.querySelectorAll('[tabindex]')).toHaveLength(0);
  });

  it('clips the coastlines to what the chart shows', () => {
    const { projection } = chartFrame({ route: ROUTE, ports: [MIAMI, NASSAU], width: 860, height: 430 });
    expect(projection.clipExtent()).toEqual([[0, 0], [860, 430]]);
  });

  it('frames a single port without an endless zoom', () => {
    const { projection } = chartFrame({ route: null, ports: [MIAMI], width: 400, height: 200 });
    const [x, y] = projection([MIAMI.lon, MIAMI.lat]);
    expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
    expect(x).toBeGreaterThan(0);
    expect(x).toBeLessThan(400);
  });

  it('keeps every port clear of the day card at the bottom of the chart', () => {
    const ROATAN = { name: 'Roatán', country: 'Honduras', lat: 16.32, lon: -86.54 };
    const { projection } = chartFrame({ route: null, ports: [MIAMI, ROATAN], width: 860, height: 430, reserveBottom: 120 });
    for (const port of [MIAMI, ROATAN]) expect(projection([port.lon, port.lat])[1]).toBeLessThanOrEqual(430 - 120 + 1e-6);
  });

  it('finds the route point nearest a port', () => {
    expect(nearestRouteIndex(ROUTE, NASSAU)).toBe(2);
  });
});

describe('the route thumbnail', () => {
  it('draws one route line and a dot per port', () => {
    const { container } = render(<RouteThumb route={ROUTE} ports={[MIAMI, NASSAU]} width={300} height={110} />);
    expect(container.querySelectorAll('path')).toHaveLength(1);
    expect(container.querySelectorAll('circle')).toHaveLength(2);
  });

  it('draws nothing broken without a route', () => {
    const { container } = render(<RouteThumb route={null} ports={[MIAMI]} width={300} height={110} />);
    expect(container.querySelector('svg')).toBeTruthy();
    expect(container.innerHTML).not.toMatch(/NaN|undefined/);
  });
});
