import supabase from '../config/supabase.js';

/**
 * A customer's saved travellers: the people they book flights for, so the
 * review page fills a traveller form with one tap instead of names, dates of
 * birth and passports typed again on every trip - MakeMyTrip's "My Traveller
 * List", Cleartrip's primary traveller.
 *
 * Only ever the signed-in customer's own list. Every query is scoped to the
 * session's user id, never to anything in the request; the table has RLS on
 * and no policies, so this service-role client is the only way in.
 *
 * Until supabase/migrations/20260915120000_saved_travellers.sql is applied the
 * table does not exist: the list reads as empty, saving says it is unavailable,
 * and booking carries on regardless.
 */

const TABLE = 'saved_travellers';
const MAX_SAVED = 50;
// A booking carries at most 9 passengers with seats, and an infant for each adult.
const MAX_PER_SAVE = 18;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const tableMissing = (error) => error?.code === '42P01'
  || /relation .*saved_travellers.* does not exist/i.test(String(error?.message ?? ''));

const text = (value, max) => String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);

/** YYYY-MM-DD, from a date or a timestamp, or null. */
const isoDate = (value) => {
  const day = String(value ?? '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(Date.parse(`${day}T00:00:00Z`)) ? day : null;
};

/**
 * A traveller as the page sends it, made safe to store: trimmed, bounded, the
 * passport reduced to letters and digits. Null when there is no usable name -
 * a saved traveller nobody can recognise is no use to anyone.
 */
export function sanitizeTraveller(input = {}) {
  const firstName = text(input.firstName, 60);
  const lastName = text(input.lastName, 60);
  if (!firstName || !lastName) return null;

  const gender = String(input.gender ?? '').trim().toLowerCase();
  const nationality = String(input.nationality ?? '').trim().toUpperCase();
  return {
    first_name: firstName,
    last_name: lastName,
    gender: gender === 'male' || gender === 'female' ? gender : null,
    date_of_birth: isoDate(input.dateOfBirth),
    nationality: /^[A-Z]{2,3}$/.test(nationality) ? nationality : null,
    passport_number: String(input.passportNumber ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20) || null,
    passport_expiry: isoDate(input.passportExpiry),
  };
}

const toClient = (row) => ({
  id: row.id,
  firstName: row.first_name,
  lastName: row.last_name,
  gender: row.gender ?? '',
  dateOfBirth: row.date_of_birth ?? '',
  nationality: row.nationality ?? '',
  passportNumber: row.passport_number ?? '',
  passportExpiry: row.passport_expiry ?? '',
});

const sameName = (a, b) => a.first_name.toLowerCase() === b.first_name.toLowerCase()
  && a.last_name.toLowerCase() === b.last_name.toLowerCase();

// @desc    The signed-in customer's saved travellers, and themselves from their profile
// @route   GET /api/users/me/travellers
// @access  Private
export const listSavedTravellers = async (req, res) => {
  const userId = req.user?.id;
  try {
    const [saved, profile] = await Promise.all([
      supabase.from(TABLE).select('*').eq('user_id', userId)
        .order('last_used_at', { ascending: false, nullsFirst: false })
        .limit(MAX_SAVED),
      supabase.from('users')
        .select('first_name, last_name, gender, date_of_birth, nationality, passport_number, passport_expiry')
        .eq('id', userId)
        .maybeSingle(),
    ]);

    if (saved.error && !tableMissing(saved.error)) throw saved.error;

    // The account holder, offered as "You" - Cleartrip's primary traveller.
    const self = sanitizeTraveller({
      firstName: profile.data?.first_name,
      lastName: profile.data?.last_name,
      gender: profile.data?.gender,
      dateOfBirth: profile.data?.date_of_birth,
      nationality: profile.data?.nationality,
      passportNumber: profile.data?.passport_number,
      passportExpiry: profile.data?.passport_expiry,
    });

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      success: true,
      data: {
        self: self ? toClient({ id: 'self', ...self }) : null,
        travellers: saved.error ? [] : (saved.data || []).map(toClient),
        available: !saved.error,
      },
    });
  } catch (error) {
    console.error('List saved travellers error:', error?.message);
    return res.status(500).json({ success: false, error: 'We could not load your saved travellers.' });
  }
};

// @desc    Save the travellers from a booking, updating anyone already saved
// @route   POST /api/users/me/travellers   { travellers: [...] }
// @access  Private
export const saveTravellers = async (req, res) => {
  const userId = req.user?.id;
  const incoming = (Array.isArray(req.body?.travellers) ? req.body.travellers : [])
    .slice(0, MAX_PER_SAVE)
    .map(sanitizeTraveller)
    .filter(Boolean);
  if (incoming.length === 0) {
    return res.status(400).json({ success: false, error: 'There are no travellers with a name to save.' });
  }

  try {
    const { data: existing, error } = await supabase.from(TABLE)
      .select('id, first_name, last_name, date_of_birth')
      .eq('user_id', userId)
      .limit(MAX_SAVED);
    if (error) {
      if (tableMissing(error)) {
        return res.status(503).json({ success: false, code: 'SAVED_TRAVELLERS_UNAVAILABLE', error: 'Saving travellers is not available yet.' });
      }
      throw error;
    }

    const now = new Date().toISOString();
    let room = MAX_SAVED - (existing?.length ?? 0);
    let saved = 0;
    for (const traveller of incoming) {
      // The same person: same name, and no date of birth that says otherwise.
      const match = (existing ?? []).find((row) => sameName(row, traveller)
        && (!row.date_of_birth || !traveller.date_of_birth || row.date_of_birth === traveller.date_of_birth));

      let result;
      if (match) {
        // Never blank out what was saved before with what this booking left empty.
        const known = Object.fromEntries(Object.entries(traveller).filter(([, value]) => value !== null));
        result = await supabase.from(TABLE)
          .update({ ...known, last_used_at: now, updated_at: now })
          .eq('id', match.id)
          .eq('user_id', userId);
      } else if (room > 0) {
        result = await supabase.from(TABLE).insert({ ...traveller, user_id: userId, last_used_at: now });
        room -= 1;
      } else {
        continue;
      }

      if (result?.error) {
        console.warn('Save traveller skipped:', result.error.message);
      } else {
        saved += 1;
      }
    }

    return res.status(200).json({ success: true, data: { saved } });
  } catch (error) {
    console.error('Save travellers error:', error?.message);
    return res.status(500).json({ success: false, error: 'We could not save your travellers.' });
  }
};

// @desc    Remove one saved traveller
// @route   DELETE /api/users/me/travellers/:id
// @access  Private
export const deleteSavedTraveller = async (req, res) => {
  const { id } = req.params;
  if (!UUID.test(String(id))) {
    return res.status(400).json({ success: false, error: 'That is not a saved traveller.' });
  }
  try {
    const { error } = await supabase.from(TABLE).delete().eq('id', id).eq('user_id', req.user?.id);
    if (error) throw error;
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Delete saved traveller error:', error?.message);
    return res.status(500).json({ success: false, error: 'We could not remove that traveller.' });
  }
};
