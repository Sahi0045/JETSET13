import React from 'react';
import { Loader2 } from 'lucide-react';
import AirlineFeeTable from './AirlineFeeTable';
import { describeFee } from './FlightCancellationPolicy';
import { ifYouCancel } from '../../../../../shared/ifYouCancel';
import { ticketState, ticketsVoided } from '../../../utils/eTicket';

const SUPPORT_PHONE = '(877) 538-7380';

/** Manage Booking's "Cancel & change": what cancelling does now, and the airline's fee table. */
export default function BookingCancelRules({ booking, feeRules }) {
  const state = ticketState(booking);
  if (state === 'cancelled') {
    return <p className="text-sm text-gray-700">This booking is cancelled, so these rules no longer apply.</p>;
  }

  const penalties = feeRules?.data ?? null;
  const currency = penalties?.currency || 'USD';
  const fee = (amount) => {
    const described = describeFee(amount, currency);
    return described ? [described.main, described.note].filter(Boolean).join(' ') : `${currency} ${amount}`;
  };
  const lines = ifYouCancel({
    ticketState: state,
    ticketsVoided: ticketsVoided(booking),
    penalties,
    airline: booking?.airlineName || '',
    fee,
  });

  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-lg font-semibold mb-3">If you cancel</h3>
        <div className="space-y-2 text-sm text-gray-700">
          {lines.map((line) => <p key={line}>{line}</p>)}
        </div>
      </section>
      <section>
        {feeRules?.isLoading ? (
          <p className="text-sm text-gray-500 flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Reading the airline&apos;s rules for this fare…
          </p>
        ) : penalties ? (
          <AirlineFeeTable penalties={penalties} />
        ) : (
          <p className="text-sm text-gray-500">
            {`The airline's fee table for this fare is not available right now. Call ${SUPPORT_PHONE} to ask what a change or cancellation would cost.`}
          </p>
        )}
      </section>
    </div>
  );
}
