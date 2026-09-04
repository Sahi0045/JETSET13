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

  return {
    segmentId: String(index + 1),
    fareBasis: atTxt(segment, 'fareBasis.additionalFareDetails.rateClass'),
    class: atTxt(segment, 'segmentInformation.flightIdentification.bookingClass'),
    cabin: CABIN_BY_DESIGNATOR[atTxt(segment, 'cabinGroup.cabinSegment.cabinDesignator')] ?? undefined,
    includedCheckedBags: bag === undefined || bag === null
      ? undefined
      : (code === 'N' ? { quantity: allowance } : { weight: allowance, weightUnit: 'KG' }),
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
      base,
      total: totalAmount?.amount ?? base,
      currency,
      taxes: readTaxes(fareInfoGroup),
      segments: readSegments(fareInfoGroup),
      text: readTextData(fareInfoGroup),
    };
  });

  const currency = perGroup[0].currency;
  // Each group prices one passenger type; the offer total is the sum across
  // every passenger, which is what was charged.
  const total = perGroup.reduce((sum, g) => sum + (g.total ?? 0) * g.paxCount, 0);
  const base = perGroup.reduce((sum, g) => sum + (g.base ?? 0) * g.paxCount, 0);

  const travelerPricings = (offer.travelerPricings ?? []).map((pricing, index) => {
    const group = perGroup.find((g) => g.refs.includes(String(pricing.travelerId)))
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
