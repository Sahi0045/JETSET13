import { randomBytes, randomUUID } from 'node:crypto';
import supabase from '../config/supabase.js';
import { CRUISE_REGIONS } from '../../shared/cruiseRegions.js';
import { makeSlug, sailingInput, stampPrice, todayInOffice } from '../services/cruiseCatalog/sailingInput.js';
import { listPublished } from '../services/cruiseCatalog/publishedSailings.js';
import { renderSailingSitemap } from '../services/cruiseCatalog/sitemap.js';
// Loaded on first use: every API route shares one Vercel function, and the sea
// network would add its load time to every cold start.
const seaRoutes = () => import('../services/cruiseCatalog/seaRoute.js');

const PHOTO_BUCKET = 'cruise-photos';
const PHOTO_TYPES = ['jpg', 'jpeg', 'png', 'webp'];

const ok = (res, data) => res.json({ success: true, data });
const refuse = (res, status, error) => res.status(status).json({ success: false, error });
const failed = (res, what, error) => {
  console.error(`Cruise catalog: ${what} failed`, error?.message ?? error);
  return refuse(res, 500, `The ${what} failed. Try again.`);
};

const futureDates = (dates, today) => (dates ?? [])
  .map((d) => d.sail_date)
  .filter((date) => date >= today)
  .sort();

const hhmm = (time) => (time ? String(time).slice(0, 5) : null);

// ── Public: published sailings only ─────────────────────────

export const listPublishedSailings = async (req, res) => {
  const { data, error } = await listPublished({ region: req.query.region });
  if (error) return failed(res, 'cruise list', error);
  return ok(res, data.map(({ updated_at: _updated, ...card }) => card));
};

export const sailingSitemap = async (_req, res) => {
  const { data, error } = await listPublished();
  if (error) return failed(res, 'sitemap', error);
  res.type('application/xml').send(renderSailingSitemap(data));
};

export const getPublishedSailing = async (req, res) => {
  const today = todayInOffice();
  const { data, error } = await supabase
    .from('cruise_sailings')
    .select('slug, title, headline, region, nights, from_price_usd, price_checked_on, inclusions, photos, route, line:cruise_lines(name), ship:cruise_ships(name), dates:cruise_sailing_dates(sail_date), days:cruise_sailing_days(day, arrive_time, depart_time, port:cruise_ports(name, country, lat, lon))')
    .eq('slug', String(req.params.slug))
    .eq('status', 'published')
    .maybeSingle();
  if (error) return failed(res, 'cruise lookup', error);
  if (!data) return refuse(res, 404, 'Cruise not found');

  return ok(res, {
    slug: data.slug,
    title: data.title,
    headline: data.headline,
    region: data.region,
    nights: data.nights,
    from_price_usd: data.from_price_usd === null || data.from_price_usd === undefined ? null : Number(data.from_price_usd),
    price_checked_on: data.price_checked_on,
    inclusions: data.inclusions,
    photos: data.photos ?? [],
    route: data.route,
    line_name: data.line?.name ?? null,
    ship_name: data.ship?.name ?? null,
    dates: futureDates(data.dates, today),
    days: [...(data.days ?? [])]
      .sort((a, b) => a.day - b.day)
      .map((d) => ({
        day: d.day,
        port: d.port ? { name: d.port.name, country: d.port.country, lat: d.port.lat, lon: d.port.lon } : null,
        arrive: hhmm(d.arrive_time),
        depart: hhmm(d.depart_time),
      })),
  });
};

export const listRegions = async (_req, res) => {
  const today = todayInOffice();
  const { data, error } = await supabase
    .from('cruise_sailings')
    .select('region, dates:cruise_sailing_dates(sail_date)')
    .eq('status', 'published');
  if (error) return failed(res, 'region list', error);

  const counts = {};
  for (const s of data ?? []) {
    if (futureDates(s.dates, today).length) counts[s.region] = (counts[s.region] ?? 0) + 1;
  }
  return ok(res, CRUISE_REGIONS.filter((r) => counts[r.key]).map((r) => ({ ...r, count: counts[r.key] })));
};

// ── Admin ───────────────────────────────────────────────────

export const listSailingsAdmin = async (_req, res) => {
  const today = todayInOffice();
  const { data, error } = await supabase
    .from('cruise_sailings')
    .select('id, slug, title, region, nights, status, from_price_usd, price_checked_on, updated_at, line:cruise_lines(name), dates:cruise_sailing_dates(sail_date)')
    .order('updated_at', { ascending: false });
  if (error) return failed(res, 'cruise list', error);
  return ok(res, (data ?? []).map((s) => ({
    id: s.id,
    slug: s.slug,
    title: s.title,
    region: s.region,
    line_name: s.line?.name ?? null,
    nights: s.nights,
    status: s.status,
    from_price_usd: s.from_price_usd === null || s.from_price_usd === undefined ? null : Number(s.from_price_usd),
    price_checked_on: s.price_checked_on,
    next_date: futureDates(s.dates, today)[0] ?? null,
  })));
};

export const getSailingAdmin = async (req, res) => {
  const { data, error } = await supabase
    .from('cruise_sailings')
    .select('*, days:cruise_sailing_days(day, port_id, arrive_time, depart_time), dates:cruise_sailing_dates(sail_date)')
    .eq('id', String(req.params.id))
    .maybeSingle();
  if (error) return failed(res, 'cruise lookup', error);
  if (!data) return refuse(res, 404, 'Cruise not found');
  const { days, dates, ...sailing } = data;
  return ok(res, {
    ...sailing,
    from_price_usd: sailing.from_price_usd === null || sailing.from_price_usd === undefined ? null : Number(sailing.from_price_usd),
    days: [...(days ?? [])].sort((a, b) => a.day - b.day).map((d) => ({
      day: d.day, portId: d.port_id, arrive: hhmm(d.arrive_time), depart: hhmm(d.depart_time),
    })),
    dates: (dates ?? []).map((d) => d.sail_date).sort(),
  });
};

const routeFor = async (days) => {
  const portIds = days.map((d) => d.port_id).filter(Boolean);
  const unique = [...new Set(portIds)];
  const { data, error } = await supabase.from('cruise_ports').select('id, lat, lon').in('id', unique);
  if (error) return { error };
  const byId = new Map((data ?? []).map((p) => [p.id, p]));
  if (unique.some((id) => !byId.has(id))) return { missing: true };
  const { routeForPorts } = await seaRoutes();
  return { route: routeForPorts(portIds.map((id) => byId.get(id))) };
};

const saveSailing = async (req, res, existingId) => {
  const today = todayInOffice();
  const input = sailingInput(req.body, { today });
  if (!input.ok) return refuse(res, 400, input.error);

  let existing = null;
  if (existingId) {
    const found = await supabase
      .from('cruise_sailings')
      .select('id, slug, from_price_usd, price_checked_on')
      .eq('id', existingId)
      .maybeSingle();
    if (found.error) return failed(res, 'cruise save', found.error);
    if (!found.data) return refuse(res, 404, 'Cruise not found');
    existing = found.data;
  }

  const { route, missing, error: portError } = await routeFor(input.days);
  if (portError) return failed(res, 'cruise save', portError);
  if (missing) return refuse(res, 400, 'A port in the itinerary is not in the port list.');

  const price = stampPrice({
    previousPrice: existing?.from_price_usd ?? null,
    previousCheckedOn: existing?.price_checked_on ?? null,
    price: input.price,
    recheckedToday: input.recheckedToday,
    today,
  });

  const sailing = {
    ...input.sailing,
    ...price,
    route,
    slug: existing ? existing.slug : makeSlug(input.sailing.title, input.sailing.nights, randomBytes(2).toString('hex')),
    ...(existing ? { id: existing.id } : { created_by: req.user?.id ?? null }),
  };

  const { data: id, error } = await supabase.rpc('cruise_save_sailing', { p_sailing: sailing, p_days: input.days, p_dates: input.dates });
  if (error) return failed(res, 'cruise save', error);
  return ok(res, { id, slug: sailing.slug });
};

export const createSailing = (req, res) => saveSailing(req, res, null);
export const updateSailing = (req, res) => saveSailing(req, res, String(req.params.id));

const nameOf = (value, min, max) => {
  const name = typeof value === 'string' ? value.trim() : '';
  return name.length >= min && name.length <= max ? name : null;
};

const insertOne = async (res, table, row, duplicateMessage) => {
  const { data, error } = await supabase.from(table).insert(row).select().single();
  if (error?.code === '23505') return refuse(res, 409, duplicateMessage);
  if (error) return failed(res, 'save', error);
  return ok(res, data);
};

export const listLines = async (_req, res) => {
  const { data, error } = await supabase.from('cruise_lines').select('id, name').order('name');
  if (error) return failed(res, 'line list', error);
  return ok(res, data ?? []);
};

export const createLine = async (req, res) => {
  const name = nameOf(req.body?.name, 2, 80);
  if (!name) return refuse(res, 400, 'The cruise line needs a name of 2 to 80 characters.');
  return insertOne(res, 'cruise_lines', { name }, 'That cruise line is already in the list.');
};

export const listShips = async (req, res) => {
  let query = supabase.from('cruise_ships').select('id, name, line_id').order('name');
  if (req.query.lineId) query = query.eq('line_id', String(req.query.lineId));
  const { data, error } = await query;
  if (error) return failed(res, 'ship list', error);
  return ok(res, data ?? []);
};

export const createShip = async (req, res) => {
  const name = nameOf(req.body?.name, 2, 80);
  const lineId = typeof req.body?.lineId === 'string' ? req.body.lineId.trim() : '';
  if (!name || !lineId) return refuse(res, 400, 'The ship needs a cruise line and a name of 2 to 80 characters.');
  return insertOne(res, 'cruise_ships', { name, line_id: lineId }, 'That ship is already in the list for this line.');
};

// Number('') and Number(null) are both 0: a blank field would place the port
// off West Africa and the sea router would happily route to it.
const coordinate = (value) => {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string' || value.trim() === '') return Number.NaN;
  return Number(value.trim());
};

const portInput = (body = {}) => {
  const name = nameOf(body.name, 2, 80);
  const country = nameOf(body.country, 2, 60);
  const lat = coordinate(body.lat);
  const lon = coordinate(body.lon);
  const valid = name && country
    && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
  if (!valid) return null;
  const unlocode = typeof body.unlocode === 'string' && /^[A-Z]{2}[A-Z0-9]{3}$/.test(body.unlocode) ? body.unlocode : null;
  return { name, country, lat, lon, unlocode };
};

const PORT_REFUSAL = 'A port needs a name, a country, a latitude from -90 to 90 and a longitude from -180 to 180.';

export const listPorts = async (_req, res) => {
  const { data, error } = await supabase.from('cruise_ports').select('id, name, country, unlocode, lat, lon').order('name');
  if (error) return failed(res, 'port list', error);
  return ok(res, data ?? []);
};

export const createPort = async (req, res) => {
  const row = portInput(req.body);
  if (!row) return refuse(res, 400, PORT_REFUSAL);
  return insertOne(res, 'cruise_ports', row, 'That port is already in the list.');
};

// A moved port moves every route that calls there; the stored lines would
// otherwise keep passing the old position while the day markers move.
const redrawRoutesThrough = async (portId) => {
  const { data: calls, error } = await supabase.from('cruise_sailing_days').select('sailing_id').eq('port_id', portId);
  if (error) return error;
  const sailingIds = [...new Set((calls ?? []).map((c) => c.sailing_id))];
  if (!sailingIds.length) return null;

  const { data: days, error: daysError } = await supabase
    .from('cruise_sailing_days')
    .select('sailing_id, day, port_id')
    .in('sailing_id', sailingIds);
  if (daysError) return daysError;
  const portIds = [...new Set((days ?? []).map((d) => d.port_id).filter(Boolean))];
  const { data: ports, error: portsError } = await supabase.from('cruise_ports').select('id, lat, lon').in('id', portIds);
  if (portsError) return portsError;
  const byId = new Map((ports ?? []).map((p) => [p.id, p]));

  const { routeForPorts } = await seaRoutes();
  for (const sailingId of sailingIds) {
    const stops = (days ?? [])
      .filter((d) => d.sailing_id === sailingId && d.port_id && byId.has(d.port_id))
      .sort((a, b) => a.day - b.day)
      .map((d) => byId.get(d.port_id));
    const { error: updateError } = await supabase.from('cruise_sailings').update({ route: routeForPorts(stops) }).eq('id', sailingId);
    if (updateError) return updateError;
  }
  return null;
};

export const updatePort = async (req, res) => {
  const row = portInput(req.body);
  if (!row) return refuse(res, 400, PORT_REFUSAL);
  const portId = String(req.params.id);
  const { data, error } = await supabase.from('cruise_ports').update(row).eq('id', portId).select().maybeSingle();
  if (error?.code === '23505') return refuse(res, 409, 'That port is already in the list.');
  if (error) return failed(res, 'port save', error);
  if (!data) return refuse(res, 404, 'Port not found');
  const redrawError = await redrawRoutesThrough(portId);
  if (redrawError) return failed(res, 'route redraw', redrawError);
  return ok(res, data);
};

export const portSearch = async (req, res) => {
  const { searchPorts } = await seaRoutes();
  return ok(res, searchPorts(String(req.query.q ?? '')));
};

export const photoUploadUrl = async (req, res) => {
  const ext = String(req.body?.filename ?? '').split('.').pop().toLowerCase();
  if (!PHOTO_TYPES.includes(ext)) return refuse(res, 400, 'Upload a JPG, PNG or WebP photo.');
  const path = `sailings/${randomUUID()}.${ext}`;
  const bucket = supabase.storage.from(PHOTO_BUCKET);
  const { data, error } = await bucket.createSignedUploadUrl(path);
  if (error) return failed(res, 'photo upload', error);
  return ok(res, { path: data.path ?? path, token: data.token, publicUrl: bucket.getPublicUrl(path).data.publicUrl });
};
