import React, { useEffect, useState } from 'react';
import currencyService from '../Services/CurrencyService';
import { approximateCharge, formatUsd } from '../utils/chargeDisplay';

/**
 * An amount the customer is about to be charged, in US dollars - the currency
 * the card is actually charged in.
 *
 * With `approximate`, and only while the exchange rates are live ones, it adds
 * roughly what that is in the currency the visitor browses in, marked as an
 * estimate. <Price> converts silently, which suits browsing fares and misleads
 * where the money is taken: see utils/chargeDisplay.js.
 */
export default function ChargeAmount({ amount, approximate = false, className = '', approximateClassName = '' }) {
  const [, refresh] = useState(0);

  useEffect(() => {
    // A new display currency, or fresh rates, change what the estimate says.
    const onChange = () => refresh((n) => n + 1);
    window.addEventListener('currencyChanged', onChange);
    return () => window.removeEventListener('currencyChanged', onChange);
  }, []);

  const currency = currencyService.getCurrency();
  const estimate = approximate
    ? approximateCharge(amount, {
      currency,
      rate: currencyService.getExchangeRate(currency),
      ratesLive: currencyService.hasLiveRates(),
    })
    : null;

  return (
    <span className={className}>
      <span data-charge-amount="">{formatUsd(amount)}</span>
      {estimate && (
        <span className={approximateClassName || 'block text-xs font-normal text-gray-500'} data-charge-estimate="">
          about {currencyService.formatPrice(estimate.amount, estimate.currency)} (estimate)
        </span>
      )}
    </span>
  );
}
