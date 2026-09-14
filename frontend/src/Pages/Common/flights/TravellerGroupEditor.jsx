import React, { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { MAX_SEATED, describeGroup, travellerGroupProblem } from '../../../../../shared/travellerGroup';

/**
 * Add or remove travellers on the review page.
 *
 * The limits are Amadeus's (shared/travellerGroup.js): at most 9 passengers
 * with seats, and never more infants than adults - each infant sits on an
 * adult's lap. The page re-prices the same fare for the new group; this only
 * collects the numbers.
 */

const ROWS = [
  { key: 'adults', label: 'Adults', hint: '12 years or older', min: 1 },
  { key: 'children', label: 'Children', hint: '2 to 11 years', min: 0 },
  { key: 'infants', label: 'Infants', hint: "Under 2, on an adult's lap", min: 0 },
];

const sameGroup = (a, b) => a.adults === b.adults && a.children === b.children && a.infants === b.infants;

export default function TravellerGroupEditor({
  initial,
  busy = false,
  problem = null,
  unavailable = null,
  onApply,
  onCancel,
  onSeeOtherFlights,
  onSearchAgain,
}) {
  const start = {
    adults: initial?.adults || 1,
    children: initial?.children || 0,
    infants: initial?.infants || 0,
  };
  const [group, setGroup] = useState(start);

  const step = (key, delta) => ({ ...group, [key]: group[key] + delta });
  const canChange = (key, delta, min) => {
    const next = step(key, delta);
    return next[key] >= min && !travellerGroupProblem(next);
  };
  // Why the + for infants or the - for adults is off, when it is.
  const infantsAtLimit = group.infants >= group.adults;
  const seatsAtLimit = group.adults + group.children >= MAX_SEATED;

  return (
    <div className="mt-4 rounded-xl border border-[#bae6fd] bg-[#f0f9ff] p-4" role="group" aria-label="Change travellers">
      <p className="text-sm font-semibold text-[#0d3d56]">Who is travelling?</p>
      <p className="text-xs text-gray-600 mt-1">
        We ask the airline for this same flight and fare for the new group. The price is for everyone and can change.
      </p>

      <div className="mt-3 divide-y divide-[#dbeafe]">
        {ROWS.map(({ key, label, hint, min }) => (
          <div key={key} className="flex items-center justify-between py-2">
            <div>
              <div className="text-sm font-medium text-gray-800">{label}</div>
              <div className="text-xs text-gray-500">{hint}</div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label={`Remove one ${label.toLowerCase()}`}
                onClick={() => setGroup(step(key, -1))}
                disabled={busy || !canChange(key, -1, min)}
                className="h-8 w-8 rounded-full border border-[#055B75] text-[#055B75] flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-5 text-center font-semibold" aria-live="polite" data-testid={`count-${key}`}>{group[key]}</span>
              <button
                type="button"
                aria-label={`Add one ${label.toLowerCase()}`}
                onClick={() => setGroup(step(key, 1))}
                disabled={busy || !canChange(key, 1, min)}
                className="h-8 w-8 rounded-full border border-[#055B75] text-[#055B75] flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-500 mt-2">
        {seatsAtLimit
          ? `A booking can have at most ${MAX_SEATED} passengers with seats. For larger groups, please contact us.`
          : infantsAtLimit && group.infants > 0
            ? "Each infant sits on an adult's lap, so add an adult before adding another infant."
            : `Up to ${MAX_SEATED} passengers with seats; one infant per adult.`}
      </p>

      {problem && <p className="text-sm text-red-700 mt-3" role="alert">{problem}</p>}

      {unavailable && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3" role="alert">
          <p className="text-sm text-amber-900">
            This fare is not available for {describeGroup(unavailable.group)} on this flight, so your booking is unchanged.
          </p>
          <button
            type="button"
            onClick={() => onSeeOtherFlights?.(unavailable)}
            className="mt-2 text-sm font-semibold text-[#055B75] underline"
          >
            See flights for {describeGroup(unavailable.group)}
          </button>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onApply?.(group)}
          disabled={busy || sameGroup(group, start)}
          className="px-4 py-2 rounded-lg bg-[#055B75] text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy ? "Checking the airline's price..." : 'Update price'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-semibold disabled:opacity-40"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSearchAgain}
          disabled={busy}
          className="text-xs text-[#055B75] underline ml-auto disabled:opacity-40"
        >
          Or choose a different flight
        </button>
      </div>
    </div>
  );
}
