

const Field = ({ label, icon: Icon, active, children }) => (
  <label className="block">
    <span className="mb-1.5 block text-xs font-semibold text-slate-700">{label}</span>
    <span className={`relative block rounded-xl bg-slate-50 ring-1 transition ${active ? 'ring-2 ring-[#0890BC]' : 'ring-slate-200'}`}>
      <Icon className={`pointer-events-none absolute left-3 top-3 h-4 w-4 ${active ? 'text-[#055B75]' : 'text-slate-400'}`} />
      {children}
    </span>
  </label>
);

const ItineraryCallbackPopup = ({ isOpen, onClose, cruiseLine }) => {
  const [form, setForm] = useState({ name: '', email: '', phone: '', preferredTime: '', message: '' });
  const [activeField, setActiveField] = useState(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const closeTimer = useRef(null);

  useEffect(() => () => clearTimeout(closeTimer.current), []);
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (event) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);

  const update = (event) => {
    const { name, value } = event.target;
    setForm((previous) => ({ ...previous, [name]: value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    if (![form.name, form.email, form.phone].every((value) => value.trim())) {
      setError('Please complete all required fields.');
      return;
    }
    setStatus('submitting');
    setError('');
    try {
      await callbackService.createCallbackRequest({
        name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim(),
        preferredTime: form.preferredTime.trim(), message: form.message.trim(),
      });
      setStatus('success');
      setForm({ name: '', email: '', phone: '', preferredTime: '', message: '' });
      closeTimer.current = setTimeout(() => { onClose(); setStatus('idle'); }, 3000);
    } catch {
      setStatus('idle');
      setError('We could not save your request. Please try again or email support@jetsetterss.com.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-[#034457]/75 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="callback-title"
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="relative overflow-hidden bg-gradient-to-r from-[#034457] to-[#0890BC] px-6 py-6 text-white">
          <button onClick={onClose} aria-label="Close callback form" className="absolute right-4 top-4 rounded-full p-2 text-white/80 transition hover:bg-white/10 hover:text-white">
            <X className="h-5 w-5" />
          </button>
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20">
            <Phone className="h-5 w-5" />
          </div>
          <h2 id="callback-title" className="text-2xl font-bold">Request a call back</h2>
          <p className="mt-1 text-sm text-white/80">A cruise expert will help you compare {cruiseLine || 'available cruise'} options.</p>
        </header>

        {status === 'success' ? (
          <div className="px-6 py-14 text-center">
            <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-500" />
            <h3 className="mt-4 text-2xl font-bold text-[#034457]">Request received</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">Our cruise team will contact you shortly.</p>
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
              <textarea name="message" rows="3" value={form.message} onChange={update} onFocus={() => setActiveField('message')} onBlur={() => setActiveField(null)} className="w-full resize-none rounded-xl bg-transparent py-2.5 pl-10 pr-3 text-sm outline-none" placeholder="Tell us about your preferred dates or cabin" />
            </Field>
            {error && <p className="rounded-xl bg-red-50 p-3 text-xs text-red-700">{error}</p>}
            <button type="submit" disabled={status === 'submitting'} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#055B75] to-[#0890BC] px-4 py-3 font-bold text-white shadow-lg shadow-[#055B75]/20 transition hover:from-[#034457] hover:to-[#055B75] disabled:opacity-60">
              {status === 'submitting' ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Phone className="h-4 w-4" />}
              {status === 'submitting' ? 'Sending request…' : 'Request call back'}
            </button>
            <p className="text-center text-[11px] text-slate-500">
              By submitting, you agree to our <Link to="/terms-conditions" className="text-[#055B75] underline">Terms</Link> and <Link to="/privacy-policy" className="text-[#055B75] underline">Privacy Policy</Link>.
            </p>
          </form>
        )}
      </div>
    </div>
  );
};

const SummaryItem = ({ icon: Icon, label, value }) => (
  <div className="flex min-w-0 items-start gap-3">
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F1FBFD] text-[#055B75] ring-1 ring-[#65B3CF]/20">
      <Icon className="h-4 w-4" />
    </span>
    <span className="min-w-0">
      <span className="block text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400">{label}</span>
      <span className="mt-0.5 block truncate text-sm font-semibold text-[#034457]">{value}</span>
    </span>
  </div>
);

const InfoAccordion = ({ title, children, defaultOpen = false }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-slate-100 last:border-0">
      <button onClick={() => setIsOpen((value) => !value)} className="flex w-full items-center justify-between gap-4 py-4 text-left font-semibold text-[#034457]" aria-expanded={isOpen}>
        {title}<ChevronDown className={`h-4 w-4 text-[#055B75] transition ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && <div className="pb-4 text-sm leading-6 text-slate-600">{children}</div>}
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
    setStatus('loading');
    setError('');
    setCruise(null);
    loadCruiseLines()
      .then((data) => {
        if (cancelled) return;
        const cruises = data?.cruiseLines || [];
        const selected = cruiseId
          ? cruises.find((item) => String(item.id) === String(cruiseId))
          : cruises.find((item) => item.name?.toLowerCase() === cruiseLine?.toLowerCase());
        if (!selected) {
          setStatus('not-found');
          return;
        }
        setCruise(selected);
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) {
          setError('We could not load this cruise right now. Please try again.');
          setStatus('error');
        }
      });
    return () => { cancelled = true; };
  }, [cruiseId, cruiseLine]);

  const display = useMemo(() => {
    if (!cruise) return null;
    const days = Array.isArray(cruise.itinerary) ? cruise.itinerary : [];
    const destinations = Array.isArray(cruise.destinations) ? cruise.destinations : [];
    const ports = Array.isArray(cruise.departurePorts) ? cruise.departurePorts : [];
    const amenities = Array.isArray(cruise.amenities) ? cruise.amenities : [];
    const price = Number(cruise.priceValue) || Number.parseFloat(String(cruise.price || '').replace(/[^0-9.]/g, '')) || 0;
    return {
      ...cruise,
      days, destinations, ports, amenities, price,
      departure: ports[0] || days[0]?.port || 'Departure port varies',
      arrival: destinations[0] || days.at(-1)?.port || 'Itinerary varies',
      nights: getDurationNights(cruise.duration),
      reviewCount: typeof cruise.reviews === 'number' ? cruise.reviews : 0,
      rating: Number(cruise.rating) || 4.8,
    };
  }, [cruise]);

  const bookingUrl = display
    ? `/cruise-booking-summary?cruiseId=${encodeURIComponent(display.id)}&cruiseLine=${encodeURIComponent(display.name)}`
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

  if (status === 'error' || status === 'not-found' || !display) {
    return (
      <div className="min-h-screen bg-[#F4F7F8]">
        <Navbar forceScrolled />
        <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-4 text-center">
          <span className="flex h-20 w-20 items-center justify-center rounded-3xl bg-amber-50 text-amber-600">
            <AlertTriangle className="h-9 w-9" />
          </span>
          <h1 className="mt-5 text-2xl font-bold text-[#034457]">{status === 'not-found' ? 'Cruise not found' : 'Unable to load cruise'}</h1>
          <p className="mt-2 text-slate-600">{error || 'This cruise may no longer be available. Browse current itineraries to continue.'}</p>
          <Link to="/cruises" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#055B75] px-6 py-3 font-semibold text-white">
            <ArrowLeft className="h-4 w-4" /> Back to cruises
          </Link>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F4F7F8] text-slate-800">
      <Navbar forceScrolled />
      <ItineraryCallbackPopup isOpen={isCallbackOpen} onClose={() => setIsCallbackOpen(false)} cruiseLine={display.name} />

      {/* Cinematic cruise hero */}
      <section className="relative min-h-[360px] overflow-hidden">
        <img src={display.image || 'https://images.unsplash.com/photo-1548574505-5e239809ee19?q=80&w=1920&auto=format&fit=crop'} alt={display.name} className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#034457]/95 via-[#034457]/65 to-[#055B75]/20" />
        <div className="relative mx-auto flex min-h-[360px] max-w-7xl flex-col justify-center px-4 py-12 sm:px-6 lg:px-8">
          <Link to="/cruises" className="mb-8 inline-flex w-fit items-center gap-2 text-sm font-medium text-white/80 transition hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Back to cruise results
          </Link>
          <div className="inline-flex w-fit items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-white/25 backdrop-blur">
            <ShieldCheck className="h-4 w-4 text-[#9FD6E8]" /> Verified cruise partner
          </div>
          <h1 className="mt-4 max-w-3xl text-4xl font-extrabold tracking-tight text-white md:text-6xl">{display.name}</h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-white/85 md:text-lg">{display.longDescription || display.description || 'A memorable voyage with world-class dining, entertainment and destinations.'}</p>
          <div className="mt-5 flex items-center gap-2 text-sm text-white">
            <span className="flex items-center gap-1 rounded-full bg-white/15 px-3 py-1.5 backdrop-blur"><Star className="h-4 w-4 fill-[#F5B301] text-[#F5B301]" /> {display.rating.toFixed(1)}</span>
            <span className="text-white/70">{display.reviewCount.toLocaleString()} verified reviews</span>
          </div>
        </div>
      </section>

      {/* Voyage summary card */}
      <section className="relative z-10 mx-auto -mt-12 max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-3xl bg-white p-6 shadow-[0_24px_70px_-30px_rgba(3,68,87,0.45)] ring-1 ring-slate-100 md:p-8">
          <div className="grid gap-6 xl:grid-cols-[1fr_auto] xl:items-center">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-2xl font-extrabold text-[#034457] md:text-3xl">{display.departure}</span>
                <span className="text-2xl text-[#0890BC]">→</span>
                <span className="text-2xl font-extrabold text-[#034457] md:text-3xl">{display.arrival}</span>
                <span className="rounded-full bg-[#F1FBFD] px-3 py-1 text-sm font-bold text-[#055B75]">{display.duration || 'Multiple durations'}</span>
              </div>
              <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                <SummaryItem icon={Ship} label="Cruise line" value={display.name} />
                <SummaryItem icon={Anchor} label="Departure port" value={display.departure} />
                <SummaryItem icon={CalendarDays} label="Sailing dates" value="Choose a sailing date" />
                <SummaryItem icon={MapPin} label="Visiting ports" value={display.days.map((day) => day.port).filter(Boolean).join(' · ') || display.destinations.slice(0, 3).join(' · ')} />
              </div>
            </div>
            <div className="min-w-[270px] border-t border-slate-100 pt-5 xl:border-l xl:border-t-0 xl:pl-8 xl:pt-0">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Starting from</p>
              <div className="mt-1 text-4xl font-extrabold text-[#055B75]"><Price amount={display.price} showCode /></div>
              <p className="mt-1 text-xs text-slate-500">per person · taxes and fees excluded</p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button onClick={() => setIsCallbackOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#055B75]/30 px-4 py-3 text-sm font-bold text-[#055B75] transition hover:bg-[#F1FBFD]">
                  <Phone className="h-4 w-4" /> Call back
                </button>
                <Link to={bookingUrl} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#055B75] to-[#0890BC] px-4 py-3 text-sm font-bold text-white shadow-lg shadow-[#055B75]/20 transition hover:from-[#034457] hover:to-[#055B75]">
                  Book now
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Sticky section navigation */}
      <nav className="sticky top-0 z-30 mt-7 border-y border-slate-100 bg-white/95 shadow-sm backdrop-blur" aria-label="Cruise details">
        <div className="mx-auto flex max-w-7xl gap-7 overflow-x-auto px-4 text-sm font-semibold text-slate-600 sm:px-6 lg:px-8 [&::-webkit-scrollbar]:hidden">
          {['Overview', 'Itinerary', 'Highlights', 'Amenities', 'Important information'].map((label) => (
            <a key={label} href={`#${label.toLowerCase().replace(/\s+/g, '-')}`} className="shrink-0 border-b-2 border-transparent py-4 transition hover:border-[#0890BC] hover:text-[#055B75]">{label}</a>
          ))}
        </div>
      </nav>

      <div id="overview" className="mx-auto grid max-w-7xl gap-7 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:px-8">
        <main className="min-w-0 space-y-8">
          {/* Day-by-day timeline */}
          <section id="itinerary" className="scroll-mt-24 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-100 md:p-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-[0.14em] text-[#0890BC]">Day by day</span>
                <h2 className="mt-1 text-3xl font-extrabold tracking-tight text-[#034457]">Your {display.nights ? `${display.nights}-night ` : ''}itinerary</h2>
                <p className="mt-2 text-sm text-slate-500">Arrival and departure times are local and may change by sailing.</p>
              </div>
              <span className="rounded-full bg-[#F1FBFD] px-4 py-2 text-sm font-semibold text-[#055B75]">{display.days.length} itinerary days</span>
            </div>

            <div className="relative mt-8 space-y-5 before:absolute before:bottom-8 before:left-[25px] before:top-8 before:w-px before:bg-[#65B3CF]/35">
              {display.days.length ? display.days.map((day) => (
                <article key={`${day.day}-${day.port}`} className="relative grid grid-cols-[52px_1fr] gap-4">
                  <div className="z-10 flex h-[52px] w-[52px] flex-col items-center justify-center rounded-2xl bg-gradient-to-br from-[#055B75] to-[#0890BC] text-white shadow-lg shadow-[#055B75]/15">
                    <span className="text-[9px] font-bold uppercase tracking-wider">Day</span>
                    <span className="text-lg font-extrabold leading-none">{day.day}</span>
                  </div>
                  <div className="rounded-2xl border border-slate-100 bg-[#FAFDFE] p-5 transition hover:border-[#65B3CF]/40 hover:shadow-md">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-xl font-bold text-[#034457]">{day.port || 'At sea'}</h3>
                        <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                          <span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5 text-[#0890BC]" /> Arrival: {day.arrival || 'At sea'}</span>
                          <span className="inline-flex items-center gap-1.5"><Ship className="h-3.5 w-3.5 text-[#0890BC]" /> Departure: {day.departure || 'At sea'}</span>
                        </div>
                      </div>
                      <MapPin className="h-5 w-5 text-[#65B3CF]" />
                    </div>
                    {day.activities?.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {day.activities.map((activity) => <span key={activity} className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200">{activity}</span>)}
                      </div>
                    )}
                  </div>
                </article>
              )) : (
                <p className="rounded-2xl bg-[#F1FBFD] p-5 text-sm text-slate-600">The detailed port schedule will be confirmed when you choose a sailing date.</p>
              )}
            </div>
          </section>

          {/* Highlights */}
          <section id="highlights" className="scroll-mt-24 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-100 md:p-8">
            <span className="text-xs font-bold uppercase tracking-[0.14em] text-[#0890BC]">Life on board</span>
            <h2 className="mt-1 text-3xl font-extrabold tracking-tight text-[#034457]">Cruise highlights</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              {FALLBACK_HIGHLIGHTS.map((highlight, index) => (
                <article key={highlight.title} className={`group relative overflow-hidden rounded-2xl ${index === 0 ? 'sm:col-span-2 sm:row-span-2' : ''}`}>
                  <img src={highlight.image} alt={highlight.title} loading="lazy" className={`w-full object-cover transition duration-500 group-hover:scale-105 ${index === 0 ? 'h-full min-h-[320px]' : 'h-[152px]'}`} />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#034457]/80 via-transparent to-transparent" />
                  <h3 className="absolute bottom-0 left-0 p-4 font-bold text-white">{highlight.title}</h3>
                </article>
              ))}
            </div>
          </section>

          {/* Amenities */}
          <section id="amenities" className="scroll-mt-24 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-100 md:p-8">
            <span className="text-xs font-bold uppercase tracking-[0.14em] text-[#0890BC]">Included experiences</span>
            <h2 className="mt-1 text-3xl font-extrabold tracking-tight text-[#034457]">Onboard amenities</h2>
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {(display.amenities.length ? display.amenities : ['Dining', 'Entertainment', 'Pool & deck', 'Fitness center']).map((amenity, index) => {
                const Icon = AMENITY_ICONS[index % AMENITY_ICONS.length];
                return (
                  <div key={amenity} className="flex items-center gap-3 rounded-2xl bg-[#FAFDFE] p-4 ring-1 ring-slate-100">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F1FBFD] text-[#055B75]"><Icon className="h-4 w-4" /></span>
                    <span className="text-sm font-semibold text-[#034457]">{amenity}</span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Important information */}
          <section id="important-information" className="scroll-mt-24 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-100 md:p-8">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#F1FBFD] text-[#055B75]"><Info className="h-5 w-5" /></span>
              <div><h2 className="text-2xl font-extrabold text-[#034457]">Important information</h2><p className="text-sm text-slate-500">What to know before you sail</p></div>
            </div>
            <div className="mt-5">
              <InfoAccordion title="Travel documents and visa requirements" defaultOpen>Every traveler should carry a valid passport and any visas required by the ports on the selected itinerary. Requirements vary by nationality and sailing.</InfoAccordion>
              <InfoAccordion title="What is included in the fare?">Your cruise fare generally includes accommodation, main dining, entertainment and access to standard onboard facilities. Specialty dining, shore excursions and premium services may cost extra.</InfoAccordion>
              <InfoAccordion title="Cancellation and change policy">Policies depend on the selected sailing date and fare type. Review the final conditions during booking or request a call back before payment.</InfoAccordion>
            </div>
          </section>

          {/* Review */}
          <section className="rounded-3xl bg-gradient-to-br from-[#034457] to-[#055B75] p-7 text-white shadow-lg md:p-9">
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div>
                <span className="text-xs font-bold uppercase tracking-[0.14em] text-[#9FD6E8]">Traveler feedback</span>
                <h2 className="mt-1 text-2xl font-extrabold">Why guests love this cruise</h2>
              </div>
              <div className="flex gap-1">{Array.from({ length: 5 }).map((_, index) => <Star key={index} className="h-5 w-5 fill-[#F5B301] text-[#F5B301]" />)}</div>
            </div>
            <blockquote className="mt-6 max-w-3xl text-lg leading-8 text-white/90">“An excellent mix of destinations, onboard entertainment and helpful service. The itinerary was easy to follow and every port offered something memorable.”</blockquote>
            <div className="mt-6 flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 ring-2 ring-white/30">
                <User className="h-5 w-5 text-white" />
              </span>
              <div><p className="font-bold">Verified traveler</p><p className="text-xs text-white/65">Booked with Jetsetters</p></div>
            </div>
          </section>
        </main>

        {/* Sticky booking card */}
        <aside className="lg:block">
          <div className="sticky top-20 overflow-hidden rounded-3xl bg-white shadow-[0_20px_60px_-30px_rgba(3,68,87,0.4)] ring-1 ring-slate-100">
            <div className="bg-gradient-to-r from-[#034457] to-[#055B75] p-5 text-white">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#9FD6E8]">Reserve your voyage</p>
              <h2 className="mt-1 text-xl font-bold">Choose your sailing</h2>
            </div>
            <div className="space-y-5 p-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">From</p>
                <div className="mt-1 text-4xl font-extrabold text-[#055B75]"><Price amount={display.price} showCode /></div>
                <p className="text-xs text-slate-500">per person · double occupancy</p>
              </div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                Cabin type
                <select className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold normal-case text-[#034457] outline-none focus:border-[#0890BC] focus:ring-2 focus:ring-[#0890BC]/20">
                  <option>Inside cabin</option><option>Ocean view</option><option>Balcony</option><option>Suite</option>
                </select>
              </label>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                Travelers
                <select className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold normal-case text-[#034457] outline-none focus:border-[#0890BC] focus:ring-2 focus:ring-[#0890BC]/20">
                  <option>2 adults</option><option>1 adult</option><option>2 adults, 1 child</option><option>2 adults, 2 children</option>
                </select>
              </label>
              <Link to={bookingUrl} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#055B75] to-[#0890BC] px-5 py-3.5 font-bold text-white shadow-lg shadow-[#055B75]/20 transition hover:from-[#034457] hover:to-[#055B75]">
                <Ship className="h-4 w-4" /> Continue to book
              </Link>
              <button onClick={() => setIsCallbackOpen(true)} className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#055B75]/25 px-5 py-3 font-bold text-[#055B75] transition hover:bg-[#F1FBFD]">
                <Phone className="h-4 w-4" /> Request call back
              </button>

              <div className="space-y-3 border-t border-slate-100 pt-4 text-xs text-slate-600">
                <p className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-600" /> Secure checkout with ARC Pay</p>
                <p className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Authorized cruise seller</p>
                <p className="flex items-center gap-2"><Phone className="h-4 w-4 text-[#0890BC]" /> Expert support before and after booking</p>
              </div>
              <p className="text-center text-[11px] leading-5 text-slate-400">Final availability, taxes and fare conditions are shown before payment.</p>
            </div>
          </div>
        </aside>
      </div>

      <Footer />
    </div>
  );
};

export default withPageElements(Itinerary);
