import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TravellerGroupEditor from '../../frontend/src/Pages/Common/flights/TravellerGroupEditor.jsx';

/**
 * The review page's add-or-remove-travellers panel keeps to Amadeus's limits:
 * 9 passengers with seats at most, and never more infants than adults.
 */

const count = (key) => screen.getByTestId(`count-${key}`).textContent;
const add = (label) => screen.getByRole('button', { name: `Add one ${label}` });
const remove = (label) => screen.getByRole('button', { name: `Remove one ${label}` });

describe('TravellerGroupEditor', () => {
  it('adds an infant only while there is an adult lap for it', () => {
    render(<TravellerGroupEditor initial={{ adults: 1 }} />);

    fireEvent.click(add('infants'));
    expect(count('infants')).toBe('1');
    expect(add('infants').disabled).toBe(true);
    // Nor can the adult it sits on be removed.
    expect(remove('adults').disabled).toBe(true);

    fireEvent.click(add('adults'));
    expect(add('infants').disabled).toBe(false);
  });

  it('stops at 9 passengers with seats', () => {
    render(<TravellerGroupEditor initial={{ adults: 8, children: 1 }} />);

    expect(add('adults').disabled).toBe(true);
    expect(add('children').disabled).toBe(true);
    expect(add('infants').disabled).toBe(false);
  });

  it('asks for the new group only once it differs', () => {
    const onApply = vi.fn();
    render(<TravellerGroupEditor initial={{ adults: 1 }} onApply={onApply} />);

    expect(screen.getByRole('button', { name: 'Update price' }).disabled).toBe(true);
    fireEvent.click(add('children'));
    fireEvent.click(screen.getByRole('button', { name: 'Update price' }));

    expect(onApply).toHaveBeenCalledWith({ adults: 1, children: 1, infants: 0 });
  });

  it('says when the fare is not available for the group, and offers other flights', () => {
    const onSeeOtherFlights = vi.fn();
    const unavailable = { group: { adults: 3, children: 0, infants: 0 }, search: { from: 'DEL' } };
    render(<TravellerGroupEditor initial={{ adults: 1 }} unavailable={unavailable} onSeeOtherFlights={onSeeOtherFlights} />);

    expect(screen.getByRole('alert').textContent).toContain('not available for 3 adults');
    fireEvent.click(screen.getByRole('button', { name: 'See flights for 3 adults' }));
    expect(onSeeOtherFlights).toHaveBeenCalledWith(unavailable);
  });

  it('holds still while the airline price is being checked', () => {
    render(<TravellerGroupEditor initial={{ adults: 1 }} busy />);

    expect(screen.getByRole('button', { name: "Checking the airline's price..." }).disabled).toBe(true);
    expect(add('adults').disabled).toBe(true);
  });
});
