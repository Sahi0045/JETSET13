import React, { useEffect, useMemo, useState } from 'react';
import { chartFrame, loadLand, portStops, shipPosition } from './geometry';

const WIDTH = 860;
const HEIGHT = 430;
// The day card sits over the bottom-left of the chart; ports stay above it.
const CARD_SPACE = 120;

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export default function VoyageChart({ route, days, activeDay, onPickDay }) {
  const [land, setLand] = useState(null);
  useEffect(() => {
    let live = true;
    loadLand().then((shape) => { if (live) setLand(shape); }).catch(() => {});
    return () => { live = false; };
  }, []);

  const stops = useMemo(() => portStops(days), [days]);
  const { projection, path } = useMemo(
    () => chartFrame({ route, ports: stops.map((s) => s.port), width: WIDTH, height: HEIGHT, reserveBottom: CARD_SPACE }),
    [route, stops],
  );
  const activePort = days.find((d) => d.day === activeDay)?.port ?? null;
  const ship = shipPosition(route, days, activeDay);
  const shipXY = ship ? projection(ship) : null;
  const motion = !reducedMotion();

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Map of the voyage" className="block h-full w-full">
      <defs>
        <filter id="voyage-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <rect width={WIDTH} height={HEIGHT} fill="#032B37" />
      {land && <path d={path(land) ?? ''} fill="#0B4A5C" stroke="rgba(101,179,207,0.25)" strokeWidth="0.8" />}
      {route && (
        <path data-route d={path(route) ?? ''} fill="none" stroke="#65B3CF" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" filter="url(#voyage-glow)" />
      )}
      {stops.map((stop) => {
        const [x, y] = projection([stop.port.lon, stop.port.lat]);
        const active = activePort && stop.key === `${activePort.name}|${activePort.country}`;
        const day = stop.days.find((d) => d >= activeDay) ?? stop.days[0];
        return (
          <g
            key={stop.key}
            data-port
            data-active={active ? 'true' : 'false'}
            role="button"
            tabIndex={0}
            aria-label={`${stop.port.name}, day ${day}`}
            className="cursor-pointer outline-none"
            onClick={() => onPickDay(day)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPickDay(day); } }}
          >
            <circle cx={x} cy={y} r={active ? 7 : 5.5} fill={active ? '#F3C58F' : '#021C25'} stroke={active ? '#F3C58F' : '#FFFFFF'} strokeWidth="2" />
            <text x={x + 11} y={y - 7} fill="#E3F4F9" fontSize="12" fontFamily="'IBM Plex Mono', monospace">{stop.port.name}</text>
          </g>
        );
      })}
      {shipXY && (
        <circle
          data-ship
          r="8"
          cx="0"
          cy="0"
          fill="#FFFFFF"
          style={{ transform: `translate(${shipXY[0]}px, ${shipXY[1]}px)`, transition: motion ? 'transform 900ms ease-in-out' : 'none', filter: 'drop-shadow(0 0 8px #fff)' }}
        />
      )}
    </svg>
  );
}
