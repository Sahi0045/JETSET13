import React from 'react';
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react';
import { AlertCircle, ClipboardList, ShieldCheck, X } from 'lucide-react';

/**
 * The site's own dialog for telling a customer something needs their attention.
 *
 * The booking pages used the browser's `alert()`: a grey system box headed
 * "localhost:5173 says" (or the bare domain), one long plain-text list, and no
 * way to get to what needed fixing. This one matches the booking pages, groups
 * issues under the traveller they belong to, keeps focus inside while open and
 * closes on Escape.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {'attention'|'error'} [props.tone]
 * @param {string} props.title
 * @param {string} [props.message]
 * @param {Array<{id?: string|number, label: string, items: string[]}>} [props.groups]
 *   issues grouped under a heading, e.g. one group per traveller
 * @param {boolean} [props.reassure] adds "Nothing has been charged."
 * @param {string} [props.actionLabel]
 * @param {() => void} [props.onAction] runs after the dialog closes
 * @param {() => void} props.onClose
 */
const TONES = {
  attention: { Icon: ClipboardList, badge: 'bg-[#E6F4F8] text-[#055B75]' },
  error: { Icon: AlertCircle, badge: 'bg-red-50 text-red-600' },
};

export default function NoticeDialog({
  open,
  tone = 'attention',
  title,
  message,
  groups = [],
  reassure = false,
  actionLabel = 'OK',
  onAction,
  onClose,
}) {
  const { Icon, badge } = TONES[tone] || TONES.attention;
  const act = () => {
    onClose();
    onAction?.();
  };

  return (
    <Dialog open={open} onClose={onClose} className="relative z-[10000]">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-[#0d3d56]/50 backdrop-blur-[2px] transition-opacity duration-200 data-[closed]:opacity-0"
      />
      <div className="fixed inset-0 flex items-end justify-center p-4 sm:items-center">
        <DialogPanel
          transition
          className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl transition duration-200 data-[closed]:translate-y-4 data-[closed]:opacity-0 sm:data-[closed]:translate-y-0 sm:data-[closed]:scale-95"
        >
          <div className="h-1.5 bg-gradient-to-r from-[#055B75] to-[#0890BC]" />
          <div className="p-6">
            <div className="flex items-start gap-4">
              <span className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full ${badge}`}>
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <DialogTitle className="text-lg font-semibold text-[#0d3d56]">{title}</DialogTitle>
                {message && <p className="mt-1 text-sm leading-relaxed text-gray-600">{message}</p>}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="-mr-2 -mt-2 rounded-full p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {groups.length > 0 && (
              <div className="mt-5 max-h-72 space-y-3 overflow-y-auto pr-1">
                {groups.map((group) => (
                  <div key={group.id ?? group.label} className="rounded-xl border border-[#65B3CF]/40 bg-[#F4FAFC] p-3">
                    <span className="mb-2 inline-flex items-center rounded-full bg-[#055B75] px-2.5 py-0.5 text-xs font-semibold text-white">
                      {group.label}
                    </span>
                    <ul className="space-y-1.5">
                      {group.items.map((item, i) => (
                        <li key={`${i}-${item}`} className="flex items-start gap-2 text-sm text-gray-700">
                          <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#65B3CF]" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}

            {reassure && (
              <p className="mt-4 flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                Nothing has been charged.
              </p>
            )}

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              {onAction && (
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg px-4 py-2.5 text-sm font-semibold text-gray-600 transition hover:bg-gray-100"
                >
                  Close
                </button>
              )}
              <button
                type="button"
                data-autofocus
                onClick={act}
                className="rounded-lg bg-gradient-to-r from-[#055B75] to-[#0890BC] px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0890BC] focus-visible:ring-offset-2"
              >
                {actionLabel}
              </button>
            </div>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
