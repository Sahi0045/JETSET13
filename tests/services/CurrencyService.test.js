import { describe, it, expect, vi, beforeEach } from 'vitest';

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
    const mod = await import('../../resources/js/Services/CurrencyService.js');
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
});
