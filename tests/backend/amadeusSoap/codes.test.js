import { describe, expect, it } from 'vitest';
import { OPERATIONS, STATELESS_OPERATIONS } from '../../../backend/services/amadeusSoap/codes.js';

/**
 * The operation table against the WSAP's own WSDL.
 *
 * Operation versions are baked into the SOAPAction and the body namespace, so
 * this table is the single place the client is coupled to a particular WSAP.
 * When the production WSDL arrives it has to be diffed against this list: a
 * version that moved is a silent failure, because the endpoint answers a
 * mismatched action with a fault that names neither.
 *
 * Taken from 1ASIWJETJEC_PDT_20260904_170228.wsdl - every soapAction it
 * declares, and nothing else.
 */
const WSDL_ACTIONS = Object.freeze([
  'FARQNQ_07_1_1A',   // Fare_CheckRules
  'FLIREQ_07_1_1A',   // Air_FlightInfo
  'FMPCAQ_20_2_1A',   // Fare_MasterPricerCalendar
  'FMPTBQ_24_6_1A',   // Fare_MasterPricerTravelBoardSearch
  'ITAREQ_05_2_IA',   // Air_SellFromRecommendation
  'PNRADD_22_1_1A',   // PNR_AddMultiElements
  'PNRRET_21_1_1A',   // PNR_Retrieve
  'PNRXCL_22_1_1A',   // PNR_Cancel
  'QUQPCQ_03_1_1A',   // Queue_PlacePNR
  'TAUTCQ_04_1_1A',   // Ticket_CreateTSTFromPricing
  'TFOPCQ_19_2_1A',   // FOP_CreateFormOfPayment
  'TIBNRQ_23_1_1A',   // Fare_InformativeBestPricingWithoutPNR
  'TIPNRQ_24_3_1A',   // Fare_InformativePricingWithoutPNR
  'TPCBRQ_24_3_1A',   // Fare_PricePNRWithBookingClass
  'TRCANQ_14_1_1A',   // Ticket_CancelDocument
  'TTKTIQ_15_1_1A',   // DocIssuance_IssueTicket
  'VLSSOQ_04_1_1A',   // Security_SignOut
]);

describe('operation table', () => {
  it('matches the WSDL exactly, in both directions', () => {
    const ours = Object.values(OPERATIONS).map((o) => o.suffix).sort();
    expect(ours).toEqual([...WSDL_ACTIONS].sort());
  });

  it('derives the action and namespace from the same version suffix', () => {
    for (const operation of Object.values(OPERATIONS)) {
      expect(operation.action).toBe(`http://webservices.amadeus.com/${operation.suffix}`);
      expect(operation.namespace).toBe(`http://xml.amadeus.com/${operation.suffix}`);
    }
  });
});

describe('which operations may skip a session', () => {
  // Anything absent from this set mutates GDS state, and a retried mutating
  // call is a duplicate booking. The set is deliberately small.
  it('never lists an operation that changes anything', () => {
    for (const mutating of [
      'Air_SellFromRecommendation',
      'PNR_AddMultiElements',
      'PNR_Cancel',
      'Ticket_CreateTSTFromPricing',
      'FOP_CreateFormOfPayment',
      'DocIssuance_IssueTicket',
      'Ticket_CancelDocument',
      'Queue_PlacePNR',
    ]) {
      expect(STATELESS_OPERATIONS.has(mutating), `${mutating} must run inside a session`).toBe(false);
    }
  });

  it('lists the read-only ones', () => {
    for (const readOnly of [
      'Fare_MasterPricerTravelBoardSearch',
      'Fare_InformativePricingWithoutPNR',
      'Fare_CheckRules',
      'PNR_Retrieve',
    ]) {
      expect(STATELESS_OPERATIONS.has(readOnly)).toBe(true);
    }
  });
});
