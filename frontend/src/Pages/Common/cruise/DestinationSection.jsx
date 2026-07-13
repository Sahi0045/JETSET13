import React, { useRef } from 'react';
import { Link } from 'react-router-dom';
import destinationsData from './data/destinations.json';
import { FaStar } from 'react-icons/fa';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Price from '../../../Components/Price';

// MMT-style "Most-booked Cruise Destinations": a horizontally scrollable row of
// destination cards with circular carousel arrows.
const DestinationSection = () => {
  const scrollRef = useRef(null);
  const destinations = destinationsData.destinations.slice(0, 10);

  const scrollBy = (dir) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.min(el.clientWidth * 0.8, 640), behavior: 'smooth' });
  };

  return (
    <section className="py-10 md:py-14 bg-[#F4F7F8]">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-[#034457] tracking-tight">
              Most-booked Cruise Destinations
            </h2>
            <p className="text-slate-500 mt-1">Handpicked voyages travelers love most</p>
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
              key={destination.id}
              to={`/cruises?destination=${encodeURIComponent(destination.name)}&country=${encodeURIComponent(destination.country)}`}
              className="group relative flex-shrink-0 w-[260px] md:w-[300px] snap-start rounded-2xl overflow-hidden shadow-sm ring-1 ring-slate-100 bg-white hover:shadow-xl transition-all duration-300"
            >
              <div className="relative h-[300px] md:h-[340px] overflow-hidden">
                <img
                  loading="lazy"
                  decoding="async"
                  src={destination.image}
                  alt={destination.name}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#034457]/90 via-[#034457]/10 to-transparent"></div>
                <div className="absolute top-3 right-3 flex items-center gap-1 bg-white/95 backdrop-blur px-2.5 py-1 rounded-full text-xs font-bold text-[#034457] shadow-sm">
                  <FaStar className="text-[#F5B301] w-3 h-3" />
                  {destination.rating}
                </div>
                <div className="absolute bottom-0 left-0 right-0 p-4 text-white">
                  <h4 className="text-lg font-bold leading-tight">{destination.name}</h4>
                  <p className="text-sm text-white/85 mt-1">
                    Starting from <Price amount={destination.price} /> per person
                  </p>
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
            View all destinations
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  );
};

export default DestinationSection;
