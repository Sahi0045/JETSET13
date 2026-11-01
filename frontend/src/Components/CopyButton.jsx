import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';

/** A small icon button that copies `value`, named "Copy <label>" for screen readers. */
export default function CopyButton({ value, label }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy ${label}`}
      title={copied ? 'Copied' : 'Copy'}
      className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-gray-400 hover:text-[#055B75] hover:bg-[#F1FBFD] transition-colors outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#65B3CF] focus-visible:ring-offset-2"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
    </button>
  );
}
