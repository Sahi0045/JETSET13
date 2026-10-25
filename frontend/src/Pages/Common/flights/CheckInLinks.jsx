import React, { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { checkInOpensText, checkInsOf } from '../../../../../shared/airlineCheckIn';

export default function CheckInLinks({ booking }) {
  const [copied, setCopied] = useState(null);
  const checkIns = checkInsOf(booking);
  if (checkIns.length === 0) return null;

  const copy = async (code) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
    } catch {
      setCopied(null);
    }
  };

  return (
    <div className="w-full space-y-2">
      {checkIns.map((checkIn) => (
        <div
          key={checkIn.carrierCode}
          data-check-in
          className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-[#B9D0DC] bg-[#F1FBFD] p-3"
        >
          <a
            href={checkIn.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#055B75] px-4 py-2 text-sm font-semibold text-white hover:bg-[#034457] transition"
          >
            {`Check in with ${checkIn.airline}`}
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
          <div className="min-w-0 text-sm text-gray-700">
            <div className="flex flex-wrap items-center gap-2">
              <span>{checkIn.codeIsAirlines ? 'Airline booking code' : 'Booking code'}</span>
              <span className="font-mono font-semibold tracking-wider text-[#034457]">{checkIn.code}</span>
              <button
                type="button"
                onClick={() => copy(checkIn.code)}
                aria-label={`Copy ${checkIn.code}`}
                className="rounded border border-[#B9D0DC] bg-white px-2 py-0.5 text-xs font-semibold text-[#055B75] hover:border-[#055B75]"
              >
                {copied === checkIn.code ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              {[checkInOpensText(checkIn), checkIn.codeIsAirlines ? '' : 'If the airline does not find this code, use your ticket number.']
                .filter(Boolean)
                .join('. ')}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
