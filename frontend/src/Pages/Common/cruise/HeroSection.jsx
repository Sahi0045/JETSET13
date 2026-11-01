import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarDays, ChevronDown, Clock3, MapPin, Search, Ship } from 'lucide-react';
import ServiceTabs from '../../../Components/ServiceTabs';
import './HeroSection.css';
import { NIGHT_RANGES, monthName, searchOptions, searchQuery } from './searchSailings';
import { usePublishedSailings } from './useSailings';

const Choice = ({ id, label, icon: Icon, value, onChange, children }) => (
  <div className="search-field relative">
    <label htmlFor={id} className="search-label">
      <Icon className="search-icon" />
      <span>{label}</span>
    </label>
    <select id={id} className="search-input" value={value} onChange={(e) => onChange(e.target.value)}>
      {children}
    </select>
    <ChevronDown className="absolute right-3 bottom-3.5 text-gray-400 pointer-events-none" size={16} />
  </div>
);

const HeroSection = () => {
  const navigate = useNavigate();
  const { data: sailings = [] } = usePublishedSailings();
  const options = useMemo(() => searchOptions(sailings), [sailings]);
  const [criteria, setCriteria] = useState({ region: '', line: '', month: '', length: '' });
  const choose = (key) => (value) => setCriteria((current) => ({ ...current, [key]: value }));

  const handleSearch = (e) => {
    e.preventDefault();
    const query = searchQuery(criteria);
    navigate(query ? `/cruises?${query}` : '/cruises');
  };

  return (
    <section className="hero-section">
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: "url('https://images.unsplash.com/photo-1717541262982-731503ac4dc2?q=80&w=1920&auto=format&fit=crop')",
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-[#034457]/70 via-[#055B75]/45 to-[#034457]/80"></div>
      </div>

      <div className="container relative z-10 mx-auto px-4 pt-4 pb-16 sm:px-6 lg:px-8 w-full flex flex-col items-center justify-center">
        <div className="text-center mb-8 space-y-4 w-full max-w-6xl mx-auto">
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-white tracking-tight drop-shadow-2xl">
            Discover Your Perfect
            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-[#9FD6E8] to-[#65B3CF] drop-shadow-lg">
              Cruise Adventure
            </span>
          </h1>

          <p className="text-lg md:text-xl text-white max-w-3xl mx-auto font-medium drop-shadow-lg">
            Pick where and when you'd like to sail. Our team checks today's price with the cruise line and books it for you.
          </p>
        </div>

        <div className="max-w-6xl mx-auto w-full">
          <form onSubmit={handleSearch} className="search-container w-full">
            <ServiceTabs active="cruise" className="-mx-6 md:-mx-7 -mt-6 md:-mt-7 mb-5 pt-3 border-b border-gray-100 bg-transparent" />
            <div className="search-grid">
              <Choice id="cruise-search-region" label="Destination" icon={MapPin} value={criteria.region} onChange={choose('region')}>
                <option value="">Any destination</option>
                {options.regions.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
              </Choice>
              <Choice id="cruise-search-line" label="Cruise line" icon={Ship} value={criteria.line} onChange={choose('line')}>
                <option value="">Any cruise line</option>
                {options.lines.map((line) => <option key={line} value={line}>{line}</option>)}
              </Choice>
              <Choice id="cruise-search-month" label="Month" icon={CalendarDays} value={criteria.month} onChange={choose('month')}>
                <option value="">Any month</option>
                {options.months.map((month) => <option key={month} value={month}>{monthName(month)}</option>)}
              </Choice>
              <Choice id="cruise-search-length" label="Length" icon={Clock3} value={criteria.length} onChange={choose('length')}>
                <option value="">Any length</option>
                {NIGHT_RANGES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
              </Choice>
            </div>

            <button type="submit" className="search-submit">
              <Search className="w-5 h-5 mr-2" />
              <span>Search Cruises</span>
            </button>
          </form>
          <p className="mt-4 text-center">
            <Link to="/cruises" className="text-sm font-semibold text-white underline underline-offset-4 decoration-white/60 hover:decoration-white drop-shadow">
              Browse all sailings
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
