import React from 'react';
import { Armchair, Backpack, Briefcase, CalendarClock, Check, Coins, Luggage, Minus, RotateCcw, Utensils, X } from 'lucide-react';
import { STATES } from '../../../../../shared/fareInclusions';

const ROW_ICON = {
  personalItem: Backpack,
  cabinBag: Briefcase,
  checkedBag: Luggage,
  cancel: RotateCcw,
  change: CalendarClock,
  seat: Armchair,
  meal: Utensils,
};

const STATE_STYLE = {
  [STATES.INCLUDED]: { icon: 'text-[#055B75]', mark: 'text-emerald-600', text: 'text-gray-800' },
  [STATES.FEE]: { icon: 'text-[#055B75]', mark: 'text-amber-600', text: 'text-gray-700' },
  [STATES.NO]: { icon: 'text-gray-300', mark: 'text-gray-400', text: 'text-gray-400' },
  [STATES.UNKNOWN]: { icon: 'text-gray-300', mark: 'text-gray-300', text: 'text-gray-400' },
};

const STATE_MARK = {
  [STATES.INCLUDED]: { Icon: Check, label: 'Included' },
  [STATES.FEE]: { Icon: Coins, label: 'For a fee' },
  [STATES.NO]: { Icon: X, label: 'Not offered' },
  [STATES.UNKNOWN]: { Icon: Minus, label: 'Not stated' },
};

/** The rows of shared/fareInclusions.js, each with what it is and whether it is included. */
export default function FareInclusionList({ rows, extras = [], className = 'space-y-1.5 text-xs' }) {
  return (
    <ul className={className}>
      {rows.map((row) => {
        const Icon = ROW_ICON[row.key] || Check;
        const style = STATE_STYLE[row.state] || STATE_STYLE[STATES.UNKNOWN];
        const mark = STATE_MARK[row.state] || STATE_MARK[STATES.UNKNOWN];
        return (
          <li key={row.key} className="flex items-start gap-2" data-state={row.state}>
            <Icon className={`h-3.5 w-3.5 mt-px flex-shrink-0 ${style.icon}`} aria-hidden="true" />
            <span className={`flex-1 ${style.text}`}>{row.label}</span>
            <mark.Icon role="img" className={`h-3.5 w-3.5 mt-px flex-shrink-0 ${style.mark}`} aria-label={mark.label} />
          </li>
        );
      })}
      {extras.map((extra) => (
        <li key={extra} className="flex items-start gap-2" data-state={STATES.INCLUDED}>
          <Check className="h-3.5 w-3.5 mt-px flex-shrink-0 text-[#055B75]" aria-hidden="true" />
          <span className="flex-1 text-gray-800">{extra}</span>
          <Check role="img" className="h-3.5 w-3.5 mt-px flex-shrink-0 text-emerald-600" aria-label="Included" />
        </li>
      ))}
    </ul>
  );
}

export function FareInclusionLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-500">
      <span className="inline-flex items-center gap-1"><Check className="h-3 w-3 text-emerald-600" aria-hidden="true" /> Included</span>
      <span className="inline-flex items-center gap-1"><Coins className="h-3 w-3 text-amber-600" aria-hidden="true" /> For a fee</span>
      <span className="inline-flex items-center gap-1"><X className="h-3 w-3 text-gray-300" aria-hidden="true" /> Not offered</span>
      <span className="inline-flex items-center gap-1"><Minus className="h-3 w-3 text-gray-300" aria-hidden="true" /> Not stated by the airline</span>
    </div>
  );
}
