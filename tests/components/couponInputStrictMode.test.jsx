import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The coupon box, as the app actually mounts it: inside React.StrictMode
 * (frontend/main.jsx).
 *
 * The box drops an answer that arrives after it was replaced, through a
 * `mounted` ref. Its effect only ever set that ref to false on cleanup. In
 * development StrictMode runs every effect, its cleanup, then the effect
 * again - so the ref was false from the first render on, every
 * /coupons/validate answer was dropped, and the button stayed on "..." for
 * good. A production build does not double-run effects, so only local work was
 * hit, but that is where the coupon flow gets tested.
 */

const post = vi.fn();
vi.mock('axios', () => ({ default: { post: (...args) => post(...args) } }));
vi.mock('../../frontend/src/contexts/SupabaseAuthContext', () => ({
  useSupabaseAuth: () => ({ user: { id: 'user-1' }, loading: false }),
}));

const { default: CouponInput } = await import('../../frontend/src/components/CouponInput.jsx');

const answer = { success: true, coupon: { id: 'c-1', code: 'SAVE10' }, discountAmount: 10, finalTotal: 90 };

beforeEach(() => {
  post.mockReset();
  post.mockResolvedValue({ data: answer });
});

const applyCode = () => {
  fireEvent.change(screen.getByPlaceholderText('Enter coupon code'), { target: { value: 'save10' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
};

describe('the coupon box under React.StrictMode', () => {
  it('applies a coupon the server accepts, and does not stay on "..."', async () => {
    const onApply = vi.fn();
    render(<React.StrictMode><CouponInput orderTotal={100} onApply={onApply} formatAmount={(n) => `$${n}`} /></React.StrictMode>);

    applyCode();

    await waitFor(() => expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ code: 'SAVE10', discountAmount: 10 })));
    expect(screen.queryByText('...')).toBeNull();
  });

  // Fence: the guard itself still works - an answer for a box that was
  // replaced before it arrived is still dropped.
  it('still drops an answer that arrives after the box is gone', async () => {
    let resolve;
    post.mockReturnValue(new Promise((ok) => { resolve = ok; }));
    const onApply = vi.fn();
    const { unmount } = render(<React.StrictMode><CouponInput orderTotal={100} onApply={onApply} formatAmount={(n) => `$${n}`} /></React.StrictMode>);

    applyCode();
    unmount();
    resolve({ data: answer });
    await new Promise((ok) => setTimeout(ok, 20));

    expect(onApply).not.toHaveBeenCalled();
  });

  // Fence: outside StrictMode (a production build), nothing changes.
  it('applies a coupon outside StrictMode as before', async () => {
    const onApply = vi.fn();
    render(<CouponInput orderTotal={100} onApply={onApply} formatAmount={(n) => `$${n}`} />);

    applyCode();

    await waitFor(() => expect(onApply).toHaveBeenCalled());
  });
});
