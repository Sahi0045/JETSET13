import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import Navbar from '../Navbar';
import Footer from '../Footer';
import withPageElements from '../PageWrapper';
import { regionByKey } from '../../../../../shared/cruiseRegions.js';
import { CRUISE_PHONE, fetchSailing, inquiryMail, officeToday, priceLabel, shortDate } from './catalog';
import { CRUISE_FONTS } from './CruisesPage';
import './cruisePages.css';

const VoyageChart = lazy(() => import('./map/VoyageChart'));

const SITE = 'https://www.jetsetterss.com';

/** "16:00" → "4:00 PM". */
export const clock = (hhmm) => {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

const listWords = (names) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

const voyageFacts = (sailing) => {
  const portDays = sailing.days.filter((d) => d.port);
  const start = portDays[0]?.port ?? null;
  const end = portDays[portDays.length - 1]?.port ?? null;
  const roundTrip = Boolean(start && end && start.name === end.name && start.country === end.country);
  const ports = portDays.map((d) => d.port).filter((p, i, all) => all.findIndex((q) => q.name === p.name && q.country === p.country) === i);
  const calls = ports.filter((p) => p !== ports[0] && !(roundTrip ? false : p.name === end?.name && p.country === end?.country)).map((p) => p.name);
  return { start, end, roundTrip, ports, calls };
};

const describe = (sailing, facts) => {
  const route = facts.roundTrip ? `round trip from ${facts.start?.name}` : `from ${facts.start?.name} to ${facts.end?.name}`;
  const calls = facts.calls.length ? `, calling at ${listWords(facts.calls)}` : '';
  return `${sailing.nights} nights ${route}${calls}.`;
};

function DayLine({ day }) {
  const arrive = clock(day.arrive);
  const depart = clock(day.depart);
  return (
    <span className="cruise-mono text-[12px] text-[#A9D7E5]">
      {[arrive && `Arrive ${arrive}`, depart && `Depart ${depart}`].filter(Boolean).join(' · ')}
    </span>
  );
}

function Actions({ sailing, compact = false }) {
  return (
    <div className={compact ? 'flex gap-2' : 'mt-3 flex flex-col gap-2'}>
      <a href={CRUISE_PHONE.href} className="rounded-lg bg-[#0890BC] px-4 py-2.5 text-center text-sm font-bold text-white hover:bg-[#055B75]">Call {CRUISE_PHONE.text}</a>
      <a href={inquiryMail(sailing.title)} className="rounded-lg border border-[#0890BC] px-4 py-2.5 text-center text-sm font-bold text-[#055B75] hover:bg-[#F1FBFD]">Email us about this cruise</a>
    </div>
  );
}

function NotAvailable() {
  return (
    <div className="mx-auto max-w-xl px-4 py-32 text-center">
      <Helmet><meta name="robots" content="noindex" /><title>Cruise not available | Jetsetters</title></Helmet>
      <h1 className="cruise-display text-4xl text-white">This cruise isn&apos;t available</h1>
      <p className="mt-4 text-[#CFE8F0]">It may have sailed, or our team may have taken it down while they check the price.</p>
      <Link to="/cruises" className="mt-8 inline-block rounded-lg bg-[#0890BC] px-5 py-3 font-bold text-white">See all cruises</Link>
    </div>
  );
}

function CruiseSailingPage() {
  const { slug } = useParams();
  const [sailing, setSailing] = useState(null);
  const [state, setState] = useState('loading');
  const [activeDay, setActiveDay] = useState(1);
  const chapters = useRef([]);
  const today = officeToday();

  useEffect(() => {
    let live = true;
    setState('loading');
    fetchSailing(slug)
      .then((data) => { if (!live) return; setSailing(data); setState(data ? 'ready' : 'missing'); setActiveDay(1); })
      .catch(() => { if (live) setState('error'); });
    return () => { live = false; };
  }, [slug]);

  // The ship moves to the day a reader has scrolled to.
  useEffect(() => {
    if (state !== 'ready' || typeof IntersectionObserver !== 'function') return undefined;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((e) => e.isIntersecting).map((e) => Number(e.target.dataset.day));
      if (visible.length) setActiveDay(Math.min(...visible));
    }, { rootMargin: '-40% 0px -55% 0px' });
    chapters.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [state, sailing]);

  const facts = useMemo(() => (sailing ? voyageFacts(sailing) : null), [sailing]);

  if (state === 'missing') {
    return <div className="cruise-page min-h-screen"><Navbar /><NotAvailable /><Footer /></div>;
  }
  if (state !== 'ready') {
    return (
      <div className="cruise-page min-h-screen">
        <Navbar />
        <p className="px-4 py-40 text-center text-[#CFE8F0]">
          {state === 'error' ? <>We couldn&apos;t load this cruise just now. Call <a href={CRUISE_PHONE.href} className="underline">{CRUISE_PHONE.text}</a>.</> : 'Loading the voyage…'}
        </p>
        <Footer />
      </div>
    );
  }

  const price = priceLabel(sailing, today);
  const region = regionByKey(sailing.region)?.name ?? '';
  const kicker = [region, `${sailing.nights} NIGHTS`, facts.roundTrip ? `ROUND TRIP FROM ${facts.start?.name}` : `FROM ${facts.start?.name} TO ${facts.end?.name}`]
    .filter(Boolean).join(' · ').toUpperCase();
  const active = sailing.days.find((d) => d.day === activeDay);
  const url = `${SITE}/cruise/${sailing.slug}`;
  const trip = {
    '@context': 'https://schema.org',
    '@type': 'Trip',
    name: sailing.title,
    description: describe(sailing, facts),
    url,
    provider: { '@type': 'TravelAgency', name: 'Jetsetters', url: SITE },
    itinerary: {
      '@type': 'ItemList',
      itemListElement: facts.ports.map((p, i) => ({ '@type': 'ListItem', position: i + 1, item: { '@type': 'Place', name: `${p.name}, ${p.country}` } })),
    },
    ...(price.kind === 'price' ? { offers: { '@type': 'Offer', price: Number(sailing.from_price_usd), priceCurrency: 'USD', url } } : {}),
  };

  return (
    <div className="cruise-page min-h-screen">
      <Helmet>
        <title>{`${sailing.title} | ${sailing.nights}-night cruise | Jetsetters`}</title>
        <meta name="description" content={describe(sailing, facts)} />
        <link rel="canonical" href={url} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={CRUISE_FONTS} />
        <script type="application/ld+json">{JSON.stringify(trip)}</script>
      </Helmet>
      <Navbar />

      <div className="cruise-sailing-sky pb-28 pt-24 md:pb-16">
        <header className="mx-auto max-w-6xl px-4">
          <Link to="/cruises" className="cruise-mono text-[12px] text-[#A9D7E5] hover:text-white">← All cruises</Link>
          <p className="cruise-mono mt-4 text-[12px] tracking-wide text-[#65B3CF]">{kicker}</p>
          <h1 className="cruise-display mt-3 max-w-3xl text-[34px] leading-[1.06] text-white md:text-[44px]">{sailing.headline || sailing.title}</h1>
          {sailing.headline && <p className="mt-2 text-[#CFE8F0]">{sailing.title}</p>}
        </header>

        <div className="mx-auto mt-8 grid max-w-6xl gap-6 px-4 md:grid-cols-[1.45fr_1fr]">
          <div className="md:sticky md:top-20 md:self-start">
            <div className="relative h-[240px] overflow-hidden rounded-2xl border border-[rgba(101,179,207,0.18)] bg-[#032B37] md:h-[430px]">
              <Suspense fallback={<div className="h-full w-full bg-[#032B37]" />}>
                <VoyageChart route={sailing.route} days={sailing.days} activeDay={activeDay} onPickDay={setActiveDay} />
              </Suspense>
              {active && (
                <div className="absolute bottom-3 left-3 max-w-[280px] rounded-xl border border-[rgba(101,179,207,0.25)] bg-[rgba(2,28,37,0.88)] px-4 py-3">
                  <p className="cruise-mono text-[11px] text-[#F3C58F]">DAY {String(active.day).padStart(2, '0')}{active.port ? ` · ${active.port.country.toUpperCase()}` : ''}</p>
                  <p className="cruise-display text-2xl text-white">{active.port ? active.port.name : 'At sea'}</p>
                  {active.port && <DayLine day={active} />}
                </div>
              )}
            </div>
            <div className="mt-4 hidden rounded-xl bg-white p-4 text-[#0F2A33] md:block">
              <p className="cruise-display text-2xl text-[#034457]">{price.amount}</p>
              <p className="cruise-mono mt-1 text-[11px] text-[#5B7480]">{price.note}</p>
              <Actions sailing={sailing} />
            </div>
          </div>

          <div>
            <ol aria-label="Day by day" className="border-l border-[rgba(143,195,211,0.35)]">
              {sailing.days.map((d, i) => (
                <li
                  key={d.day}
                  ref={(el) => { chapters.current[i] = el; }}
                  data-day={d.day}
                  className="relative min-h-[96px] cursor-pointer py-4 pl-6 md:min-h-[140px]"
                  onClick={() => setActiveDay(d.day)}
                >
                  <span className={`absolute -left-[5px] top-6 h-[9px] w-[9px] rounded-full border ${d.day === activeDay ? 'border-[#F3C58F] bg-[#F3C58F] shadow-[0_0_12px_#F3C58F]' : d.day < activeDay ? 'border-[#8FC3D3] bg-[#8FC3D3]' : 'border-[#8FC3D3] bg-[#021C25]'}`} />
                  <p className="cruise-mono text-[11px] text-[#8FC3D3]">DAY {d.day}</p>
                  <p className={`cruise-display text-xl ${d.day === activeDay ? 'text-white' : 'text-[#CFE8F0]'}`}>
                    {d.port ? <>{d.port.name}<span className="text-base text-[#8FC3D3]">, {d.port.country}</span></> : 'At sea'}
                  </p>
                  {d.port && <DayLine day={d} />}
                </li>
              ))}
            </ol>
          </div>
        </div>

        <section className="mx-auto mt-12 grid max-w-6xl gap-8 px-4 md:grid-cols-3">
          <div>
            <h2 className="cruise-display text-xl text-white">Sailing dates</h2>
            <ul className="cruise-mono mt-3 space-y-1 text-[13px] text-[#CFE8F0]">
              {sailing.dates.map((date) => <li key={date}>{shortDate(date)}</li>)}
            </ul>
          </div>
          <div>
            <h2 className="cruise-display text-xl text-white">Ship and line</h2>
            <p className="mt-3 text-[#CFE8F0]">{[sailing.ship_name, sailing.line_name].filter(Boolean).join(' · ')}</p>
          </div>
          {sailing.inclusions && (
            <div>
              <h2 className="cruise-display text-xl text-white">What&apos;s included</h2>
              <p className="mt-3 whitespace-pre-line text-[#CFE8F0]">{sailing.inclusions}</p>
            </div>
          )}
        </section>

        {sailing.photos.length > 0 && (
          <section className="mx-auto mt-10 grid max-w-6xl gap-4 px-4 sm:grid-cols-2 lg:grid-cols-3">
            {sailing.photos.map((photo) => (
              <figure key={photo.url} className="overflow-hidden rounded-xl bg-[#032B37]">
                <img src={photo.url} alt="" loading="lazy" className="h-56 w-full object-cover" />
                <figcaption className="cruise-mono px-3 py-2 text-[11px] text-[#8FC3D3]">Photo: {photo.credit}</figcaption>
              </figure>
            ))}
          </section>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t border-gray-200 bg-white px-4 py-3 md:hidden">
        <div className="min-w-0">
          <p className="cruise-display truncate text-lg text-[#034457]">{price.amount}</p>
          <p className="cruise-mono truncate text-[10px] text-[#5B7480]">{price.kind === 'price' ? 'pp · port fees incl.' : 'call or email us'}</p>
        </div>
        <Actions sailing={sailing} compact />
      </div>

      <Footer />
    </div>
  );
}

export default withPageElements(CruiseSailingPage);
