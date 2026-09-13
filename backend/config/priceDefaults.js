/**
 * Price settings used for any key the stored `price_settings` row does not set.
 *
 * Shared by GET /admin/price-settings, which the review page quotes from, and
 * by checkout, which verifies the charge. They must merge the same way or the
 * two disagree about the fee and every checkout is refused.
 */
export const DEFAULT_PRICE_SETTINGS = Object.freeze({
  flight_taxes_fees: 25.00,
  flight_taxes_fees_percentage: 5.0,
  cruise_taxes_fees: 150.00,
  cruise_taxes_fees_percentage: 8.0,
  cruise_port_charges: 50.00,
  hotel_taxes_fees: 35.00,
  hotel_taxes_fees_percentage: 12.0,
  hotel_service_fee_percentage: 5.0,
  package_markup_percentage: 10.0,
  service_fee_percentage: 2.5,
  cancellation_fee: 50.00,
});
