import React from 'react';
import { coinsToUsd, formatCoins, maxWalletCoinsFor } from '../../../shared/jetCoins.js';

const usd = (amount) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

const earnWords = (earn) => (
  <><strong>{formatCoins(earn)} Jet Coins</strong> ({usd(coinsToUsd(earn))})</>
);

export function JetCoinsLoginPrompt({ earn = 0, onLogin }) {
  return (
    <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-[#B9D0DC] bg-[#F1FBFD] p-3">
      <p className="min-w-0 text-xs text-[#034457]">
        {earn > 0
          ? <>Log in to earn {earnWords(earn)} on this booking and use your Jet Coins at checkout.</>
          : 'Log in to earn Jet Coins on your bookings and use them at checkout.'}
      </p>
      <button type="button" onClick={onLogin} className="flex-shrink-0 rounded-lg bg-[#055B75] px-3 py-1.5 text-xs font-semibold text-white">
        Log in
      </button>
    </div>
  );
}

export default function JetCoinsToggle({ balance = 0, held = 0, afterCoupon, limit, useCoins, onChange, earn = 0 }) {
  if (!(balance > 0) && !(held > 0) && !(earn > 0)) return null;
  const usable = maxWalletCoinsFor(afterCoupon, balance, limit);
  const allowed = Math.floor(Number(limit) || 0);
  const isLimited = usable > 0 && usable === allowed && usable < balance;
  return (
    <div className="mt-4 rounded-xl border border-[#B9D0DC] bg-[#F1FBFD] p-3">
      {balance > 0 && (
        <label className="flex items-center justify-between gap-3 cursor-pointer">
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-gray-900">Use my Jet Coins</span>
            <span className="block text-xs text-gray-600">
              {formatCoins(balance)} Jet Coins available ({usd(coinsToUsd(balance))})
              {useCoins && usable > 0 ? ` · −${usd(coinsToUsd(usable))}` : ''}
            </span>
          </span>
          <input
            type="checkbox"
            role="switch"
            className="peer sr-only"
            checked={Boolean(useCoins) && usable > 0}
            disabled={usable <= 0}
            onChange={() => onChange(!useCoins)}
          />
          <span className="relative h-6 w-11 flex-shrink-0 rounded-full bg-gray-300 transition-colors peer-checked:bg-[#055B75] peer-disabled:opacity-50 after:absolute after:top-0.5 after:left-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-5" />
        </label>
      )}
      {isLimited && (
        <p className="mt-1 text-xs text-gray-600">This booking can use up to {usd(coinsToUsd(usable))} of your Jet Coins. The rest stay in your wallet for your next trip.</p>
      )}
      {balance > 0 && usable <= 0 && (
        <p className="mt-1 text-xs text-gray-500">
          {allowed > 0 ? 'At least $1.00 has to be paid by card, so coins cannot be used on this total.' : 'Jet Coins cannot be used on this fare.'}
        </p>
      )}
      {held > 0 && (
        <p className="mt-1 text-xs text-gray-500">
          {formatCoins(held)} coins are held for a payment page you opened. They come back within 3 hours if that payment is not completed.
        </p>
      )}
      {earn > 0 && (
        <p className={`${balance > 0 || held > 0 ? 'mt-2 border-t border-[#B9D0DC] pt-2 ' : ''}text-xs text-[#034457]`}>
          You'll earn {earnWords(earn)} on this booking. They're added to your Jet Wallet once free cancellation ends.
        </p>
      )}
    </div>
  );
}
