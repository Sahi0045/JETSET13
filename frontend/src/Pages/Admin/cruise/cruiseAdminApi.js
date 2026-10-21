import { adminFetch, readAdminResponse } from '../../../utils/adminAuth';
import { getApiUrl } from '../../../utils/apiHelper';

const UNREACHABLE = 'The server could not be reached. Try again.';
const UNREADABLE = 'The server sent an answer that could not be read.';

export const FIELD = 'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[#055B75] focus:outline-none focus:ring-1 focus:ring-[#055B75] disabled:bg-gray-50 disabled:text-gray-500';
export const PRIMARY = 'rounded-lg bg-[#055B75] px-4 py-2 font-semibold text-white hover:bg-[#034457] disabled:opacity-60';
export const SECONDARY = 'rounded-lg border border-[#055B75]/30 px-4 py-2 font-semibold text-[#055B75] hover:bg-[#F1FBFD] disabled:opacity-60';

/** `{ body }` on success, `{ error }` with the server's own words otherwise. */
export async function send(path, options) {
  let response;
  try {
    response = await adminFetch(getApiUrl(`cruise-catalog/admin/${path}`), options);
  } catch {
    return { error: UNREACHABLE };
  }
  try {
    const body = await readAdminResponse(response);
    if (body?.success !== true) return { error: body?.error || UNREADABLE };
    return { body };
  } catch (error) {
    if (error?.sessionExpired) window.location.replace('/admin/login?expired=1');
    return { error: error?.message || UNREADABLE };
  }
}

/** Today in the office's time zone, `YYYY-MM-DD`, the day prices are stamped with. */
export const officeToday = (now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

export const STALE_DAYS = 30;

export const isPriceStale = (checkedOn, today = officeToday()) => {
  if (!checkedOn) return false;
  const days = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${checkedOn}T00:00:00Z`)) / 86400000;
  return days > STALE_DAYS;
};

export const usd = (amount) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
