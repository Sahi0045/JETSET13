import React from 'react';
import { Loader2 } from 'lucide-react';
import AirlineFeeTable from './AirlineFeeTable';
import { describeFee } from './FlightCancellationPolicy';
import { ifYouCancel } from '../../../../../shared/ifYouCancel';
import { documentState, ticketState, ticketsVoided } from '../../../utils/eTicket';

const SUPPORT_PHONE = '(877) 538-7380';

// Bookings store the validating carrier's code as the airline name.
const airlineNameOf = (booking) => {
  const name = String(booking?.airlineName || '').trim();
  return /^[A-Z0-9]{2}$/.test(name) ? '' : name;
};

export default function BookingCancelRules({ booking, feeRules, canCancel }) {
  const state = ticketState(booking);
  if (state === 'cancelled') {
    return <p className="text-sm text-gray-700">This booking is cancelled, so these rules no longer apply.</p>;
  }
  if (!canCancel) {
    return (
      <p className="text-sm text-gray-700">
        {`This booking cannot be cancelled online. For a change or a cancellation, call ${SUPPORT_PHONE} with your booking reference.`}
      </p>
    );
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
    ticketComing: ['held', 'queued'].includes(documentState(booking)),
    penalties,
    airline: airlineNameOf(booking),
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
      {booking?.pnr ? (
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
      ) : null}
    </div>
  );
}
