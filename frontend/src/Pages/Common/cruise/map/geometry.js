import { geoBounds, geoMercator, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';

const MIN_SPAN_DEGREES = 4;

const centreLongitude = ([[west], [east]]) => {
  // A voyage across the 180° line has its west edge east of its east edge.
  const centre = west <= east ? (west + east) / 2 : (west + east + 360) / 2;
  return centre > 180 ? centre - 360 : centre;
};

/** A Mercator projection fitted to the voyage, centred on it so a Pacific crossing stays in one piece. */
export const chartFrame = ({ route, ports, width, height, padding = 40, reserveBottom = 0 }) => {
  const points = [
    ...(route?.coordinates ?? []),
    ...ports.map((p) => [p.lon, p.lat]),
  ];
  const target = { type: 'MultiPoint', coordinates: points.length ? points : [[0, 0]] };
  const bounds = geoBounds(target);
  const centre = centreLongitude(bounds);

  // One port, or ports a few miles apart, would otherwise zoom without end.
  const [[west, south], [east, north]] = bounds;
  const lonSpan = west <= east ? east - west : east - west + 360;
  const latSpan = north - south;
  const midLat = (north + south) / 2;
  if (lonSpan < MIN_SPAN_DEGREES || latSpan < MIN_SPAN_DEGREES) {
    const half = MIN_SPAN_DEGREES / 2;
    target.coordinates = [...target.coordinates, [centre - half, midLat - half], [centre + half, midLat + half]];
  }

  const projection = geoMercator()
    .rotate([-centre, 0])
    .fitExtent([[padding, padding], [width - padding, height - Math.max(padding, reserveBottom)]], target)
    .clipExtent([[0, 0], [width, height]]);
  return { projection, path: geoPath(projection) };
};

let landPromise = null;

/** Natural Earth coastlines (public domain), fetched once and only where a chart is drawn. */
export const loadLand = () => {
  if (!landPromise) {
    landPromise = import('world-atlas/land-50m.json').then((module) => {
      const topology = module.default ?? module;
      return feature(topology, topology.objects.land);
    });
  }
  return landPromise;
};

export const nearestRouteIndex = (route, port) => {
  const coordinates = route?.coordinates ?? [];
  let best = -1;
  let bestDistance = Infinity;
  coordinates.forEach(([lon, lat], i) => {
    const dLon = Math.abs(lon - port.lon) % 360;
    const distance = Math.hypot(Math.min(dLon, 360 - dLon), lat - port.lat);
    if (distance < bestDistance) {
      best = i;
      bestDistance = distance;
    }
  });
  return best;
};

/** Distinct ports in the order the ship reaches them, each with the days it is there. */
export const portStops = (days) => {
  const stops = [];
  for (const d of days) {
    if (!d.port) continue;
    const key = `${d.port.name}|${d.port.country}`;
    const known = stops.find((s) => s.key === key);
    if (known) known.days.push(d.day);
    else stops.push({ key, port: d.port, days: [d.day] });
  }
  return stops;
};

/**
 * Where the ship is on a given day: at the port, or for a day at sea, halfway
 * along the route between the port before and the port after.
 */
export const shipPosition = (route, days, activeDay) => {
  const today = days.find((d) => d.day === activeDay);
  if (today?.port) return [today.port.lon, today.port.lat];
  const before = [...days].reverse().find((d) => d.day < activeDay && d.port);
  const after = days.find((d) => d.day > activeDay && d.port);
  if (!before && !after) return null;
  if (!before || !after) return [(before ?? after).port.lon, (before ?? after).port.lat];
  const from = nearestRouteIndex(route, before.port);
  const to = nearestRouteIndex(route, after.port);
  if (from >= 0 && to > from) return route.coordinates[Math.round((from + to) / 2)];
  return [(before.port.lon + after.port.lon) / 2, (before.port.lat + after.port.lat) / 2];
};
