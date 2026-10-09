import React, { useState } from 'react';
import { Loader2, Luggage, ChevronDown, FileText, Check } from 'lucide-react';
import Price from '../../../Components/Price';
import { readableRuleText, summarizeRule } from '../../../utils/fareRuleSummary';
import { describeFee, Fee } from './FlightCancellationPolicy';
import { penaltyRows } from '../../../../../shared/penaltyTable';

/**
 * `rules` is the review page's one fare check: { status: 'loading' | 'ready' |
 * 'failed' | 'refused', data: { bags, fareRules } }. This panel used to fetch
 * /flights/fare-rules itself - another pricing of an offer the page had
 * already priced.
 */
const RULE_TITLES = Object.freeze({
  CANCELLATIONS: 'Cancellation & refund',
  CHANGES: 'Date & flight changes',
  'NO SHOW': 'No-show',
  PENALTIES: 'Fare rules',
});

const VERDICT_LABEL = Object.freeze({ allowed: 'Allowed', notAllowed: 'Not allowed', conditional: 'Conditions apply' });
const VERDICT_STYLE = Object.freeze({
  allowed: 'bg-emerald-50 text-emerald-700',
  notAllowed: 'bg-red-50 text-red-700',
  conditional: 'bg-amber-50 text-amber-700',
});

const bagLabel = (bag) => {
  if (bag.weight) return `${bag.weight} ${bag.weightUnit || 'KG'} checked baggage`;
  const quantity = bag.quantity ?? 0;
  if (quantity === 0) return 'No checked bag';
  return `${quantity} checked ${quantity === 1 ? 'bag' : 'bags'}`;
};

/** One line per flight, or one for all when every flight allows the same. */
const includedBagLines = (bags, flightOffer) => {
  if (bags.length === 0) return [];
  const segments = (flightOffer?.itineraries ?? []).flatMap((itinerary) => itinerary?.segments ?? []);
  const lines = bags.map((bag) => {
    const segment = segments.find((s) => String(s.id) === String(bag.segmentIds?.[0]));
    return { label: bagLabel(bag), route: segment ? `${segment.departure?.iataCode} → ${segment.arrival?.iataCode}` : null };
  });
  if (new Set(lines.map((l) => l.label)).size === 1) {
    return [lines.length > 1 ? `${lines[0].label} on every flight` : lines[0].label];
  }
  return lines.map((l) => (l.route ? `${l.route}: ${l.label}` : l.label));
};

function FlightFareRules({ flightOffer, onBagsChange, rules: fareCheck }) {
  const loading = Boolean(flightOffer) && (!fareCheck || fareCheck.status === 'loading');
  const ready = fareCheck?.status === 'ready';
  const bags = ready ? fareCheck.data?.bags || [] : [];
  const fareRules = ready ? fareCheck.data?.fareRules || [] : [];
  const penalties = ready ? fareCheck.data?.penalties || null : null;
  const feeRows = penaltyRows(penalties);
  const [openRule, setOpenRule] = useState(null);
  const [selectedBagIdx, setSelectedBagIdx] = useState([]);
  const selectable = typeof onBagsChange === 'function';

  const toggleBag = (idx) => {
    const next = selectedBagIdx.includes(idx)
      ? selectedBagIdx.filter((i) => i !== idx)
      : [...selectedBagIdx, idx];
    setSelectedBagIdx(next);
    const chosen = next.map((i) => bags[i]).filter(Boolean);
    const total = chosen.reduce((sum, b) => sum + (b.price?.amount || 0), 0);
    onBagsChange?.(chosen, total);
  };

  if (loading) {
    return (
      <div className="flex items-center py-4 text-gray-500 text-sm">
        <Loader2 className="h-4 w-4 animate-spin text-[#055B75] mr-2" /> Loading fare rules…
      </div>
    );
  }

  if (bags.length === 0 && fareRules.length === 0 && !feeRows) {
    return <p className="text-sm text-gray-400 italic py-2">Fare rules unavailable for this fare.</p>;
  }

  const prettyTitle = (t) => RULE_TITLES[String(t || '').toUpperCase()]
    ?? (t || 'Information').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

  // A bag with a price is one the airline sells; one without is the fare's own
  // allowance.
  const forSale = bags.filter((b) => b.price);
  const included = includedBagLines(bags.filter((b) => !b.price), flightOffer);

  return (
    <div className="space-y-4">
      {/* Extra baggage options. Selectable only when the caller books what is
          selected. The review page used to add these to the charge and never
          send them to the airline, so it now shows them as information. */}
      {included.length > 0 && (
        <div>
          <div className="text-xs font-bold text-gray-700 mb-2 flex items-center gap-1.5">
            <Luggage className="h-4 w-4 text-[#055B75]" /> Checked baggage included in this fare
          </div>
          <ul className="space-y-1 text-sm text-gray-700">
            {included.map((line) => (
              <li key={line} className="border border-gray-200 rounded-lg px-3 py-2">{line}</li>
            ))}
          </ul>
        </div>
      )}

      {forSale.length > 0 && (
        <div>
          <div className="text-xs font-bold text-gray-700 mb-2 flex items-center gap-1.5">
            <Luggage className="h-4 w-4 text-[#055B75]" /> {selectable ? 'Add extra baggage' : 'Extra baggage the airline sells for this fare'}
          </div>
          {!selectable && (
            <p className="text-xs text-gray-500 mb-2">Extra bags can be added with the airline after booking; they are not added here.</p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {forSale.map((b) => {
              const i = bags.indexOf(b);
              const on = selectable && selectedBagIdx.includes(i);
              return (
                <button
                  key={i}
                  type="button"
                  disabled={!selectable}
                  onClick={() => selectable && b.price && toggleBag(i)}
                  className={`flex items-center justify-between border rounded-lg px-3 py-2 text-sm text-left transition-colors ${on ? 'border-[#055B75] bg-[#F0FAFC]' : 'border-gray-200'} ${selectable ? 'hover:border-[#65B3CF]' : 'cursor-default'}`}
                >
                  <span className="flex items-center gap-2 text-gray-700">
                    {selectable && b.price && (
                      <span className={`h-4 w-4 rounded border flex items-center justify-center flex-shrink-0 ${on ? 'bg-[#055B75] border-[#055B75]' : 'border-gray-300'}`}>
                        {on && <Check className="h-3 w-3 text-white" />}
                      </span>
                    )}
                    {/* A weight allowance is not a piece count: a 15 KG bag
                        used to render as "+15 checked bag 15kg". */}
                    {b.weight
                      ? `+${b.weight} ${b.weightUnit || 'KG'} checked baggage`
                      : `+${b.quantity ?? 1} ${b.quantity === 1 || b.quantity === undefined ? 'checked bag' : 'checked bags'}`}
                  </span>
                  {b.price && (
                    <span className="font-semibold text-[#055B75]">
                      <Price amount={{ amount: b.price.amount, currency: b.price.currency }} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {feeRows && (
        <div>
          <div className="flex items-baseline justify-between mb-2">
            <div className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
              <FileText className="h-4 w-4 text-[#055B75]" /> Cancel or change: airline fees
            </div>
            <span className="text-[11px] text-gray-500">per adult</span>
          </div>
          <table className="w-full text-xs border border-gray-200 rounded-lg overflow-hidden border-separate border-spacing-0">
            <thead className="bg-gray-50 text-gray-600 text-left">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">When</th>
                <th scope="col" className="px-3 py-2 font-semibold">Cancel</th>
                <th scope="col" className="px-3 py-2 font-semibold">Change date</th>
              </tr>
            </thead>
            <tbody>
              {feeRows.map((row) => (
                <tr key={row.key} className="align-top">
                  <th scope="row" className="px-3 py-2 text-left font-semibold text-gray-800 border-t border-gray-100">{row.label}</th>
                  {[row.cancel, row.change].map((cell, i) => {
                    const fee = cell.amount !== null ? describeFee(cell.amount, penalties.currency || 'USD') : null;
                    return (
                      <td key={i} className={`px-3 py-2 border-t border-gray-100 ${cell.tone === 'notAllowed' ? 'font-semibold text-red-700' : 'text-gray-800'}`}>
                        {fee ? (
                          <>
                            <span className="font-semibold"><Fee fee={fee} /></span>
                            {i === 1 && <span className="block text-gray-500">+ fare difference</span>}
                          </>
                        ) : cell.text}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-gray-500 mt-2">
            Fees are the airline&apos;s, filed with this fare.
            {penalties.bookBy && ` Book by ${new Date(`${penalties.bookBy}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })} to keep this fare.`}
          </p>
        </div>
      )}

      {/* Cancellation / change rules */}
      {fareRules.length > 0 && (
        <div>
          <div className="text-xs font-bold text-gray-700 mb-2 flex items-center gap-1.5">
            <FileText className="h-4 w-4 text-[#055B75]" /> Cancellation &amp; change policy
          </div>
          <div className="space-y-2">
            {fareRules.map((r, i) => {
              const summary = summarizeRule(r);
              const fees = summary.fees.map((f) => describeFee(f.amount, f.currency)).filter(Boolean);
              const open = openRule === i;
              return (
                <div key={i} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-gray-800">{prettyTitle(r.title)}</span>
                    {summary.verdict && (
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${VERDICT_STYLE[summary.verdict]}`}>
                        {VERDICT_LABEL[summary.verdict]}
                      </span>
                    )}
                  </div>
                  {fees.length > 0 && (
                    <p className="mt-1 text-xs text-gray-700">
                      {fees.length === 1 ? 'Fee' : 'Fees'}:{' '}
                      {fees.map((fee, f) => (
                        <span key={f} className="font-semibold">{f > 0 && ', '}<Fee fee={fee} /></span>
                      ))}
                    </p>
                  )}
                  {summary.points.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {summary.points.map((point) => (
                        <li key={point} className="flex items-start gap-2 text-xs text-gray-700">
                          <span className="mt-1.5 h-1 w-1 rounded-full bg-gray-400 flex-shrink-0" />
                          {point}
                        </li>
                      ))}
                    </ul>
                  )}
                  <button
                    type="button"
                    onClick={() => setOpenRule(open ? null : i)}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#055B75] hover:underline"
                  >
                    {open ? "Hide the airline's full rules" : "Read the airline's full rules"}
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
                  </button>
                  {open && (
                    <div className="mt-2 space-y-2 text-xs leading-relaxed text-gray-600 max-h-64 overflow-y-auto pr-1">
                      {readableRuleText(r.text).map((paragraph, p) => <p key={p}>{paragraph}</p>)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default FlightFareRules;
