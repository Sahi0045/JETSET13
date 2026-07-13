import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { loadCruiseLines } from './data/cruiselinesLoader';
import { FaStar, FaShip } from 'react-icons/fa';
import Price from '../../../Components/Price';

// MMT-style "Our Featured Cruise Lines": white panel with cards that have a ship
// photo, a circular cruise-line badge overlapping the image, name and price.
const CruiseLineSection = () => {
  const [cruiseLines, setCruiseLines] = useState([]);

  useEffect(() => {
    let cancelled = false;
    loadCruiseLines().then((data) => {
      if (!cancelled) setCruiseLines((data.cruiseLines || []).slice(0, 6));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="py-10 md:py-14 bg-[#F4F7F8]">
      <div className="max-w-7xl mx-auto px-4">
        <div className="bg-white rounded-3xl shadow-[0_20px_60px_-30px_rgba(3,68,87,0.35)] ring-1 ring-slate-100 p-6 md:p-10">
          <div className="mb-8">
            <h2 className="text-2xl md:text-3xl font-bold text-[#034457] tracking-tight">
              Our Featured Cruise Lines
            </h2>
            <p className="text-slate-500 mt-1">
              Authorized worldwide sellers for all major cruise liners
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
            {cruiseLines.map((cruiseLine) => (
              <div
                key={cruiseLine.id}
                className="group rounded-2xl overflow-hidden bg-white ring-1 ring-slate-100 shadow-sm hover:shadow-xl transition-all duration-300"
              >
                <div className="relative h-44 overflow-hidden">
                  <img
                    loading="lazy"
                    decoding="async"
                    src={cruiseLine.image}
                    alt={cruiseLine.name}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#034457]/40 to-transparent"></div>
                  {/* Circular cruise-line badge overlapping the image bottom edge */}
                  <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 w-14 h-14 rounded-full bg-white shadow-md ring-1 ring-slate-100 flex items-center justify-center">
                    <FaShip className="w-6 h-6 text-[#055B75]" />
                  </div>
                </div>

                <div className="pt-10 pb-6 px-5 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1.5">
                    <FaStar className="text-[#F5B301] w-3.5 h-3.5" />
                    <span className="text-sm font-semibold text-slate-600">5.0</span>
                  </div>
                  <h4 className="text-lg font-bold text-[#034457]">{cruiseLine.name}</h4>
                  <p className="text-sm text-slate-500 mt-1">
                    Starting from{' '}
                    <span className="font-semibold text-[#055B75]">
                      <Price amount={String(cruiseLine.price).replace(/[^0-9.]/g, '')} />
                    </span>{' '}
                    per person
                  </p>
                  <Link
                    to={`/cruises?cruiseLine=${encodeURIComponent(cruiseLine.name)}`}
                    className="mt-4 inline-flex items-center justify-center px-6 py-2.5 rounded-full bg-gradient-to-r from-[#055B75] to-[#0890BC] text-white text-sm font-semibold hover:from-[#034457] hover:to-[#055B75] transition-all shadow-sm hover:shadow-md"
                  >
                    Explore
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default CruiseLineSection;
