import { sendRequest } from './client.js';

export const MASTER_PRICER_ACTION = 'http://webservices.amadeus.com/FMPTBQ_24_6_1A';
const MASTER_PRICER_NS = 'http://xml.amadeus.com/FMPTBQ_24_6_1A';

/** The schema types this field as Date_DDMMYY - a 6 digit string, not ISO. */
export const toAmadeusDate = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(date.getUTCDate())}${pad(date.getUTCMonth() + 1)}${String(date.getUTCFullYear()).slice(-2)}`;
};

/**
 * Build a one-way Fare_MasterPricerTravelBoardSearch body.
 *
 * Element order follows the root sequence in
 * Fare_MasterPricerTravelBoardSearch_24_6_1A.xsd exactly; XML Schema sequences
 * are ordered, and a misplaced element fails validation with an error that does
 * not name the element.
 */
export const buildMasterPricerBody = ({
  origin,
  destination,
  departureDate,
  adults = 1,
  maxRecommendations = 20,
}) => `    <Fare_MasterPricerTravelBoardSearch xmlns="${MASTER_PRICER_NS}">
      <numberOfUnit>
        <unitNumberDetail>
          <numberOfUnits>${adults}</numberOfUnits>
          <typeOfUnit>PX</typeOfUnit>
        </unitNumberDetail>
        <unitNumberDetail>
          <numberOfUnits>${maxRecommendations}</numberOfUnits>
          <typeOfUnit>RC</typeOfUnit>
        </unitNumberDetail>
      </numberOfUnit>
      <paxReference>
        <ptc>ADT</ptc>
        <traveller>
          <ref>1</ref>
        </traveller>
      </paxReference>
      <fareOptions>
        <pricingTickInfo>
          <pricingTicketing>
            <priceType>RP</priceType>
            <priceType>RU</priceType>
            <priceType>TAC</priceType>
          </pricingTicketing>
        </pricingTickInfo>
      </fareOptions>
      <itinerary>
        <requestedSegmentRef>
          <segRef>1</segRef>
        </requestedSegmentRef>
        <departureLocalization>
          <depMultiCity>
            <locationId>${origin}</locationId>
            <airportCityQualifier>A</airportCityQualifier>
          </depMultiCity>
        </departureLocalization>
        <arrivalLocalization>
          <arrivalMultiCity>
            <locationId>${destination}</locationId>
            <airportCityQualifier>A</airportCityQualifier>
          </arrivalMultiCity>
        </arrivalLocalization>
        <timeDetails>
          <firstDateTimeDetail>
            <date>${toAmadeusDate(departureDate)}</date>
          </firstDateTimeDetail>
        </timeDetails>
      </itinerary>
    </Fare_MasterPricerTravelBoardSearch>`;

export const searchFlights = (params, options = {}) => sendRequest({
  action: MASTER_PRICER_ACTION,
  body: buildMasterPricerBody(params),
  ...options,
});
