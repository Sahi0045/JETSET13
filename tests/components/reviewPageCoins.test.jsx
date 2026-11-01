import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import JetCoinsToggle, { JetCoinsLoginPrompt } from '../../frontend/src/components/JetCoinsToggle.jsx';

describe('the Jet Coins switch', () => {
  it('offers the coins the total can take, and says what they take off', () => {
    const onChange = vi.fn();
    render(<JetCoinsToggle balance={5000} held={0} afterCoupon={122.2} limit={5000} useCoins={false} onChange={onChange} />);
    expect(screen.getByText(/5,000 Jet Coins available/)).toBeTruthy();
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('caps at $1 left on the card', () => {
    render(<JetCoinsToggle balance={50000} held={0} afterCoupon={30} limit={50000} useCoins onChange={() => {}} />);
    expect(screen.getByText(/−\$29\.00/)).toBeTruthy();
  });

  it('uses no more than this booking may, and says the rest stays in the wallet', () => {
    render(<JetCoinsToggle balance={5000} held={0} afterCoupon={122.2} limit={300} useCoins onChange={() => {}} />);
    expect(screen.getByText(/−\$3\.00/)).toBeTruthy();
    expect(screen.getByText('This booking can use up to $3.00 of your Jet Coins. The rest stay in your wallet for your next trip.')).toBeTruthy();
  });

  it('says what the booking can use before the switch is on', () => {
    render(<JetCoinsToggle balance={5000} held={0} afterCoupon={122.2} limit={300} useCoins={false} onChange={() => {}} />);
    expect(screen.getByText(/This booking can use up to \$3\.00/)).toBeTruthy();
  });

  it('says coins cannot be used on a fare whose band allows none, not that the card needs $1', () => {
    render(<JetCoinsToggle balance={5000} held={0} afterCoupon={122.2} limit={0} useCoins={false} onChange={() => {}} />);
    expect(screen.getByText('Jet Coins cannot be used on this fare.')).toBeTruthy();
    expect(screen.queryByText(/At least \$1\.00/)).toBeNull();
    expect(screen.getByRole('switch').disabled).toBe(true);
  });

  it('says nothing about a limit the balance is under', () => {
    render(<JetCoinsToggle balance={120} held={0} afterCoupon={122.2} limit={300} useCoins onChange={() => {}} />);
    expect(screen.getByText(/−\$1\.20/)).toBeTruthy();
    expect(screen.queryByText(/This booking can use up to/)).toBeNull();
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

describe('the Jet Coins a booking earns', () => {
  it('says how many coins the booking earns, below the switch', () => {
    const { container } = render(<JetCoinsToggle balance={5000} held={0} afterCoupon={88.21} limit={200} useCoins={false} earn={88} onChange={() => {}} />);
    expect(screen.getByRole('switch')).toBeTruthy();
    expect(container.textContent).toContain("You'll earn 88 Jet Coins ($0.88) on this booking. They're added to your Jet Wallet once free cancellation ends.");
  });

  it('says what the booking earns to a customer with no coins yet, with no switch', () => {
    const { container } = render(<JetCoinsToggle balance={0} held={0} afterCoupon={88.21} limit={200} useCoins={false} earn={88} onChange={() => {}} />);
    expect(screen.queryByRole('switch')).toBeNull();
    expect(container.textContent).toContain("You'll earn 88 Jet Coins ($0.88) on this booking.");
  });

  it('asks a guest to log in to earn the coins, and sends them to log in', () => {
    const onLogin = vi.fn();
    const { container } = render(<JetCoinsLoginPrompt earn={88} onLogin={onLogin} />);
    expect(container.textContent).toContain('Log in to earn 88 Jet Coins ($0.88) on this booking and use your Jet Coins at checkout.');
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(onLogin).toHaveBeenCalledTimes(1);
  });

  it('names no number to a guest when the booking earns none', () => {
    const { container } = render(<JetCoinsLoginPrompt earn={0} onLogin={() => {}} />);
    expect(container.textContent).toContain('Log in to earn Jet Coins on your bookings and use them at checkout.');
  });
});
