import { getApiUrl } from '../../../utils/apiHelper';

export const CRUISE_PHONE = { href: 'tel:+18775387380', text: '(877) 538-7380' };
export const CRUISE_EMAIL = 'support@jetsetterss.com';

const STALE_DAYS = 30;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Today on the cruise desk's calendar, `YYYY-MM-DD`: prices are stamped in Pacific time. */
export const officeToday = (now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

const parts = (iso) => {
  const [year, month, day] = String(iso).split('-').map(Number);
  return { year, month, day };
};

export const shortDate = (iso) => {
  const { year, month, day } = parts(iso);
  return `${day} ${MONTHS[month - 1]} ${year}`;
};

export const dayMonth = (iso) => {
  const { month, day } = parts(iso);
  return `${day} ${MONTHS[month - 1]}`;
};

const daysBetween = (from, to) => (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000;

const dollars = (amount) => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  maximumFractionDigits: 2,
}).format(amount);

const ASK = { kind: 'ask', amount: "Ask for today's price", note: 'Our team checks it with the cruise line' };

/**
 * The price a customer sees. A price nobody has checked for over a month is
 * not shown: cruise fares move daily, and an old figure would be a promise.
 */
export const priceLabel = ({ from_price_usd: price, price_checked_on: checkedOn }, today = officeToday()) => {
  if (!price || price <= 0 || !checkedOn || !(daysBetween(checkedOn, today) <= STALE_DAYS)) return ASK;
  return { kind: 'price', amount: `From ${dollars(Number(price))}`, note: `per person, port fees included · price checked ${dayMonth(checkedOn)}` };
};

export const inquiryMail = (title) => `mailto:${CRUISE_EMAIL}?subject=${encodeURIComponent(`Cruise inquiry: ${title}`)}`;

const read = async (path) => {
  const response = await fetch(getApiUrl(`cruise-catalog/${path}`));
  if (response.status === 404) return null;
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.success !== true) throw new Error('The cruise catalog could not be read.');
  return body.data;
};

export const fetchSailings = async (region) => (await read(region ? `sailings?region=${encodeURIComponent(region)}` : 'sailings')) ?? [];
export const fetchRegions = async () => (await read('regions')) ?? [];
export const fetchSailing = (slug) => read(`sailings/${encodeURIComponent(slug)}`);

/** A ship at sea, for a sailing staff have not added a photo to yet. */
export const SEA_PHOTO = 'https://images.unsplash.com/photo-1548574505-5e239809ee19?q=80&w=1200&auto=format&fit=crop';
