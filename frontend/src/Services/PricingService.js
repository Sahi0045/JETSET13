import { getApiUrl } from '../utils/apiHelper';

class PricingService {
  constructor() {
    this.settings = null;
    this.settingsCache = {};
    this.cacheExpiry = {};
    this.DEFAULT_CACHE_TIME = 5 * 60 * 1000; // 5 minutes
  }

  // Get cached settings for a specific service or fetch from API
  async getPriceConfig(service = 'all') {
    const cacheKey = `pricing_${service}`;
    const now = Date.now();
    
    // Check if we have valid cached data
    if (this.settingsCache[cacheKey] && this.cacheExpiry[cacheKey] > now) {
      return this.settingsCache[cacheKey];
    }

    try {
      const endpoint = service === 'all' ? 'admin/price-settings' : `admin/price-config/${service}`;
      const response = await fetch(getApiUrl(endpoint));
      const result = await response.json();

      if (result.success) {
        this.settingsCache[cacheKey] = result.data;
        this.cacheExpiry[cacheKey] = now + this.DEFAULT_CACHE_TIME;
        return result.data;
      } else {
        console.warn('Failed to fetch price config, using defaults');
        return this.getDefaultSettings(service);
      }
    } catch (error) {
      console.warn('Error fetching price config, using defaults:', error);
      return this.getDefaultSettings(service);
    }
  }

  // Get default settings for fallback
  getDefaultSettings(service = 'all') {
    const defaults = {
      flight_taxes_fees: 25.00,
      flight_taxes_fees_percentage: 5.0,
      cruise_taxes_fees: 150.00,
      cruise_taxes_fees_percentage: 8.0,
      cruise_port_charges: 50.00,
      hotel_taxes_fees: 35.00,
      hotel_taxes_fees_percentage: 12.0,
      package_markup_percentage: 10.0,
      service_fee_percentage: 2.5,
      cancellation_fee: 50.00
    };

    if (service === 'all') return defaults;

    switch (service) {
      case 'flights':
        return {
          taxes_fees: defaults.flight_taxes_fees,
          taxes_fees_percentage: defaults.flight_taxes_fees_percentage
        };
      case 'cruises':
        return {
          taxes_fees: defaults.cruise_taxes_fees,
          taxes_fees_percentage: defaults.cruise_taxes_fees_percentage,
          port_charges: defaults.cruise_port_charges
        };
      case 'hotels':
        return {
          taxes_fees: defaults.hotel_taxes_fees,
          taxes_fees_percentage: defaults.hotel_taxes_fees_percentage
        };
      case 'general':
        return {
          package_markup_percentage: defaults.package_markup_percentage,
          service_fee_percentage: defaults.service_fee_percentage,
          cancellation_fee: defaults.cancellation_fee
        };
      default:
        return defaults;
    }
  }

  // Calculate flight pricing with dynamic taxes and fees
  async calculateFlightPrice(baseFare, passengers = 1) {
    const config = await this.getPriceConfig('flights');
    
    const fixedTaxes = config.taxes_fees * passengers;
    const percentageTaxes = baseFare * (config.taxes_fees_percentage / 100);
    const totalTaxes = fixedTaxes + percentageTaxes;
    
    return {
      baseFare: baseFare,
      totalTax: totalTaxes,
      fixedTaxes: fixedTaxes,
      percentageTaxes: percentageTaxes,
      totalPrice: baseFare + totalTaxes
    };
  }

  // Calculate cruise pricing with dynamic taxes, fees, and port charges
  async calculateCruisePrice(baseFare, passengers = 1) {
    const config = await this.getPriceConfig('cruises');
    
    const fixedTaxes = config.taxes_fees * passengers;
    const percentageTaxes = baseFare * (config.taxes_fees_percentage / 100);
    const portCharges = config.port_charges * passengers;
    const totalAdditional = fixedTaxes + percentageTaxes + portCharges;
    
    return {
      baseFare: baseFare,
      fixedTaxes: fixedTaxes,
      percentageTaxes: percentageTaxes,
      portCharges: portCharges,
      totalAdditional: totalAdditional,
      totalPrice: baseFare + totalAdditional,
      taxes_and_fees: fixedTaxes + percentageTaxes
    };
  }

  // Calculate hotel pricing with dynamic taxes and fees
  async calculateHotelPrice(roomRate, nights = 1, rooms = 1) {
    const config = await this.getPriceConfig('hotels');
    
    const baseTotal = roomRate * nights * rooms;
    const fixedTaxes = config.taxes_fees * nights * rooms;
    const percentageTaxes = baseTotal * (config.taxes_fees_percentage / 100);
    const totalTaxes = fixedTaxes + percentageTaxes;
    
    return {
      baseTotal: baseTotal,
      fixedTaxes: fixedTaxes,
      percentageTaxes: percentageTaxes,
      totalTaxes: totalTaxes,
      totalPrice: baseTotal + totalTaxes
    };
  }

  // Calculate package pricing with markup
  async calculatePackagePrice(flightPrice, hotelPrice, additionalServices = 0) {
    const config = await this.getPriceConfig('general');
    
    const subtotal = flightPrice + hotelPrice + additionalServices;
    const markup = subtotal * (config.package_markup_percentage / 100);
    const serviceFee = subtotal * (config.service_fee_percentage / 100);
    
    return {
      flightPrice: flightPrice,
      hotelPrice: hotelPrice,
      additionalServices: additionalServices,
      subtotal: subtotal,
      markup: markup,
      serviceFee: serviceFee,
      totalPrice: subtotal + markup + serviceFee
    };
  }

  // Get cancellation fee
  async getCancellationFee() {
    const config = await this.getPriceConfig('general');
    return config.cancellation_fee || 50.00;
  }

  // Clear cache (useful when settings are updated)
  clearCache() {
    this.settingsCache = {};
    this.cacheExpiry = {};
  }

  // Format currency for display
  formatCurrency(amount, currency = 'USD') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  }
}

// Create and export a singleton instance
const pricingService = new PricingService();
export default pricingService;