import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

/** The cancellation policy, stated on the review page before payment. */
const { default: CancellationPolicyNote } = await import('../../frontend/src/Pages/Common/flights/CancellationPolicyNote.jsx');

describe('CancellationPolicyNote', () => {
  it('states the policy with the flight cancellation fee', () => {
    render(<CancellationPolicyNote cancellationFee={50} />);
    expect(screen.getByText('Cancellation policy')).toBeTruthy();
    expect(screen.getByText('Cancel within 24 hours of booking and you get back the airline price. The service fee is not refundable.')).toBeTruthy();
    expect(screen.getByText(/less the airline's penalty and our \$50\.00 cancellation fee; a non-refundable fare returns only unused taxes\./)).toBeTruthy();
    expect(screen.getByText('If the airline cancels or changes your flight, you get back everything you paid.')).toBeTruthy();
  });

  it('names no fee when none is set', () => {
    render(<CancellationPolicyNote cancellationFee={0} />);
    expect(screen.queryByText(/cancellation fee;/)).toBeNull();
  });
});
