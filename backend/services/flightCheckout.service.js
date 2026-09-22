import axios from 'axios';
import { computeFlightCharge, roundMoney, travellerTypesOf } from '../../shared/flightCharge.js';
import { bookingTravellerProblems, lastFlightDepartureDate, tripDates } from '../../shared/travellerDetails.js';
import { TRAVELLER_TYPES } from '../../shared/flightOrderBody.js';
import { describeGroup, groupFromOffer } from '../../shared/travellerGroup.js';
import { NAME_MISSING, travellerNameProblem } from '../../shared/passengerName.js';
import { DEFAULT_PRICE_SETTINGS } from '../config/priceDefaults.js';
import { couponTripKey, evaluateCoupon } from './coupon.service.js';

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
 *
 * It also asks for the seats to be confirmed with the airline, since this runs
 * just before the charge: a fare search offered but the airline would not sell
 * used to be found only by the booking chain, after payment, and refunded.
 */
export async function priceOfferForCheckout(offer) {
  const base = pricingBase();
  if (base) {
    const resp = await axios.post(
      `${base.replace(/\/$/, '')}/api/flights/price`,
      { flightOffer: offer, confirmSeats: true },
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
    const secureFlight = resp?.data?.meta?.secureFlight;
    const bookingEnabled = resp?.data?.meta?.bookingEnabled;
    return {
      ...priced,
      _ama: {
        ...priced._ama,
        ...(typeof international === 'boolean' ? { international } : {}),
        ...(typeof secureFlight === 'boolean' ? { secureFlight } : {}),
        ...(typeof bookingEnabled === 'boolean' ? { bookingEnabled } : {}),
      },
    };
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
  const { describeWsConfig } = await import('./amadeusSoap/config.js');
  const wsConfig = describeWsConfig();
  // Not while booking is off: verifyFlightCharge refuses BOOKING_DISABLED as
  // soon as this returns, so a sell here was a sell-and-release against the
  // office for a checkout that could never become a booking. The pricing route
  // holds the same rule for the Vercel leg.
  if (wsConfig.seatCheckBeforePayment && wsConfig.bookingEnabled === true) {
    try {
      await FlightProvider.confirmSeats(priced);
    } catch (error) {
      if (isFareRefusal(error)) throw fareRefused(error.technicalError || error.message);
      throw error;
    }
  }
  const { crossesBorder, touchesUnitedStates } = await import('../utils/itinerary.js');
  return {
    ...priced,
    _ama: {
      ...priced._ama,
      international: crossesBorder(priced),
      secureFlight: touchesUnitedStates(priced),
      // This process is the one that would book, so its own config is the
      // authority. Over HTTPS the same answer arrives in the reply's `meta`.
      bookingEnabled: wsConfig.bookingEnabled === true,
    },
  };
}

/** The configured price settings, merged over the defaults exactly as the page receives them. */
export async function readPriceSettings(client) {
  const { data, error } = await client.from('price_settings').select('*').single();
  if (error && error.code !== 'PGRST116') throw error;
  if (!data) {
    // Every flight checkout stops here, and nothing said why. `.single()`
    // answers PGRST116 for both "no rows" and "more than one row", so what the
    // driver said is logged - as the admin route logs it - to tell an empty
    // table from a duplicated row. Still refused rather than picking a row: the
    // review page computes its total from the same row, and a fee read from one
    // of two could differ from the total the customer was shown.
    console.error('No price_settings row could be read; flight checkout is refusing', {
      pgError: error ? { code: error.code, message: error.message, details: error.details } : null,
    });
    return null;
  }
  return { ...DEFAULT_PRICE_SETTINGS, ...(data.settings || {}) };
}

const refuse = (status, code, message, extra = {}) => ({ ok: false, status, code, message, ...extra });

/** 'YYYY-MM-DD...' -> 'DDMMYY', the form `_ama.segments` carries a date in. */
const ddmmyy = (at) => {
  const match = /^\d{2}(\d{2})-(\d{2})-(\d{2})/.exec(String(at ?? ''));
  return match ? `${match[3]}${match[2]}${match[1]}` : null;
};

/**
 * Are the flights shown - `itineraries`, which the traveller checks read for
 * borders, ages and passport expiry - the flights sold, `_ama.segments`, which
 * pricing, the seat check and the booking chain read?
 *
 * The mapper builds both from the same reply, one segment for one
 * (mappers/offer.js), so a genuine offer always agrees. Nothing checked it: an
 * offer showing a domestic hop over a real international `_ama` needed no
 * passport here and was sold abroad without SSR DOCS, and one with no
 * itineraries at all skipped every age and passport-expiry check. An offer
 * with no `_ama.segments` is left to pricing, which refuses it.
 */
const flightsShownAreSold = (offer) => {
  const sold = offer?._ama?.segments;
  if (!Array.isArray(sold) || sold.length === 0) return true;
  const shown = (Array.isArray(offer.itineraries) ? offer.itineraries : [])
    .flatMap((itinerary) => (Array.isArray(itinerary?.segments) ? itinerary.segments : []));
  if (shown.length !== sold.length) return false;
  const same = (a, b) => String(a ?? '').trim().toUpperCase() === String(b ?? '').trim().toUpperCase();
  return sold.every((segment, i) => same(shown[i]?.carrierCode, segment?.marketingCarrier)
    && same(shown[i]?.number, segment?.flightNumber)
    && same(shown[i]?.departure?.iataCode, segment?.boardPoint)
    && same(shown[i]?.arrival?.iataCode, segment?.offPoint)
    && (!segment?.departureDate || ddmmyy(shown[i]?.departure?.at) === String(segment.departureDate)));
};

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
  if (!flightsShownAreSold(offer)) {
    return refuse(400, 'OFFER_MISSING', 'Your flight selection did not reach us intact. Please search again.');
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

  // The same mix of passenger types as the fare, compared as the order route
  // compares them - but before payment. A child booked on an adult's fare was
  // charged, then refused by the order route and refunded. A client that sends
  // no types is held to the offer's order, as the order route holds it.
  const pricedTypes = offer.travelerPricings.map((pricing) => pricing?.travelerType);
  const sentTypes = passengers.map((p) => (TRAVELLER_TYPES.includes(p?.type) ? p.type : '')).filter(Boolean);
  if (sentTypes.length > 0 && (sentTypes.length !== passengers.length
    || [...sentTypes].sort().join() !== [...pricedTypes].sort().join())) {
    return refuse(400, 'PASSENGER_COUNT_MISMATCH',
      `The travellers do not match this fare, which is for ${describeGroup(groupFromOffer(offer))}. Please search again for the people travelling.`);
  }

  // The fee settings, read before the fare is priced. Pricing is where the
  // seats are sold and released at the airline (the seat check), and a
  // checkout that cannot be charged without these was refused only after that
  // sell - one it could never use, counted against the office's look-to-book.
  let config = null;
  try {
    config = await readPriceSettings(client);
  } catch (error) {
    console.warn('⚠️ Checkout could not read price settings:', error?.message || error);
  }
  if (!config) {
    return refuse(503, 'PRICE_CONFIG_UNAVAILABLE', 'Pricing is temporarily unavailable. Please try again shortly.');
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

  // Can this even be booked right now?
  //
  // AMADEUS_WS_BOOKING_ENABLED is off in production while the office waits for
  // Amadeus certification, and the order route honours it - but the order route
  // runs after ARC's hosted checkout has completed, so its refusal means taking
  // the customer's money and reversing it. A charge and a refund for a booking
  // that was never possible is a bad enough experience that the flag defeats
  // its own purpose; the route's own comment says as much.
  //
  // Asked here, the customer is told before anything is charged. It is asked
  // AFTER pricing because that is the earliest moment the answer exists:
  // checkout can run on Vercel, which never books, so the authority is the host
  // that priced the offer and the answer rides back on `_ama.bookingEnabled`.
  // An absent answer is not treated as "off" - an older server that does not
  // send it must not stop a booking that would have worked.
  if (priced?._ama?.bookingEnabled === false) {
    return refuse(503, 'BOOKING_DISABLED',
      'Online booking is temporarily unavailable. '
      + 'Please call (877) 538-7380 and we will book this flight for you by phone.');
  }

  // Every traveller as the airline needs them before the card is charged, by
  // the rule the review page checks (shared/travellerDetails.js): a printable
  // name, a gender, a date of birth where one is needed and an age that fits
  // the fare (an infant on every flight of the trip), and a passport valid to the last
  // flight on a trip abroad. This checked only that names, a gender and a date
  // of birth were there. The order route refuses an incomplete traveller too -
  // but only after payment - and the airline will not ticket a trip abroad
  // without the passport.
  //
  // Whether the trip crosses a border is decided from the airport index the
  // order route uses, so the review page's shorter airport list cannot let a
  // customer pay for a booking the route then refunds. An unknown answer
  // counts as crossing for the date of birth, as before. The passport is asked
  // for only when the index knows the trip crosses a border: the review page
  // shows passport fields from its own list, and must not be refused for a
  // document it gave the customer nowhere to enter.
  const international = typeof priced?._ama?.international === 'boolean' ? priced._ama.international : true;
  const { firstDate, lastDate } = tripDates(offer);
  const lastDepartureDate = lastFlightDepartureDate(offer);
  for (const [index, traveller] of passengers.entries()) {
    const problems = bookingTravellerProblems(traveller, {
      type: TRAVELLER_TYPES.includes(traveller?.type) ? traveller.type : pricedTypes[index],
      international,
      secureFlight: priced?._ama?.secureFlight === true,
      passportRequired: priced?._ama?.international === true,
      travelDate: firstDate,
      lastDate,
      lastDepartureDate,
    });
    if (problems.length > 0) {
      return refuse(400, 'PASSENGERS_INCOMPLETE', `Traveller ${index + 1}: ${problems[0]} Nothing has been charged.`);
    }
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

  // The fixed fee is per seated traveller; a lap infant pays none of it. Which
  // traveller is which comes from the offer the airline just priced, as it does
  // on the review page - never from the traveller forms.
  const travellerTypes = travellerTypesOf(offer);

  let discount = 0;
  let coupon = null;
  if (couponCode) {
    const beforeDiscount = computeFlightCharge({ fareTotal, travellerTypes, config });
    let evaluated;
    try {
      evaluated = await evaluateCoupon(client, {
        code: couponCode,
        orderTotal: beforeDiscount.total,
        bookingType: 'flights',
        userId,
        email,
        // So the customer's own abandoned payment page for this trip does not
        // count as the coupon being on another booking.
        trip: couponTripKey(offer, passengers),
      });
    } catch (error) {
      // The coupons table could not be read. That is not a coupon that does
      // not apply, so it is not taken off - and it was not an explained
      // failure either: the error escaped as a bare 500 "Failed to create
      // hosted checkout", which the review page could do nothing with.
      console.warn('Checkout could not check the coupon:', error?.message || error);
      return refuse(503, 'COUPON_UNAVAILABLE',
        'We could not check your coupon just now. Please try again in a moment.', { pricedFare });
    }
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
