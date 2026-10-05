import { CABIN_BY_DESIGNATOR } from '../codes.js';
import { isFareFamilyName } from '../operations/informativePricing.js';
import { arr, at, atTxt, num, txt } from '../parseXml.js';

const TYPE_BY_PTC = Object.freeze({ ADT: 'ADULT', CNN: 'CHILD', CHD: 'CHILD', INF: 'HELD_INFANT', INS: 'SEATED_INFANT' });

const isoDate = (dateTime) => {
  const year = txt(dateTime?.year);
  const month = txt(dateTime?.month);
  const day = txt(dateTime?.day);
  if (!year || !month || !day) return undefined;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
};

const readAmounts = (fare) => {
  const amounts = {};
  for (const detail of arr(at(fare, 'fareDataInformation.fareDataSupInformation'))) {
    const qualifier = txt(detail.fareDataQualifier);
    if (qualifier) amounts[qualifier] = { amount: num(detail.fareAmount), currency: txt(detail.fareCurrency) };
  }
  return amounts;
};

const readCheckedBags = (segment) => {
  const allowance = at(segment, 'bagAllowanceInformation.bagAllowanceDetails');
  if (!allowance) return undefined;
  const quantity = num(allowance.baggageQuantity);
  const weight = num(allowance.baggageWeight);
  if (txt(allowance.baggageType) === 'N') return quantity === null ? undefined : { quantity };
  if (weight !== null) return { weight, ...(txt(allowance.measureUnit) ? { weightUnit: txt(allowance.measureUnit) } : {}) };
  return quantity === null ? undefined : { quantity };
};

const readSegments = (fare) => {
  const bySegment = new Map();
  for (const segment of arr(fare.segmentInformation)) {
    const ref = arr(at(segment, 'segmentReference.refDetails')).find((d) => txt(d.refQualifier) === 'S');
    const index = Number.parseInt(txt(ref?.refNumber), 10) - 1;
    if (!(index >= 0)) continue;
    const basis = at(segment, 'fareQualifier.fareBasisDetails');
    const designator = atTxt(segment, 'flightProductInformationType.cabinProduct.cabin')
      || atTxt(segment, 'cabinGroup.cabinSegment.bookingClassDetails.option');
    const seats = Number.parseInt(atTxt(segment, 'flightProductInformationType.cabinProduct.avlStatus'), 10);
    bySegment.set(index, {
      class: atTxt(segment, 'segDetails.segmentDetail.classOfService') || atTxt(segment, 'flightProductInformationType.cabinProduct.rbd'),
      fareBasis: `${txt(basis?.primaryCode) ?? ''}${txt(basis?.fareBasisCode) ?? ''}` || undefined,
      ptc: txt(basis?.discTktDesignator),
      designator,
      cabin: CABIN_BY_DESIGNATOR[designator],
      seats: Number.isFinite(seats) ? seats : undefined,
      includedCheckedBags: readCheckedBags(segment),
    });
  }
  return bySegment;
};

/** The fare components of a fare: each names its family and the segments (ST) it covers. */
export const readComponents = (fare) => arr(fare?.fareComponentDetailsGroup).map((component) => ({
  family: atTxt(component, 'fareFamilyDetails.fareFamilyname'),
  owner: atTxt(component, 'fareFamilyOwner.companyIdentification.otherCompany'),
  origin: atTxt(component, 'marketFareComponent.boardPointDetails.trueLocationId'),
  destination: atTxt(component, 'marketFareComponent.offpointDetails.trueLocationId'),
  segments: arr(component.couponDetailsGroup)
    .flatMap((coupon) => arr(at(coupon, 'productId.referenceDetails')))
    .filter((ref) => txt(ref.type) === 'ST')
    .map((ref) => Number.parseInt(txt(ref.value), 10) - 1)
    .filter((index) => index >= 0),
}));

/** Segment index -> the component covering it, for components that name a family. */
export const familiesBySegment = (fare) => {
  const bySegment = new Map();
  for (const component of readComponents(fare)) {
    if (!component.family) continue;
    for (const segment of component.segments) bySegment.set(segment, component);
  }
  return bySegment;
};

const readFare = (fare) => {
  const refs = arr(at(fare, 'paxSegReference.refDetails'));
  const ofType = (qualifier) => refs.filter((d) => txt(d.refQualifier) === qualifier).map((d) => txt(d.refNumber));
  const segments = readSegments(fare);
  return {
    offerKey: (atTxt(fare, 'offerReferences.offerIdentifier.uniqueOfferReference') ?? '').replace(/-OI\d+-AI\d+$/, '') || null,
    seated: ofType('PA'),
    infantsOf: ofType('PI'),
    ptc: [...segments.values()][0]?.ptc ?? null,
    amounts: readAmounts(fare),
    taxes: arr(fare.taxInformation).map((tax) => ({
      code: atTxt(tax, 'taxDetails.taxType.isoCountry'),
      amount: num(at(tax, 'amountDetails.fareDataMainInformation.fareAmount')),
    })).filter((tax) => tax.code && tax.amount > 0),
    lastTicketingDate: isoDate(at(fare, 'lastTktDate.dateTime')),
    validatingCarrier: atTxt(fare, 'validatingCarrier.carrierInformation.carrierCode'),
    segments,
    families: familiesBySegment(fare),
  };
};

const fareFor = (pricing, fares) => {
  const type = pricing.travelerType;
  if (type === 'HELD_INFANT') {
    const adult = String(pricing.associatedAdultId ?? pricing.travelerId);
    return fares.find((fare) => fare.infantsOf.includes(adult));
  }
  const id = String(pricing.travelerId);
  return fares.find((fare) => fare.seated.includes(id) && (!fare.ptc || TYPE_BY_PTC[fare.ptc] === type))
    ?? fares.find((fare) => fare.seated.includes(id));
};

const cents = (amount) => Math.round(amount * 100);

/**
 * One option per offer in the reply, priced for every traveller of the offer.
 *
 * Only options in a single fare family on every segment are returned: the
 * booking pins the chosen family with one PFF for the whole itinerary, and a
 * leg in another family, or in none, would be refused at pricing. A lap
 * infant's fare may name no family; every seated passenger's must. Every
 * segment must name the same booking class for every passenger type, because
 * one sell holds one class per flight.
 */
export const mapUpsellReply = (reply, offer) => {
  const fares = arr(reply?.fareList).map(readFare);
  const segmentCount = offer?._ama?.segments?.length ?? 0;
  if (!fares.length || !segmentCount) return [];

  const groups = new Map();
  fares.forEach((fare, index) => {
    const key = fare.offerKey ?? `fare-${index}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(fare);
  });
  const segmentIndexes = Array.from({ length: segmentCount }, (_, i) => i);

  const options = [];
  for (const [key, group] of groups) {
    const seated = group.filter((fare) => fare.seated.length > 0);
    if (seated.length === 0 || !seated.every((fare) => segmentIndexes.every((i) => fare.families.has(i)))) continue;
    const components = group.flatMap((fare) => [...fare.families.values()]);
    const names = new Set(components.map((c) => c.family));
    const family = [...names][0];
    if (names.size !== 1 || !isFareFamilyName(family)) continue;
    const component = components[0];

    const classes = segmentIndexes.map((i) => new Set(group.map((fare) => fare.segments.get(i)?.class).filter(Boolean)));
    if (classes.some((set) => set.size !== 1)) continue;
    const segmentClasses = classes.map((set) => [...set][0]);
    const lead = seated[0].segments;

    const currency = group[0].amounts['712']?.currency;
    const travelerPricings = [];
    let totalCents = 0;
    let baseCents = 0;
    let baseKnown = true;
    const feeCents = new Map();
    let complete = Boolean(currency);
    for (const pricing of offer.travelerPricings ?? []) {
      const fare = fareFor(pricing, group);
      const total = fare?.amounts['712'];
      if (!fare || !total || total.currency !== currency || !Number.isFinite(total.amount)) { complete = false; break; }
      const base = [fare.amounts.E, fare.amounts.B].find((a) => a && a.currency === currency && Number.isFinite(a.amount));
      totalCents += cents(total.amount);
      if (base) baseCents += cents(base.amount); else baseKnown = false;
      for (const tax of fare.taxes) feeCents.set(tax.code, (feeCents.get(tax.code) ?? 0) + cents(tax.amount));
      travelerPricings.push({
        ...pricing,
        price: { currency, total: total.amount.toFixed(2), base: base ? base.amount.toFixed(2) : undefined },
        fareDetailsBySegment: (pricing.fareDetailsBySegment ?? []).map((detail, i) => {
          const priced = fare.segments.get(i);
          return {
            ...detail,
            class: segmentClasses[i] ?? detail.class,
            fareBasis: priced?.fareBasis ?? detail.fareBasis,
            cabin: priced?.cabin ?? detail.cabin,
            brandedFare: family,
            includedCheckedBags: priced?.includedCheckedBags ?? detail.includedCheckedBags,
          };
        }),
      });
    }
    if (!complete || travelerPricings.length === 0) continue;

    const seats = segmentIndexes.map((i) => lead.get(i)?.seats).filter((n) => Number.isFinite(n));
    const total = (totalCents / 100).toFixed(2);
    const validatingCarrier = group[0].validatingCarrier;
    options.push({
      ...offer,
      id: `${offer.id}-${family}`,
      isUpsellOffer: true,
      lastTicketingDate: group[0].lastTicketingDate ?? offer.lastTicketingDate,
      numberOfBookableSeats: seats.length === segmentCount ? Math.min(...seats) : undefined,
      validatingAirlineCodes: validatingCarrier ? [validatingCarrier] : offer.validatingAirlineCodes,
      price: {
        currency,
        total,
        base: baseKnown ? (baseCents / 100).toFixed(2) : undefined,
        grandTotal: total,
        fees: [...feeCents].map(([code, amount]) => ({ amount: (amount / 100).toFixed(2), type: 'TAX', code })),
      },
      travelerPricings,
      _ama: {
        ...offer._ama,
        refundable: undefined,
        segments: offer._ama.segments.map((segment, i) => ({
          ...segment,
          rbd: segmentClasses[i] ?? segment.rbd,
          cabinDesignator: lead.get(i)?.designator ?? segment.cabinDesignator,
          fareBasis: lead.get(i)?.fareBasis ?? segment.fareBasis,
        })),
        fareFamily: family,
        fareFamilyOwner: component.owner ?? validatingCarrier,
        upsellOffer: key,
      },
      fareFamilyDescriptionRequest: {
        family,
        carrier: component.owner ?? validatingCarrier,
        origin: component.origin,
        destination: component.destination,
      },
    });
  }
  return options;
};

const STATUS_BY_INDICATOR = Object.freeze({ INC: 'included', CHA: 'charged', NOF: 'notOffered' });

/**
 * What each family includes, keyed `FAMILY|CARRIER`.
 *
 * The reply numbers each description by the position of its request
 * (referenceInformation), so the requests passed in must be the ones sent.
 */
export const mapFareFamilyDescriptions = (reply, requests) => {
  const descriptions = new Map();
  arr(reply?.fareFamilyDescriptionGroup).forEach((group, index) => {
    const position = Number.parseInt(atTxt(group, 'referenceInformation.itemNumberDetails.number'), 10);
    const request = requests[(position > 0 ? position : index + 1) - 1];
    const family = atTxt(group, 'fareInformation.discountDetails.rateCategory') ?? request?.family;
    const carrier = atTxt(group, 'carrierInformation.companyIdentification.otherCompany') ?? request?.carrier;
    if (!family) return;
    const label = arr(group.freeFlowDescription)
      .filter((d) => atTxt(d, 'freeTextDetails.informationType') === 'FFD')
      .flatMap((d) => arr(d.freeText).map(txt))
      .find(Boolean);
    const services = arr(group.ocFeeInformation).map((service) => ({
      text: arr(at(service, 'feeFreeFlowDescription.freeText')).map(txt).filter(Boolean).join(' '),
      status: STATUS_BY_INDICATOR[atTxt(service, 'feeDescription.dataInformation.indicator')] ?? 'unknown',
      code: atTxt(service, 'feeDescription.dataTypeInformation.type'),
    })).filter((service) => service.text);
    descriptions.set(`${family}|${carrier}`, { family, carrier, label: label ?? family, services });
  });
  return descriptions;
};

const refundableFrom = (services) => {
  const refunds = services.filter((s) => /REFUND/.test(s.text) && !/NO SHOW/.test(s.text));
  if (refunds.some((s) => s.status === 'included')) return true;
  if (refunds.length > 0 && refunds.every((s) => s.status === 'notOffered')) return false;
  return null;
};

const cabinBagFrom = (services) => {
  const bag = services.find((s) => s.status === 'included' && /CABIN BAG/.test(s.text));
  const weight = bag?.text.match(/(\d+)\s*(KG|LB)/);
  return weight ? { weight: Number(weight[1]), weightUnit: weight[2] } : undefined;
};

/**
 * An upsell option with its family described: the label, what is included and
 * what is at a charge come from Fare_GetFareFamilyDescription, as Amadeus's
 * certification asks, not from the upsell reply.
 */
export const describeOption = (option, descriptions) => {
  const { fareFamilyDescriptionRequest: request, ...offer } = option;
  const description = request ? descriptions.get(`${request.family}|${request.carrier}`) : null;
  if (!description) return offer;

  const amenities = description.services
    .filter((s) => s.status === 'included' || s.status === 'charged')
    .map((s) => ({ description: s.text, isChargeable: s.status === 'charged', amenityType: s.code }));
  const cabinBags = cabinBagFrom(description.services);
  const refundable = refundableFrom(description.services);

  return {
    ...offer,
    travelerPricings: offer.travelerPricings.map((pricing) => ({
      ...pricing,
      fareDetailsBySegment: pricing.fareDetailsBySegment.map((detail) => ({
        ...detail,
        brandedFareLabel: description.label,
        amenities,
        ...(cabinBags ? { includedCabinBags: cabinBags } : {}),
      })),
    })),
    _ama: {
      ...offer._ama,
      ...(refundable === null ? {} : { refundable }),
    },
  };
};
