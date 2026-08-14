import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, Anchor, ArrowLeft, CalendarDays, CheckCircle2, ChevronDown,
  Clock3, Info, LoaderCircle, Mail, MapPin, MessageSquare, Phone, ShieldCheck,
  Ship, Sparkles, Star, User, Users, Utensils, Waves, X,
} from 'lucide-react';
import Navbar from '../Navbar';
import Footer from '../Footer';
import withPageElements from '../PageWrapper';
import callbackService from '../../../Services/callbackService';
import { loadCruiseLines } from './data/cruiselinesLoader';
import Price from '../../../Components/Price';

const HIGHLIGHTS = [
  { title: 'Ocean-view dining', image: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?q=80&w=800&auto=format&fit=crop' },
  { title: 'World-class entertainment', image: 'https://images.unsplash.com/photo-1503095396549-807759245b35?q=80&w=800&auto=format&fit=crop' },
  { title: 'Resort-style relaxation', image: 'https://images.unsplash.com/photo-1540202404-a2f29016b523?q=80&w=800&auto=format&fit=crop' },
];

const AMENITY_ICONS = [Utensils, Waves, Sparkles, Ship, Users, Anchor, ShieldCheck, Star];

const getNights = (duration) => {
  const value = Number.parseInt(String(duration || '').match(/\d+/)?.[0], 10);
  return Number.isFinite(value) ? value : null;
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

const CallbackModal = ({ isOpen, onClose, cruiseLine }) => {
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
        preferredTime: form.preferredTime.trim(), message: form.message.trim(),
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
      <span className="mt-0.5 block truncate text-sm font-semibold text-[#034457]">{value}</span>
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

const Itinerary = () => {
  const [searchParams] = useSearchParams();
  const cruiseId = searchParams.get('cruiseId');
  const cruiseLine = searchParams.get('cruiseLine');
  const [isCallbackOpen, setIsCallbackOpen] = useState(false);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [cruise, setCruise] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading'); setError(''); setCruise(null);
    loadCruiseLines()
      .then((data) => {
        if (cancelled) return;
        const cruises = data?.cruiseLines || [];
        const selected = cruiseId
          ? cruises.find((c) => String(c.id) === String(cruiseId))
          : cruises.find((c) => c.name?.toLowerCase() === cruiseLine?.toLowerCase());
        if (!selected) { setStatus('not-found'); return; }
        setCruise(selected); setStatus('ready');
      })
      .catch(() => { if (!cancelled) { setError('We could not load this cruise right now.'); setStatus('error'); } });
    return () => { cancelled = true; };
  }, [cruiseId, cruiseLine]);

  const view = useMemo(() => {
    if (!cruise) return null;
    const days = Array.isArray(cruise.itinerary) ? cruise.itinerary : [];
    const destinations = Array.isArray(cruise.destinations) ? cruise.destinations : [];
    const ports = Array.isArray(cruise.departurePorts) ? cruise.departurePorts : [];
    const amenities = Array.isArray(cruise.amenities) ? cruise.amenities : [];
    const price = Number(cruise.priceValue) || Number.parseFloat(String(cruise.price || '').replace(/[^0-9.]/g, '')) || 0;
    return {
      ...cruise, days, destinations, ports, amenities, price,
      departure: ports[0] || days[0]?.port || 'Departure port varies',
      arrival: destinations[0] || days.at(-1)?.port || 'Itinerary varies',
      nights: getNights(cruise.duration),
      reviewCount: typeof cruise.reviews === 'number' ? cruise.reviews : 0,
      rating: Number(cruise.rating) || 4.8,
    };
  }, [cruise]);

  const bookingUrl = view
    ? `/cruise-booking-summary?cruiseId=${encodeURIComponent(view.id)}&cruiseLine=${encodeURIComponent(view.name)}`
    : '/cruises';

  if (status === 'loading') {
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

  if (status !== 'ready' || !view) {
    return (
      <div className="min-h-screen bg-[#F4F7F8]">
        <Navbar forceScrolled />
        <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-4 text-center">
          <span className="flex h-20 w-20 items-center justify-center rounded-3xl bg-amber-50 text-amber-600"><AlertTriangle className="h-9 w-9" /></span>
          <h1 className="mt-5 text-2xl font-bold text-[#034457]">{status === 'not-found' ? 'Cruise not found' : 'Unable to load cruise'}</h1>
          <p className="mt-2 text-slate-600">{error || 'This cruise may no longer be available.'}</p>
          <Link to="/cruises" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#055B75] px-6 py-3 font-semibold text-white"><ArrowLeft className="h-4 w-4" /> Back to cruises</Link>
        </div>
        <Footer />
      </div>
    );
  }

  const visitingPorts = view.days.map((d) => d.port).filter(Boolean).join(' · ') || view.destinations.slice(0, 3).join(' · ') || 'Multiple ports';

  return (
    <div className="min-h-screen bg-[#F4F7F8] text-slate-800">
      <Navbar forceScrolled />
      <CallbackModal isOpen={isCallbackOpen} onClose={() => setIsCallbackOpen(false)} cruiseLine={view.name} />

      {/* Hero */}
      <section className="relative h-[300px] w-full overflow-hidden">
        <img src={view.image || 'https://images.unsplash.com/photo-1548574505-5e239809ee19?q=80&w=1600&auto=format&fit=crop'} alt={view.name} className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#034457]/95 via-[#034457]/60 to-[#055B75]/25" />
        <div className="relative mx-auto flex h-full max-w-6xl flex-col items-start justify-center px-4 sm:px-6 lg:px-8">
          <Link to="/cruises" className="mb-5 inline-flex w-fit items-center gap-2 text-sm font-medium text-white/85 hover:text-white"><ArrowLeft className="h-4 w-4" /> Back to results</Link>
          <div className="inline-flex w-fit items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white ring-1 ring-white/25 backdrop-blur"><ShieldCheck className="h-3.5 w-3.5 text-[#9FD6E8]" /> Verified cruise partner</div>
          <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-white md:text-5xl">{view.name}</h1>
          <p className="mt-2 max-w-xl text-sm text-white/85 md:text-base">{view.description || 'A memorable voyage with world-class dining, entertainment and destinations.'}</p>
          <div className="mt-3 flex items-center gap-2 text-sm text-white">
            <span className="flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 backdrop-blur"><Star className="h-3.5 w-3.5 fill-[#F5B301] text-[#F5B301]" /> {view.rating.toFixed(1)}</span>
            <span className="text-white/70">{view.reviewCount.toLocaleString()} reviews</span>
          </div>
        </div>
      </section>

      {/* Summary bar (below hero, no overlap) */}
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-2xl font-extrabold text-[#034457]">{view.departure}</span>
                <span className="text-xl text-[#0890BC]">→</span>
                <span className="text-2xl font-extrabold text-[#034457]">{view.arrival}</span>
                <span className="rounded-full bg-[#F1FBFD] px-3 py-1 text-sm font-bold text-[#055B75]">{view.duration || 'Multiple durations'}</span>
              </div>
              <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Fact icon={Ship} label="Cruise line" value={view.name} />
                <Fact icon={Anchor} label="Departure port" value={view.departure} />
                <Fact icon={CalendarDays} label="Sailing dates" value="Choose a date" />
                <Fact icon={MapPin} label="Visiting ports" value={visitingPorts} />
              </div>
            </div>
            <div className="shrink-0 border-t border-slate-100 pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">From</p>
              <div className="text-3xl font-extrabold text-[#055B75]"><Price amount={view.price} showCode /></div>
              <p className="mb-3 text-xs text-slate-500">per person</p>
              <div className="flex gap-2">
                <button onClick={() => setIsCallbackOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#055B75]/30 px-4 py-2.5 text-sm font-bold text-[#055B75] hover:bg-[#F1FBFD]"><Phone className="h-4 w-4" /> Callback</button>
                <Link to={bookingUrl} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#055B75] to-[#0890BC] px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:from-[#034457] hover:to-[#055B75]">Book now</Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Two-column content */}
      <div className="mx-auto grid max-w-6xl gap-6 px-4 pb-12 sm:px-6 lg:grid-cols-[1fr_320px] lg:px-8">
        <main className="min-w-0 space-y-6">
          {/* Itinerary */}
          <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
            <h2 className="text-2xl font-bold text-[#034457]">Your {view.nights ? `${view.nights}-night ` : ''}itinerary</h2>
            <p className="mt-1 text-sm text-slate-500">Times are local and may vary by sailing date.</p>
            <div className="mt-6 space-y-4">
              {view.days.length ? view.days.map((day) => (
                <article key={`${day.day}-${day.port}`} className="rounded-xl border border-slate-100 bg-[#FAFDFE] p-5">
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-gradient-to-br from-[#055B75] to-[#0890BC] text-white">
                      <span className="text-[9px] font-bold uppercase">Day</span>
                      <span className="text-base font-extrabold leading-none">{day.day}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-lg font-bold text-[#034457]">{day.port || 'At sea'}</h3>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5 text-[#0890BC]" /> Arrival: {day.arrival || 'At sea'}</span>
                        <span className="inline-flex items-center gap-1.5"><Ship className="h-3.5 w-3.5 text-[#0890BC]" /> Departure: {day.departure || 'At sea'}</span>
                      </div>
                      {day.activities?.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {day.activities.map((a) => <span key={a} className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">{a}</span>)}
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              )) : <p className="rounded-xl bg-[#F1FBFD] p-5 text-sm text-slate-600">The detailed port schedule is confirmed when you choose a sailing date.</p>}
            </div>
          </section>

          {/* Highlights — equal 3-column */}
          <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
            <h2 className="text-2xl font-bold text-[#034457]">Cruise highlights</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              {HIGHLIGHTS.map((h) => (
                <article key={h.title} className="group overflow-hidden rounded-xl ring-1 ring-slate-100">
                  <div className="relative h-40 overflow-hidden">
                    <img src={h.image} alt={h.title} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#034457]/70 to-transparent" />
                  </div>
                  <p className="p-3 text-sm font-semibold text-[#034457]">{h.title}</p>
                </article>
              ))}
            </div>
          </section>

          {/* Amenities */}
          <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
            <h2 className="text-2xl font-bold text-[#034457]">Onboard amenities</h2>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {(view.amenities.length ? view.amenities : ['Dining', 'Entertainment', 'Pool & deck', 'Fitness center']).map((a, i) => {
                const Icon = AMENITY_ICONS[i % AMENITY_ICONS.length];
                return (
                  <div key={a} className="flex items-center gap-3 rounded-xl bg-[#FAFDFE] p-3.5 ring-1 ring-slate-100">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#F1FBFD] text-[#055B75]"><Icon className="h-4 w-4" /></span>
                    <span className="truncate text-sm font-semibold text-[#034457]">{a}</span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Important information */}
          <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F1FBFD] text-[#055B75]"><Info className="h-5 w-5" /></span>
              <h2 className="text-xl font-bold text-[#034457]">Important information</h2>
            </div>
            <div className="mt-4">
              <Accordion title="Travel documents and visa requirements" defaultOpen>Carry a valid passport and any visas required for the ports on your itinerary. Requirements vary by nationality and sailing.</Accordion>
              <Accordion title="What is included in the fare?">Fares generally include accommodation, main dining, entertainment and standard onboard facilities. Specialty dining, excursions and premium services may cost extra.</Accordion>
              <Accordion title="Cancellation and change policy">Policies depend on the selected sailing and fare type. Review final conditions during booking or request a call back before payment.</Accordion>
            </div>
          </section>

          {/* Review */}
          <section className="rounded-2xl bg-gradient-to-br from-[#034457] to-[#055B75] p-6 text-white shadow-sm md:p-8">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-bold">Why guests love this cruise</h2>
              <div className="flex gap-1">{Array.from({ length: 5 }).map((_, i) => <Star key={i} className="h-4 w-4 fill-[#F5B301] text-[#F5B301]" />)}</div>
            </div>
            <blockquote className="mt-4 max-w-3xl leading-7 text-white/90">“An excellent mix of destinations, onboard entertainment and helpful service. Every port offered something memorable.”</blockquote>
            <div className="mt-5 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 ring-2 ring-white/25"><User className="h-5 w-5 text-white" /></span>
              <div><p className="font-bold">Verified traveler</p><p className="text-xs text-white/65">Booked with Jetsetters</p></div>
            </div>
          </section>
        </main>

        {/* Sticky booking card */}
        <aside>
          <div className="sticky top-24 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">
            <div className="bg-gradient-to-r from-[#034457] to-[#055B75] p-5 text-white">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#9FD6E8]">Reserve your voyage</p>
              <h2 className="mt-1 text-lg font-bold">Choose your sailing</h2>
            </div>
            <div className="space-y-4 p-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">From</p>
                <div className="text-3xl font-extrabold text-[#055B75]"><Price amount={view.price} showCode /></div>
                <p className="text-xs text-slate-500">per person · double occupancy</p>
              </div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">Cabin type
                <select className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold normal-case text-[#034457] outline-none focus:border-[#0890BC]">
                  <option>Inside cabin</option><option>Ocean view</option><option>Balcony</option><option>Suite</option>
                </select>
              </label>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">Travelers
                <select className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold normal-case text-[#034457] outline-none focus:border-[#0890BC]">
                  <option>2 adults</option><option>1 adult</option><option>2 adults, 1 child</option><option>2 adults, 2 children</option>
                </select>
              </label>
              <Link to={bookingUrl} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#055B75] to-[#0890BC] px-5 py-3 font-bold text-white shadow-sm hover:from-[#034457] hover:to-[#055B75]"><Ship className="h-4 w-4" /> Continue to book</Link>
              <button onClick={() => setIsCallbackOpen(true)} className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#055B75]/25 px-5 py-2.5 font-bold text-[#055B75] hover:bg-[#F1FBFD]"><Phone className="h-4 w-4" /> Request call back</button>
              <div className="space-y-2 border-t border-slate-100 pt-4 text-xs text-slate-600">
                <p className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-600" /> Secure checkout with ARC Pay</p>
                <p className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Authorized cruise seller</p>
                <p className="flex items-center gap-2"><Phone className="h-4 w-4 text-[#0890BC]" /> Expert support before &amp; after booking</p>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <Footer />
    </div>
  );
};

export default withPageElements(Itinerary);
