import React from 'react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CancelOutcomeDialog from '../../frontend/src/Pages/Common/login/CancelOutcomeDialog.jsx';

/**
 * My Trips told a customer what their cancellation did with alert(): a browser
 * box with no context for a screen reader, and a bare system prompt on phones.
 */
describe('CancelOutcomeDialog', () => {
  it('is a labelled dialog with the outcome sentence, focused on its one button', () => {
    render(<CancelOutcomeDialog outcome={{ tone: 'success', text: 'Your booking is cancelled. A refund of $241.00 is on its way.' }} onClose={() => {}} />);

    const dialog = screen.getByRole('alertdialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.textContent).toContain('Booking cancelled');
    expect(dialog.textContent).toContain('refund of $241.00');
    expect(document.activeElement.textContent).toBe('OK');
  });

  it('says a failed cancellation plainly, and closes on Escape or OK', () => {
    const onClose = vi.fn();
    render(<CancelOutcomeDialog outcome={{ tone: 'error', text: 'The booking could not be cancelled.' }} onClose={onClose} />);

    expect(screen.getByRole('alertdialog').textContent).toContain('Cancellation not completed');
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });
    fireEvent.click(screen.getByText('OK'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('is what My Trips uses: no alert() is left on the page', () => {
    // From the working directory: under jsdom, import.meta.url is not a file URL.
    const source = readFileSync(path.resolve(process.cwd(), 'frontend/src/Pages/Common/login/mytrips.jsx'), 'utf8');
    expect(source).not.toMatch(/\balert\(/);
    expect(source).toContain('<CancelOutcomeDialog');
  });
});
