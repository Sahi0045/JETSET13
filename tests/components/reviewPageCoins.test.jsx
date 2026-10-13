import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import JetCoinsToggle from '../../frontend/src/components/JetCoinsToggle.jsx';

describe('the Jet Coins switch', () => {
  it('offers the coins the total can take, and says what they take off', () => {
    const onChange = vi.fn();
    render(<JetCoinsToggle balance={5000} held={0} afterCoupon={122.2} useCoins={false} onChange={onChange} />);
    expect(screen.getByText(/5,000 Jet Coins available/)).toBeTruthy();
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('caps at $1 left on the card', () => {
    render(<JetCoinsToggle balance={50000} held={0} afterCoupon={30} useCoins onChange={() => {}} />);
    expect(screen.getByText(/−\$29\.00/)).toBeTruthy();
  });

  it('says coins are held for an open payment page', () => {
    render(<JetCoinsToggle balance={0} held={2000} afterCoupon={30} useCoins={false} onChange={() => {}} />);
    expect(screen.getByText(/2,000 coins are held for a payment page you opened/)).toBeTruthy();
  });

  it('shows nothing to someone with no coins and none held', () => {
    const { container } = render(<JetCoinsToggle balance={0} held={0} afterCoupon={30} useCoins={false} onChange={() => {}} />);
    expect(container.innerHTML).toBe('');
  });
});
