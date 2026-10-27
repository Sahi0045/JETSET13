import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, Anchor, ArrowLeft, CalendarDays, CheckCircle2, ChevronDown,
  Clock3, Info, LoaderCircle, Mail, MapPin, MessageSquare, Phone, Ship, User, Waves, X,
} from 'lucide-react';
import Navbar from '../Navbar';
import Footer from '../Footer';
import withPageElements from '../PageWrapper';
import callbackService from '../../../Services/callbackService';
import { CRUISE_EMAIL, CRUISE_PHONE, SEA_PHOTO, inquiryMail, priceLabel, shortDate } from './catalog';
import { nightsLabel, regionName } from './searchSailings';
import { usePublishedSailing } from './useSailings';

const clock = (time) => {
  const [hours, minutes] = time.split(':').map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`;
};

const tripLine = (days) => {
  const calls = days.filter((d) => d.port);
  const first = calls[0]?.port;
  const last = calls[calls.length - 1]?.port;
  if (!first) return null;
  if (first.name === last.name && first.country === last.country) return `Round trip from ${first.name}`;
  return `${first.name} to ${last.name}`;
};

const portsOfCall = (days) => {
  const calls = days.filter((d) => d.port).map((d) => d.port.name);
  return [...new Set(calls.slice(1, -1))].filter((name) => name !== calls[0]);
};

const Field = ({ label, icon: Icon, active, children }) => (
  <label className="block">
    <span className="mb-1.5 block text-xs font-semibold text-slate-700">{label}</span>
    <span className={`relative block rounded-xl bg-slate-50 ring-1 transition ${active ? 'ring-2 ring-[#0890BC]' : 'ring-slate-200'}`}>
      <Icon className={`pointer-events-none absolute left-3 top-3 h-4 w-4 ${active ? 'text-[#055B75]' : 'text-slate-400'}`} />
      {children}
    </span>
  </label>
);

const CallbackModal = ({ isOpen, onClose, cruiseLine, about }) => {
  const [form, setForm] = useState({ name: '', email: '', phone: '', preferredTime: '', message: '' });
  const [activeField, setActiveField] = useState(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [isOpen, onClose]);

  const update = (e) => setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (![form.name, form.email, form.phone].every((v) => v.trim())) { setError('Please complete all required fields.'); return; }
    setStatus('submitting'); setError('');
    try {
      await callbackService.createCallbackRequest({
        name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim(),
        preferredTime: form.preferredTime.trim(),
        message: [form.message.trim(), about].filter(Boolean).join('\n\n'),
      });
      setStatus('success');
      setForm({ name: '', email: '', phone: '', preferredTime: '', message: '' });
      timer.current = setTimeout(() => { onClose(); setStatus('idle'); }, 3000);
    } catch {
      setStatus('idle');
      setError('We could not save your request. Please try again or email support@jetsetterss.com.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-[#034457]/70 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <header className="relative bg-gradient-to-r from-[#034457] to-[#0890BC] px-6 py-6 text-white">
          <button onClick={onClose} aria-label="Close" className="absolute right-4 top-4 rounded-full p-2 text-white/80 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20"><Phone className="h-5 w-5" /></div>
          <h2 className="text-2xl font-bold">Request a call back</h2>
          <p className="mt-1 text-sm text-white/80">A cruise expert will help you plan {cruiseLine || 'your voyage'}.</p>
        </header>
        {status === 'success' ? (
          <div className="px-6 py-14 text-center">
            <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-500" />
            <h3 className="mt-4 text-2xl font-bold text-[#034457]">Request received</h3>
            <p className="mt-2 text-sm text-slate-600">Our cruise team will contact you shortly.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4 p-6">
            <Field label="Full name *" icon={User} active={activeField === 'name'}>
              <input name="name" value={form.name} onChange={update} onFocus={() => setActiveField('name')} onBlur={() => setActiveField(null)} className="w-full rounded-xl bg-transparent py-2.5 pl-10 pr-3 text-sm outline-none" placeholder="John Doe" required />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Email *" icon={Mail} active={activeField === 'email'}>
                <input type="email" name="email" value={form.email} onChange={update} onFocus={() => setActiveField('email')} onBlur={() => setActiveField(null)} className="w-full rounded-xl bg-transparent py-2.5 pl-10 pr-3 text-sm outline-none" placeholder="john@example.com" required />
              </Field>
              <Field label="Phone *" icon={Phone} active={activeField === 'phone'}>
                <input type="tel" name="phone" value={form.phone} onChange={update} onFocus={() => setActiveField('phone')} onBlur={() => setActiveField(null)} className="w-full rounded-xl bg-transparent py-2.5 pl-10 pr-3 text-sm outline-none" placeholder="+1 234 567 890" required />
              </Field>
            </div>
            <Field label="Preferred call time" icon={CalendarDays} active={activeField === 'preferredTime'}>
              <input name="preferredTime" value={form.preferredTime} onChange={update} onFocus={() => setActiveField('preferredTime')} onBlur={() => setActiveField(null)} className="w-full rounded-xl bg-transparent py-2.5 pl-10 pr-3 text-sm outline-none" placeholder="Weekdays after 2 PM" />
            </Field>
            <Field label="How can we help?" icon={MessageSquare} active={activeField === 'message'}>
              <textarea name="message" rows="3" value={form.message} onChange={update} onFocus={() => setActiveField('message')} onBlur={() => setActiveField(null)} className="w-full resize-none rounded-xl bg-transparent py-2.5 pl-10 pr-3 text-sm outline-none" placeholder="Preferred dates or cabin" />
            </Field>
            {error && <p className="rounded-xl bg-red-50 p-3 text-xs text-red-700">{error}</p>}
            <button type="submit" disabled={status === 'submitting'} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#055B75] to-[#0890BC] px-4 py-3 font-bold text-white shadow-lg shadow-[#055B75]/20 transition hover:from-[#034457] hover:to-[#055B75] disabled:opacity-60">
              {status === 'submitting' ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Phone className="h-4 w-4" />}
              {status === 'submitting' ? 'Sending…' : 'Request call back'}
            </button>
            <p className="text-center text-[11px] text-slate-500">By submitting you agree to our <Link to="/terms-conditions" className="text-[#055B75] underline">Terms</Link> and <Link to="/privacy-policy" className="text-[#055B75] underline">Privacy Policy</Link>.</p>
          </form>
        )}
      </div>
    </div>
  );
};

const Fact = ({ icon: Icon, label, value }) => (
  <div className="flex min-w-0 items-start gap-2.5">
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#F1FBFD] text-[#055B75]"><Icon className="h-4 w-4" /></span>
    <span className="min-w-0">
      <span className="block text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">{label}</span>
      <span className="mt-0.5 block text-sm font-semibold leading-snug text-[#034457] [overflow-wrap:anywhere]">{value}</span>
    </span>
  </div>
);

const Accordion = ({ title, children, defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-slate-100 last:border-0">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-4 py-4 text-left font-semibold text-[#034457]" aria-expanded={open}>
        {title}<ChevronDown className={`h-4 w-4 shrink-0 text-[#055B75] transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="pb-4 text-sm leading-6 text-slate-600">{children}</div>}
    </div>
  );
};

const ContactLinks = () => (
  <>
    Call <a href={CRUISE_PHONE.href} className="font-semibold text-[#055B75] underline">{CRUISE_PHONE.text}</a> or email{' '}
    <a href={`mailto:${CRUISE_EMAIL}`} className="font-semibold text-[#055B75] underline">{CRUISE_EMAIL}</a>
  </>
);

const PageNotice = ({ title, children }) => (
  <div className="min-h-screen bg-[#F4F7F8]">
    <Navbar forceScrolled />
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-4 text-center">
      <span className="flex h-20 w-20 items-center justify-center rounded-3xl bg-[#F1FBFD] text-[#055B75]"><AlertTriangle className="h-9 w-9" /></span>
      <h2 className="mt-5 text-2xl font-bold text-[#034457]">{title}</h2>
      <div className="mt-2 text-slate-600">{children}</div>
      <Link to="/cruises" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#055B75] px-6 py-3 font-semibold text-white"><ArrowLeft className="h-4 w-4" /> See all cruises</Link>
    </div>
    <Footer />
  </div>
);

const Itinerary = () => {
  const [searchParams] = useSearchParams();
  const slug = searchParams.get('sailing');
  const [isCallbackOpen, setIsCallbackOpen] = useState(false);
  const { data: sailing, isLoading, isError } = usePublishedSailing(slug);
  if (slug && isLoading) {
    return (
      <div className="min-h-screen bg-[#F4F7F8]">
        <Navbar forceScrolled />
        <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
          <LoaderCircle className="h-12 w-12 animate-spin text-[#055B75]" />
          <p className="mt-4 font-medium text-slate-600">Loading cruise itinerary…</p>
        </div>
      </div>
    );
  }

  if (slug && isError) {
    return (
      <PageNotice title="We couldn't load this cruise">
        Please try again in a minute. <ContactLinks /> and our team will help you straight away.
      </PageNotice>
    );
  }

  if (!sailing) {
    return (
      <PageNotice title="This cruise isn't available">
        It may have sailed, or our team has taken it off the list.
      </PageNotice>
    );
  }

  const price = priceLabel(sailing);
  const days = sailing.days ?? [];
  const dates = sailing.dates ?? [];
  const photos = sailing.photos ?? [];
  const hero = photos[0];
  const trip = tripLine(days);
  const calls = portsOfCall(days);
  const mail = inquiryMail(sailing.title);
  const moreDates = dates.length - 1;

  return (
    <div className="min-h-screen bg-[#F4F7F8] pb-24 text-slate-800 lg:pb-0">
      <Navbar forceScrolled />
      <CallbackModal isOpen={isCallbackOpen} onClose={() => setIsCallbackOpen(false)} cruiseLine={sailing.title} about={`Cruise: ${sailing.title} (${sailing.slug})`} />

      {/* Hero */}
      <section className="relative min-h-[300px] w-full overflow-hidden bg-[#034457]">
        <img src={hero?.url || SEA_PHOTO} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#034457]/95 via-[#034457]/60 to-[#055B75]/25" />
        <div className="relative mx-auto flex min-h-[300px] max-w-6xl flex-col items-start justify-center px-4 py-10 sm:px-6 lg:px-8">
          <Link to="/cruises" className="mb-4 inline-flex w-fit items-center gap-2 text-sm font-medium text-white/85 hover:text-white"><ArrowLeft className="h-4 w-4" /> Back to results</Link>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#9FD6E8]">{regionName(sailing.region)} · {nightsLabel(sailing.nights)}</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-white md:text-5xl">{sailing.title}</h1>
          {sailing.headline && <p className="mt-2 max-w-xl text-sm text-white/85 md:text-base">{sailing.headline}</p>}
        </div>
        {hero?.credit && <p className="absolute bottom-2 right-3 text-[10px] text-white/70">Photo: {hero.credit}</p>}
      </section>

      {/* Summary bar */}
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                {trip && <span className="text-xl font-extrabold text-[#034457] md:text-2xl">{trip}</span>}
                <span className="rounded-full bg-[#F1FBFD] px-3 py-1 text-sm font-bold text-[#055B75]">{nightsLabel(sailing.nights)}</span>
              </div>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Fact icon={Ship} label="Cruise line" value={sailing.line_name} />
                <Fact icon={Anchor} label="Ship" value={sailing.ship_name || 'Confirmed with your quote'} />
                <Fact icon={CalendarDays} label="Next sailing" value={`${shortDate(dates[0])}${moreDates > 0 ? ` · ${moreDates} more` : ''}`} />
                <Fact icon={MapPin} label="Ports of call" value={calls.join(' · ') || 'No other stops'} />
              </div>
            </div>
            <div className="shrink-0 border-t border-slate-100 pt-5 lg:max-w-[320px] lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Price</p>
              <div className="text-xl font-extrabold text-[#055B75]">{price.amount}</div>
              <p className="mb-3 text-xs text-slate-500">{price.note}</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setIsCallbackOpen(true)} className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-[#055B75]/30 px-4 py-2.5 text-sm font-bold text-[#055B75] hover:bg-[#F1FBFD]"><Phone className="h-4 w-4" /> Callback</button>
                <a href={CRUISE_PHONE.href} className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-gradient-to-r from-[#055B75] to-[#0890BC] px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:from-[#034457] hover:to-[#055B75]">Call {CRUISE_PHONE.text}</a>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Two-column content */}
      <div className="mx-auto grid max-w-6xl gap-6 px-4 pb-12 sm:px-6 lg:grid-cols-[1fr_320px] lg:px-8">
        <main className="min-w-0 space-y-6">
          <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
            <h2 className="text-2xl font-bold text-[#034457]">Your {sailing.nights}-night itinerary</h2>
            <p className="mt-1 text-sm text-slate-500">Times are local and can change with the cruise line.</p>
            <ol aria-label="Day by day" className="mt-6 space-y-3">
              {days.map((day) => (
                <li key={day.day} className={`rounded-xl border p-4 ${day.port ? 'border-slate-100 bg-[#FAFDFE]' : 'border-[#65B3CF]/30 bg-[#F1FBFD]'}`}>
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-gradient-to-br from-[#055B75] to-[#0890BC] text-white">
                      <span className="text-[9px] font-bold uppercase">{'Day '}</span>
                      <span className="text-base font-extrabold leading-none">{day.day}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      {day.port ? (
                        <>
                          <h3 className="text-lg font-bold text-[#034457]">{day.port.name}, <span className="font-medium text-slate-500">{day.port.country}</span></h3>
                          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                            {day.arrive && <span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5 text-[#0890BC]" /> Arrive {clock(day.arrive)}</span>}
                            {day.depart && <span className="inline-flex items-center gap-1.5"><Ship className="h-3.5 w-3.5 text-[#0890BC]" /> Depart {clock(day.depart)}</span>}
                          </div>
                        </>
                      ) : (
                        <h3 className="flex items-center gap-2 text-lg font-bold text-[#034457]"><Waves className="h-4 w-4 text-[#0890BC]" /> At sea</h3>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
            <h2 className="text-2xl font-bold text-[#034457]">Sailing dates</h2>
            <p className="mt-1 text-sm text-slate-500">Tell us which one suits you and we'll check the cabins and today's price.</p>
            <ul className="mt-5 flex flex-wrap gap-2">
              {dates.map((date) => (
                <li key={date} className="rounded-full bg-[#F1FBFD] px-4 py-2 text-sm font-semibold text-[#055B75] ring-1 ring-[#65B3CF]/30">{shortDate(date)}</li>
              ))}
            </ul>
          </section>

          {sailing.inclusions && (
            <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
              <h2 className="text-2xl font-bold text-[#034457]">What's included</h2>
              <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-600">{sailing.inclusions}</p>
            </section>
          )}

          {photos.length > 1 && (
            <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
              <h2 className="text-2xl font-bold text-[#034457]">Photos</h2>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                {photos.slice(1).map((photo) => (
                  <figure key={photo.url} className="overflow-hidden rounded-xl ring-1 ring-slate-100">
                    <img src={photo.url} alt="" loading="lazy" className="h-48 w-full object-cover" />
                    {photo.credit && <figcaption className="px-3 py-2 text-xs text-slate-500">Photo: {photo.credit}</figcaption>}
                  </figure>
                ))}
              </div>
            </section>
          )}

          <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F1FBFD] text-[#055B75]"><Info className="h-5 w-5" /></span>
              <h2 className="text-xl font-bold text-[#034457]">Important information</h2>
            </div>
            <div className="mt-4">
              <Accordion title="Travel documents and visa requirements" defaultOpen>Carry a valid passport and any visas required for the ports on your itinerary. Requirements vary by nationality and sailing.</Accordion>
              <Accordion title="How booking works">Tell us your date, cabin and who's travelling. We check today's price with the cruise line and send you a quote; you pay only once you accept it, and we book the cruise for you.</Accordion>
              <Accordion title="Cancellation and change policy">Each cruise line sets its own rules, and they depend on the sailing and fare. We send them with your quote, before you pay.</Accordion>
            </div>
          </section>
        </main>

        <aside>
          <div className="sticky top-24 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">
            <div className="bg-gradient-to-r from-[#034457] to-[#055B75] p-5 text-white">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#9FD6E8]">Booked by our team</p>
              <h2 className="mt-1 text-lg font-bold">Ask about this cruise</h2>
            </div>
            <div className="space-y-4 p-5">
              <div>
                <div className="text-2xl font-extrabold text-[#055B75]">{price.amount}</div>
                <p className="text-xs text-slate-500">{price.note}</p>
              </div>
              <p className="text-sm leading-6 text-slate-600">Tell us your date, cabin and who's travelling. We'll check today's price with the cruise line and send you a quote.</p>
              <a href={mail} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#055B75] to-[#0890BC] px-5 py-3 font-bold text-white shadow-sm hover:from-[#034457] hover:to-[#055B75]"><Mail className="h-4 w-4" /> Email us about this cruise</a>
              <a href={CRUISE_PHONE.href} className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#055B75]/25 px-5 py-2.5 font-bold text-[#055B75] hover:bg-[#F1FBFD]"><Phone className="h-4 w-4" /> Call {CRUISE_PHONE.text}</a>
              <button type="button" onClick={() => setIsCallbackOpen(true)} className="w-full text-center text-sm font-semibold text-[#055B75] underline">Request a call back</button>
            </div>
          </div>
        </aside>
      </div>

      <div data-testid="phone-price-bar" className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-3 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-8px_24px_-12px_rgba(3,68,87,0.35)] backdrop-blur lg:hidden">
        <div className="min-w-0">
          <div className="text-base font-extrabold leading-tight text-[#055B75]">{price.amount}</div>
          <div className="truncate text-[11px] text-slate-500">{price.kind === 'price' ? 'per person, port fees included' : price.note}</div>
        </div>
        <div className="flex shrink-0 gap-2">
          <a href={mail} className="rounded-lg border border-[#055B75]/30 px-3 py-2 text-sm font-bold text-[#055B75]">Email</a>
          <a href={CRUISE_PHONE.href} className="rounded-lg bg-gradient-to-r from-[#055B75] to-[#0890BC] px-4 py-2 text-sm font-bold text-white">Call</a>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default withPageElements(Itinerary);
