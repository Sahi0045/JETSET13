import axios from 'axios';
import { withCache, get, set } from './cache.service.js';

const EXCHANGE_API = process.env.EXCHANGE_RATE_API || 'https://api.exchangerate.host';
const API_KEY = process.env.EXCHANGE_API_KEY;

const FALLBACK_RATES = {
  USD: 1,
  INR: 83.35,
  EUR: 0.92,
  GBP: 0.79,
  AED: 3.67,
  SGD: 1.34,
  AUD: 1.53,
  CAD: 1.36,
  JPY: 149.50,
  THB: 35.50,
};

export async function getExchangeRates(baseCurrency = 'USD') {
  const cacheKey = `exchange_rates_${baseCurrency}`;

  const rates = await withCache(cacheKey, 3600, async () => {
    try {
      if (!API_KEY || API_KEY === 'demo') {
        console.log('[Currency] Using fallback rates (no API key)');
        return FALLBACK_RATES;
      }

      const response = await axios.get(`${EXCHANGE_API}/latest`, {
        params: { base: baseCurrency, access_key: API_KEY },
        timeout: 5000
      });

      if (response.data && response.data.rates) {
        return { ...FALLBACK_RATES, ...response.data.rates };
      }
    } catch (error) {
      console.error('[Currency] API fetch failed:', error.message);
    }

    return FALLBACK_RATES;
  });

  return rates;
}

export async function convertCurrency(amount, fromCurrency, toCurrency) {
  if (fromCurrency === toCurrency) return amount;

  const rates = await getExchangeRates(fromCurrency);
  const rate = rates[toCurrency];

  if (!rate) {
    console.warn(`[Currency] No rate for ${toCurrency}, using 1:1`);
    return amount;
  }

  return amount * rate;
}

export function formatCurrency(amount, currencyCode) {
  const symbols = {
    USD: '$', INR: '₹', EUR: '€', GBP: '£', AED: 'د.إ',
    SGD: 'S$', AUD: 'A$', CAD: 'C$', JPY: '¥', THB: '฿'
  };

  const symbol = symbols[currencyCode] || '$';
  const noDecimals = ['INR', 'JPY', 'THB'].includes(currencyCode);

  const formatted = noDecimals
    ? Math.round(amount).toLocaleString()
    : amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  return `${symbol}${formatted}`;
}

export async function getSupportedCurrencies() {
  return Object.keys(FALLBACK_RATES);
}

export async function getCurrencyForCountry(countryCode) {
  const countryToCurrency = {
    US: 'USD', IN: 'INR', GB: 'GBP', UK: 'GBP',
    DE: 'EUR', FR: 'EUR', IT: 'EUR', ES: 'EUR',
    AE: 'AED', SG: 'SGD', AU: 'AUD', CA: 'CAD',
    JP: 'JPY', TH: 'THB'
  };

  return countryToCurrency[countryCode] || 'USD';
}

export function getExchangeRate(fromCurrency, toCurrency) {
  return FALLBACK_RATES[toCurrency] / FALLBACK_RATES[fromCurrency];
}