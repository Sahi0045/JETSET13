import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

/**
 * What a cancel would return, in the cancel dialog, before the customer
 * confirms: worked out by the server with the rule the cancel applies.
 */
const { default: CancelQuote } = await import('../../frontend/src/Pages/Common/flights/CancelQuote.jsx');

const quote = {
  policy: 'not_ticketed', paid: 300, serviceFeeKept: 12.5, airlinePrice: 287.5, refundAmount: 287.5,
  penalty: null, penaltyCurrency: null, cancellationFee: null, freeUntil: null,
};

describe('CancelQuote', () => {
  it('says it is working the refund out while the quote loads', () => {
    render(<CancelQuote query={{ isLoading: true, data: undefined }} />);
    expect(screen.getByText(/Working out what you would get back/)).toBeTruthy();
  });

  it('does not show an old quote while a fresh one is on its way', () => {
    render(<CancelQuote query={{ isLoading: false, isFetching: true, data: quote }} />);
    expect(screen.getByText(/Working out what you would get back/)).toBeTruthy();
    expect(screen.queryByText(/You get back/)).toBeNull();
  });

  it('gives the amount the cancel returns', () => {
    render(<CancelQuote query={{ isLoading: false, data: quote }} />);
    expect(screen.getByText('No ticket has been issued yet. You get back $287.50; the $12.50 platform fee is not refundable.')).toBeTruthy();
  });

  it('says it could not work the refund out when there is no quote', () => {
    render(<CancelQuote query={{ isLoading: false, isError: true, data: undefined }} />);
    expect(screen.getByText('We could not work out your refund just now. You will see what happens to your payment as soon as the cancellation completes.')).toBeTruthy();
  });
});
