import React from 'react';
import { FileText } from 'lucide-react';
import { describeFee, Fee } from './FlightCancellationPolicy';
import { penaltyRows } from '../../../../../shared/penaltyTable';

export default function AirlineFeeTable({ penalties }) {
  const feeRows = penaltyRows(penalties);
  if (!feeRows) return null;
  return (
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
                const fee = cell.amount > 0 ? describeFee(cell.amount, penalties.currency || 'USD') : null;
                return (
                  <td key={i} className={`px-3 py-2 border-t border-gray-100 ${cell.tone === 'notAllowed' ? 'font-semibold text-red-700' : 'text-gray-800'}`}>
                    {fee ? <span className="font-semibold"><Fee fee={fee} /></span> : cell.text}
                    {i === 1 && cell.amount !== null && <span className="block text-gray-500">+ fare difference</span>}
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
  );
}
