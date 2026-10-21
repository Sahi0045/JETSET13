import supabase from '../../config/supabase.js';
import { todayInOffice } from './sailingInput.js';

const futureDates = (dates, today) => (dates ?? []).map((d) => d.sail_date).filter((date) => date >= today).sort();

/**
 * Published sailings customers can still book, as the cards, the app feed and
 * the sitemap all read them. A sailing whose dates have all passed is left out.
 */
export const listPublished = async ({ region } = {}) => {
  const today = todayInOffice();
  let query = supabase
    .from('cruise_sailings')
    .select('slug, title, headline, region, nights, from_price_usd, price_checked_on, photos, route, updated_at, line:cruise_lines(name), ship:cruise_ships(name), dates:cruise_sailing_dates(sail_date), days:cruise_sailing_days(day, port:cruise_ports(name, country, lat, lon))')
    .eq('status', 'published');
  if (region) query = query.eq('region', String(region));
  const { data, error } = await query;
  if (error) return { error };

  const sailings = (data ?? [])
    .map((s) => {
      const dates = futureDates(s.dates, today);
      const portDays = [...(s.days ?? [])].sort((a, b) => a.day - b.day).filter((d) => d.port);
      const ports = portDays
        .map((d) => ({ name: d.port.name, country: d.port.country, lat: d.port.lat, lon: d.port.lon }))
        .filter((p, i, all) => all.findIndex((q) => q.name === p.name && q.country === p.country) === i);
      return {
        slug: s.slug,
        title: s.title,
        headline: s.headline,
        region: s.region,
        nights: s.nights,
        from_price_usd: s.from_price_usd === null || s.from_price_usd === undefined ? null : Number(s.from_price_usd),
        price_checked_on: s.price_checked_on,
        photo: s.photos?.[0] ?? null,
        line_name: s.line?.name ?? null,
        ship_name: s.ship?.name ?? null,
        port_names: ports.map((p) => p.name),
        ports,
        start_port: portDays[0]?.port.name ?? null,
        end_port: portDays[portDays.length - 1]?.port.name ?? null,
        route: s.route ?? null,
        updated_at: s.updated_at ?? null,
        next_date: dates[0] ?? null,
        date_count: dates.length,
      };
    })
    .filter((s) => s.next_date)
    .sort((a, b) => a.next_date.localeCompare(b.next_date));
  return { data: sailings };
};
