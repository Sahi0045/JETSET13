import React from 'react';
import { cancelPolicyLines } from '../../../../../shared/flightCancelPolicy';

export default function CancellationPolicyNote({ cancellationFee }) {
  return (
    <section className="mt-4" aria-labelledby="cancellation-policy-title">
      <h3 id="cancellation-policy-title" className="text-sm font-bold text-gray-800 mb-2">Cancellation policy</h3>
      <ul className="space-y-1 text-sm text-gray-600 list-disc pl-5">
        {cancelPolicyLines({ cancellationFee }).map((line) => <li key={line}>{line}</li>)}
      </ul>
    </section>
  );
}
