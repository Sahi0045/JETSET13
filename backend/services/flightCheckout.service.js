import axios from 'axios';
import { computeFlightCharge, roundMoney } from '../../shared/flightCharge.js';
import { DEFAULT_PRICE_SETTINGS } from '../config/priceDefaults.js';
import { evaluateCoupon } from './coupon.service.js';

/**
 * Verify what a flight checkout is about to charge, before ARC Pay sees it.
 *
 * Hosted checkout used to take `amount` from the request body verbatim. The
 * offer was in the same payload and nothing priced it, so the charge was
 * whatever the page computed - four fares for two adults, $90 of add-ons that
 * did not exist - or whatever a tampered request said. And nothing re-priced
 * before payment at all: a fare that had moved or expired was discovered only
 * after the card was charged.
 *
 * Now the server prices the offer with the airline, applies the configured
 * service fee and any coupon itself, and refuses unless the requested amount is
 * that figure to the cent.
 */

/** Where pricing runs. Vercel cannot reach Amadeus (it allow-lists Lightsail's IP). */
const pricingBase = () => process.env.FLIGHTS_API_BASE
  || (process.env.VERCEL ? 'https://api.jetsetterss.com' : '');

/**
 * The airline's current price for this offer.
 *
 * On Lightsail and in local development the provider is called directly. On
 * Vercel the same route the review page uses is called over HTTPS - the very
 * route vercel.json already forwards to Lightsail for every flight request.
 */
export async function priceOfferForCheckout(offer) {
  const base = pricingBase();
  if (base) {
    const resp = await axios.post(
      `${base.replace(/\/$/, '')}/api/flights/price`,
      { flightOffer: offer },
      { timeout: 25000, validateStatus: () => true },
    );
    const priced = resp?.data?.data?.flightOffers?.[0];
    if (resp?.status !== 200 || !resp?.data?.success || !priced?.price) {
      throw new Error(`pricing answered ${resp?.status}: ${resp?.data?.error || 'no priced offer'}`);
    }
    return priced;
  }

  const { default: FlightProvider } = await import('./flightProvider.js');
  const result = await FlightProvider.priceFlightOffer(offer);
  const priced = result?.data?.flightOffers?.[0];
  if (!result?.success || !priced?.price) throw new Error(result?.error || 'pricing returned no offer');
  return priced;
}

/** The configured price settings, merged over the defaults exactly as the page receives them. */
export async function readPriceSettings(client) {
  const { data, error } = await client.from('price_settings').select('*').single();
  if (error && error.code !== 'PGRST116') throw error;
  if (!data) return null;
  return { ...DEFAULT_PRICE_SETTINGS, ...(data.settings || {}) };
}

const refuse = (status, code, message, extra = {}) => ({ ok: false, status, code, message, ...extra });

/**
 * @returns {Promise<
 *   {ok: true, charge, coupon, pricedFare} |
 *   {ok: false, status, code, message, charge?, pricedFare?}
 * >}
 */
export async function verifyFlightCharge({
  client,
  amount,
  bookingData,
  couponCode,
  userId,
  settlementCurrency = 'USD',
  priceOffer = priceOfferForCheckout,
} = {}) {
  const offer = bookingData?.originalOffer;
  const pricedFor = Array.isArray(offer?.travelerPricings) ? offer.travelerPricings.length : 0;
  if (!offer || pricedFor === 0) {
    return refuse(400, 'OFFER_MISSING', 'Your flight selection did not reach us. Please search again.');
  }

  // The fare covers exactly the travellers it was priced for. Extra travellers
  // added on the page were charged for and then booked on the wrong fare.
  const travellers = Array.isArray(bookingData?.passengerData) ? bookingData.passengerData.length : 0;
  if (travellers !== pricedFor) {
    return refuse(400, 'PASSENGER_COUNT_MISMATCH',
      `This fare is for ${pricedFor} traveller${pricedFor === 1 ? '' : 's'}. Please search again for the number travelling.`);
  }

  let priced;
  try {
    priced = await priceOffer(offer);
  } catch (error) {
    console.warn('⚠️ Checkout pricing failed:', error?.message || error);
    return refuse(503, 'PRICE_UNAVAILABLE', 'We could not confirm the current fare with the airline. Please try again in a moment.');
  }

  const pricedCurrency = priced?.price?.currency;
  const fareTotal = Number(priced?.price?.grandTotal ?? priced?.price?.total);
  const pricedFare = {
    total: Number.isFinite(fareTotal) ? roundMoney(fareTotal) : null,
    base: Number.isFinite(Number(priced?.price?.base)) ? roundMoney(priced.price.base) : null,
    currency: pricedCurrency || null,
  };

  // The merchant settles only in USD. A fare in anything else would be charged
  // its number as dollars.
  if (pricedCurrency && pricedCurrency !== settlementCurrency) {
    return refuse(400, 'CURRENCY_UNSUPPORTED', 'This fare cannot be paid online. Please call (877) 538-7380 to book it.', { pricedFare });
  }
  if (!Number.isFinite(fareTotal) || fareTotal <= 0) {
    return refuse(503, 'PRICE_UNAVAILABLE', 'We could not confirm the current fare with the airline. Please try again in a moment.');
  }

  let config = null;
  try {
    config = await readPriceSettings(client);
  } catch (error) {
    console.warn('⚠️ Checkout could not read price settings:', error?.message || error);
  }
  if (!config) {
    return refuse(503, 'PRICE_CONFIG_UNAVAILABLE', 'Pricing is temporarily unavailable. Please try again shortly.');
  }

  let discount = 0;
  let coupon = null;
  if (couponCode) {
    const beforeDiscount = computeFlightCharge({ fareTotal, passengers: pricedFor, config });
    const evaluated = await evaluateCoupon(client, {
      code: couponCode,
      orderTotal: beforeDiscount.total,
      bookingType: 'flights',
      userId,
    });
    if (!evaluated.ok) {
      return refuse(409, 'COUPON_INVALID', evaluated.message, { pricedFare });
    }
    discount = evaluated.discountAmount;
    coupon = { id: evaluated.coupon.id, code: evaluated.coupon.code, discountAmount: discount };
  }

  const charge = computeFlightCharge({ fareTotal, passengers: pricedFor, config, discount });
  const requested = roundMoney(amount);

  if (Math.abs(requested - charge.total) > 0.01) {
    return refuse(409, 'PRICE_CHANGED',
      `The total for this booking is ${charge.total.toFixed(2)} ${settlementCurrency}. Please review it before paying.`,
      { charge, pricedFare });
  }

  return { ok: true, charge, coupon, pricedFare };
}
