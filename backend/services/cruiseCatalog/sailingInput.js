import { regionByKey } from '../../../shared/cruiseRegions.js';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PHOTOS = 12;
const MAX_DATES = 52;

const fail = (error) => ({ ok: false, error });

const text = (value) => (typeof value === 'string' ? value.trim() : '');

const isRealDate = (value) => {
  if (typeof value !== 'string' || !DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

const priceOf = (value) => {
  if (value === null || value === undefined || value === '') return { ok: true, price: null };
  const price = typeof value === 'number' ? value : Number.NaN;
  if (!Number.isFinite(price) || price <= 0 || Math.round(price * 100) !== price * 100) return { ok: false };
  return { ok: true, price };
};

const photoPrefix = () => `${process.env.SUPABASE_URL}/storage/v1/object/public/cruise-photos/`;

/** The office's calendar date, `YYYY-MM-DD`: the cruise desk works Pacific time. */
export const todayInOffice = (now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

export const makeSlug = (title, nights, idSuffix) => {
  const words = String(title).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `${words}-${nights}-nights-${idSuffix}`;
};

/**
 * A price keeps the day it was checked until it changes or staff say they
 * checked it again: re-saving an old price must not make it look fresh.
 */
export const stampPrice = ({ previousPrice, previousCheckedOn, price, recheckedToday, today }) => {
  if (price === null || price === undefined) return { from_price_usd: null, price_checked_on: null };
  const unchanged = previousPrice !== null && previousPrice !== undefined && Number(previousPrice) === Number(price);
  return {
    from_price_usd: price,
    price_checked_on: unchanged && !recheckedToday && previousCheckedOn ? previousCheckedOn : today,
  };
};

export const sailingInput = (body = {}, { today }) => {
  const title = text(body.title);
  if (title.length < 3 || title.length > 120) return fail('The title must be 3 to 120 characters.');

  if (!regionByKey(body.region)) return fail('Pick a region from the list.');

  const lineId = text(body.lineId);
  if (!lineId) return fail('Pick the cruise line.');

  const { nights } = body;
  if (!Number.isInteger(nights) || nights < 1 || nights > 60) return fail('Nights must be a whole number from 1 to 60.');

  const status = body.status ?? 'draft';
  if (status !== 'draft' && status !== 'published') return fail('The status must be Draft or Published.');

  const rawDays = Array.isArray(body.days) ? body.days : [];
  const dayNumbers = rawDays.map((d) => d?.day);
  const expected = Array.from({ length: nights + 1 }, (_, i) => i + 1);
  const sorted = [...dayNumbers].sort((a, b) => a - b);
  if (sorted.length !== expected.length || sorted.some((day, i) => day !== expected[i])) {
    return fail(`The itinerary must list every day from 1 to ${nights + 1}, once each.`);
  }
  const ordered = [...rawDays].sort((a, b) => a.day - b.day);
  if (!ordered[0].portId || !ordered[ordered.length - 1].portId) {
    return fail('The first and last day must be a port, not a day at sea.');
  }
  for (const d of ordered) {
    for (const time of [d.arrive, d.depart]) {
      if (time !== null && time !== undefined && time !== '' && !TIME.test(time)) return fail('Times must look like 16:00.');
    }
  }

  const price = priceOf(body.fromPriceUsd);
  if (!price.ok) return fail('The price must be a positive amount in dollars, like 849 or 849.50.');

  const photos = Array.isArray(body.photos) ? body.photos : [];
  const prefix = photoPrefix();
  const photosOk = photos.length <= MAX_PHOTOS && photos.every((p) => {
    const credit = text(p?.credit);
    return typeof p?.url === 'string' && p.url.startsWith(prefix) && credit.length >= 1 && credit.length <= 120;
  });
  if (!photosOk) return fail('Each photo needs a credit, and must be uploaded here.');

  const dates = Array.isArray(body.dates) ? body.dates : [];
  if (dates.length > MAX_DATES || !dates.every(isRealDate) || new Set(dates).size !== dates.length) {
    return fail(`Sailing dates must be real dates, each listed once (${MAX_DATES} at most).`);
  }

  if (status === 'published') {
    if (!dates.some((date) => date >= today)) return fail('To publish, add at least one sailing date from today on.');
    const ports = new Set(ordered.map((d) => d.portId).filter(Boolean));
    if (ports.size < 2) return fail('To publish, the itinerary needs at least two ports.');
  }

  return {
    ok: true,
    sailing: {
      title,
      headline: text(body.headline) || null,
      region: body.region,
      line_id: lineId,
      ship_id: text(body.shipId) || null,
      nights,
      inclusions: text(body.inclusions) || null,
      photos: photos.map((p) => ({ url: p.url, credit: text(p.credit) })),
      status,
    },
    days: ordered.map((d) => ({
      day: d.day,
      port_id: d.portId || null,
      arrive_time: d.arrive || null,
      depart_time: d.depart || null,
    })),
    dates: [...dates].sort(),
    price: price.price,
    recheckedToday: body.recheckedToday === true,
  };
};
