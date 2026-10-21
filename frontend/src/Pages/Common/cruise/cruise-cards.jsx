import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  FaAnchor, FaCalendarAlt, FaChevronDown, FaChevronUp, FaExclamationTriangle, FaMapMarkerAlt, FaRegClock, FaSearch, FaShip,
  FaSlidersH, FaSpinner,
} from 'react-icons/fa';
import './HeroSection.css';
import Navbar from '../Navbar';
import Footer from '../Footer';
import withPageElements from '../PageWrapper';
import { CRUISE_EMAIL, CRUISE_PHONE, SEA_PHOTO, priceLabel, shortDate } from './catalog';
import {
  NIGHT_RANGES, criteriaFrom, departurePort, matchesSearch, monthName, regionName, searchOptions, searchQuery,
} from './searchSailings';
import { usePublishedSailings } from './useSailings';

const SORTS = [
  { key: 'date', label: 'Soonest departure' },
  { key: 'price', label: 'Price: low to high' },
  { key: 'nights', label: 'Shortest first' },
];

const byPrice = (a, b) => {
  const pa = priceLabel(a).kind === 'price' ? a.from_price_usd : Infinity;
  const pb = priceLabel(b).kind === 'price' ? b.from_price_usd : Infinity;
  return pa - pb;
};

const sortSailings = (sailings, sortBy) => {
  const out = [...sailings].sort((a, b) => a.next_date.localeCompare(b.next_date));
  if (sortBy === 'price') return out.sort(byPrice);
  if (sortBy === 'nights') return out.sort((a, b) => a.nights - b.nights);
  return out;
};

/* ---------- Collapsible sidebar filter group ---------- */
const FilterGroup = ({ title, icon: Icon, children, defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-slate-100 last:border-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 py-3.5 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2.5 text-sm font-semibold text-[#034457]">
          <Icon className="w-3.5 h-3.5 text-[#0890BC]" /> {title}
        </span>
        {open ? <FaChevronUp className="w-3 h-3 text-slate-400" /> : <FaChevronDown className="w-3 h-3 text-slate-400" />}
      </button>
      {open && <div className="pb-4 pl-1">{children}</div>}
    </div>
  );
};

const OptionList = ({ options, chosen, onChoose }) => (
  <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
    {options.length === 0 && <p className="text-xs text-slate-400">No options</p>}
    {options.map(({ value, label }) => {
      const isChosen = chosen === value;
      return (
        <button
          key={value}
          type="button"
          aria-pressed={isChosen}
          onClick={() => onChoose(isChosen ? '' : value)}
          className={`w-full flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${isChosen ? 'bg-[#F1FBFD] font-semibold text-[#055B75]' : 'text-slate-600 hover:text-[#055B75]'}`}
        >
          <span className={`h-3.5 w-3.5 shrink-0 rounded-full border ${isChosen ? 'border-[#055B75] bg-[#055B75]' : 'border-slate-300'}`} />
          <span className="truncate">{label}</span>
        </button>
      );
    })}
  </div>
);

/* ---------- Top-bar labeled field ---------- */
const TopChoice = ({ id, label, value, onChange, children }) => (
  <div>
    <label htmlFor={id} className="block text-[10px] font-bold uppercase tracking-[0.12em] text-[#65B3CF] mb-1">{label}</label>
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="cruise-topbar-input">
      {children}
    </select>
  </div>
);

const ContactLinks = () => (
  <>
    Call <a href={CRUISE_PHONE.href} className="font-semibold text-[#055B75] underline">{CRUISE_PHONE.text}</a> or email{' '}
    <a href={`mailto:${CRUISE_EMAIL}`} className="font-semibold text-[#055B75] underline">{CRUISE_EMAIL}</a>
  </>
);

const Notice = ({ icon: Icon, title, children }) => (
  <div className="bg-white rounded-2xl ring-1 ring-slate-100 shadow-sm p-10 md:p-12 text-center">
    <div className="w-16 h-16 bg-[#055B75]/10 text-[#055B75] rounded-2xl flex items-center justify-center mx-auto mb-5">
      <Icon className="text-2xl" />
    </div>
    <h2 className="text-xl font-bold text-[#034457] mb-2">{title}</h2>
    <div className="text-slate-600 max-w-md mx-auto">{children}</div>
  </div>
);

const CruiseCards = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const criteria = useMemo(() => criteriaFrom(searchParams), [searchParams]);
  const [sortBy, setSortBy] = useState('date');
  const { data: sailings = [], isLoading, isError } = usePublishedSailings();

  const options = useMemo(() => searchOptions(sailings), [sailings]);
  const results = useMemo(
    () => sortSailings(sailings.filter((s) => matchesSearch(s, criteria)), sortBy),
    [sailings, criteria, sortBy],
  );

  const choose = (key) => (value) => setSearchParams(searchQuery({ ...criteria, [key]: value }), { replace: true });
  const clearAll = () => setSearchParams('', { replace: true });

  const regionOptions = options.regions.map((r) => ({ value: r.key, label: r.name }));
  const lineOptions = options.lines.map((line) => ({ value: line, label: line }));
  const portOptions = options.ports.map((port) => ({ value: port, label: port }));
  const lengthOptions = NIGHT_RANGES.map((r) => ({ value: r.key, label: r.label }));

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F4F7F8]">
        <Navbar forceScrolled={true} />
        <div className="flex items-center justify-center py-32">
          <div className="text-center">
            <FaSpinner className="text-[#055B75] text-5xl animate-spin mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-[#034457] mb-2">Loading Cruises</h1>
            <p className="text-gray-600 font-medium">Loading the sailings our team has listed…</p>
          </div>
        </div>
      </div>
    );
  }

  let body;
  if (isError) {
    body = (
      <Notice icon={FaExclamationTriangle} title="We couldn't load the sailings">
        Please try again in a minute. <ContactLinks /> and our team will help you straight away.
      </Notice>
    );
  } else if (sailings.length === 0) {
    body = (
      <Notice icon={FaShip} title="No sailings are listed right now">
        Our team can still find and book a cruise for you. <ContactLinks />.
      </Notice>
    );
  } else if (results.length === 0) {
    body = (
      <Notice icon={FaSearch} title="No cruises match your search">
        <p className="mb-6">Try fewer filters, or clear them to see every sailing.</p>
        <button type="button" onClick={clearAll} className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-br from-[#055B75] to-[#034457] text-white font-semibold rounded-lg hover:shadow-lg transition-all">
          Clear all filters
        </button>
      </Notice>
    );
  } else {
    body = (
      <div className="space-y-5">
        {results.map((sailing) => <SailingCard key={sailing.slug} sailing={sailing} />)}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F4F7F8]">
      <Navbar forceScrolled={true} />

      {/* ===== Top teal search bar ===== */}
      <div className="bg-gradient-to-r from-[#034457] to-[#055B75]">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 items-end">
            <TopChoice id="cruise-filter-region" label="Destination" value={criteria.region} onChange={choose('region')}>
              <option value="">Any destination</option>
              {regionOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </TopChoice>
            <TopChoice id="cruise-filter-line" label="Cruise line" value={criteria.line} onChange={choose('line')}>
              <option value="">Any cruise line</option>
              {lineOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </TopChoice>
            <TopChoice id="cruise-filter-port" label="Departure port" value={criteria.port} onChange={choose('port')}>
              <option value="">Any port</option>
              {portOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </TopChoice>
            <TopChoice id="cruise-filter-month" label="Month" value={criteria.month} onChange={choose('month')}>
              <option value="">Any month</option>
              {options.months.map((month) => <option key={month} value={month}>{monthName(month)}</option>)}
            </TopChoice>
            <div className="col-span-2 lg:col-span-1">
              <TopChoice id="cruise-filter-length" label="Length" value={criteria.length} onChange={choose('length')}>
                <option value="">Any length</option>
                {lengthOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </TopChoice>
            </div>
          </div>
        </div>
      </div>

      {/* ===== Two-column layout ===== */}
      <div className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
        <aside className="hidden lg:block">
          <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-100 overflow-hidden sticky top-24">
            <div className="flex items-center justify-between px-5 py-4 bg-[#034457] text-white">
              <span className="flex items-center gap-2 font-semibold"><FaSlidersH className="w-4 h-4" /> Filter your search</span>
              <button type="button" onClick={clearAll} className="text-xs text-white/80 hover:text-white underline">Clear</button>
            </div>
            <div className="px-5">
              <FilterGroup title="Length" icon={FaRegClock} defaultOpen>
                <OptionList options={lengthOptions} chosen={criteria.length} onChoose={choose('length')} />
              </FilterGroup>
              <FilterGroup title="Destination" icon={FaMapMarkerAlt} defaultOpen>
                <OptionList options={regionOptions} chosen={criteria.region} onChoose={choose('region')} />
              </FilterGroup>
              <FilterGroup title="Departure port" icon={FaAnchor}>
                <OptionList options={portOptions} chosen={criteria.port} onChoose={choose('port')} />
              </FilterGroup>
              <FilterGroup title="Cruise line" icon={FaShip}>
                <OptionList options={lineOptions} chosen={criteria.line} onChoose={choose('line')} />
              </FilterGroup>
            </div>
          </div>
        </aside>

        <main className="min-w-0">
          <h1 className="mb-5 text-2xl font-bold text-[#034457]">Find Your Perfect Cruise</h1>

          {!isError && sailings.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white rounded-xl shadow-sm ring-1 ring-slate-100 px-4 py-3 mb-5">
              <div className="flex items-center gap-2">
                <label htmlFor="cruise-sort" className="text-sm text-slate-500">Sort by</label>
                <select id="cruise-sort" value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="text-sm font-semibold text-[#034457] border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#0890BC]">
                  {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </div>
              <span className="text-sm font-bold text-[#055B75]">{results.length} {results.length === 1 ? 'sailing' : 'sailings'}</span>
            </div>
          )}

          {body}
        </main>
      </div>

      <Footer />
    </div>
  );
};

/* ---------- One sailing ---------- */
const SailingCard = ({ sailing }) => {
  const price = priceLabel(sailing);
  const moreDates = Math.max(0, (sailing.date_count ?? 1) - 1);
  const route = sailing.port_names?.length ? sailing.port_names.join(' → ') : 'Ports listed on the itinerary';
  const from = departurePort(sailing);

  return (
    <article className="bg-white rounded-2xl ring-1 ring-slate-100 shadow-sm hover:shadow-lg transition-shadow overflow-hidden flex flex-col md:flex-row">
      <div className="relative h-44 md:h-auto md:w-60 md:min-h-[184px] shrink-0 bg-[#034457]">
        <img loading="lazy" decoding="async" src={sailing.photo?.url || SEA_PHOTO} alt="" className="absolute inset-0 w-full h-full object-cover" />
        <span className="absolute top-3 left-3 rounded-full bg-white/90 px-2.5 py-1 text-xs font-bold text-[#034457] shadow-sm">{regionName(sailing.region)}</span>
      </div>

      <div className="flex-1 min-w-0 p-5">
        <h3 className="text-lg font-bold text-[#034457] leading-tight">{sailing.title}</h3>
        <p className="mt-1.5 flex items-center gap-2 text-sm font-semibold text-[#055B75]">
          <FaShip className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{sailing.line_name}{sailing.ship_name ? ` · ${sailing.ship_name}` : ''}</span>
        </p>
        <ul className="mt-3 space-y-1.5 text-sm text-slate-600">
          <li className="flex items-center gap-2"><FaRegClock className="w-3.5 h-3.5 shrink-0 text-[#0890BC]" /> {sailing.nights} nights{from ? ` from ${from}` : ''}</li>
          <li className="flex items-start gap-2"><FaMapMarkerAlt className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#0890BC]" /> <span>{route}</span></li>
          <li className="flex items-center gap-2">
            <FaCalendarAlt className="w-3.5 h-3.5 shrink-0 text-[#0890BC]" />
            {`Next sailing ${shortDate(sailing.next_date)}${moreDates ? ` · ${moreDates} more ${moreDates === 1 ? 'date' : 'dates'}` : ''}`}
          </li>
        </ul>
      </div>

      <div className="md:w-56 shrink-0 flex items-center md:flex-col md:items-end md:justify-center justify-between gap-3 border-t md:border-t-0 md:border-l border-slate-100 bg-[#FAFDFE] p-5 md:text-right">
        <div className="min-w-0">
          <div className="text-lg font-extrabold text-[#055B75] leading-tight">{price.amount}</div>
          <div className="mt-0.5 text-[11px] leading-snug text-slate-500 max-w-[190px]">{price.note}</div>
        </div>
        <Link
          to={`/itinerary?sailing=${encodeURIComponent(sailing.slug)}`}
          className="inline-flex shrink-0 items-center gap-2 bg-gradient-to-r from-[#055B75] to-[#0890BC] hover:from-[#034457] hover:to-[#055B75] text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-all shadow-sm hover:shadow-md whitespace-nowrap"
        >
          View itinerary
        </Link>
      </div>
    </article>
  );
};

export default withPageElements(CruiseCards);
