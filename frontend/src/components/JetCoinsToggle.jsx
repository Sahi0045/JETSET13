import React from 'react';
import { coinsToUsd, formatCoins, maxWalletCoinsFor } from '../../../shared/jetCoins.js';

const usd = (amount) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

export default function JetCoinsToggle({ balance = 0, held = 0, afterCoupon, useCoins, onChange }) {
  if (!(balance > 0) && !(held > 0)) return null;
  const usable = maxWalletCoinsFor(afterCoupon, balance);
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
      {balance > 0 && usable <= 0 && (
        <p className="mt-1 text-xs text-gray-500">At least $1.00 has to be paid by card, so coins cannot be used on this total.</p>
      )}
      {held > 0 && (
        <p className="mt-1 text-xs text-gray-500">
          {formatCoins(held)} coins are held for a payment page you opened. They come back within 3 hours if that payment is not completed.
        </p>
      )}
    </div>
  );
}
