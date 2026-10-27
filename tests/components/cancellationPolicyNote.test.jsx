import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

/** The cancellation policy, stated on the review page before payment. */
const { default: CancellationPolicyNote } = await import('../../frontend/src/Pages/Common/flights/CancellationPolicyNote.jsx');

describe('CancellationPolicyNote', () => {
  it('states the policy with the deadline for a booking made now and the flight cancellation fee', () => {
    render(<CancellationPolicyNote cancellationFee={50} freeUntil="2026-10-13T04:00:00.000Z" />);
    expect(screen.getByText('Cancellation policy')).toBeTruthy();
    expect(screen.getByText(/^Book now and you can cancel free until .+: you get back the airline price\. The platform fee is not refundable\.$/)).toBeTruthy();
    expect(screen.queryByText(/24 hours/)).toBeNull();
    expect(screen.getByText(/less the airline's penalty and our \$50\.00 cancellation fee; a non-refundable fare returns only unused taxes\./)).toBeTruthy();
    expect(screen.getByText('If the airline cancels or changes your flight, you get back everything you paid.')).toBeTruthy();
  });

  it('names the end of the booking day while the deadline is not known', () => {
    render(<CancellationPolicyNote cancellationFee={50} />);
    expect(screen.getByText("You can cancel free until 11:59 PM on the day you book (our ticketing office's time): you get back the airline price. The platform fee is not refundable.")).toBeTruthy();
  });

  it('names the flat fee and the percentage together', () => {
    render(<CancellationPolicyNote cancellationFee={50} cancellationFeePercent={10} />);
    expect(screen.getByText(/less the airline's penalty and our cancellation fee of \$50\.00 plus 10% of what you paid; a non-refundable fare/)).toBeTruthy();
  });

  it('names no fee when none is set', () => {
    render(<CancellationPolicyNote cancellationFee={0} />);
    expect(screen.queryByText(/cancellation fee;/)).toBeNull();
  });
});
