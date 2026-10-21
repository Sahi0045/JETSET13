import React from 'react';

// MMT-style "Cruise" feature banner: a large hero image with brand overlay text
// on the left, and a row of four feature tiles on the right.
const TILES = [
  {
    caption: 'Amenities for a fun-filled experience',
    image: 'https://images.unsplash.com/photo-1599640842225-85d111c60e6b?q=80&w=600&auto=format&fit=crop',
  },
  {
    caption: 'Dining with stunning ocean views',
    image: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?q=80&w=600&auto=format&fit=crop',
  },
  {
    caption: 'World-class performances',
    image: 'https://images.unsplash.com/photo-1503095396549-807759245b35?q=80&w=600&auto=format&fit=crop',
  },
  {
    caption: 'Stays for every style & budget',
    image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?q=80&w=600&auto=format&fit=crop',
  },
];

const CruiseFeatureBanner = () => {
  return (
    <div className="max-w-7xl mx-auto px-4">
      <div className="rounded-3xl overflow-hidden shadow-[0_20px_60px_-25px_rgba(3,68,87,0.4)] ring-1 ring-[#055B75]/10 bg-white">
        <div className="flex flex-col lg:flex-row">
          {/* Left: hero image with overlay text */}
          <div className="relative lg:w-1/2 min-h-[280px] lg:min-h-[380px]">
            <img
              src="https://images.unsplash.com/photo-1548574505-5e239809ee19?q=80&w=1200&auto=format&fit=crop"
              alt="Luxury cruise ship"
              loading="lazy"
              decoding="async"
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#034457]/85 via-[#055B75]/45 to-transparent"></div>
            <div className="relative z-10 h-full flex flex-col justify-center p-8 lg:p-12">
              <h2 className="text-5xl lg:text-6xl font-extrabold text-white tracking-tight drop-shadow-lg">
                Cruise
              </h2>
              <p className="mt-3 text-lg text-white/90 font-medium max-w-xs">
                From search to sail, guided by experts
              </p>
            </div>
          </div>

          {/* Right: four feature tiles */}
          <div className="lg:w-1/2 grid grid-cols-2 sm:grid-cols-4 gap-0">
            {TILES.map((tile, i) => (
              <div key={i} className="relative min-h-[140px] lg:min-h-[190px] group overflow-hidden">
                <img
                  src={tile.image}
                  alt={tile.caption}
                  loading="lazy"
                  decoding="async"
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#034457]/85 via-[#034457]/25 to-transparent"></div>
                <p className="absolute bottom-0 left-0 right-0 p-3 text-white text-xs sm:text-[13px] font-semibold leading-snug">
                  {tile.caption}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CruiseFeatureBanner;
