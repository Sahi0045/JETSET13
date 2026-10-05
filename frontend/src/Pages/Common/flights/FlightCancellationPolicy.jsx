import React, { useEffect, useState } from 'react';
import { Plane, ChevronDown, Loader2 } from 'lucide-react';
import currencyService from '../../../Services/CurrencyService';
import { CHARGE_CURRENCY, feeInUsd } from '../../../utils/chargeDisplay';

// Segment times are the departure airport's wall clock with no offset
// ("2026-11-15T10:30:00"). They are held in UTC and formatted in UTC so they
// print exactly as the airport's clock reads, in every viewer's time zone.
const airportClock = (at) => (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(String(at || ''))
  ? new Date(`${at}Z`)
  : null);
const fmtTime = (d) => {
  if (!d || isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
};
const fmtDay = (d) => {
  if (!d || isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' });
};
/**
 * The currency an amount is in, or null when the fare rules did not say.
 *
 * This returned `code + ' '` for anything it did not recognise, so an empty
 * code became a single space and the panel rendered "Cancellation fee: 3,500" -
 * a bare number, no currency, on the screen where the customer decides whether
 * the fare is worth booking. Fare-rule amounts are in the fare's own currency
 * while the card is always charged in USD, so an unlabelled number is ambiguous
 * exactly where it must not be. Without a currency we do not state an amount.
 */
const cur = (code) => {
  const c = String(code || '').trim().toUpperCase();
  if (!c) return null;
  if (c === 'INR') return '₹';
  if (c === 'USD') return '$';
  if (c === 'EUR') return '€';
  return `${c} `;
};

const CURRENCY_NAMES = { EUR: 'euros', INR: 'rupees', GBP: 'pounds', AED: 'dirhams', CAD: 'Canadian dollars', AUD: 'Australian dollars', SGD: 'Singapore dollars', JPY: 'yen' };
const plain = (n) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });

/**
 * A fee as the customer should read it beside a total charged in US dollars:
 * `main` is what it costs them, `note` the airline's own amount.
 *
 * Airlines file penalties in their own currency (EUR 150 on LOT, INR 14000 on
 * Virgin for the same DEL-EWR search on PDT), and the panel printed that as it
 * came - "€500" under "Total Amount US$4,038.77". Now a fee in another currency
 * reads in dollars at the live rate, with the airline's figure beside it; with
 * no live rate it keeps the airline's figure and names the currency.
 */
export const describeFee = (amount, currency) => {
  const code = String(currency || '').trim().toUpperCase();
  const sym = cur(code);
  if (sym === null || amount == null) return null;
  if (code === CHARGE_CURRENCY) return { main: `US$${plain(amount)}`, note: null, estimated: false };
  const usd = feeInUsd(amount, code, {
    rate: currencyService.getExchangeRate(code),
    ratesLive: currencyService.hasLiveRates(),
  });
  const own = `${sym}${plain(amount)}`;
  if (usd === null) return { main: own, note: `(in ${CURRENCY_NAMES[code] || code}, as the airline sets it)`, estimated: false };
  return { main: `about US$${Math.round(usd).toLocaleString('en-US')}`, note: `(${own} set by the airline)`, estimated: true };
};

export const Fee = ({ fee }) => (
  <>
    <span>{fee.main}</span>
    {fee.note && <span className="ml-1 text-[11px] font-normal text-gray-500">{fee.note}</span>}
  </>
);

/**
 * `rules` is the review page's one fare check: { status: 'loading' | 'ready' |
 * 'failed' | 'refused', data: { cancellation, fareRules } }. The panel used to fetch the
 * rules itself, and so did the baggage panel beside it - two more pricings of
 * the same offer next to the page's own price check.
 */
function FlightCancellationPolicy({ flightOffer, fromCode, toCode, departureAt, rules: fareCheck }) {
  const [showPolicy, setShowPolicy] = useState(false);
  const [, refresh] = useState(0);

  useEffect(() => {
    // Live rates arriving change what a fee in another currency reads as.
    const onChange = () => refresh((n) => n + 1);
    window.addEventListener('currencyChanged', onChange);
    return () => window.removeEventListener('currencyChanged', onChange);
  }, []);
  const loading = !fareCheck || fareCheck.status === 'loading';
  // The airline could not be reached, as opposed to filing no rules. A fare it
  // refused ('refused') reads like one with no rules on file.
  const unreachable = fareCheck?.status === 'failed';
  const c = fareCheck?.status === 'ready' ? fareCheck.data?.cancellation || null : null;
  const rules = fareCheck?.status === 'ready'
    ? (fareCheck.data?.fareRules || []).filter(r => /PENALT|CANCEL|CHANGE|REISSUE|REFUND/i.test((r.title || '') + (r.text || '')))
    : [];

  if (!flightOffer) return null;

  // Only what the fare rules say. This drew a second penalty tier at 1.6x the
  // first, a 4-hour cutoff when the rules gave none, rupees when no currency
  // was given, and used the change fee as the cancellation fee - all rendered
  // as precise amounts and times on the page where the customer decides.
  const dep = airportClock(departureAt);
  const cutoffHours = Number.isFinite(c?.cutoffHours) ? c.cutoffHours : null;
  const cutoff = dep && cutoffHours != null ? new Date(dep.getTime() - cutoffHours * 3600000) : null;
  const feeCurrency = c?.currency || c?.fareCurrency || '';
  const cancelFee = describeFee(c?.cancelFee, feeCurrency);
  const changeFee = describeFee(c?.changeFee, feeCurrency);
  const estimated = Boolean(cancelFee?.estimated || changeFee?.estimated);
  const tier2 = c?.refundable === false ? 'Non-refundable' : 'See fare rules';

  return (
    <div className="booking-card mb-8">
      <div className="booking-card-header" style={{ padding: '1.1rem 1.5rem', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ color: '#055B75' }}>Cancellation &amp; Date Change Policy</h2>
        {rules.length > 0 && (
          <button
            onClick={() => setShowPolicy(v => !v)}
            className="text-sm font-semibold text-[#055B75] hover:underline inline-flex items-center gap-1"
          >
            View Policy <ChevronDown className={`h-4 w-4 transition-transform ${showPolicy ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>

      <div className="booking-card-body">
        {loading ? (
          <div className="flex items-center py-4 text-gray-500 text-sm">
            <Loader2 className="h-4 w-4 animate-spin text-[#055B75] mr-2" /> Loading airline cancellation rules…
          </div>
        ) : unreachable ? (
          <p className="text-sm text-amber-800">
            We could not reach the airline for this fare's cancellation rules just now.
            Charges apply as per the airline's fare rules — please check before you pay.
          </p>
        ) : !c || !c.hasData ? (
          <p className="text-sm text-gray-500">
            Cancellation and date-change charges apply as per the airline's fare rules.
            {c && c.refundable === false && <span className="font-semibold text-gray-700"> This is a non-refundable fare.</span>}
          </p>
        ) : (
          <>
            {/* Route badge */}
            <div className="flex items-center gap-2 mb-5">
              <span className="w-8 h-8 rounded-md bg-[#055B75] flex items-center justify-center">
                <Plane className="h-4 w-4 text-white rotate-45" />
              </span>
              <span className="font-bold text-gray-800">{fromCode} – {toCode}</span>
            </div>

            {/* Penalty timeline */}
            <div className="max-w-2xl">
              {/* Amounts over the two tiers */}
              <div className="flex items-center mb-1.5">
                <span className="text-[11px] sm:text-xs text-gray-500 w-[92px] sm:w-[150px] flex-shrink-0">Cancellation Penalty :</span>
                <div className="relative flex-1 h-5">
                  <span className="absolute left-0 text-xs sm:text-sm font-bold text-gray-800 whitespace-nowrap">{cancelFee ? <Fee fee={cancelFee} /> : 'See fare rules'}</span>
                  <span className={`absolute right-0 text-xs sm:text-sm font-bold whitespace-nowrap ${c.refundable === false ? 'text-red-500' : 'text-gray-800'}`}>{tier2}</span>
                </div>
              </div>

              {/* Gradient bar with cutoff divider */}
              <div className="flex items-center">
                <span className="w-[92px] sm:w-[150px] flex-shrink-0" />
                <div className="relative flex-1 h-2 rounded-full" style={{ background: 'linear-gradient(90deg, #16a34a 0%, #84cc16 45%, #eab308 65%, #ef4444 100%)' }}>
                  {cutoff && (
                    <span className="absolute top-1/2 -translate-y-1/2 h-4 w-0 border-l-2 border-dashed border-gray-500" style={{ left: '64%' }} />
                  )}
                </div>
              </div>

              {/* Time tiers - on the departure airport's clock. The label said
                  IST, then "your time"; neither was what these times are. */}
              <div className="flex items-start mt-1.5">
                <span className="text-[11px] sm:text-xs text-gray-500 w-[92px] sm:w-[150px] flex-shrink-0">Cancel between ({fromCode ? `${fromCode} local time` : 'airport local time'}) :</span>
                <div className="relative flex-1 h-9 text-[11px] sm:text-xs">
                  <span className="absolute left-0 font-semibold text-gray-700">Now</span>
                  {cutoff && (
                    <span className="absolute -translate-x-1/2 text-center" style={{ left: '58%' }}>
                      <span className="block font-semibold text-gray-700">{fmtDay(cutoff)}</span>
                      <span className="block text-gray-400">{fmtTime(cutoff)}</span>
                    </span>
                  )}
                  {dep && (
                    <span className="absolute right-0 text-right">
                      <span className="block font-semibold text-gray-700">{fmtDay(dep)}</span>
                      <span className="block text-gray-400">{fmtTime(dep)}</span>
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Summary chips */}
            <div className="flex flex-wrap gap-x-6 gap-y-2 mt-5 pt-4 border-t border-gray-100 text-xs text-gray-600">
              {cancelFee && (
                <span><span className="text-gray-400">Cancellation fee:</span> <span className="font-semibold text-gray-800"><Fee fee={cancelFee} /></span></span>
              )}
              {changeFee && (
                <span><span className="text-gray-400">Date change fee:</span> <span className="font-semibold text-gray-800"><Fee fee={changeFee} /></span></span>
              )}
              <span>
                <span className="text-gray-400">Refundable:</span>{' '}
                {/* Unknown is not "No". */}
                <span className={`font-semibold ${c.refundable === true ? 'text-emerald-600' : c.refundable === false ? 'text-red-500' : 'text-gray-600'}`}>
                  {c.refundable === true ? 'Yes' : c.refundable === false ? 'No' : 'See fare rules'}
                </span>
              </span>
              <span className="text-gray-400">
                Charges per the airline fare rules; taxes/GST may apply.
                {estimated && ' The US$ amount is an estimate at today\'s rate; the airline converts at its own rate when you cancel.'}
              </span>
            </div>

            {/* Full policy text */}
            {showPolicy && rules.length > 0 && (
              <div className="mt-4 space-y-2">
                {rules.map((r, i) => (
                  <div key={i} className="border border-gray-200 rounded-lg p-3">
                    <div className="text-xs font-bold text-gray-700 mb-1">
                      {(r.title || 'Information').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (ch) => ch.toUpperCase())}
                    </div>
                    <pre className="text-[11px] text-gray-600 whitespace-pre-wrap font-sans max-h-40 overflow-y-auto">{r.text}</pre>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default FlightCancellationPolicy;
