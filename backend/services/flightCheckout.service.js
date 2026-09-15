import axios from 'axios';
import { computeFlightCharge, roundMoney, travellerTypesOf } from '../../shared/flightCharge.js';
import { needsDateOfBirth } from '../../shared/travellerDetails.js';
import { NAME_MISSING, travellerNameProblem } from '../../shared/passengerName.js';
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

/**
 * Whether a pricing failure is the airline refusing this fare - gone, changed,
 * or not sellable as described - rather than a failure to reach the airline.
 *
 * The SOAP client answers a refusal with a 409 (or a 400 for a request it
 * cannot sell at all) and an outage with a 5xx. Checkout used to turn both into
 * "try again in a moment", and dropped the provider's "please search again":
 * a customer on a fare that could no longer be sold retried for ever.
 */
export const isFareRefusal = (error) => error?.name === 'AmadeusSoapError' && [400, 409].includes(Number(error?.code));

/** A pricing failure checkout answers with "search again", not "try again". */
const fareRefused = (reason) => Object.assign(new Error(`the airline refused to price the fare: ${reason}`), { fareUnavailable: true });

/** Where pricing runs. Vercel cannot reach Amadeus (it allow-lists Lightsail's IP). */
const pricingBase = () => process.env.FLIGHTS_API_BASE
  || (process.env.VERCEL ? 'https://api.jetsetterss.com' : '');

/**
 * The airline's current price for this offer, and whether the trip crosses a
 * border.
 *
 * On Lightsail and in local development the provider is called directly. On
 * Vercel the same route the review page uses is called over HTTPS - the very
 * route vercel.json already forwards to Lightsail for every flight request.
 * The border answer comes from the same place the order route decides it (the
 * Lightsail airport index), so checkout and booking can never disagree about
 * whether a traveller needs a date of birth. It rides on `_ama.international`.
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
    if (resp?.data?.code === 'FARE_UNAVAILABLE') {
      throw fareRefused(resp?.data?.error || `pricing answered ${resp?.status}`);
    }
    if (resp?.status !== 200 || !resp?.data?.success || !priced?.price) {
      throw new Error(`pricing answered ${resp?.status}: ${resp?.data?.error || 'no priced offer'}`);
    }
    const international = resp?.data?.meta?.international;
    return typeof international === 'boolean' ? { ...priced, _ama: { ...priced._ama, international } } : priced;
  }

  const { default: FlightProvider } = await import('./flightProvider.js');
  let result;
  try {
    result = await FlightProvider.priceFlightOffer(offer);
  } catch (error) {
    if (isFareRefusal(error)) throw fareRefused(error.technicalError || error.message);
    throw error;
  }
  const priced = result?.data?.flightOffers?.[0];
  if (!result?.success || !priced?.price) throw new Error(result?.error || 'pricing returned no offer');
  const { crossesBorder } = await import('../utils/itinerary.js');
  return { ...priced, _ama: { ...priced._ama, international: crossesBorder(priced) } };
}

/** The configured price settings, merged over the defaults exactly as the page receives them. */
export async function readPriceSettings(client) {
  const { data, error } = await client.from('price_settings').select('*').single();
  if (error && error.code !== 'PGRST116') throw error;
  if (!data) return null;
  return { ...DEFAULT_PRICE_SETTINGS, ...(data.settings || {}) };
}

const refuse = (status, code, message, extra = {}) => ({ ok: false, status, code, message, ...extra });

/** The first traveller whose details the airline needs and does not have, or -1. */
const firstIncompleteTraveller = (passengers, types, international) => passengers.findIndex((p, index) => (
  !String(p?.firstName ?? '').trim()
  || !String(p?.lastName ?? '').trim()
  || !p?.gender
  || (!p?.dateOfBirth && needsDateOfBirth({ type: p?.type || types[index], international }))
));

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
  email,
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
  const passengers = Array.isArray(bookingData?.passengerData) ? bookingData.passengerData : [];
  if (passengers.length !== pricedFor) {
    return refuse(400, 'PASSENGER_COUNT_MISMATCH',
      `This fare is for ${pricedFor} traveller${pricedFor === 1 ? '' : 's'}. Please search again for the number travelling.`);
  }

  // A name the airline cannot print, refused before the fare is even priced.
  // The PNR keeps only A-Z, spaces and hyphens: a name in another script was
  // refused by the booking chain after payment and refunded, and one with a
  // letter like Ł was booked short. Same rule as the page and the PNR
  // (shared/passengerName.js); a missing name is left to the check below.
  const unprintable = passengers.findIndex((p) => {
    const problem = travellerNameProblem(p);
    return Boolean(problem) && problem !== NAME_MISSING;
  });
  if (unprintable !== -1) {
    return refuse(400, 'PASSENGER_NAME_UNUSABLE',
      `Traveller ${unprintable + 1}: ${travellerNameProblem(passengers[unprintable])} Nothing has been charged.`);
  }

  let priced;
  try {
    priced = await priceOffer(offer);
  } catch (error) {
    console.warn('⚠️ Checkout pricing failed:', error?.message || error);
    // The airline will not sell this fare any more: say so, and that a new
    // search is the way on. A retry of the same fare cannot succeed.
    if (error?.fareUnavailable) {
      return refuse(409, 'FARE_UNAVAILABLE',
        'The airline can no longer sell this fare. Please search again to see the fares available now. Nothing has been charged.');
    }
    return refuse(503, 'PRICE_UNAVAILABLE', 'We could not confirm the current fare with the airline. Please try again in a moment.');
  }

  // Every traveller complete before the card is charged. The order route
  // refuses an incomplete traveller too - but only after payment, and then has
  // to reverse the charge. The date-of-birth rule is the route's own, decided
  // from the same airport index, so the review page's shorter airport list can
  // no longer let a customer pay for a booking the route then refunds. An
  // unknown answer counts as crossing a border.
  const international = typeof priced?._ama?.international === 'boolean' ? priced._ama.international : true;
  const incomplete = firstIncompleteTraveller(passengers, offer.travelerPricings.map((t) => t.travelerType), international);
  if (incomplete !== -1) {
    return refuse(400, 'PASSENGERS_INCOMPLETE',
      `Traveller ${incomplete + 1} needs a first and last name, a gender${international ? ' and a date of birth' : ''} before you pay. Nothing has been charged.`);
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

  // The fixed fee is per seated traveller; a lap infant pays none of it. Which
  // traveller is which comes from the offer the airline just priced, as it does
  // on the review page - never from the traveller forms.
  const travellerTypes = travellerTypesOf(offer);

  let discount = 0;
  let coupon = null;
  if (couponCode) {
    const beforeDiscount = computeFlightCharge({ fareTotal, travellerTypes, config });
    const evaluated = await evaluateCoupon(client, {
      code: couponCode,
      orderTotal: beforeDiscount.total,
      bookingType: 'flights',
      userId,
      email,
    });
    if (!evaluated.ok) {
      return refuse(409, 'COUPON_INVALID', evaluated.message, { pricedFare });
    }
    discount = evaluated.discountAmount;
    coupon = { id: evaluated.coupon.id, code: evaluated.coupon.code, discountAmount: discount };
  }

  const charge = computeFlightCharge({ fareTotal, travellerTypes, config, discount });

  // A coupon worth the whole booking leaves nothing to charge, and a payment
  // page cannot be opened for $0.00. The page sent 0, and checkout answered
  // with its own internal "Missing required fields" message.
  if (coupon && charge.total <= 0) {
    return refuse(409, 'COUPON_INVALID',
      'This coupon covers the whole fare, and a booking cannot be paid for at $0.00 online. Please call (877) 538-7380 to use it.',
      { pricedFare });
  }

  const requested = roundMoney(amount);

  if (Math.abs(requested - charge.total) > 0.01) {
    return refuse(409, 'PRICE_CHANGED',
      `The total for this booking is ${charge.total.toFixed(2)} ${settlementCurrency}. Please review it before paying.`,
      { charge, pricedFare });
  }

  return { ok: true, charge, coupon, pricedFare };
}
