import { attentionOf } from '../../../shared/reviewQueue.js';

/**
 * What the desk page sends with "Mark as handled": the entry it showed, as
 * the list gave it (frontend/src/Pages/Support/SupportQueue.jsx shownQuery).
 * resolve-review refuses a press that does not say.
 *
 * @param {object|null} row - the booking row as the page's list read it
 * @returns {string} the query string, with its leading "?"
 */
export function shownQueryOf(row) {
  const attention = row ? attentionOf(row) : null;
  return `?${new URLSearchParams({ shownKind: attention?.kind || '', shownSince: attention?.since || '' })}`;
}

/**
 * The same for booking `id` as it reads now, through the Supabase client the
 * routes use: a desk page loaded just before the press. Not for a test that
 * hooks that client's reads - read its table's row directly there.
 *
 * @param {string|number} id
 * @returns {Promise<string>}
 */
export async function shownQueryFor(id) {
  const supabase = (await import('../../../backend/config/supabase.js')).default;
  const { data } = await supabase.from('bookings').select('*').eq('id', id).single();
  return shownQueryOf(data);
}
