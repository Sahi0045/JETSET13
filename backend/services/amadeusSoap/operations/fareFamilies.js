import { OPERATIONS } from '../codes.js';
import { each, el, wrap } from '../xml.js';
import { buildPassengerGroups, buildSegmentGroups } from './informativePricing.js';

const option = (key, children = '') => wrap('pricingOptionGroup', [wrap('pricingOptionKey', el('pricingOptionKey', key)), children]);

/**
 * Fare_PriceUpsellWithoutPNR: every fare family the airline sells on these
 * flights, each priced per passenger type.
 *
 * The options are the ones in Amadeus's own example for this WSAP (5 Oct 2026):
 * VC, RP, RLO and FCO. RU is added so negotiated fares are offered as they are
 * at search and pricing.
 */
export const buildUpsellBody = ({ paxRefs, segments, currency = 'USD', validatingCarrier }) => {
  if (!segments?.length) throw new Error('segments are required to price an offer');
  if (!paxRefs?.length) throw new Error('paxRefs are required to price an offer');

  const body = [
    buildPassengerGroups(paxRefs, segments.length),
    buildSegmentGroups(segments),
    validatingCarrier
      ? option('VC', wrap('carrierInformation', wrap('companyIdentification', el('otherCompany', validatingCarrier))))
      : '',
    option('RP'),
    option('RU'),
    option('RLO'),
    option('FCO', wrap('currency', wrap('firstCurrencyDetails', [
      el('currencyQualifier', 'FCO'),
      el('currencyIsoCode', currency),
    ]))),
  ].join('');

  const ns = OPERATIONS.Fare_PriceUpsellWithoutPNR.namespace;
  return `    <Fare_PriceUpsellWithoutPNR xmlns="${ns}">${body}</Fare_PriceUpsellWithoutPNR>`;
};

/**
 * Fare_GetFareFamilyDescription for several families in one call, one
 * standaloneDescriptionRequest each, in the order given: the reply's
 * referenceInformation numbers them the same way.
 *
 * @param {Array<{family: string, carrier: string, origin: string, destination: string}>} requests
 */
export const buildFareFamilyDescriptionBody = (requests) => {
  if (!requests?.length) throw new Error('at least one fare family is required');

  const body = each(requests, ({ family, carrier, origin, destination }) => wrap('standaloneDescriptionRequest', [
    wrap('fareInformation', wrap('discountDetails', [
      el('fareQualifier', 'FF'),
      el('rateCategory', family),
    ])),
    wrap('itineraryInformation', [el('origin', origin), el('destination', destination)]),
    wrap('carrierInformation', wrap('companyIdentification', el('otherCompany', carrier))),
  ]));

  const ns = OPERATIONS.Fare_GetFareFamilyDescription.namespace;
  return `    <Fare_GetFareFamilyDescription xmlns="${ns}">${body}</Fare_GetFareFamilyDescription>`;
};
