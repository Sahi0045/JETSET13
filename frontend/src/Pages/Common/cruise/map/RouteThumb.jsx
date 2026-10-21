import React from 'react';

/**
 * A small sketch of the route for a sailing card. A plain equirectangular fit,
 * so the cards load no map library; the sailing page draws the real chart.
 */
export default function RouteThumb({ route, ports, width = 300, height = 110, padding = 14 }) {
  const points = [...(route?.coordinates ?? []), ...ports.map((p) => [p.lon, p.lat])];
  if (!points.length) return <svg viewBox={`0 0 ${width} ${height}`} className="block h-full w-full" aria-hidden="true" />;

  // Shift longitudes next to the first point so a Pacific crossing doesn't span the card.
  const anchor = points[0][0];
  const unwrap = ([lon, lat]) => [lon - anchor > 180 ? lon - 360 : lon - anchor < -180 ? lon + 360 : lon, lat];
  const unwrapped = points.map(unwrap);
  const xs = unwrapped.map(([lon]) => lon);
  const ys = unwrapped.map(([, lat]) => lat);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, (maxY - minY) * ((width - 2 * padding) / (height - 2 * padding)), 1);
  const scale = (width - 2 * padding) / span;
  const offsetX = (width - (maxX - minX) * scale) / 2;
  const offsetY = (height - (maxY - minY) * scale) / 2;
  const toXY = (coordinate) => {
    const [lon, lat] = unwrap(coordinate);
    return [offsetX + (lon - minX) * scale, offsetY + (maxY - lat) * scale];
  };

  const line = route?.coordinates?.length
    ? route.coordinates.map((c, i) => `${i ? 'L' : 'M'}${toXY(c).map((n) => n.toFixed(1)).join(',')}`).join(' ')
    : null;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="block h-full w-full" aria-hidden="true">
      {line && <path d={line} fill="none" stroke="#65B3CF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 0 4px rgba(101,179,207,0.8))' }} />}
      {ports.map((p) => {
        const [x, y] = toXY([p.lon, p.lat]);
        return <circle key={`${p.name}|${p.country}`} cx={x.toFixed(1)} cy={y.toFixed(1)} r="3" fill="#FFFFFF" />;
      })}
    </svg>
  );
}
