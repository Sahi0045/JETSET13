import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import Navbar from '../Navbar';
import Footer from '../Footer';
import withPageElements from '../PageWrapper';
import CruiseGlobe from './map/CruiseGlobe';
import RouteThumb from './map/RouteThumb';
import { CRUISE_EMAIL, CRUISE_PHONE, fetchRegions, fetchSailings, officeToday, priceLabel, shortDate } from './catalog';
import './cruisePages.css';

export const CRUISE_FONTS = 'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;1,9..144,300&family=Manrope:wght@400;500;700&family=IBM+Plex+Mono:wght@400;500&display=swap';

const ALL = 'all';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "7 nights · round trip from Miami · 3 ports of call" or "7 nights · Seattle to Juneau". */
export const voyageLine = (s) => {
  const roundTrip = s.start_port && s.start_port === s.end_port;
  const calls = (s.port_names ?? []).filter((name) => name !== s.start_port && name !== s.end_port).length;
  const route = roundTrip ? `round trip from ${s.start_port}` : [s.start_port, s.end_port].filter(Boolean).join(' to ');
  return [plural(s.nights, 'night'), route, roundTrip && calls ? plural(calls, 'port') + ' of call' : null].filter(Boolean).join(' · ');
};

function SailingCard({ sailing, today }) {
  const price = priceLabel(sailing, today);
  const more = sailing.date_count > 1 ? ` · ${plural(sailing.date_count - 1, 'more date')}` : '';
  return (
    <Link to={`/cruise/${sailing.slug}`} className="group block overflow-hidden rounded-xl border border-[rgba(101,179,207,0.18)] bg-[#04394A] text-[#E3F4F9] transition-colors hover:border-[rgba(101,179,207,0.5)]">
      <div className="h-[110px] bg-[#032F3D]">
        <RouteThumb route={sailing.route} ports={sailing.ports ?? []} />
      </div>
      <div className="p-4">
        <h3 className="text-base font-bold text-white">{sailing.title}</h3>
        <p className="cruise-mono mt-1 text-[11.5px] text-[#8FC3D3]">{voyageLine(sailing)}</p>
        <p className="cruise-mono mt-1 text-[11.5px] text-[#8FC3D3]">Next sailing {shortDate(sailing.next_date)}{more}</p>
        <p className="cruise-display mt-3 text-xl text-white">{price.amount}</p>
        {price.kind === 'price' && <p className="cruise-mono mt-0.5 text-[10.5px] text-[#8FC3D3]">{price.note}</p>}
      </div>
    </Link>
  );
}

function ContactLine() {
  return (
    <>
      Call <a href={CRUISE_PHONE.href} className="font-semibold text-[#F3C58F] underline">{CRUISE_PHONE.text}</a> or email{' '}
      <a href={`mailto:${CRUISE_EMAIL}`} className="font-semibold text-[#F3C58F] underline">{CRUISE_EMAIL}</a>
    </>
  );
}

function CruisesPage() {
  const [params, setParams] = useSearchParams();
  const [sailings, setSailings] = useState([]);
  const [regions, setRegions] = useState([]);
  const [state, setState] = useState('loading');
  const today = officeToday();

  useEffect(() => {
    let live = true;
    Promise.all([fetchSailings(), fetchRegions()])
      .then(([s, r]) => { if (live) { setSailings(s); setRegions(r); setState('ready'); } })
      .catch(() => { if (live) setState('error'); });
    return () => { live = false; };
  }, []);

  const wanted = params.get('region') || ALL;
  const selected = wanted === ALL || regions.some((r) => r.key === wanted) ? wanted : ALL;
  const busiest = useMemo(() => [...regions].sort((a, b) => b.count - a.count)[0], [regions]);
  const chips = useMemo(() => [
    { key: ALL, name: 'All regions', count: sailings.length, lat: busiest?.lat ?? 20, lon: busiest?.lon ?? -60 },
    ...regions,
  ], [regions, sailings.length, busiest]);
  const shown = selected === ALL ? sailings : sailings.filter((s) => s.region === selected);
  const selectedName = chips.find((c) => c.key === selected)?.name;

  const select = (key) => setParams(key === ALL ? {} : { region: key }, { replace: true });

  return (
    <div className="cruise-page min-h-screen">
      <Helmet>
        <title>Cruises | Jetsetters</title>
        <meta name="description" content="Cruises our team books on the major cruise lines: real sailings, port-by-port itineraries and prices our team checks with the cruise line." />
        <link rel="canonical" href="https://www.jetsetterss.com/cruises" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={CRUISE_FONTS} />
      </Helmet>
      <Navbar />

      <section className="cruise-hero min-h-[620px] pt-20">
        <div className="cruise-sky" aria-hidden="true" />
        <div className="cruise-stars" aria-hidden="true" />
        <div className="cruise-sea" aria-hidden="true" />
        <div className="cruise-waves" aria-hidden="true">
          <svg viewBox="0 0 2400 110" preserveAspectRatio="none"><path fill="rgba(5,91,117,0.55)" d="M0 55 Q150 25 300 55 T600 55 T900 55 T1200 55 T1500 55 T1800 55 T2100 55 T2400 55 V110 H0 Z" /></svg>
          <svg viewBox="0 0 2400 110" preserveAspectRatio="none"><path fill="rgba(2,28,37,0.9)" d="M0 80 Q150 64 300 80 T600 80 T900 80 T1200 80 T1500 80 T1800 80 T2100 80 T2400 80 V110 H0 Z" /></svg>
        </div>
        <div className="relative z-10 mx-auto grid max-w-6xl items-center gap-10 px-4 pb-32 pt-10 md:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="cruise-mono text-[12px] tracking-wide text-[#65B3CF]">CRUISES · BOOKED BY OUR TEAM, PAID ON JETSETTERS</p>
            <h1 className="cruise-display mt-4 text-[42px] leading-[1.02] text-white md:text-[58px]">
              Pick a sea. We&apos;ll <em className="text-[#F3C58F]">plot</em> the voyage.
            </h1>
            <p className="mt-4 max-w-md leading-relaxed text-[#CFE8F0]">
              Turn the globe or pick a region. Every sailing we can book there appears below, with its route, its ports and the hours in each.
            </p>
          </div>
          <CruiseGlobe regions={chips} selectedKey={selected} onSelect={select} />
        </div>
      </section>

      <section className="bg-[#032A36] px-4 py-10">
        <div className="mx-auto max-w-6xl">
          <h2 className="cruise-display text-2xl text-white">{selected === ALL ? 'All sailings' : `${selectedName} sailings`}</h2>
          {state === 'loading' && <p className="mt-6 text-[#A9D7E5]">Loading sailings…</p>}
          {state === 'error' && (
            <p className="mt-6 max-w-xl leading-relaxed text-[#CFE8F0]">We couldn&apos;t load the cruises just now. <ContactLine /> and we&apos;ll find your sailing.</p>
          )}
          {state === 'ready' && shown.length === 0 && (
            <p className="mt-6 max-w-xl leading-relaxed text-[#CFE8F0]">Our cruise team is adding sailings. <ContactLine /> and we&apos;ll find yours.</p>
          )}
          {state === 'ready' && shown.length > 0 && (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {shown.map((s) => <SailingCard key={s.slug} sailing={s} today={today} />)}
            </div>
          )}
        </div>
      </section>

      <section className="bg-[#021C25] px-4 pb-14 pt-4">
        <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-2">
          <div>
            <h2 className="cruise-display text-xl text-white">Booked by our team</h2>
            <p className="mt-2 leading-relaxed text-[#CFE8F0]">Tell us the sailing, your dates and who is travelling. We check the cabin and today&apos;s price with the cruise line, send you a quote, and book it once you have paid on Jetsetters.</p>
          </div>
          <div>
            <h2 className="cruise-display text-xl text-white">Port by port</h2>
            <p className="mt-2 leading-relaxed text-[#CFE8F0]">Each sailing lists every day of the voyage: the port, the time the ship arrives and the time it leaves, and the days at sea in between.</p>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

export default withPageElements(CruisesPage);
