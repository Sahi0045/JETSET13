/**
 * CurrencyService is a frontend/browser service (uses localStorage + navigator),
 * so this file must run under jsdom even though it lives in tests/services
 * (which the backend project otherwise runs under node).
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Reset modules before each test so we get a fresh singleton
describe('CurrencyService', () => {
  let currencyService;

  beforeEach(async () => {
    vi.resetModules();
    localStorage.clear();
    // Mock navigator.language
    Object.defineProperty(navigator, 'language', {
      value: 'en-US',
      configurable: true,
    });
    // Mock window.location to be non-localhost so it defaults to USD
    Object.defineProperty(window, 'location', {
      value: { hostname: 'jetset13.com' },
      writable: true,
      configurable: true,
    });
    const mod = await import('../../frontend/src/Services/CurrencyService.js');
    currencyService = mod.default;
  });

  describe('getCurrency', () => {
    it('defaults to USD', () => {
      expect(currencyService.getCurrency()).toBe('USD');
    });

    it('returns stored currency from localStorage', () => {
      localStorage.setItem('userCurrency', 'INR');
      expect(currencyService.getCurrency()).toBe('INR');
    });
  });

  describe('setCurrency', () => {
    it('updates current currency', () => {
      currencyService.setCurrency('EUR');
      expect(currencyService.getCurrency()).toBe('EUR');
    });

    it('stores in localStorage', () => {
      currencyService.setCurrency('GBP');
      expect(localStorage.getItem('userCurrency')).toBe('GBP');
    });

    it('ignores invalid currency codes', () => {
      currencyService.setCurrency('INVALID');
      expect(currencyService.getCurrency()).not.toBe('INVALID');
    });

    it('stores manual flag when isManual=true', () => {
      currencyService.setCurrency('AUD', true);
      expect(localStorage.getItem('userCurrencyManual')).toBe('true');
    });
  });

  describe('convertPrice', () => {
    it('converts USD to INR correctly', () => {
      const result = currencyService.convertPrice(100, 'INR');
      expect(result).toBe(100 * 83.35);
    });

    it('converts USD to EUR correctly', () => {
      const result = currencyService.convertPrice(100, 'EUR');
      expect(result).toBe(100 * 0.92);
    });

    it('returns same price for USD', () => {
      expect(currencyService.convertPrice(100, 'USD')).toBe(100);
    });

    it('returns original price for unknown currency', () => {
      expect(currencyService.convertPrice(100, 'UNKNOWN')).toBe(100);
    });

    it('uses current currency when no target specified', () => {
      currencyService.setCurrency('GBP');
      expect(currencyService.convertPrice(100)).toBe(100 * 0.79);
    });
  });

  describe('formatPrice', () => {
    it('formats USD with $ symbol', () => {
      const result = currencyService.formatPrice(1234.56, 'USD');
      expect(result).toContain('$');
      expect(result).toContain('1,234.56');
    });

    it('formats INR with ₹ symbol and no decimals', () => {
      const result = currencyService.formatPrice(1234.56, 'INR');
      expect(result).toContain('₹');
      expect(result).toContain('1,235'); // Rounded to whole number
    });

    it('formats JPY with no decimals', () => {
      const result = currencyService.formatPrice(1000.75, 'JPY');
      expect(result).toContain('¥');
      expect(result).toContain('1,001');
    });

    it('formats EUR with € symbol', () => {
      const result = currencyService.formatPrice(99.99, 'EUR');
      expect(result).toContain('€');
      expect(result).toContain('99.99');
    });

    it('formats GBP with £ symbol', () => {
      const result = currencyService.formatPrice(50, 'GBP');
      expect(result).toBe('£50.00');
    });
  });

  describe('convertAndFormat', () => {
    it('converts and formats a number', () => {
      const result = currencyService.convertAndFormat(100, 'EUR');
      expect(result).toContain('€');
      expect(result).toContain('92.00');
    });

    it('handles string price with $ symbol', () => {
      const result = currencyService.convertAndFormat('$100.00', 'USD');
      expect(result).toBe('$100.00');
    });

    it('handles string price with comma separators', () => {
      const result = currencyService.convertAndFormat('$1,234.56', 'USD');
      expect(result).toBe('$1,234.56');
    });

    it('returns original string for non-numeric input', () => {
      const result = currencyService.convertAndFormat('N/A');
      expect(result).toBe('N/A');
    });
  });

  describe('getCurrencySymbol', () => {
    it('returns $ for USD', () => {
      expect(currencyService.getCurrencySymbol('USD')).toBe('$');
    });

    it('returns ₹ for INR', () => {
      expect(currencyService.getCurrencySymbol('INR')).toBe('₹');
    });

    it('returns € for EUR', () => {
      expect(currencyService.getCurrencySymbol('EUR')).toBe('€');
    });

    it('returns $ as fallback for unknown currency', () => {
      expect(currencyService.getCurrencySymbol('UNKNOWN')).toBe('$');
    });
  });

  describe('getExchangeRate', () => {
    it('returns 1 for USD', () => {
      expect(currencyService.getExchangeRate('USD')).toBe(1);
    });

    it('returns correct rate for INR', () => {
      expect(currencyService.getExchangeRate('INR')).toBe(83.35);
    });

    it('returns 1 for unknown currency', () => {
      expect(currencyService.getExchangeRate('UNKNOWN')).toBe(1);
    });
  });

  describe('isManuallySet', () => {
    it('returns false by default', () => {
      expect(currencyService.isManuallySet()).toBe(false);
    });

    it('returns true after manual setCurrency', () => {
      currencyService.setCurrency('AUD', true);
      expect(currencyService.isManuallySet()).toBe(true);
    });
  });

  /**
   * The flight review page shows a converted estimate beside the dollar charge
   * only from live rates. The hardcoded table, and the server's copy of it sent
   * when no FX source answered, used to be applied and cached as if live.
   */
  describe('hasLiveRates', () => {
    const answer = (body) => vi.fn().mockResolvedValue({ json: async () => body });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('is false until a live source answers', () => {
      expect(currencyService.hasLiveRates()).toBe(false);
    });

    it('is true once the server sends live rates, and caches them as live', async () => {
      vi.stubGlobal('fetch', answer({ success: true, base: 'USD', rates: { USD: 1, INR: 88.1 }, source: 'open.er-api.com' }));

      await currencyService.loadLiveRates();

      expect(currencyService.hasLiveRates()).toBe(true);
      expect(currencyService.getExchangeRate('INR')).toBe(88.1);
      expect(JSON.parse(localStorage.getItem('fxRates')).live).toBe(true);
    });

    it("does not count the server's hardcoded fallback as live, or cache it", async () => {
      vi.stubGlobal('fetch', answer({ success: false, base: 'USD', rates: { USD: 1, INR: 83.35 }, source: 'fallback' }));

      await currencyService.loadLiveRates();

      expect(currencyService.hasLiveRates()).toBe(false);
      expect(localStorage.getItem('fxRates')).toBeNull();
    });

    it('does not trust a cached snapshot that does not say it was live', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
      localStorage.setItem('fxRates', JSON.stringify({ rates: { USD: 1, INR: 83.35 }, at: Date.now() }));

      await currencyService.loadLiveRates();

      expect(currencyService.hasLiveRates()).toBe(false);
    });

    it('trusts a recent snapshot of live rates while offline', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
      localStorage.setItem('fxRates', JSON.stringify({ rates: { USD: 1, INR: 87.9 }, at: Date.now(), live: true }));

      await currencyService.loadLiveRates();

      expect(currencyService.hasLiveRates()).toBe(true);
      expect(currencyService.getExchangeRate('INR')).toBe(87.9);
    });
  });
});
