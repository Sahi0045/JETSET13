import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { FaShip } from 'react-icons/fa';
import { SEA_PHOTO } from './catalog';
import { lineCards, searchQuery } from './searchSailings';
import { usePublishedSailings } from './useSailings';

// MMT-style "Our Featured Cruise Lines": white panel with cards that have a ship
// photo, a circular cruise-line badge overlapping the image, name and price.
const CruiseLineSection = () => {
  const { data: sailings = [] } = usePublishedSailings();
  const cruiseLines = useMemo(() => lineCards(sailings).slice(0, 6), [sailings]);

  if (!cruiseLines.length) return null;

  return (
    <section className="py-8 md:py-10 bg-[#F4F7F8]">
      <div className="max-w-7xl mx-auto px-4">
        <div className="bg-white rounded-3xl shadow-[0_20px_60px_-30px_rgba(3,68,87,0.35)] ring-1 ring-slate-100 p-4 sm:p-6 md:p-10">
          <div className="mb-6 md:mb-8">
            <h2 className="text-2xl md:text-3xl font-bold text-[#034457] tracking-tight">
              Our Featured Cruise Lines
            </h2>
            <p className="text-slate-500 mt-1">
              Lines with sailings listed now
            </p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6 md:gap-8">
            {cruiseLines.map((cruiseLine) => (
              <Link
                key={cruiseLine.key}
                to={`/cruises?${searchQuery({ line: cruiseLine.name })}`}
                className="group rounded-2xl overflow-hidden bg-white ring-1 ring-slate-100 shadow-sm hover:shadow-xl transition-all duration-300"
              >
                <div className="relative h-24 sm:h-36 md:h-44">
                  <div className="absolute inset-0 overflow-hidden">
                    <img
                      loading="lazy"
                      decoding="async"
                      src={cruiseLine.photo?.url || SEA_PHOTO}
                      alt=""
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#034457]/40 to-transparent"></div>
                  </div>
                  <div className="absolute -bottom-6 md:-bottom-7 left-1/2 -translate-x-1/2 w-12 h-12 md:w-14 md:h-14 rounded-full bg-white shadow-md ring-1 ring-slate-100 flex items-center justify-center overflow-hidden">
                    {cruiseLine.logo
                      ? <img src={cruiseLine.logo} alt={`${cruiseLine.name} logo`} className="w-9 h-9 md:w-11 md:h-11 object-contain" />
                      : <FaShip className="w-5 h-5 md:w-6 md:h-6 text-[#055B75]" />}
                  </div>
                </div>

                <div className="pt-8 md:pt-10 pb-4 md:pb-6 px-3 md:px-5 text-center">
                  <h3 className="text-sm sm:text-base md:text-lg font-bold text-[#034457] leading-tight">{cruiseLine.name}</h3>
                  <p className="text-xs text-slate-400 mt-1">{cruiseLine.count} {cruiseLine.count === 1 ? 'sailing' : 'sailings'}</p>
                  <p className="text-sm font-semibold text-[#055B75] mt-1">{cruiseLine.price.amount}</p>
                  <span className="mt-3 md:mt-4 inline-flex items-center justify-center px-4 md:px-6 py-2 rounded-full bg-gradient-to-r from-[#055B75] to-[#0890BC] text-white text-xs md:text-sm font-semibold group-hover:from-[#034457] group-hover:to-[#055B75] transition-all shadow-sm">
                    See sailings
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default CruiseLineSection;
