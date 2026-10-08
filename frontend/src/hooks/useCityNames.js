import { useEffect, useMemo, useState } from 'react';
import { allAirports } from '../Pages/Common/flights/airports.js';
import { resolveCityNames } from '../Services/AirportService.js';

const BUILT_IN_NAMES = Object.freeze(Object.fromEntries(allAirports.map((airport) => [airport.code, airport.name])));

/** Every airport code a flight, as the flight pages hold it, touches. */
export const airportCodesOf = (flight) => {
  if (!flight) return [];
  const legs = [flight, flight.returnLeg].filter(Boolean);
  return legs.flatMap((leg) => [
    leg.departure?.airport,
    leg.arrival?.airport,
    ...(leg.segments || []).flatMap((segment) => [segment.departure?.airport, segment.arrival?.airport]),
    ...(leg.stopDetails || []).map((stop) => stop.airport),
  ]).filter(Boolean);
};

/**
 * Code-to-city-name map: the built-in airport list, plus names looked up from
 * the airport API for any of `codes` it lacks.
 */
export default function useCityNames(codes = []) {
  const [lookedUp, setLookedUp] = useState({});
  const missing = [...new Set(codes.map((code) => String(code || '').toUpperCase()))]
    .filter((code) => /^[A-Z]{3}$/.test(code) && !BUILT_IN_NAMES[code])
    .sort()
    .join(',');

  useEffect(() => {
    if (!missing) return undefined;
    let cancelled = false;
    resolveCityNames(missing.split(',')).then((found) => {
      if (!cancelled && Object.keys(found).length > 0) setLookedUp((previous) => ({ ...previous, ...found }));
    });
    return () => { cancelled = true; };
  }, [missing]);

  return useMemo(() => ({ ...BUILT_IN_NAMES, ...lookedUp }), [lookedUp]);
}
