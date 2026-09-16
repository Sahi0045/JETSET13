import { CABIN_BY_DESIGNATOR } from '../codes.js';
import { arr, at, atTxt, num, txt } from '../parseXml.js';

/**
 * Fare_InformativePricingWithoutPNRReply -> the REST flight-offers-pricing shape.
 *
 * The route returns this verbatim to the client and the booking path reads the
 * repriced total from it, so the numbers here are what a customer is charged.
 * The reply is authoritative: it supersedes the search quote, which is only an
 * indication and can drift once availability moves.
 *
 * Amounts are typed by qualifier, not position:
 *   B    base fare
 *   712  total including taxes
 *   E    equivalent amount in a second currency, when the office converts
 */
const AMOUNT_BASE = 'B';          // base fare, in the FARE's own currency
const AMOUNT_EQUIV = 'E';         // the same base converted to the requested currency
const AMOUNT_TOTAL = '712';       // total, in the requested currency

/** Every monetary detail in a fareAmount, keyed by its type qualifier. */
const readAmounts = (fareAmount) => {
  const out = {};
  const details = [
    ...arr(fareAmount?.monetaryDetails),
    ...arr(fareAmount?.otherMonetaryDetails),
  ];
  for (const detail of details) {
    const qualifier = txt(detail.typeQualifier);
    if (qualifier) out[qualifier] = { amount: num(detail.amount), currency: txt(detail.currency) };
  }
  return out;
};

/** Itemised taxes, which the UI shows as a fee breakdown. */
const readTaxes = (fareInfoGroup) => arr(at(fareInfoGroup, 'surchargesGroup.taxesAmount.taxDetails'))
  .map((tax) => ({
    amount: String(num(tax.rate) ?? 0),
    code: txt(tax.countryCode),
    type: txt(tax.type),
  }))
  .filter((tax) => Number(tax.amount) > 0);

/**
 * Per-segment fare data. `rateClass` is the fare basis; `baggageAllowance`
 * uses quantityCode 'N' for pieces and 'W'/'K' for kilos, the same convention
 * as the search reply.
 */
const readSegments = (fareInfoGroup) => arr(fareInfoGroup.segmentLevelGroup).map((segment, index) => {
  const bag = at(segment, 'baggageAllowance.baggageDetails');
  const allowance = bag ? num(bag.freeAllowance) ?? 0 : null;
  const code = bag ? txt(bag.quantityCode) : null;
  // `quantityCode` says weight or pieces; `unitQualifier` says which unit the
  // weight is in. This hardcoded KG while the search mapper (mappers/offer.js)
  // reads the qualifier properly - and since the priced value OVERRIDES the
  // searched one below, the same fare read "50 LB" on the card and "50 KG" one
  // click later on the review page. A US-settled agency sees pounds-filed
  // fares routinely, and a passenger told they may carry 50 KG when the fare
  // says 50 LB is told they may carry more than twice what they may.
  const unit = bag ? txt(bag.unitQualifier) : null;

  return {
    segmentId: String(index + 1),
    fareBasis: atTxt(segment, 'fareBasis.additionalFareDetails.rateClass'),
    class: atTxt(segment, 'segmentInformation.flightIdentification.bookingClass'),
    cabin: CABIN_BY_DESIGNATOR[atTxt(segment, 'cabinGroup.cabinSegment.cabinDesignator')] ?? undefined,
    includedCheckedBags: bag === undefined || bag === null
      ? undefined
      : (code === 'N' ? { quantity: allowance } : { weight: allowance, weightUnit: unit === 'L' ? 'LB' : 'KG' }),
  };
});

/** Free text carries the penalty wording the fare-rules panel already parses. */
const readTextData = (fareInfoGroup) => arr(fareInfoGroup.textData).map((entry) => ({
  qualifier: atTxt(entry, 'freeTextQualification.textSubjectQualifier'),
  informationType: atTxt(entry, 'freeTextQualification.informationType'),
  text: arr(entry.freeText).map(txt).join(' '),
}));

/**
 * Apply a pricing reply to the offer that was priced.
 *
 * Returns a NEW offer rather than mutating: the caller may still need the
 * original search offer, and `_ama` has to survive so the booking chain can
 * sell exactly what was priced.
 *
 * @param {object} reply  parsed Fare_InformativePricingWithoutPNRReply
 * @param {object} offer  the canonical offer that was priced
 */
export const applyPricingToOffer = (reply, offer) => {
  const groups = arr(at(reply, 'mainGroup.pricingGroupLevelGroup'));
  if (groups.length === 0) return { offer, priced: false };

  const perGroup = groups.map((group) => {
    const fareInfoGroup = group.fareInfoGroup ?? {};
    const amounts = readAmounts(fareInfoGroup.fareAmount);
    const pricedAs = txt(arr(at(arr(fareInfoGroup.segmentLevelGroup)[0], 'ptcSegment.quantityDetails'))[0]?.unitQualifier);
    const paxCount = Number.parseInt(atTxt(group, 'numberOfPax.segmentControlDetails.numberOfUnits'), 10) || 1;

    const totalAmount = amounts[AMOUNT_TOTAL];
    const currency = totalAmount?.currency ?? amounts[AMOUNT_BASE]?.currency ?? offer.price?.currency ?? 'USD';

    // An office whose fares are filed in another currency returns B in that
    // currency and E as the equivalent in ours - a DEL-BOM fare comes back as
    // INR 7661 base against a USD 98.00 total. Only ever combine amounts that
    // share a currency, or the base is off by an exchange rate.
    const base = [amounts[AMOUNT_EQUIV], amounts[AMOUNT_BASE]]
      .find((a) => a && a.currency === currency)?.amount ?? null;

    return {
      paxCount,
      // Traveller references this group priced, so passengers map to their own
      // fare rather than being matched by position.
      refs: arr(at(group, 'passengersID.travellerDetails')).map((t) => txt(t.measurementValue)),
      // The passenger type the group was priced as: ADT, CNN for a child, INF.
      type: { ADT: 'ADULT', CNN: 'CHILD', CHD: 'CHILD', CH: 'CHILD', INF: 'HELD_INFANT', IN: 'HELD_INFANT' }[pricedAs] ?? null,
      base,
      // No silent fall back to the base fare. `?? base` meant a reply missing
      // qualifier 712 priced the fare at its base - taxes excluded - and
      // presented that as the total: an undercharge shown as a price rather
      // than a refusal. Null instead, so applyPricingToOffer treats the reply
      // as unpriced and the caller refuses (index.js noFareFound), before a
      // card is charged rather than after.
      total: totalAmount?.amount ?? null,
      currency,
      taxes: readTaxes(fareInfoGroup),
      segments: readSegments(fareInfoGroup),
      text: readTextData(fareInfoGroup),
    };
  });

  const currency = perGroup[0].currency;

  // A group Amadeus priced at nothing makes the WHOLE reply unusable.
  //
  // `total` was `totalAmount?.amount ?? base` - a silent fall back to the base
  // fare, taxes excluded. Changing that to `?? null` was not enough on its own
  // and made the failure larger: the reducer below coerces `null` to 0, so a
  // 1 adult + 1 child reply whose CHILD group carries no qualifier 712 priced
  // at the adult's fare alone. That is non-zero, so it clears every "is there a
  // price" gate, the customer is charged it, and the order route re-prices to
  // the same understated figure and compares it against itself. We would sell
  // the airline a fare we had undercharged for by a whole passenger.
  //
  // `priced: false` is the honest answer: index.js turns it into noFareFound, a
  // 409, and the customer is asked to search again before anything is charged.
  if (perGroup.some((g) => g.total === null || !Number.isFinite(g.total))) {
    return { offer, priced: false };
  }

  // Each group prices one passenger type; the offer total is the sum across
  // every passenger, which is what was charged.
  const total = perGroup.reduce((sum, g) => sum + (g.total ?? 0) * g.paxCount, 0);
  const base = perGroup.reduce((sum, g) => sum + (g.base ?? 0) * g.paxCount, 0);

  const travelerPricings = (offer.travelerPricings ?? []).map((pricing, index) => {
    // An infant is priced under its adult's reference (operations/
    // masterPricer.js), so the reference alone found the ADULT group and gave
    // the infant an adult fare. The type decides between them.
    const ref = String(pricing.associatedAdultId ?? pricing.travelerId);
    const group = perGroup.find((g) => g.refs.includes(ref) && (!g.type || g.type === pricing.travelerType))
      ?? perGroup.find((g) => g.refs.includes(ref))
      ?? perGroup[Math.min(index, perGroup.length - 1)];
    return {
      ...pricing,
      price: {
        currency,
        total: group.total === null ? pricing.price?.total : group.total.toFixed(2),
        base: group.base === null ? pricing.price?.base : group.base.toFixed(2),
      },
      fareDetailsBySegment: (pricing.fareDetailsBySegment ?? []).map((detail, i) => {
        const priced = group.segments[i];
        return priced
          ? {
            ...detail,
            fareBasis: priced.fareBasis || detail.fareBasis,
            class: priced.class || detail.class,
            cabin: priced.cabin ?? detail.cabin,
            includedCheckedBags: priced.includedCheckedBags ?? detail.includedCheckedBags,
          }
          : detail;
      }),
    };
  });

  const fees = perGroup[0].taxes.map((tax) => ({ amount: tax.amount, type: 'TAX', code: tax.code }));
  const penalties = perGroup.flatMap((g) => g.text).filter((t) => /REFUND|PENALT|CHANGE/i.test(t.text));

  return {
    priced: true,
    offer: {
      ...offer,
      price: {
        currency,
        total: total.toFixed(2),
        base: base.toFixed(2),
        grandTotal: total.toFixed(2),
        fees,
      },
      travelerPricings,
      _ama: {
        ...offer._ama,
        pricedAt: new Date().toISOString(),
        pricedTotal: total.toFixed(2),
        pricedCurrency: currency,
      },
    },
    // Kept separate from the offer: the fare-rules endpoint reads these, and
    // they are free text rather than structured data.
    penalties,
    text: perGroup.flatMap((g) => g.text),
  };
};
