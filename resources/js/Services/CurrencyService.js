/**
 * Currency Service
 * Handles currency detection, conversion, and formatting based on user location.
 */

// Exchange rates (simplified for demonstration)
// In a production app, these would be fetched from a currency API
const EXCHANGE_RATES = {
  USD: 1, // Base currency
  INR: 83.35, // 1 USD = 83.35 INR
  EUR: 0.92, // 1 USD = 0.92 EUR
  GBP: 0.79, // 1 USD = 0.79 GBP
};

// Currency symbols and formats
const CURRENCY_CONFIG = {
  USD: {
    symbol: '$',
    code: 'USD',
    placement: 'before', // symbol before number
    format: (value) => `$${value}`
  },
  INR: {
    symbol: '₹',
    code: 'INR',
    placement: 'before',
    format: (value) => `₹${value}`
  },
  EUR: {
    symbol: '€',
    code: 'EUR',
    placement: 'before',
    format: (value) => `€${value}`
  },
  GBP: {
    symbol: '£',
    code: 'GBP',
    placement: 'before',
    format: (value) => `£${value}`
  }
};

// Country to currency mapping
const COUNTRY_CURRENCY = {
  'US': 'USD',
  'IN': 'INR',
  'GB': 'GBP',
  'UK': 'GBP', // Alias for Great Britain
  'IE': 'EUR',
  'FR': 'EUR',
  'DE': 'EUR',
  'IT': 'EUR',
  'ES': 'EUR',
  // Add more country codes as needed
};

// Default currency
const DEFAULT_CURRENCY = 'USD';

class CurrencyService {
  constructor() {
    this.currentCurrency = DEFAULT_CURRENCY;
    this.detectUserCurrency();
  }

  /**
   * Detect user's currency based on their location
   * Uses browser API and falls back to an IP geolocation service
   */
  async detectUserCurrency() {
    try {
      // Check if user has already set a preference
      const storedCurrency = localStorage.getItem('userCurrency');
      if (storedCurrency && CURRENCY_CONFIG[storedCurrency]) {
        this.currentCurrency = storedCurrency;
        return;
      }

      // Default to USD for production environment to avoid server-side detection
      // Only attempt geolocation if explicitly requested by user
      if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
        this.currentCurrency = DEFAULT_CURRENCY;
        localStorage.setItem('userCurrency', this.currentCurrency);

        // Dispatch an event so components can update
        window.dispatchEvent(new CustomEvent('currencyChanged', {
          detail: { currency: this.currentCurrency }
        }));
        return;
      }

      // Try browser's navigator.language first (quick but less accurate)
      const browserLocale = navigator.language || navigator.userLanguage;
      if (browserLocale) {
        const country = browserLocale.split('-')[1]?.toUpperCase();
        if (country && COUNTRY_CURRENCY[country]) {
          this.currentCurrency = COUNTRY_CURRENCY[country];
          localStorage.setItem('userCurrency', this.currentCurrency);

          // Dispatch an event so components can update
          window.dispatchEvent(new CustomEvent('currencyChanged', {
            detail: { currency: this.currentCurrency }
          }));
          return;
        }
      }

      // Fall back to IP-based geolocation only for localhost/development
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        const response = await fetch('/api/geo/location');
        const data = await response.json();

        if (data && data.country) {
          const country = data.country;
          this.currentCurrency = COUNTRY_CURRENCY[country] || DEFAULT_CURRENCY;
        }
      }
    } catch (error) {
      console.error("Error detecting user currency:", error);
      // Fallback to default currency
      this.currentCurrency = DEFAULT_CURRENCY;
    }

    // Store the currency preference
    localStorage.setItem('userCurrency', this.currentCurrency);

    // Dispatch an event so components can update
    window.dispatchEvent(new CustomEvent('currencyChanged', {
      detail: { currency: this.currentCurrency }
    }));
  }

  /**
   * Get the current currency code
   */
  getCurrency() {
    // Check if user has manually set a currency preference
    const storedCurrency = localStorage.getItem('userCurrency');
    return storedCurrency || this.currentCurrency || DEFAULT_CURRENCY;
  }

  /**
   * Set currency manually
   */
  setCurrency(currencyCode) {
    if (CURRENCY_CONFIG[currencyCode]) {
      this.currentCurrency = currencyCode;
      localStorage.setItem('userCurrency', currencyCode);

      // Dispatch an event so components can update
      window.dispatchEvent(new CustomEvent('currencyChanged', {
        detail: { currency: currencyCode }
      }));
    }
  }

  /**
   * Convert price from USD to the target currency
   * @param {number} priceInUSD - The price in USD
   * @param {string} targetCurrency - The target currency code (defaults to current currency)
   * @returns {number} - The converted price
   */
  convertPrice(priceInUSD, targetCurrency = null) {
    const currency = targetCurrency || this.getCurrency();
    const rate = EXCHANGE_RATES[currency] || 1;

    return priceInUSD * rate;
  }

  /**
   * Format the price according to the currency's format
   * @param {number} price - The price to format
   * @param {string} currencyCode - The currency code to use for formatting
   * @returns {string} - The formatted price string
   */
  formatPrice(price, currencyCode = null) {
    const currency = currencyCode || this.getCurrency();
    const config = CURRENCY_CONFIG[currency] || CURRENCY_CONFIG[DEFAULT_CURRENCY];

    // Round to 2 decimal places
    let formattedValue = Math.round(price * 100) / 100;

    // For INR, round to whole numbers
    if (currency === 'INR') {
      formattedValue = Math.round(formattedValue);
    }

    // Format with thousand separators
    formattedValue = formattedValue.toLocaleString('en-US', {
      minimumFractionDigits: currency === 'INR' ? 0 : 2,
      maximumFractionDigits: currency === 'INR' ? 0 : 2
    });

    // Apply currency-specific formatting
    return config.format(formattedValue);
  }

  /**
   * Convert and format a price in one step
   * @param {number|string} price - The price in USD (can be string with or without $ symbol)
   * @param {string} currencyCode - Optional target currency
   * @returns {string} - The converted and formatted price
   */
  convertAndFormat(price, currencyCode = null) {
    // Extract numeric value if price is a string (e.g., "$1,234.56")
    let numericPrice = price;
    if (typeof price === 'string') {
      numericPrice = parseFloat(price.replace(/[^0-9.]/g, ''));
    }

    if (isNaN(numericPrice)) {
      return price; // Return original if parsing failed
    }

    const convertedPrice = this.convertPrice(numericPrice, currencyCode);
    return this.formatPrice(convertedPrice, currencyCode);
  }

  /**
   * Get the currency symbol
   */
  getCurrencySymbol(currencyCode = null) {
    const currency = currencyCode || this.getCurrency();
    return CURRENCY_CONFIG[currency]?.symbol || '$';
  }

  /**
   * Get exchange rate for a currency
   */
  getExchangeRate(currencyCode) {
    return EXCHANGE_RATES[currencyCode] || 1;
  }
}

// Create a singleton instance
const currencyService = new CurrencyService();

export default currencyService; 