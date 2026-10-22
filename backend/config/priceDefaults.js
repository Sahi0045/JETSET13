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
  flight_cancellation_fee: 50.00,
  flight_cancellation_fee_percent: null,
});

const usableFee = (raw) => {
  if (raw === null || raw === undefined || raw === '') return null;
  const fee = Number(raw);
  return Number.isFinite(fee) && fee >= 0 ? fee : null;
};

/**
 * The fee a flight cancel keeps, from the STORED settings row. Falls back to
 * the general `cancellation_fee` until someone saves a flight fee, so the day
 * this setting appeared no flight cancel kept a different amount.
 */
export function flightCancellationFeeFrom(settings) {
  return usableFee(settings?.flight_cancellation_fee) ?? usableFee(settings?.cancellation_fee) ?? DEFAULT_PRICE_SETTINGS.cancellation_fee;
}

/**
 * The share of what a customer paid that a flight cancel keeps, 0-100, or null
 * until an admin saves one. While null the fixed fee above still applies, so
 * nothing changed for customers the day the percentage appeared.
 */
export function flightCancellationPercentFrom(settings) {
  const percent = usableFee(settings?.flight_cancellation_fee_percent);
  return percent !== null && percent <= 100 ? percent : null;
}

/** The fee a flight cancel keeps for a booking that cost `paid`; null when a percentage is set and `paid` is unknown. */
export function flightCancellationFeeFor(settings, paid) {
  const percent = flightCancellationPercentFrom(settings);
  if (percent === null) return flightCancellationFeeFrom(settings);
  const amount = paid === null || paid === undefined || paid === '' ? NaN : Number(paid);
  if (!Number.isFinite(amount)) return null;
  return Math.round(Math.round(amount * 100) * percent / 100) / 100;
}
