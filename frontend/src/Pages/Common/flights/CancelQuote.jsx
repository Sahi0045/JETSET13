import React from 'react';
import { Loader2 } from 'lucide-react';
import { cancelTermsLines } from '../../../../../shared/flightCancelPolicy';
import { QUOTE_UNAVAILABLE } from '../../../../../shared/ifYouCancel';

export function QuoteLoading() {
  return (
    <p className="flex items-center gap-2">
      <Loader2 className="h-4 w-4 animate-spin" /> Working out what you would get back…
    </p>
  );
}

export default function CancelQuote({ query }) {
  // The 24 hours and the ticket can change while a page stays open: a quote
  // being asked again is not shown in its old words.
  if (query?.isLoading || query?.isFetching) return <QuoteLoading />;
  const lines = cancelTermsLines(query?.data);
  return (
    <>
      {(lines.length > 0 ? lines : [QUOTE_UNAVAILABLE]).map((line) => <p key={line}>{line}</p>)}
    </>
  );
}
