import React, { useEffect, useState, useMemo } from "react";
import { useSearchParams, Link } from "react-router-dom";
import {
  FaMapMarkerAlt, FaCalendarAlt, FaArrowLeft, FaShip, FaSearch, FaSpinner,
  FaExclamationTriangle, FaAnchor, FaChevronRight, FaChevronDown, FaChevronUp,
  FaSlidersH, FaRegClock, FaTags, FaGift, FaFileInvoiceDollar,
} from 'react-icons/fa';
import { loadCruiseLines } from './data/cruiselinesLoader';
import './HeroSection.css';
import Navbar from '../Navbar';
import Footer from '../Footer';
import withPageElements from '../PageWrapper';
import Price from '../../../Components/Price';
import { useCruiseList } from '../../../hooks/queries';

// Representative cabin-type multipliers applied to the per-person "from" price.
// The API returns a single starting price; cabin-level rates are finalised on the
// itinerary/booking page. These give the MMT-style rate table a realistic spread.
const CABIN_TYPES = [
  { key: 'INSIDE', mult: 1 },
  { key: 'OUTSIDE', mult: 1.28 },
  { key: 'BALCONY', mult: 1.7 },
  { key: 'SUITE', mult: 3.0 },
];

const toNumber = (v) => {
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const parseNights = (duration) => {
  const n = parseInt(String(duration || '').replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/* ---------- Collapsible sidebar filter group ---------- */
const FilterGroup = ({ title, icon: Icon, children, defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-slate-100 last:border-0">
      <button
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

const CheckboxList = ({ options, selected, onToggle }) => (
  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
    {options.length === 0 && <p className="text-xs text-slate-400">No options</p>}
    {options.map((opt) => (
      <label key={opt} className="flex items-center gap-2.5 text-sm text-slate-600 cursor-pointer hover:text-[#055B75]">
        <input
          type="checkbox"
          checked={selected.has(opt)}
          onChange={() => onToggle(opt)}
          className="w-4 h-4 rounded border-slate-300 text-[#055B75] focus:ring-[#0890BC] accent-[#055B75]"
        />
        <span className="truncate">{opt}</span>
      </label>
    ))}
  </div>
);

const CruiseCards = () => {
  const [searchParams] = useSearchParams();
  const cruiseLineParam = searchParams.get('cruiseLine');
  const destinationParam = searchParams.get('destination');

  const [usingFallback, setUsingFallback] = useState(false);
  const [fallbackCruises, setFallbackCruises] = useState([]);

  const { data: apiCruises, isLoading: apiLoading, isError } = useCruiseList();

  const transformedCruises = useMemo(() => {
    if (!apiCruises || apiCruises.length === 0) return [];
    return apiCruises.map((cruise, idx) => ({
      id: cruise.id || `${cruise.cruise_line || 'cruise'}-${cruise.departure_date || ''}-${cruise.departure_port || ''}-${idx}`,
      name: cruise.cruise_line || cruise.name,
      image: cruise.image || '/images/cruises/caribbean-paradise.jpg',
      duration: cruise.duration ? `${cruise.duration} Days` : cruise.duration,
      description: cruise.name || cruise.description,
      destinations: cruise.destinations || [],
      departurePorts: cruise.departure_port ? [cruise.departure_port] : (cruise.departurePorts || []),
      price: cruise.price_per_person || cruise.price,
      priceValue: cruise.price_per_person || cruise.priceValue || cruise.price,
      departureDate: cruise.departure_date || cruise.departureDate,
    }));
  }, [apiCruises]);

  useEffect(() => {
    if (isError && fallbackCruises.length === 0) {
      setUsingFallback(true);
      loadCruiseLines().then((fb) => setFallbackCruises((fb.cruiseLines || []).map((c) => ({
        ...c,
        destinations: c.destinations || [],
        departurePorts: c.departurePorts || [],
        priceValue: c.price,
      }))));
    }
  }, [isError, fallbackCruises.length]);

  const allCruises = usingFallback ? fallbackCruises : transformedCruises;
  const error = isError ? 'Unable to fetch live cruise data. Using fallback data.' : null;

  /* ---------- Filter state (shared by top bar + sidebar) ---------- */
  const [selectedLines, setSelectedLines] = useState(new Set(cruiseLineParam ? [cruiseLineParam] : []));
  const [selectedDestinations, setSelectedDestinations] = useState(new Set(destinationParam ? [destinationParam] : []));
  const [selectedPorts, setSelectedPorts] = useState(new Set());
  const [durationBuckets, setDurationBuckets] = useState(new Set());
  const [maxPrice, setMaxPrice] = useState(0);
  const [sortBy, setSortBy] = useState('price');

  const toggleInSet = (setter) => (val) =>
    setter((prev) => {
      const next = new Set(prev);
      next.has(val) ? next.delete(val) : next.add(val);
      return next;
    });
  const setSingle = (setter) => (val) => setter(val ? new Set([val]) : new Set());

  /* ---------- Derive filter options from data ---------- */
  const { lineOptions, destinationOptions, portOptions, priceCeiling } = useMemo(() => {
    const lines = new Set(), dests = new Set(), ports = new Set();
    let ceiling = 0;
    allCruises.forEach((c) => {
      if (c.name) lines.add(c.name);
      (c.destinations || []).forEach((d) => dests.add(d));
      (c.departurePorts || []).forEach((p) => ports.add(p));
      ceiling = Math.max(ceiling, toNumber(c.priceValue));
    });
    return {
      lineOptions: [...lines].sort(),
      destinationOptions: [...dests].sort(),
      portOptions: [...ports].sort(),
      priceCeiling: Math.ceil(ceiling) || 5000,
    };
  }, [allCruises]);

  useEffect(() => { if (priceCeiling && maxPrice === 0) setMaxPrice(priceCeiling); }, [priceCeiling]);

  const DURATION_BUCKETS = [
    { key: '2-5', label: '2 – 5 Nights', test: (n) => n >= 2 && n <= 5 },
    { key: '6-9', label: '6 – 9 Nights', test: (n) => n >= 6 && n <= 9 },
    { key: '10+', label: '10+ Nights', test: (n) => n >= 10 },
  ];

  /* ---------- Apply filters + sort ---------- */
  const filteredCruises = useMemo(() => {
    let out = allCruises.filter((c) => {
      if (selectedLines.size && !selectedLines.has(c.name)) return false;
      if (selectedDestinations.size && !(c.destinations || []).some((d) => selectedDestinations.has(d))) return false;
      if (selectedPorts.size && !(c.departurePorts || []).some((p) => selectedPorts.has(p))) return false;
      if (durationBuckets.size) {
        const n = parseNights(c.duration);
        const ok = n != null && [...durationBuckets].some((k) => DURATION_BUCKETS.find((b) => b.key === k)?.test(n));
        if (!ok) return false;
      }
      if (maxPrice && toNumber(c.priceValue) > maxPrice) return false;
      return true;
    });
    out = [...out].sort((a, b) => {
      if (sortBy === 'price') return toNumber(a.priceValue) - toNumber(b.priceValue);
      if (sortBy === 'duration') return (parseNights(a.duration) || 0) - (parseNights(b.duration) || 0);
      return String(a.name).localeCompare(String(b.name));
    });
    return out;
  }, [allCruises, selectedLines, selectedDestinations, selectedPorts, durationBuckets, maxPrice, sortBy]);

  const totalSailings = useMemo(
    () => filteredCruises.reduce((sum, c) => sum + Math.max(1, (c.departurePorts || []).length) * 3, 0),
    [filteredCruises]
  );

  const clearAll = () => {
    setSelectedLines(new Set());
    setSelectedDestinations(new Set());
    setSelectedPorts(new Set());
    setDurationBuckets(new Set());
    setMaxPrice(priceCeiling);
  };

  const isLoading = apiLoading && !usingFallback;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F4F7F8]">
        <Navbar forceScrolled={true} />
        <div className="flex items-center justify-center py-32">
          <div className="text-center">
            <FaSpinner className="text-[#055B75] text-5xl animate-spin mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-[#034457] mb-2">Loading Cruises</h1>
            <p className="text-gray-600 font-medium">Loading cruise data...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F4F7F8]">
      <Navbar forceScrolled={true} />

      {/* ===== Top teal search bar ===== */}
      <div>
        <div className="bg-gradient-to-r from-[#034457] to-[#055B75]">
          <div className="max-w-7xl mx-auto px-4 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
              <SearchField label="Destination">
                <select value={[...selectedDestinations][0] || ''} onChange={(e) => setSingle(setSelectedDestinations)(e.target.value)} className="cruise-topbar-input">
                  <option value="">Select Destination</option>
                  {destinationOptions.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </SearchField>
              <SearchField label="Cruise Line">
                <select value={[...selectedLines][0] || ''} onChange={(e) => setSingle(setSelectedLines)(e.target.value)} className="cruise-topbar-input">
                  <option value="">Select Cruise Line</option>
                  {lineOptions.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </SearchField>
              <SearchField label="Departure Port">
                <select value={[...selectedPorts][0] || ''} onChange={(e) => setSingle(setSelectedPorts)(e.target.value)} className="cruise-topbar-input">
                  <option value="">Select Departure Ports</option>
                  {portOptions.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </SearchField>
              <div className="flex items-center gap-2">
                <SearchField label="Duration" className="flex-1">
                  <select value={[...durationBuckets][0] || ''} onChange={(e) => setDurationBuckets(e.target.value ? new Set([e.target.value]) : new Set())} className="cruise-topbar-input">
                    <option value="">Any Duration</option>
                    {DURATION_BUCKETS.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
                  </select>
                </SearchField>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ===== Two-column layout ===== */}
      <div className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* ---- Sidebar ---- */}
        <aside className="hidden lg:block">
          <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-100 overflow-hidden sticky top-4">
            <div className="flex items-center justify-between px-5 py-4 bg-[#034457] text-white">
              <span className="flex items-center gap-2 font-semibold"><FaSlidersH className="w-4 h-4" /> Filter Your Search</span>
              <button onClick={clearAll} className="text-xs text-white/80 hover:text-white underline">Clear</button>
            </div>
            <div className="px-5">
              <FilterGroup title="Price Per Person" icon={FaTags} defaultOpen>
                <div className="pt-1">
                  <input type="range" min={0} max={priceCeiling} value={maxPrice} onChange={(e) => setMaxPrice(Number(e.target.value))} className="w-full accent-[#055B75]" />
                  <div className="flex justify-between text-xs text-slate-500 mt-1">
                    <span>Up to</span>
                    <span className="font-semibold text-[#055B75]"><Price amount={maxPrice} /></span>
                  </div>
                </div>
              </FilterGroup>
              <FilterGroup title="Duration" icon={FaRegClock}>
                <div className="space-y-2">
                  {DURATION_BUCKETS.map((b) => (
                    <label key={b.key} className="flex items-center gap-2.5 text-sm text-slate-600 cursor-pointer hover:text-[#055B75]">
                      <input type="checkbox" checked={durationBuckets.has(b.key)} onChange={() => toggleInSet(setDurationBuckets)(b.key)} className="w-4 h-4 rounded border-slate-300 accent-[#055B75]" />
                      {b.label}
                    </label>
                  ))}
                </div>
              </FilterGroup>
              <FilterGroup title="Destination" icon={FaMapMarkerAlt}>
                <CheckboxList options={destinationOptions} selected={selectedDestinations} onToggle={toggleInSet(setSelectedDestinations)} />
              </FilterGroup>
              <FilterGroup title="Departure Port" icon={FaAnchor}>
                <CheckboxList options={portOptions} selected={selectedPorts} onToggle={toggleInSet(setSelectedPorts)} />
              </FilterGroup>
              <FilterGroup title="Cruise Line" icon={FaShip}>
                <CheckboxList options={lineOptions} selected={selectedLines} onToggle={toggleInSet(setSelectedLines)} />
              </FilterGroup>
            </div>
          </div>
        </aside>

        {/* ---- Results column ---- */}
        <main>
          <h1 className="mb-5 text-2xl font-bold text-[#034457]">Find Your Perfect Cruise</h1>

          {/* Sort bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white rounded-xl shadow-sm ring-1 ring-slate-100 px-4 py-3 mb-5">
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-500">Sort by</span>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="text-sm font-semibold text-[#034457] border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#0890BC]">
                <option value="price">Price</option>
                <option value="duration">Duration</option>
                <option value="name">Cruise Line</option>
              </select>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <span><span className="font-bold text-[#055B75]">{filteredCruises.length.toLocaleString()}</span> <span className="text-slate-500">Itineraries Found</span></span>
              <span><span className="font-bold text-[#0890BC]">{totalSailings.toLocaleString()}</span> <span className="text-slate-500">Sailings Found</span></span>
            </div>
          </div>

          {usingFallback && (
            <div className="mb-4 inline-flex items-center gap-2 text-xs font-semibold text-amber-800 bg-amber-100 px-3 py-1.5 rounded-full border border-amber-200">
              <FaExclamationTriangle /> Showing sample data
            </div>
          )}

          {filteredCruises.length === 0 ? (
            <div className="bg-white rounded-2xl ring-1 ring-slate-100 shadow-sm p-12 text-center">
              <div className="w-20 h-20 bg-[#055B75]/10 text-[#055B75] rounded-2xl flex items-center justify-center mx-auto mb-5">
                <FaSearch className="text-3xl" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">No cruises found</h2>
              <p className="text-gray-500 mb-6">Try adjusting your filters or clear them to see all cruises.</p>
              <button onClick={clearAll} className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-br from-[#055B75] to-[#034457] text-white font-semibold rounded-lg hover:shadow-lg transition-all">
                Clear all filters
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              {filteredCruises.map((cruise) => (
                <CruiseResultRow key={cruise.id} cruise={cruise} />
              ))}
            </div>
          )}
        </main>
      </div>

      <Footer />
    </div>
  );
};

/* ---------- Top-bar labeled field ---------- */
const SearchField = ({ label, children, className = '' }) => (
  <div className={className}>
    <label className="block text-[10px] font-bold uppercase tracking-[0.12em] text-[#65B3CF] mb-1">{label}</label>
    {children}
  </div>
);

/* ---------- Single MMT-style result row ---------- */
const CruiseResultRow = ({ cruise }) => {
  const nights = parseNights(cruise.duration);
  const base = toNumber(cruise.priceValue);
  const dests = cruise.destinations || [];
  const ports = cruise.departurePorts || [];
  const from = ports[0] || dests[0] || 'Departure';
  const to = dests[dests.length - 1] || ports[0] || 'Return';
  const primaryDest = dests[0] || 'Cruise';
  const titleBits = [nights ? `${nights} Nights` : null, primaryDest, cruise.name].filter(Boolean).join(' | ');

  return (
    <div className="bg-white rounded-2xl ring-1 ring-slate-100 shadow-sm hover:shadow-lg transition-shadow overflow-hidden">
      {/* Title line */}
      <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 border-b border-slate-100">
        <h3 className="text-base md:text-lg font-bold text-[#034457] leading-tight">{titleBits}</h3>
        {nights && <span className="hidden sm:inline text-xs text-slate-400 whitespace-nowrap">{nights} Night {primaryDest} Cruise</span>}
      </div>

      {/* Middle: image + details + rate table */}
      <div className="flex flex-col lg:flex-row gap-4 p-5">
        <div className="lg:w-56 flex-shrink-0">
          <div className="relative h-40 lg:h-full rounded-xl overflow-hidden">
            <img loading="lazy" decoding="async" src={cruise.image} alt={cruise.name} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#034457]/60 to-transparent" />
            <span className="absolute bottom-2 left-2 text-white text-xs font-semibold drop-shadow">{nights ? `${nights} Night ` : ''}{primaryDest} Cruise</span>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-[#055B75] font-bold mb-3">
            <FaShip className="w-4 h-4" /> {cruise.name}
          </div>
          <div className="space-y-2.5 text-sm">
            <div className="flex items-center gap-2 text-slate-700">
              <span className="font-semibold">{from}</span>
              <FaChevronRight className="w-3 h-3 text-slate-400" />
              <span className="font-semibold">{to}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-500">
              <FaRegClock className="w-3.5 h-3.5 text-[#0890BC]" /> {nights ? `${nights} Nights` : cruise.duration || 'Multiple durations'}
            </div>
            <div className="flex items-start gap-2 text-slate-500">
              <FaMapMarkerAlt className="w-3.5 h-3.5 text-[#0890BC] mt-0.5 flex-shrink-0" />
              <span className="leading-relaxed">
                {dests.slice(0, 5).join(' · ') || 'Ports of call vary by departure date'}
              </span>
            </div>
          </div>
        </div>

        {/* Rate table */}
        <div className="lg:w-64 flex-shrink-0 flex flex-col">
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-3 py-1.5 bg-[#F1FBFD] text-[11px] font-bold uppercase tracking-wider text-[#055B75] border-b border-slate-200">Lowest Rate</div>
            <div className="divide-y divide-slate-100">
              {CABIN_TYPES.map(({ key, mult }) => (
                <div key={key} className="flex items-center justify-between px-3 py-1.5 text-sm">
                  <span className="text-slate-500">{key}</span>
                  <span className="font-semibold text-[#034457]">
                    {base ? <Price amount={Math.round(base * mult)} /> : '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="text-right mt-2">
            <div className="text-[11px] text-slate-400">From</div>
            <div className="text-xl font-bold text-[#055B75] leading-none">
              {base ? <Price amount={base} showCode={true} /> : 'Call for price'}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">per person · excl. taxes &amp; fees</div>
          </div>
        </div>
      </div>

      {/* Bottom offer strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-t border-slate-100 bg-[#FAFDFE]">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1.5"><FaGift className="text-[#0890BC]" /> Buy One Get One Offer</span>
          <span className="inline-flex items-center gap-1.5"><FaTags className="text-[#0890BC]" /> Special Promotions</span>
          <span className="inline-flex items-center gap-1.5"><FaFileInvoiceDollar className="text-[#0890BC]" /> Non Refundable Deposit</span>
        </div>
        <Link
          to={`/itinerary?cruiseId=${cruise.id}`}
          className="inline-flex items-center gap-2 bg-gradient-to-r from-[#055B75] to-[#0890BC] hover:from-[#034457] hover:to-[#055B75] text-white px-5 py-2 rounded-lg text-sm font-semibold transition-all shadow-sm hover:shadow-md whitespace-nowrap"
        >
          <FaCalendarAlt className="w-3.5 h-3.5" /> Show Dates
        </Link>
      </div>
    </div>
  );
};

export default withPageElements(CruiseCards);
