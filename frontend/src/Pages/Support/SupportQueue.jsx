import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminFetch, readAdminResponse } from '../../utils/adminAuth';
import { getApiUrl } from '../../utils/apiHelper';
import { attentionLabel, refundOwedOf } from '../../../../shared/reviewQueue';
import { canVoidPayment } from '../../utils/adminBookingActions';
import { needsManualRefund } from '../../utils/bookingStatus';
import { formatUsd } from '../../utils/bookingCharge';
import { isFullAdmin } from '../../../../shared/staffRoles';

/**
 * The customer support desk: the bookings the Slack alarms named.
 *
 * Until this page, an alarm was the whole story. It fires once per booking and
 * stamps `alerted_at`, so a booking somebody had already ticketed by hand looked
 * exactly like one nobody had touched; the admin panel could not list the
 * flagged bookings, did not show the PNR, the reason or the ticket numbers, and
 * had no way to record that a person had dealt with one. Staff pasted a
 * reference out of Slack into a search box and guessed the rest.
 *
 * Support signs in here with their own account (role `support`), which can work
 * bookings and their money and nothing else - no settings, coupons, fees or
 * staff accounts.
 */

const TABS = [
  { key: 'open', label: 'Needs attention' },
  { key: 'handled', label: 'Handled' },
  { key: 'all', label: 'All bookings' },
];

/** The owner's own tab, for inviting and removing support accounts. */
const STAFF_TAB = { key: 'staff', label: 'Support accounts' };

/** Who is signed in, as the sign-in page recorded it. Not a credential. */
const signedInRole = () => {
  try {
    return JSON.parse(localStorage.getItem('adminUser') || '{}')?.role ?? null;
  } catch {
    return null;
  }
};

/**
 * What the desk writes to a customer, ready to edit.
 *
 * The page showed an email address and a name and nothing to do with them:
 * ringing or writing meant copying the address into another window. A mailto
 * carries the booking's own reference, so the customer knows what it is about
 * and the reply lands in the desk's own inbox.
 */
const mailtoFor = (booking) => {
  const subject = `Your Jetsetters booking ${booking.bookingReference}`;
  const lines = [
    `Hello ${booking.customerName && booking.customerName !== 'N/A' ? booking.customerName.split(' ')[0] : 'there'},`,
    '',
    `I am writing about your booking ${booking.bookingReference}${booking.pnr ? ` (airline reference ${booking.pnr})` : ''}.`,
    '',
    '',
    'Jetsetters customer support',
    '(877) 538-7380',
  ];
  return `mailto:${encodeURIComponent(booking.customerEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`;
};

/** Digits only: a number with spaces or brackets does not dial. */
const telFor = (phone) => `tel:${String(phone).replace(/[^\d+]/g, '')}`;

/**
 * A commit the airline never answered is marked with what the airline said
 * (resolve-review): it does not hold the booking, or it does, under a record
 * locator that goes on the booking. Every other flag takes the note alone.
 */
const RECORD_LOCATOR = /^[A-Z0-9]{6}$/;

/** A booking cancelled or refunded here cannot be recorded as held (the server refuses it). */
const settledHere = (booking) => String(booking?.status || '').toLowerCase() === 'cancelled'
  || ['refunded', 'partially_refunded', 'reversed'].includes(String(booking?.paymentStatus || '').toLowerCase());

const commitAnswer = (handling) => {
  if (!handling?.booking?.commitUnknown) return {};
  return handling.outcome === 'held'
    ? { outcome: 'held', pnr: String(handling.pnr || '').trim().toUpperCase() }
    : { outcome: handling.outcome };
};

const canMarkHandled = (handling) => {
  if (!handling?.note?.trim()) return false;
  if (!handling.booking?.commitUnknown) return true;
  if (handling.outcome === 'not_held') return true;
  return handling.outcome === 'held' && RECORD_LOCATOR.test(String(handling.pnr || '').trim().toUpperCase());
};

/**
 * What Finish refund starts from: what the cancel decided goes back.
 *
 * The box was filled with the booking's whole total, and Refund now sent it.
 * The server caps a refund at what ARC holds, not at what is owed, so a
 * cancel that meant to keep its fee gave the fee back too. With no amount
 * decided - a refund held for a person, or the rest of one after a refund by
 * hand - it starts empty, as the admin panel's does: nothing is filled in
 * that nobody decided.
 */
const refundStartingAmount = (booking) => String(refundOwedOf(booking)?.owed ?? '');

/** The sentence under Finish refund that says where that amount comes from, or null. */
const owedSentence = (booking) => {
  const owed = refundOwedOf(booking);
  if (!owed) return null;
  const less = [
    owed.fee > 0 ? `the ${formatUsd(owed.fee)} cancellation fee it keeps` : null,
    owed.refunded > 0 ? `the ${formatUsd(owed.refunded)} already refunded` : null,
  ].filter(Boolean);
  const decided = less.length
    ? `The cancel decided ${formatUsd(owed.owed)} ${owed.refunded > 0 ? 'more ' : ''}goes back: ${formatUsd(owed.paid)} paid, less ${less.join(' and ')}.`
    : `The cancel decided the whole ${formatUsd(owed.owed)} goes back.`;
  return owed.unanswered
    ? `${decided} Its refund was sent to ARC Pay and never answered: press Check ARC Pay before sending anything.`
    : decided;
};

const hoursSince = (iso) => {
  const at = Date.parse(iso ?? '');
  if (!Number.isFinite(at)) return null;
  return Math.max(0, Math.round((Date.now() - at) / 3600000));
};

const Pill = ({ tone = 'neutral', children }) => {
  const tones = {
    danger: 'bg-red-50 text-red-700 border-red-200',
    warning: 'bg-amber-50 text-amber-800 border-amber-200',
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    neutral: 'bg-[#F0FAFC] text-[#055B75] border-[#B9D0DC]',
  };
  return <span className={`inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-full border ${tones[tone]}`}>{children}</span>;
};

const Field = ({ label, children }) => (
  <div className="min-w-0">
    <p className="text-[10px] font-semibold uppercase tracking-wider text-[#0890BC] mb-0.5">{label}</p>
    <p className="text-sm font-semibold text-gray-900 break-words">{children}</p>
  </div>
);

function SupportQueue() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('open');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  // { booking, note } while the "I have dealt with this" box is open.
  const [handling, setHandling] = useState(null);
  // { type: 'cancel' | 'void' | 'refund', booking, reason?, amount? }
  const [action, setAction] = useState(null);
  const [saving, setSaving] = useState(false);
  // Only the owner sees this: invite a support person, or take the desk away.
  const canInvite = isFullAdmin(signedInRole());
  const [staff, setStaff] = useState([]);
  const [invite, setInvite] = useState({ email: '', firstName: '' });
  const [inviting, setInviting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ limit: '50' });
      if (tab !== 'all') query.set('attention', tab);
      if (search) query.set('search', search);
      const response = await adminFetch(getApiUrl(`flights/admin-bookings-all?${query}`));
      const result = await readAdminResponse(response);
      if (!result.success) throw new Error(result.error || 'Could not load the bookings');
      setBookings(result.data || []);
    } catch (problem) {
      // A dead session is a dead session: readAdminResponse marks it, and the
      // page says so instead of rendering an empty queue that looks like calm.
      if (problem?.sessionExpired) {
        navigate('/desk/login');
        return;
      }
      setError(problem.message || 'Could not load the bookings');
    } finally {
      setLoading(false);
    }
  }, [tab, search, navigate]);

  useEffect(() => { load(); }, [load]);

  const loadStaff = useCallback(async () => {
    if (!canInvite) return;
    try {
      const response = await adminFetch(getApiUrl('staff'));
      const result = await response.json().catch(() => ({}));
      if (result.success) setStaff(result.data || []);
    } catch {
      // The queue is the page's job; a staff list that will not load is not
      // worth an error banner over the bookings.
    }
  }, [canInvite]);

  useEffect(() => { loadStaff(); }, [loadStaff]);

  const sendInvite = async (event) => {
    event.preventDefault();
    setInviting(true);
    try {
      const response = await adminFetch(getApiUrl('staff/invite'), {
        method: 'POST',
        body: JSON.stringify({ email: invite.email.trim(), firstName: invite.firstName.trim() }),
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result.success) {
        setMessage({ tone: 'success', text: result.message });
        setInvite({ email: '', firstName: '' });
        loadStaff();
      } else {
        setMessage({ tone: 'error', text: [result.error, result.detail].filter(Boolean).join(' — ') || 'Could not send the invitation.' });
      }
    } catch {
      setMessage({ tone: 'error', text: 'Could not send the invitation.' });
    } finally {
      setInviting(false);
      setTimeout(() => setMessage(null), 10000);
    }
  };

  const revoke = async (person) => {
    setInviting(true);
    try {
      const response = await adminFetch(getApiUrl(`staff/${person.id}/revoke`), { method: 'POST' });
      const result = await response.json().catch(() => ({}));
      setMessage(response.ok && result.success
        ? { tone: 'success', text: `${person.email} no longer has the desk.` }
        : { tone: 'error', text: result.error || 'Could not remove the access.' });
      loadStaff();
    } finally {
      setInviting(false);
      setTimeout(() => setMessage(null), 10000);
    }
  };

  const markHandled = async () => {
    if (!canMarkHandled(handling)) return;
    setSaving(true);
    try {
      const response = await adminFetch(getApiUrl(`flights/admin-bookings/${handling.booking.id}/resolve-review`), {
        method: 'POST',
        body: JSON.stringify({ note: handling.note.trim(), ...commitAnswer(handling) }),
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result.success) {
        setMessage({ tone: 'success', text: `${handling.booking.bookingReference} marked as handled.` });
        setHandling(null);
        load();
      } else {
        setMessage({ tone: 'error', text: result.error || 'Could not record it.' });
      }
    } catch {
      setMessage({ tone: 'error', text: 'Could not record it.' });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 8000);
    }
  };


  /**
   * Cancel and refund, void, finish refund - the same three server routes the
   * admin panel calls, which decide what actually happens to the money. The
   * desk only says which one to run and why.
   */
  const runAction = async (overrides = {}) => {
    if (!action) return;
    // The choice is passed in, not read back from state: setState is not
    // applied by the time the handler runs, so "Check ARC Pay" sent a refund.
    const current = { ...action, ...overrides };
    const { type, booking } = current;
    setSaving(true);
    try {
      let response;
      if (type === 'cancel') {
        response = await adminFetch(getApiUrl(`flights/admin-bookings/${booking.id}/cancel`), {
          method: 'POST',
          body: JSON.stringify({ reason: current.reason?.trim() || 'Cancelled by the support desk' }),
        });
      } else if (type === 'void') {
        const orderId = booking.arcOrderId || booking.bookingReference;
        response = await adminFetch(getApiUrl('payments?action=payment-void'), {
          method: 'POST',
          body: JSON.stringify({
            paymentId: orderId,
            orderId,
            bookingReference: booking.bookingReference,
            reason: current.reason?.trim() || 'Voided by the support desk',
          }),
        });
      } else {
        response = await adminFetch(getApiUrl(`flights/admin-bookings/${booking.id}/refund`), {
          method: 'POST',
          body: JSON.stringify(current.mode === 'sync'
            ? { mode: 'sync' }
            : { mode: 'refund', amount: Number(current.amount), reason: 'Refund finished by the support desk' }),
        });
      }
      const result = await response.json().catch(() => ({}));
      if (response.ok && result.success) {
        setMessage({ tone: 'success', text: `${booking.bookingReference}: ${result.message || 'done'}` });
        setAction(null);
        load();
      } else {
        setMessage({ tone: 'error', text: result.error || result.message || 'The server refused that.' });
      }
    } catch {
      setMessage({ tone: 'error', text: 'That did not go through. Please try again.' });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 10000);
    }
  };

  const openCount = tab === 'open' ? bookings.length : null;

  return (
    <div className="min-h-screen bg-[#F7FBFC]">
      <header className="bg-white border-b border-[#D1E9F0]">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-[#055B75]">Support desk</h1>
            <p className="text-sm text-gray-500">The bookings that need a person, the same ones Slack announces.</p>
          </div>
          <button
            type="button"
            onClick={() => { try { localStorage.removeItem('adminUser'); } catch { /* blocked storage */ } navigate('/desk/login'); }}
            className="text-sm font-semibold text-[#055B75] border border-[#B9D0DC] rounded-lg px-3 py-2"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {[...TABS, ...(canInvite ? [STAFF_TAB] : [])].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={`px-3.5 py-2 rounded-lg text-sm font-semibold border ${tab === item.key
                ? 'bg-[#055B75] text-white border-[#055B75]'
                : 'bg-white text-[#055B75] border-[#B9D0DC]'}`}
            >
              {item.label}{item.key === 'open' && openCount !== null ? ` (${openCount})` : ''}
            </button>
          ))}
          {tab !== 'staff' && (
          <form
            className="ml-auto flex items-center gap-2"
            onSubmit={(event) => { event.preventDefault(); setSearch(searchInput.trim()); }}
          >
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Booking reference, name or email"
              aria-label="Search bookings"
              className="px-3 py-2 rounded-lg border border-[#B9D0DC] text-sm w-64 max-w-full"
            />
            <button type="submit" className="px-3 py-2 rounded-lg bg-[#0890BC] text-white text-sm font-semibold">Search</button>
          </form>
          )}
        </div>

        {message && (
          <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-semibold ${message.tone === 'success'
            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
            : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {message.text}
          </div>
        )}

        {tab !== 'staff' && loading && <p className="text-gray-500">Loading…</p>}
        {error && !loading && <p className="text-red-700 font-semibold">{error}</p>}

        {tab !== 'staff' && !loading && !error && bookings.length === 0 && (
          <div className="bg-white border border-[#D1E9F0] rounded-xl p-8 text-center">
            <p className="text-lg font-semibold text-gray-900">
              {tab === 'open' ? 'Nothing needs attention' : 'Nothing to show'}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              {tab === 'open' ? 'Every flagged booking has been dealt with.' : 'Try another tab, or search for a booking reference.'}
            </p>
          </div>
        )}

        <div className="space-y-4">
          {(tab === 'staff' ? [] : bookings).map((booking) => {
            const attention = booking.attention;
            const resolved = booking.reviewResolution;
            const age = hoursSince(booking.bookingDate);
            return (
              <article key={booking.id} className="bg-white border border-[#D1E9F0] rounded-xl p-4">
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <h2 className="text-base font-bold text-gray-900">{booking.bookingReference}</h2>
                  <Pill tone="neutral">{booking.service || booking.type}</Pill>
                  {attention && <Pill tone={attention.kind === 'airline_refund' ? 'warning' : 'danger'}>{attentionLabel(attention)}</Pill>}
                  {resolved && <Pill tone="success">Handled</Pill>}
                  {age !== null && <span className="text-xs text-gray-500">{age}h old</span>}
                </div>

                {attention && (
                  <p className="text-sm text-gray-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                    {attention.reason}
                    {attention.tickets?.length ? ` — tickets ${attention.tickets.join(', ')}` : ''}
                  </p>
                )}
                {resolved && (
                  <p className="text-sm text-gray-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mb-3">
                    {resolved.note} — {resolved.by} on {new Date(resolved.at).toLocaleString()}
                  </p>
                )}

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                  <Field label="Customer">
                    {booking.customerName || '—'}
                    <br />
                    <span className="font-normal text-gray-500 text-xs">{booking.customerEmail || 'no email on the booking'}</span>
                    <br />
                    <span className="font-normal text-gray-500 text-xs">{booking.customerPhone || 'no phone on the booking'}</span>
                  </Field>
                  <Field label="PNR">{booking.pnr || 'Not assigned'}</Field>
                  <Field label="Tickets">{booking.ticketNumbers?.length ? booking.ticketNumbers.join(', ') : (booking.ticketed ? 'Issued' : 'None')}</Field>
                  <Field label="Paid">{booking.totalAmount > 0 ? formatUsd(booking.totalAmount) : '—'}<br /><span className="font-normal text-gray-500 text-xs">{booking.status} · {booking.paymentStatus}</span></Field>
                </div>

                <div className="flex flex-wrap gap-2">
                  {booking.customerPhone && (
                    <a
                      href={telFor(booking.customerPhone)}
                      className="px-3 py-2 rounded-lg border border-[#B9D0DC] text-[#055B75] text-sm font-semibold"
                    >
                      Call {booking.customerPhone}
                    </a>
                  )}
                  {booking.customerEmail && (
                    <a
                      href={mailtoFor(booking)}
                      className="px-3 py-2 rounded-lg border border-[#B9D0DC] text-[#055B75] text-sm font-semibold"
                    >
                      Email customer
                    </a>
                  )}
                  {attention && (
                    <button
                      type="button"
                      onClick={() => setHandling({ booking, note: '' })}
                      className="px-3 py-2 rounded-lg bg-[#055B75] text-white text-sm font-semibold"
                    >
                      Mark as handled
                    </button>
                  )}
                  {String(booking.status || '').toLowerCase() !== 'cancelled' && !booking.isPackage && (
                    <button
                      type="button"
                      onClick={() => setAction({ type: 'cancel', booking, reason: '' })}
                      className="px-3 py-2 rounded-lg border border-[#B9D0DC] text-[#055B75] text-sm font-semibold"
                    >
                      Cancel &amp; refund
                    </button>
                  )}
                  {canVoidPayment(booking) && (
                    <button
                      type="button"
                      onClick={() => setAction({ type: 'void', booking, reason: '' })}
                      className="px-3 py-2 rounded-lg border border-[#B9D0DC] text-[#055B75] text-sm font-semibold"
                    >
                      Void payment
                    </button>
                  )}
                  {needsManualRefund(booking) && (
                    <button
                      type="button"
                      onClick={() => setAction({ type: 'refund', booking, amount: refundStartingAmount(booking) })}
                      className="px-3 py-2 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 text-sm font-semibold"
                    >
                      Finish refund
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
        {canInvite && tab === 'staff' && (
          <section className="bg-white border border-[#D1E9F0] rounded-xl p-4">
            <h2 className="text-base font-bold text-gray-900 mb-1">Support accounts</h2>
            <p className="text-sm text-gray-500 mb-3">
              Invite someone by email. They get a link, choose their own password, and the account activates - you never send a password.
            </p>
            <form onSubmit={sendInvite} className="flex flex-wrap items-end gap-2 mb-4">
              <label className="text-xs font-semibold text-gray-600">
                Email
                <input
                  type="email"
                  required
                  value={invite.email}
                  onChange={(event) => setInvite({ ...invite, email: event.target.value })}
                  aria-label="Email to invite"
                  className="mt-1 block w-64 max-w-full border border-[#B9D0DC] rounded-lg p-2.5 text-sm font-normal"
                />
              </label>
              <label className="text-xs font-semibold text-gray-600">
                First name
                <input
                  value={invite.firstName}
                  onChange={(event) => setInvite({ ...invite, firstName: event.target.value })}
                  aria-label="First name"
                  className="mt-1 block w-40 max-w-full border border-[#B9D0DC] rounded-lg p-2.5 text-sm font-normal"
                />
              </label>
              <button type="submit" disabled={inviting} className="px-3 py-2.5 rounded-lg bg-[#055B75] text-white text-sm font-semibold disabled:opacity-50">
                {inviting ? 'Sending…' : 'Send invitation'}
              </button>
            </form>

            {staff.length > 0 && (
              <ul className="divide-y divide-[#E3F1F6]">
                {staff.map((person) => (
                  <li key={person.id} className="py-2 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">{person.email}</span>
                    <Pill tone={person.status === 'active' ? 'success' : 'warning'}>
                      {person.status === 'active' ? 'Active' : 'Invited, not accepted yet'}
                    </Pill>
                    <button
                      type="button"
                      onClick={() => revoke(person)}
                      disabled={inviting}
                      className="ml-auto text-sm font-semibold text-red-700 border border-red-200 rounded-lg px-3 py-1.5 disabled:opacity-50"
                    >
                      Remove access
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </main>

      {action && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" role="dialog" aria-modal="true" aria-label="Confirm">
          <div className="bg-white rounded-xl p-5 w-full max-w-lg">
            <h3 className="text-lg font-bold text-gray-900 mb-1">
              {action.type === 'cancel' && `Cancel ${action.booking.bookingReference} and refund`}
              {action.type === 'void' && `Void the payment for ${action.booking.bookingReference}`}
              {action.type === 'refund' && `Finish the refund for ${action.booking.bookingReference}`}
            </h3>
            <p className="text-sm text-gray-600 mb-3">
              {action.type === 'cancel' && 'The seats are released with the airline first, then the money is returned under the fare rules.'}
              {action.type === 'void' && 'This reverses a payment that has not settled yet. It does not release any seats.'}
              {action.type === 'refund' && 'Check what ARC Pay already shows, or send the refund now. The amount is capped by what the gateway holds.'}
            </p>
            {action.type === 'refund' && owedSentence(action.booking) && (
              <p className="text-sm font-semibold text-gray-800 mb-3">{owedSentence(action.booking)}</p>
            )}
            {action.type !== 'refund' && (
              <textarea
                value={action.reason || ''}
                onChange={(event) => setAction({ ...action, reason: event.target.value })}
                rows={3}
                aria-label="Reason"
                placeholder="Why (the customer asked, duplicate booking, …)"
                className="w-full border border-[#B9D0DC] rounded-lg p-3 text-sm"
              />
            )}
            {action.type === 'refund' && (
              <label className="block text-sm font-semibold text-gray-700">
                Amount (USD)
                <input
                  value={action.amount || ''}
                  onChange={(event) => setAction({ ...action, amount: event.target.value })}
                  inputMode="decimal"
                  className="mt-1 w-full border border-[#B9D0DC] rounded-lg p-2.5 text-sm font-normal"
                />
              </label>
            )}
            <div className="flex justify-end gap-2 mt-3">
              <button type="button" onClick={() => setAction(null)} className="px-3 py-2 rounded-lg border border-gray-300 text-sm font-semibold">Close</button>
              {action.type === 'refund' && (
                <button
                  type="button"
                  onClick={() => runAction({ mode: 'sync' })}
                  disabled={saving}
                  className="px-3 py-2 rounded-lg border border-[#B9D0DC] text-[#055B75] text-sm font-semibold disabled:opacity-50"
                >
                  Check ARC Pay
                </button>
              )}
              <button
                type="button"
                onClick={() => runAction(action.type === 'refund' ? { mode: 'refund' } : {})}
                disabled={saving}
                className="px-3 py-2 rounded-lg bg-[#055B75] text-white text-sm font-semibold disabled:opacity-50"
              >
                {saving ? 'Working…' : (action.type === 'refund' ? 'Refund now' : 'Confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {handling && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" role="dialog" aria-modal="true" aria-label="Mark as handled">
          <div className="bg-white rounded-xl p-5 w-full max-w-lg">
            <h3 className="text-lg font-bold text-gray-900 mb-1">Mark {handling.booking.bookingReference} as handled</h3>
            <p className="text-sm text-gray-600 mb-3">Say what you did, so the next person knows. This does not move any money.</p>
            {handling.booking.commitUnknown && (
              <fieldset className="mb-3 border border-[#D1E9F0] rounded-lg p-3">
                <legend className="px-1 text-sm font-semibold text-gray-800">
                  The airline never answered this booking. What did it tell you?
                </legend>
                <label className="flex items-center gap-2 text-sm text-gray-800 mt-1">
                  <input
                    type="radio"
                    name="commit-outcome"
                    value="not_held"
                    checked={handling.outcome === 'not_held'}
                    onChange={() => setHandling({ ...handling, outcome: 'not_held' })}
                  />
                  The airline does not hold this booking
                </label>
                {!settledHere(handling.booking) && (
                  <label className="flex items-center gap-2 text-sm text-gray-800 mt-1">
                    <input
                      type="radio"
                      name="commit-outcome"
                      value="held"
                      checked={handling.outcome === 'held'}
                      onChange={() => setHandling({ ...handling, outcome: 'held' })}
                    />
                    The airline holds this booking - it goes on the booking and waits to be ticketed
                  </label>
                )}
                {handling.outcome === 'held' && (
                  <input
                    value={handling.pnr || ''}
                    onChange={(event) => setHandling({ ...handling, pnr: event.target.value.toUpperCase() })}
                    aria-label="Record locator"
                    placeholder="Record locator, e.g. ABC123"
                    maxLength={6}
                    className="mt-2 w-40 border border-[#B9D0DC] rounded-lg p-2 text-sm font-mono uppercase"
                  />
                )}
              </fieldset>
            )}
            <textarea
              value={handling.note}
              onChange={(event) => setHandling({ ...handling, note: event.target.value })}
              rows={4}
              aria-label="What you did"
              placeholder="e.g. Ticket issued by hand in Amadeus, number 220-1234567890."
              className="w-full border border-[#B9D0DC] rounded-lg p-3 text-sm"
            />
            <div className="flex justify-end gap-2 mt-3">
              <button type="button" onClick={() => setHandling(null)} className="px-3 py-2 rounded-lg border border-gray-300 text-sm font-semibold">Cancel</button>
              <button
                type="button"
                onClick={markHandled}
                disabled={saving || !canMarkHandled(handling)}
                className="px-3 py-2 rounded-lg bg-[#055B75] text-white text-sm font-semibold disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Mark as handled'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SupportQueue;
