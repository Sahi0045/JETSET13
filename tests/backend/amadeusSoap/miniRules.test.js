import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mapMiniRules } from '../../../backend/services/amadeusSoap/mappers/miniRules.js';
import { parseSoap, unwrapEnvelope } from '../../../backend/services/amadeusSoap/parseXml.js';

/**
 * Amadeus MiniRules, read into the airline's cancel and change-date fees by
 * situation. The fixture is Lufthansa Economy Light FRA-JFK, recorded on PDT
 * on 5 Oct 2026: changeable before departure and on a no-show for USD 338,
 * not after departure, and never refundable.
 */

const bodyOf = (xml) => {
  const { body } = unwrapEnvelope(parseSoap(xml));
  return body[Object.keys(body).find((k) => k !== 'Fault')];
};
const lufthansa = () => bodyOf(readFileSync(new URL('../../fixtures/amadeus/minirules-lh-ecolight.xml', import.meta.url), 'utf8'));

const money = (qualifier, amount, currency = 'USD') => `<monetaryDetails><typeQualifier>${qualifier}</typeQualifier><amount>${amount}</amount><currency>${currency}</currency></monetaryDetails>`;
const indicator = (code, value) => `<statusInformation><indicator>${code}</indicator><action>${value}</action></statusInformation>`;
const components = (...numbers) => numbers.map((n) => `<fareComponentInfo><fareComponentRef><referenceDetails><type>FC</type><value>${n}</value></referenceDetails></fareComponentRef></fareComponentInfo>`).join('');
const category = (number, { indicators = '', amounts = '', fc = null } = {}) => `<mnrRulesInfoGrp><mnrCatInfo><descriptionInfo><number>${number}</number></descriptionInfo></mnrCatInfo>${fc ? `<mnrFCInfoGrp><refInfo><referenceDetails><type>FC</type><value>${fc}</value></referenceDetails></refInfo></mnrFCInfoGrp>` : ''}${amounts ? `<mnrMonInfoGrp><monetaryInfo>${amounts}</monetaryInfo></mnrMonInfoGrp>` : ''}${indicators ? `<mnrRestriAppInfoGrp><mnrRestriAppInfo>${indicators}</mnrRestriAppInfo></mnrRestriAppInfoGrp>` : ''}</mnrRulesInfoGrp>`;
const record = (paxType, pax, groups) => `<mnrByPricingRecord><pricingRecordId><referenceType>FRN</referenceType><uniqueReference>1</uniqueReference></pricingRecordId><paxRef><passengerReference><type>${paxType}</type><value>${pax}</value></passengerReference></paxRef>${groups}</mnrByPricingRecord>`;
const replyOf = (...records) => bodyOf(`<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Header/><soap:Body><MiniRule_GetFromRecReply xmlns="http://xml.amadeus.com/TMRXRR_23_1_1A"><responseDetails><statusCode>O</statusCode></responseDetails>${records.join('')}</MiniRule_GetFromRecReply></soap:Body></soap:Envelope>`);

describe('mapMiniRules', () => {
  it('reads a change before departure as allowed for the filed fee', () => {
    expect(mapMiniRules(lufthansa()).change.before).toEqual({ allowed: true, amount: 338, varies: false });
  });

  it('reads a change on a no-show before departure the same way', () => {
    expect(mapMiniRules(lufthansa()).change.noShowBefore).toEqual({ allowed: true, amount: 338, varies: false });
  });

  it('reads a change after departure as not allowed', () => {
    expect(mapMiniRules(lufthansa()).change.after).toMatchObject({ allowed: false });
  });

  it('reads the fare as never refundable', () => {
    const { refund } = mapMiniRules(lufthansa());
    expect([refund.before.allowed, refund.noShowBefore.allowed, refund.after.allowed, refund.noShowAfter.allowed])
      .toEqual([false, false, false, false]);
  });

  it('keeps the currency and the last day to book', () => {
    expect(mapMiniRules(lufthansa())).toMatchObject({ currency: 'USD', bookBy: '2026-11-04' });
  });

  // The meaning of each monetary qualifier letter is not in the schema, so a
  // figure is shown only when every variant for the situation agrees.
  it('gives no figure when the variants for a situation disagree', () => {
    const reply = replyOf(record('PA', 1, category(31, {
      indicators: indicator('BDA', 1),
      amounts: money('BDM', '338.00') + money('BDX', '150.00'),
    })));
    expect(mapMiniRules(reply).change.before).toEqual({ allowed: true, amount: null, varies: true });
  });

  it('reads the adult record, never a child or infant one', () => {
    const reply = replyOf(
      record('PA', 1, category(31, { indicators: indicator('BDA', 1), amounts: money('BDM', '338.00') })),
      record('PI', 1, category(31, { indicators: indicator('BDA', 0), amounts: money('BDM', '0.00') })),
    );
    expect(mapMiniRules(reply).change.before).toEqual({ allowed: true, amount: 338, varies: false });
  });

  it('gives no figure when two fare components file different fees', () => {
    const twoComponents = category(31, { indicators: indicator('BDA', 1), amounts: money('BDM', '338.00') })
      + category(31, { indicators: indicator('BDA', 1), amounts: money('BDM', '200.00') });
    expect(mapMiniRules(replyOf(record('PA', 1, twoComponents))).change.before).toMatchObject({ amount: null, varies: true });
  });

  it('calls a situation not allowed when any fare component refuses it', () => {
    const mixed = category(33, { indicators: indicator('BDA', 1) }) + category(33, { indicators: indicator('BDA', 0) });
    expect(mapMiniRules(replyOf(record('PA', 1, mixed))).refund.before.allowed).toBe(false);
  });

  it('gives an allowed situation with no amounts no figure', () => {
    const reply = replyOf(record('PA', 1, category(31, { indicators: indicator('BDA', 1) })));
    expect(mapMiniRules(reply).change.before).toEqual({ allowed: true, amount: null, varies: false });
  });

  // amount is optional in TMRXRR: an empty one is not a fee of nothing.
  it('never reads a missing amount as no fee', () => {
    const reply = replyOf(record('PA', 1, category(33, {
      indicators: indicator('BDA', 1),
      amounts: '<monetaryDetails><typeQualifier>BDM</typeQualifier><currency>USD</currency></monetaryDetails>',
    })));
    expect(mapMiniRules(reply).refund.before).toEqual({ allowed: true, amount: null, varies: false });
  });

  it('never takes a figure without its currency', () => {
    const reply = replyOf(record('PA', 1, category(31, {
      indicators: indicator('BDA', 1),
      amounts: '<monetaryDetails><typeQualifier>BDM</typeQualifier><amount>100.00</amount></monetaryDetails>',
    })));
    expect(mapMiniRules(reply).change.before).toEqual({ allowed: true, amount: null, varies: false });
  });

  it('does not agree two figures in different currencies', () => {
    const reply = replyOf(record('PA', 1, category(31, {
      indicators: indicator('BDA', 1),
      amounts: money('BDM', '100.00', 'EUR') + money('BDX', '100.00', 'USD'),
    })));
    expect(mapMiniRules(reply).change.before).toEqual({ allowed: true, amount: null, varies: true });
  });

  it('gives no figure when one fare component allows the situation and files no amount', () => {
    const reply = replyOf(record('PA', 1, components(1, 2)
      + category(33, { fc: 1, indicators: indicator('BDA', 1), amounts: money('BDM', '0.00') })
      + category(33, { fc: 2, indicators: indicator('BDA', 1) })));
    expect(mapMiniRules(reply).refund.before).toEqual({ allowed: true, amount: null, varies: false });
  });

  it('does not know a situation when a fare component files no rule for it', () => {
    const reply = replyOf(record('PA', 1, components(1, 2)
      + category(31, { fc: 1, indicators: indicator('BDA', 1), amounts: money('BDM', '338.00') })
      + category(33, { fc: 1, indicators: indicator('BDA', 0) })
      + category(33, { fc: 2, indicators: indicator('BDA', 0) })));
    expect(mapMiniRules(reply).change.before).toEqual({ allowed: null, amount: null, varies: false });
  });

  it('keeps a refusal when another fare component files no rule', () => {
    const reply = replyOf(record('PA', 1, components(1, 2)
      + category(33, { fc: 1, indicators: indicator('BDA', 0) })));
    expect(mapMiniRules(reply).refund.before.allowed).toBe(false);
  });

  it('is null when the adult record says nothing about cancelling or changing', () => {
    expect(mapMiniRules(replyOf(record('PA', 1, category(6))))).toBeNull();
  });

  it('is null for a reply with no pricing record', () => {
    expect(mapMiniRules(replyOf())).toBeNull();
  });
});
