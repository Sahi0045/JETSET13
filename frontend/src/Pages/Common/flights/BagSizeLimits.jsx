import React from 'react';
import { bagSizesOf, dimensionsText, weightText } from '../../../../../shared/airlineBagSizes';

export const carrierOf = (flight) => flight?.airline?.code || flight?.airlineCode || flight?.validatingAirlineCodes?.[0] || null;

/** The airline's published size limits for its bags: what fits, not what a fare includes. */
export default function BagSizeLimits({ carrier, cabin, aircraft, className = 'mt-3' }) {
  const sizes = bagSizesOf(carrier, cabin, { aircraft });
  if (!sizes) return null;
  const lines = [
    ['Cabin bag', sizes.cabinBag, weightText(sizes.cabinBag)],
    ['Personal item', sizes.personalItem, weightText(sizes.personalItem)],
    ['Checked bag', sizes.checkedBag, ''],
  ]
    .map(([label, item, weight]) => [label, [dimensionsText(item), weight].filter(Boolean).join(' · ')])
    .filter(([, text]) => text);
  if (lines.length === 0) return null;

  return (
    <div data-testid="bag-size-limits" className={`${className} rounded-lg bg-[#F1FBFD] px-2.5 py-2 text-[11px] text-gray-600`}>
      <div className="font-semibold text-gray-700 mb-0.5">{sizes.airline} size limits</div>
      {lines.map(([label, text]) => (
        <div key={label}><span className="text-gray-500">{label}:</span> {text}</div>
      ))}
    </div>
  );
}
