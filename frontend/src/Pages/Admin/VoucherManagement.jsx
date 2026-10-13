import React, { useCallback, useEffect, useState } from 'react';
import { adminFetch, readAdminResponse } from '../../utils/adminAuth';
import { getApiUrl } from '../../utils/apiHelper';
import { useRegisterRefresh } from './shell/RefreshContext';

const usd = (amount) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
const coinsText = (coins) => new Intl.NumberFormat('en-US').format(coins);
const day = (iso) => {
  const time = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(time) ? new Date(time).toISOString().slice(0, 10) : '';
};
const dates = (voucher) => {
  const from = day(voucher.valid_from);
  const until = day(voucher.valid_until);
  if (from && until) return `${from} → ${until}`;
  if (from) return `From ${from}`;
  if (until) return `Until ${until}`;
  return 'Any time';
};
const EMPTY = { code: '', valueUsd: '', maxRedemptions: '', validFrom: '', validUntil: '', note: '' };
const UNREACHABLE = 'The server could not be reached. Try again.';
const UNREADABLE = 'The server sent an answer that could not be read.';

async function send(path, options) {
  let response;
  try {
    response = await adminFetch(getApiUrl(path), options);
  } catch {
    return { error: UNREACHABLE };
  }
  try {
    const body = await readAdminResponse(response);
    if (body?.success !== true) return { error: body?.error || UNREADABLE };
    return { body };
  } catch (error) {
    // A hard navigation: clearing the flags makes ProtectedRoute bounce a soft one to the site login first.
    if (error?.sessionExpired) window.location.replace('/admin/login?expired=1');
    return { error: error?.message || UNREADABLE };
  }
}

export default function VoucherManagement() {
  const [vouchers, setVouchers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [form, setForm] = useState(null);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [redemptions, setRedemptions] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { body, error } = await send('vouchers');
    setLoadError(error || null);
    if (body) setVouchers(Array.isArray(body.data) ? body.data : []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  useRegisterRefresh(load);

  const openForm = (next) => {
    setFormError(null);
    setForm(next);
  };

  const save = async (event) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setFormError(null);
    const code = form.code.trim().toUpperCase();
    const editing = Boolean(form.id);
    const { error } = await send(editing ? `vouchers/${form.id}` : 'vouchers', {
      method: editing ? 'PUT' : 'POST',
      body: JSON.stringify({
        code,
        valueUsd: Number(form.valueUsd),
        maxRedemptions: form.maxRedemptions,
        validFrom: form.validFrom,
        validUntil: form.validUntil,
        note: form.note,
      }),
    });
    setSaving(false);
    if (error) {
      setFormError(error);
      return;
    }
    setNotice({ tone: 'ok', text: `Voucher ${code} ${editing ? 'saved' : 'created'}.` });
    setForm(null);
    load();
  };

  const toggle = async (voucher) => {
    if (busyId) return;
    setBusyId(voucher.id);
    setNotice(null);
    const turningOn = !voucher.is_active;
    const { error } = await send(`vouchers/${voucher.id}`, { method: 'PUT', body: JSON.stringify({ isActive: turningOn }) });
    setNotice(error ? { tone: 'error', text: error } : { tone: 'ok', text: `${voucher.code} is ${turningOn ? 'on' : 'off'}.` });
    await load();
    setBusyId(null);
  };

  const showRedemptions = async (voucher) => {
    const { body, error } = await send(`vouchers/${voucher.id}/redemptions`);
    setRedemptions({ voucher, rows: Array.isArray(body?.data) ? body.data : [], error });
  };

  const input = (name, label, props = {}) => (
    <label className="block text-sm">
      <span className="font-medium text-gray-700">{label}</span>
      <input
        value={form[name]}
        onChange={(event) => setForm({ ...form, [name]: event.target.value })}
        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[#055B75] focus:outline-none focus:ring-1 focus:ring-[#055B75] disabled:bg-gray-50 disabled:text-gray-500"
        {...props}
      />
    </label>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-600">A voucher adds Jet Coins to the wallet of each customer who redeems it (once each). 100 coins = $1.</p>
        <button type="button" onClick={() => openForm({ ...EMPTY })} className="shrink-0 rounded-lg bg-[#055B75] px-4 py-2 text-sm font-semibold text-white hover:bg-[#034457]">
          New voucher
        </button>
      </div>

      {notice && (
        <p
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className={`rounded-lg border px-3 py-2 text-sm ${notice.tone === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-[#65B3CF] bg-[#F1FBFD] text-[#034457]'}`}
        >
          {notice.text}
        </p>
      )}

      {form && (
        <form onSubmit={save} className="grid gap-3 rounded-xl border border-gray-200 bg-white p-4 sm:grid-cols-2">
          {input('code', 'Code', { required: true, maxLength: 32, autoComplete: 'off', autoCapitalize: 'characters', spellCheck: false, disabled: form.locked })}
          <div>
            {input('valueUsd', 'Value (USD)', { required: true, type: 'number', min: '0.01', step: '0.01', disabled: form.locked })}
            {Number(form.valueUsd) > 0 && <p className="mt-1 text-xs text-gray-500">{`= ${coinsText(Math.round(Number(form.valueUsd) * 100))} Jet Coins`}</p>}
          </div>
          {form.locked && <p className="text-xs text-gray-500 sm:col-span-2">Customers have redeemed this voucher, so its code and value cannot be changed.</p>}
          {input('maxRedemptions', 'Total uses (empty = no limit)', { type: 'number', min: '1', step: '1' })}
          {input('note', 'Note (admin only)', { maxLength: 200 })}
          {input('validFrom', 'Starts', { type: 'date' })}
          {input('validUntil', 'Ends', { type: 'date' })}
          <p className="text-xs text-gray-500 sm:col-span-2">Pick a code that is hard to guess (for example SHUBHAM-7K2Q): anyone signed in can try codes.</p>
          {formError && <p role="alert" className="text-sm text-red-600 sm:col-span-2">{formError}</p>}
          <div className="flex gap-2 sm:col-span-2">
            <button type="submit" disabled={saving} className="rounded-lg bg-[#055B75] px-4 py-2 text-sm font-semibold text-white hover:bg-[#034457] disabled:opacity-50">
              {form.id ? 'Save voucher' : 'Create voucher'}
            </button>
            <button type="button" onClick={() => setForm(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">Cancel</button>
          </div>
        </form>
      )}

      {loadError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p>}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr><th className="px-4 py-2">Code</th><th className="px-4 py-2">Value</th><th className="px-4 py-2">Used</th><th className="px-4 py-2">Dates</th><th className="px-4 py-2">Status</th><th className="px-4 py-2" /></tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {vouchers.map((voucher) => (
              <tr key={voucher.id}>
                <td className="px-4 py-2 font-semibold text-gray-900">{voucher.code}</td>
                <td className="px-4 py-2">{usd(voucher.coins / 100)}</td>
                <td className="px-4 py-2">{`${voucher.redemptions_count} / ${voucher.max_redemptions ?? '∞'}`}</td>
                <td className="px-4 py-2 text-gray-600">{dates(voucher)}</td>
                <td className="px-4 py-2">
                  <button
                    type="button"
                    disabled={busyId !== null}
                    aria-label={`${voucher.is_active ? 'Switch off' : 'Switch on'} ${voucher.code}`}
                    onClick={() => toggle(voucher)}
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold disabled:opacity-50 ${voucher.is_active ? 'bg-[#F1FBFD] text-[#055B75]' : 'bg-gray-100 text-gray-500'}`}
                  >
                    {voucher.is_active ? 'Active' : 'Off'}
                  </button>
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-right">
                  <button type="button" aria-label={`Who used ${voucher.code}`} onClick={() => showRedemptions(voucher)} className="text-xs font-semibold text-[#055B75] hover:underline">Who used it</button>
                  <button
                    type="button"
                    aria-label={`Edit ${voucher.code}`}
                    onClick={() => openForm({
                      id: voucher.id,
                      locked: Number(voucher.redemptions_count) > 0,
                      code: voucher.code,
                      valueUsd: String(voucher.coins / 100),
                      maxRedemptions: voucher.max_redemptions ?? '',
                      validFrom: day(voucher.valid_from),
                      validUntil: day(voucher.valid_until),
                      note: voucher.note || '',
                    })}
                    className="ml-3 text-xs font-semibold text-[#055B75] hover:underline"
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
            {!loading && !loadError && vouchers.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-500">No vouchers yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {redemptions && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-900">{`Redeemed ${redemptions.voucher.code}`}</span>
            <button type="button" onClick={() => setRedemptions(null)} className="text-xs text-gray-500 hover:underline">Close</button>
          </div>
          {redemptions.error && <p role="alert" className="text-sm text-red-600">{redemptions.error}</p>}
          {!redemptions.error && redemptions.rows.length > 0 && (
            <ul className="divide-y divide-gray-100 text-sm">
              {redemptions.rows.map((row) => (
                <li key={row.id} className="flex justify-between gap-3 py-2">
                  <span>{row.email || row.userId}</span>
                  <span className="text-gray-500">{`${coinsText(row.coins)} coins · ${new Date(row.createdAt).toLocaleString()}`}</span>
                </li>
              ))}
            </ul>
          )}
          {!redemptions.error && redemptions.rows.length === 0 && <p className="text-sm text-gray-500">Nobody has redeemed it yet.</p>}
        </div>
      )}
    </div>
  );
}
