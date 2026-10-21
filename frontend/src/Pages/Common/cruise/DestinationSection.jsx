import React, { useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { SEA_PHOTO } from './catalog';
import { regionCards } from './searchSailings';
import { usePublishedSailings } from './useSailings';

// Cruise destinations: a horizontally scrollable row of
// destination cards with circular carousel arrows.
const DestinationSection = () => {
  const scrollRef = useRef(null);
  const { data: sailings = [] } = usePublishedSailings();
  const destinations = useMemo(() => regionCards(sailings), [sailings]);

  const scrollBy = (dir) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.min(el.clientWidth * 0.8, 640), behavior: 'smooth' });
  };

  if (!destinations.length) return null;

  return (
    <section className="py-8 md:py-10 bg-[#F4F7F8]">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-[#034457] tracking-tight">
              Cruise Destinations
            </h2>
            <p className="text-slate-500 mt-1">Where our listed sailings go</p>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <button
              onClick={() => scrollBy(-1)}
              aria-label="Previous"
              className="w-10 h-10 rounded-full bg-white border border-slate-200 text-[#055B75] flex items-center justify-center shadow-sm hover:bg-[#055B75] hover:text-white hover:border-[#055B75] transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={() => scrollBy(1)}
              aria-label="Next"
              className="w-10 h-10 rounded-full bg-white border border-slate-200 text-[#055B75] flex items-center justify-center shadow-sm hover:bg-[#055B75] hover:text-white hover:border-[#055B75] transition-colors"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div
          ref={scrollRef}
          className="flex gap-5 overflow-x-auto pb-4 snap-x snap-mandatory scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          {destinations.map((destination) => (
            <Link
              key={destination.key}
              to={`/cruises?region=${encodeURIComponent(destination.key)}`}
              className="group relative flex-shrink-0 w-[240px] md:w-[280px] snap-start rounded-2xl overflow-hidden shadow-sm ring-1 ring-slate-100 bg-white hover:shadow-xl transition-all duration-300"
            >
              <div className="relative h-[260px] md:h-[300px] overflow-hidden">
                <img
                  loading="lazy"
                  decoding="async"
                  src={destination.photo?.url || SEA_PHOTO}
                  alt=""
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#034457]/90 via-[#034457]/10 to-transparent"></div>
                <div className="absolute bottom-0 left-0 right-0 p-4 text-white">
                  <h3 className="text-lg font-bold leading-tight">{destination.name}</h3>
                  <p className="text-xs text-white/75 mt-0.5">{destination.count} {destination.count === 1 ? 'sailing' : 'sailings'}</p>
                  <p className="text-sm font-semibold text-white mt-1">{destination.price.amount}</p>
                  <p className="text-[11px] leading-snug text-white/70">{destination.price.note}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div className="text-center mt-6">
          <Link
            to="/cruises"
            className="inline-flex items-center gap-2 px-7 py-3 rounded-full border border-[#055B75]/30 text-[#055B75] font-semibold hover:bg-[#055B75] hover:text-white transition-colors"
          >
            See all sailings
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  );
};

export default DestinationSection;
