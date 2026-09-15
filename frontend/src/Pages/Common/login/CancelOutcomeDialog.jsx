import React, { useEffect, useRef } from 'react';

/**
 * What happened when a booking was cancelled from My Trips, in a dialog.
 *
 * My Trips said it with `alert()`: a browser box a screen reader announces
 * without context, that blocks the page, and that most phones render as a
 * bare system prompt. This is a real dialog - labelled, focus moved into it
 * and back out, closed with Escape - carrying the same one sentence
 * (shared/cancellationOutcome.js) Manage Booking and the email use.
 *
 * @param {{ outcome: { tone: 'success'|'error', text: string }, onClose: () => void }} props
 */
export default function CancelOutcomeDialog({ outcome, onClose }) {
  const okRef = useRef(null);
  const returnFocusTo = useRef(null);

  useEffect(() => {
    returnFocusTo.current = document.activeElement;
    okRef.current?.focus();
    return () => {
      if (returnFocusTo.current && typeof returnFocusTo.current.focus === 'function') returnFocusTo.current.focus();
    };
  }, []);

  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
    // One control in the dialog: Tab stays on it rather than escaping behind.
    if (event.key === 'Tab') {
      event.preventDefault();
      okRef.current?.focus();
    }
  };

  const failed = outcome.tone === 'error';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onKeyDown={onKeyDown}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="cancel-outcome-title"
        aria-describedby="cancel-outcome-text"
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
      >
        <h2 id="cancel-outcome-title" className={`mb-2 text-lg font-semibold ${failed ? 'text-red-700' : 'text-[#055B75]'}`}>
          {failed ? 'Cancellation not completed' : 'Booking cancelled'}
        </h2>
        <p id="cancel-outcome-text" className="mb-5 text-sm text-gray-700">{outcome.text}</p>
        <div className="flex justify-end">
          <button
            ref={okRef}
            type="button"
            onClick={onClose}
            className="rounded-lg bg-[#055B75] px-4 py-2 text-sm font-semibold text-white hover:bg-[#034457]"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
