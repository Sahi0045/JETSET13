import React, { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost } from '../../../utils/apiHelper';
import { coinsToUsd, formatCoins } from '../../../../../shared/jetCoins.js';

const usd = (amount) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

const DESCRIBE = {
  voucher: (entry) => `Voucher ${entry.note || ''}`.trim(),
  earn: (entry) => `Earned on booking ${entry.booking_reference}`,
  earn_reversal: (entry) => `Earned coins taken back, booking ${entry.booking_reference} refunded`,
  hold: (entry) => `Used on booking ${entry.booking_reference}`,
  release: (entry) => `Returned, payment not completed for ${entry.booking_reference}`,
  return: (entry) => `Returned from booking ${entry.booking_reference}`,
};

// A server `error` is the customer's to read only when the wallet routes worded it; `protect` and unexpected failures put raw text there (e.g. "jwt expired").
const isCustomerMessage = (body) => typeof body?.error === 'string'
  && (String(body.code).startsWith('VOUCHER_') || body.code === 'RATE_LIMITED' || body.code === 'WALLET_UNAVAILABLE');

const describeEntry = (entry) => (DESCRIBE[entry.kind] || (() => 'Wallet activity'))(entry);

export default function JetWalletPanel() {
  const [wallet, setWallet] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    try {
      const response = await apiGet('wallet');
      const body = await response.json();
      if (!response.ok || !body?.success) throw new Error(body?.error || 'unavailable');
      setWallet(body.data);
      setLoadError(null);
    } catch {
      setLoadError('Your Jet Wallet could not be loaded just now. Please try again.');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const redeem = async (event) => {
    event.preventDefault();
    const cleaned = code.trim().toUpperCase();
    if (!cleaned || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const response = await apiPost('wallet/redeem', { code: cleaned });
      if (response.status === 401) {
        setNotice({ tone: 'error', text: 'Please sign in again to redeem a voucher.' });
        return;
      }
      const body = await response.json();
      if (!response.ok || !body?.success) {
        setNotice({ tone: 'error', text: isCustomerMessage(body) ? body.error : 'The voucher could not be redeemed.' });
      } else {
        setNotice({ tone: 'success', text: `${formatCoins(body.data.coins)} Jet Coins added to your wallet.` });
        setCode('');
        const balance = Number(body.data.balance);
        if (Number.isFinite(balance)) setWallet((current) => (current ? { ...current, balance } : current));
        await load();
      }
    } catch {
      setNotice({ tone: 'error', text: 'The voucher could not be redeemed just now. Please try again.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="content-section">
      <div className="section-header">
        <div className="section-title-group">
          <h2>Jet Wallet</h2>
          <p>Your Jet Coins, voucher codes and coin history</p>
        </div>
      </div>

      <div className="space-y-6">
        <div className="rounded-2xl bg-gradient-to-br from-[#055B75] to-[#034457] p-6 text-white">
          <div className="text-sm opacity-80">Jet Wallet balance</div>
          {wallet ? (
            <>
              <div className="mt-1 text-4xl font-bold">{formatCoins(wallet.balance)}</div>
              <div className="text-sm opacity-90">Jet Coins · worth <span>{usd(coinsToUsd(wallet.balance))}</span></div>
              {wallet.held > 0 && (
                <div className="mt-2 text-xs opacity-80">
                  {formatCoins(wallet.held)} coins set aside for a checkout in progress. They come back if it is not completed.
                </div>
              )}
            </>
          ) : (
            <div className="mt-2 text-sm opacity-80">{loadError || 'Loading…'}</div>
          )}
          <p className="mt-3 text-xs opacity-80">100 Jet Coins = $1. Earn 1 coin for every $1 you pay for flights, and use them at checkout.</p>
        </div>

        <form onSubmit={redeem} className="rounded-2xl border border-gray-200 bg-white p-5">
          <label htmlFor="voucher-code" className="block text-sm font-semibold text-gray-900">Voucher code</label>
          <div className="mt-2 flex gap-2">
            <input
              id="voucher-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              maxLength={32}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm uppercase placeholder:normal-case focus:border-[#055B75] focus:outline-none focus:ring-1 focus:ring-[#055B75]"
              placeholder="Enter voucher code"
            />
            <button type="submit" disabled={busy || !code.trim()} className="rounded-lg bg-[#055B75] px-4 py-2 text-sm font-semibold text-white hover:bg-[#034457] disabled:opacity-50">
              Redeem
            </button>
          </div>
          {notice && (
            <p role={notice.tone === 'error' ? 'alert' : 'status'} className={`mt-2 text-sm ${notice.tone === 'error' ? 'text-red-600' : 'text-emerald-700'}`}>
              {notice.text}
            </p>
          )}
        </form>

        <div className="rounded-2xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-5 py-3 text-sm font-semibold text-gray-900">History</div>
          {wallet?.entries?.length ? (
            <ul className="divide-y divide-gray-100">
              {wallet.entries.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <div className="text-sm text-gray-900">{describeEntry(entry)}</div>
                    <div className="text-xs text-gray-500">{new Date(entry.created_at).toLocaleString()}</div>
                  </div>
                  <div className={`flex-shrink-0 text-sm font-semibold ${entry.coins >= 0 ? 'text-emerald-700' : 'text-gray-700'}`}>
                    {entry.coins >= 0 ? '+' : '−'}{formatCoins(Math.abs(entry.coins))}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-4 text-sm text-gray-500">No coins yet. Redeem a voucher or book a flight to start earning.</p>
          )}
        </div>
      </div>
    </div>
  );
}
