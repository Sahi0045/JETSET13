import { seaRoute } from 'searoute-ts';
import { PORTS } from 'searoute-ts/ports';

const point = ({ lat, lon }) => [lon, lat];
const samePlace = (a, b) => a.lat === b.lat && a.lon === b.lon;

const legCoordinates = (from, to, router) => {
  try {
    const coordinates = router(point(from), point(to))?.geometry?.coordinates;
    // The sea network snaps each end to its nearest lane node, which can be a
    // degree off the port, so the leg is pinned to the ports themselves.
    if (Array.isArray(coordinates) && coordinates.length > 0) return [point(from), ...coordinates, point(to)];
  } catch {
    // A port the network cannot reach still gets drawn, as a straight leg.
  }
  return [point(from), point(to)];
};

/** The voyage as one GeoJSON line along sea lanes, port to port; null with fewer than two places. */
export const routeForPorts = (ports, { router = seaRoute } = {}) => {
  const stops = ports.filter((port, i) => i === 0 || !samePlace(port, ports[i - 1]));
  if (stops.length < 2) return null;

  const coordinates = [];
  for (let i = 1; i < stops.length; i += 1) {
    const leg = legCoordinates(stops[i - 1], stops[i], router);
    coordinates.push(...(coordinates.length ? leg.slice(1) : leg));
  }
  return { type: 'LineString', coordinates };
};

const plain = (value) => String(value).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const PORT_LIST = Object.entries(PORTS).map(([unlocode, port]) => ({
  name: port.name,
  country: port.country,
  unlocode,
  lat: port.coordinates[1],
  lon: port.coordinates[0],
  key: plain(port.name),
}));

export const searchPorts = (query, limit = 20) => {
  const wanted = plain(query ?? '');
  if (!wanted) return [];
  return PORT_LIST
    .filter((port) => port.key.includes(wanted))
    .slice(0, limit)
    .map(({ key, ...port }) => port);
};
