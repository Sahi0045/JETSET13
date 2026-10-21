/** A published sailing in the shape the Android app's cruise screens read. No price: the app would show it as fact. */
export const toAppCruise = (s) => ({
  id: s.slug,
  name: s.title,
  cruise_line: s.line_name,
  ship: s.ship_name,
  duration: s.nights,
  departure_port: s.start_port,
  destinations: (s.port_names ?? []).filter((name) => name !== s.start_port && name !== s.end_port),
  image: s.photo?.url ?? null,
  departure_date: s.next_date,
});
