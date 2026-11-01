import React, { useState } from 'react';
import { Check, Copy, ExternalLink } from 'lucide-react';
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
          className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5 rounded-2xl border border-[#DCEBF0] bg-[#F5FAFB] px-4 py-3"
        >
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-500">{checkIn.codeIsAirlines ? 'Airline PNR' : 'Booking code (PNR)'}</div>
            <div className="flex items-center gap-2">
              <span className="font-grotesk text-lg font-bold tracking-[0.18em] text-[#034457]">{checkIn.code}</span>
              <button
                type="button"
                onClick={() => copy(checkIn.code)}
                aria-label={`Copy ${checkIn.code}`}
                className="inline-flex items-center gap-1 rounded-full border border-[#B9D0DC] bg-white px-2.5 py-0.5 text-xs font-semibold text-[#055B75] hover:border-[#055B75] transition-colors"
              >
                {copied === checkIn.code ? <Check className="h-3 w-3" aria-hidden="true" /> : <Copy className="h-3 w-3" aria-hidden="true" />}
                {copied === checkIn.code ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
          <span className="hidden sm:block h-10 w-px bg-[#DCEBF0]" aria-hidden="true" />
          <p className="flex-1 text-xs text-gray-500 leading-relaxed">
            {[checkInOpensText(checkIn), checkIn.codeIsAirlines ? '' : 'If the airline does not find this code, use your ticket number.']
              .filter(Boolean)
              .join('. ')}
          </p>
          <a
            href={checkIn.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[#055B75] px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-[#034457] transition-colors"
          >
            {`Check in with ${checkIn.airline}`}
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
      ))}
    </div>
  );
}
