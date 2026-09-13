import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import NoticeDialog from '../../frontend/src/Components/NoticeDialog.jsx';

/**
 * The booking pages' own dialog, replacing the browser's alert() box.
 */
describe('NoticeDialog', () => {
  it('shows the issues grouped under each traveller', () => {
    render(
      <NoticeDialog
        open
        title="Check the traveller details"
        message="The airline needs these to issue the ticket."
        groups={[
          { id: 'p1', label: 'Adult 1', items: ['Enter the date of birth.', 'Select a gender.'] },
          { id: 'p2', label: 'Child 2', items: ['Enter the passport number.'] },
        ]}
        reassure
        actionLabel="Review details"
        onAction={() => {}}
        onClose={() => {}}
      />
    );

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Check the traveller details')).toBeTruthy();
    expect(screen.getByText('Adult 1')).toBeTruthy();
    expect(screen.getByText('Child 2')).toBeTruthy();
    expect(screen.getByText('Select a gender.')).toBeTruthy();
    expect(screen.getByText('Nothing has been charged.')).toBeTruthy();
  });

  // The page's action scrolls to the traveller, so it has to run after the
  // dialog has let go of the page.
  it('closes, then runs the action', () => {
    const calls = [];
    render(
      <NoticeDialog open title="Check" actionLabel="Review details" onClose={() => calls.push('close')} onAction={() => calls.push('action')} />
    );

    fireEvent.click(screen.getByText('Review details'));
    expect(calls).toEqual(['close', 'action']);
  });

  it('a plain notice has one button, which closes it', () => {
    const calls = [];
    render(<NoticeDialog open tone="error" title="We could not start the payment" onClose={() => calls.push('close')} />);

    expect(screen.queryByText('Close')).toBeNull();
    fireEvent.click(screen.getByText('OK'));
    expect(calls).toEqual(['close']);
  });

  it('renders nothing while closed', () => {
    render(<NoticeDialog open={false} title="Hidden" onClose={() => {}} />);
    expect(screen.queryByText('Hidden')).toBeNull();
  });
});
