import supabase from '../config/supabase.js';
import { isCouponCode } from '../services/coupon.service.js';

const CODE_PATTERN = /^[A-Z0-9-]{3,32}$/;
const MAX_VALUE_USD = 10000;
const KINDS = ['instant', 'trip'];

const dateOrNull = (value, endOfDay = false) => {
  if (!value) return null;
  const text = String(value);
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z` : text;
  const time = Date.parse(iso);
  return Number.isFinite(time) ? new Date(time).toISOString() : undefined;
};

/** The admin form, as a vouchers row, or why not. */
export function voucherInput(body = {}) {
  const code = String(body.code || '').trim().toUpperCase();
  if (!CODE_PATTERN.test(code)) return { ok: false, error: 'Use 3 to 32 letters, digits or hyphens for the code.' };
  const value = Number(body.valueUsd);
  if (!Number.isFinite(value) || value <= 0 || value > MAX_VALUE_USD) return { ok: false, error: `The value must be between $0.01 and $${MAX_VALUE_USD}.` };
  const limit = body.maxRedemptions === '' || body.maxRedemptions == null ? null : Math.floor(Number(body.maxRedemptions));
  if (limit !== null && !(limit > 0)) return { ok: false, error: 'The limit must be a whole number above 0, or empty for no limit.' };
  const validFrom = dateOrNull(body.validFrom);
  const validUntil = dateOrNull(body.validUntil, true);
  if (validFrom === undefined || validUntil === undefined) return { ok: false, error: 'A date could not be read.' };
  if (validFrom && validUntil && validFrom > validUntil) return { ok: false, error: 'The end date is before the start date.' };
  const kind = body.kind === undefined || body.kind === null || body.kind === '' ? 'instant' : String(body.kind);
  if (!KINDS.includes(kind)) return { ok: false, error: 'The kind must be Instant or Trip reward.' };
  return {
    ok: true,
    row: {
      code,
      coins: Math.round(value * 100),
      max_redemptions: limit,
      valid_from: validFrom,
      valid_until: validUntil,
      note: body.note ? String(body.note).slice(0, 200) : null,
      kind,
      first_time_only: kind === 'trip' && body.firstTimeOnly === true,
    },
  };
}

/** True when it has answered: a coupon uses the code, or that could not be checked. */
async function answeredCodeClash(res, code) {
  try {
    if (!(await isCouponCode(supabase, code))) return false;
    res.status(409).json({ success: false, code: 'CODE_TAKEN', error: 'A coupon already uses this code. Pick another code.' });
  } catch {
    res.status(503).json({ success: false, error: 'The voucher could not be saved.' });
  }
  return true;
}

export async function listVouchers(req, res) {
  const { data, error } = await supabase.from('vouchers').select('*').order('created_at', { ascending: false });
  if (error) return res.status(503).json({ success: false, error: 'Vouchers could not be loaded.' });
  return res.json({ success: true, data: data || [] });
}

export async function createVoucher(req, res) {
  const input = voucherInput(req.body);
  if (!input.ok) return res.status(400).json({ success: false, error: input.error });
  if (await answeredCodeClash(res, input.row.code)) return res;
  const { data, error } = await supabase.from('vouchers')
    .insert({ ...input.row, created_by: req.user?.id || null })
    .select()
    .single();
  if (error?.code === '23505') return res.status(409).json({ success: false, code: 'CODE_TAKEN', error: 'A voucher with this code already exists.' });
  if (error) return res.status(503).json({ success: false, error: 'The voucher could not be saved.' });
  return res.status(201).json({ success: true, data });
}

export async function updateVoucher(req, res) {
  const { data: current, error: readError } = await supabase.from('vouchers').select('*').eq('id', req.params.id).single();
  if (readError || !current) return res.status(404).json({ success: false, error: 'Voucher not found.' });
  const body = req.body || {};
  const changesValue = body.valueUsd !== undefined && Math.round(Number(body.valueUsd) * 100) !== Number(current.coins);
  const changesCode = body.code !== undefined && String(body.code).trim().toUpperCase() !== current.code;
  const changesKind = body.kind !== undefined && String(body.kind) !== (current.kind || 'instant');
  if ((changesValue || changesCode || changesKind) && Number(current.redemptions_count) > 0) {
    return res.status(409).json({ success: false, code: 'VOUCHER_LOCKED', error: 'Customers have used this voucher, so its code, value and kind cannot change.' });
  }
  const input = voucherInput({
    code: body.code ?? current.code,
    valueUsd: body.valueUsd ?? Number(current.coins) / 100,
    maxRedemptions: body.maxRedemptions !== undefined ? body.maxRedemptions : current.max_redemptions,
    validFrom: body.validFrom !== undefined ? body.validFrom : current.valid_from,
    validUntil: body.validUntil !== undefined ? body.validUntil : current.valid_until,
    note: body.note !== undefined ? body.note : current.note,
    kind: body.kind !== undefined ? body.kind : current.kind,
    firstTimeOnly: body.firstTimeOnly !== undefined ? body.firstTimeOnly === true : current.first_time_only === true,
  });
  if (!input.ok) return res.status(400).json({ success: false, error: input.error });
  if (changesCode && await answeredCodeClash(res, input.row.code)) return res;
  const update = { ...input.row, updated_at: new Date().toISOString() };
  if (typeof body.isActive === 'boolean') update.is_active = body.isActive;
  const { data, error } = await supabase.from('vouchers').update(update).eq('id', current.id).select().single();
  if (error?.code === '23505') return res.status(409).json({ success: false, code: 'CODE_TAKEN', error: 'A voucher with this code already exists.' });
  if (error) return res.status(503).json({ success: false, error: 'The voucher could not be saved.' });
  return res.json({ success: true, data });
}

export async function listRedemptions(req, res) {
  const { data, error } = await supabase.from('voucher_redemptions')
    .select('id, coins, created_at, user_id, status, booking_reference, due_at, paid_at, users(email)')
    .eq('voucher_id', req.params.id)
    .order('created_at', { ascending: false });
  if (error) return res.status(503).json({ success: false, error: 'Redemptions could not be loaded.' });
  return res.json({
    success: true,
    data: (data || []).map((row) => ({
      id: row.id,
      coins: row.coins,
      createdAt: row.created_at,
      userId: row.user_id,
      email: row.users?.email || null,
      status: row.status || 'credited',
      bookingReference: row.booking_reference || null,
      dueAt: row.due_at || null,
      paidAt: row.paid_at || null,
    })),
  });
}
