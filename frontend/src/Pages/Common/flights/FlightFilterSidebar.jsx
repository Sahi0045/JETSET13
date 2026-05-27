import React from 'react';
import { Filter, Moon, Sunrise, Sun, Sunset, Briefcase, ShieldCheck } from 'lucide-react';
import currencyService from '../../../Services/CurrencyService';

const DEPARTURE_TIMES = [
  { value: 'early_morning', label: 'Before 6 AM', sublabel: 'Early Morning', Icon: Moon },
  { value: 'morning', label: '6 AM - 12 PM', sublabel: 'Morning', Icon: Sunrise },
  { value: 'afternoon', label: '12 PM - 6 PM', sublabel: 'Afternoon', Icon: Sun },
  { value: 'evening', label: '6 PM - 9 PM', sublabel: 'Evening', Icon: Sunset },
];

const BAGGAGE_OPTIONS = [
  { value: 'any', label: 'Any', desc: 'Show all flights' },
  { value: 'included', label: 'Check-in Baggage Included', desc: 'Flights with checked baggage' },
  { value: 'cabin_only', label: 'Cabin Baggage Only', desc: 'No checked baggage' },
];

const REFUNDABLE_OPTIONS = [
  { value: 'any', label: 'All Fares' },
  { value: 'yes', label: 'Refundable Only' },
  { value: 'no', label: 'Non-Refundable Only' },
];

const STOP_OPTIONS = [
  { value: 'any', label: 'Any' },
  { value: '0', label: 'Non-stop' },
  { value: '1', label: '1 Stop' },
];

function FlightFilterSidebar({
  filters,
  priceRangeBounds,
  airlines,
  airlineStats,
  onFilterChange,
  onToggleAirline,
  onResetAll
}) {
  const currencySymbol = currencyService.getCurrencySymbol();

  const popularFilters = [
    { label: 'Non-Stop', action: () => onFilterChange('stops', filters.stops === '0' ? 'any' : '0'), active: filters.stops === '0' },
    { label: 'Refundable', action: () => onFilterChange('refundable', filters.refundable === 'yes' ? 'any' : 'yes'), active: filters.refundable === 'yes' },
    { label: 'With Baggage', action: () => onFilterChange('baggage', filters.baggage === 'included' ? 'any' : 'included'), active: filters.baggage === 'included' },
    { label: 'Morning Dep.', action: () => onFilterChange('departureTime', filters.departureTime === 'morning' ? 'any' : 'morning'), active: filters.departureTime === 'morning' },
  ];

  return (
    <div className="hidden md:block w-full md:w-[280px] lg:w-[300px] flex-shrink-0">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">

        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-[#055B75]" />
            <span className="text-sm font-bold text-gray-800 uppercase tracking-wide">Filters</span>
          </div>
          <button
            onClick={onResetAll}
            className="text-xs font-semibold text-[#055B75] hover:text-[#034457] hover:underline transition-colors"
          >
            RESET ALL
          </button>
        </div>

        <div className="px-5 py-4 border-b border-gray-100">
          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Popular Filters</h4>
          <div className="flex flex-wrap gap-2">
            {popularFilters.map((chip, idx) => (
              <button
                key={idx}
                onClick={chip.action}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-200 ${chip.active
                  ? 'bg-[#055B75] text-white border-[#055B75] shadow-sm'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-[#055B75] hover:text-[#055B75]'
                  }`}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>

        <div className="px-5 py-4 border-b border-gray-100">
          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Price Range</h4>
          <div className="mb-3">
            <div className="flex items-center gap-2 mb-4">
              <div className="flex-1">
                <label className="text-[10px] text-gray-400 font-medium mb-1 block">MIN</label>
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">{currencySymbol}</span>
                  <input
                    type="number"
                    min={0}
                    max={priceRangeBounds.max}
                    step="500"
                    value={filters.price[0]}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      if (!isNaN(val)) onFilterChange('price', [val, filters.price[1]]);
                    }}
                    className="w-full pl-5 pr-2 py-1.5 text-xs border border-gray-200 rounded-md text-gray-700 focus:border-[#055B75] focus:ring-1 focus:ring-[#055B75] outline-none"
                  />
                </div>
              </div>
              <span className="text-gray-300 mt-4">-</span>
              <div className="flex-1">
                <label className="text-[10px] text-gray-400 font-medium mb-1 block">MAX</label>
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">{currencySymbol}</span>
                  <input
                    type="number"
                    min={0}
                    max={priceRangeBounds.max}
                    step="500"
                    value={filters.price[1]}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      if (!isNaN(val)) onFilterChange('price', [filters.price[0], val]);
                    }}
                    className="w-full pl-5 pr-2 py-1.5 text-xs border border-gray-200 rounded-md text-gray-700 focus:border-[#055B75] focus:ring-1 focus:ring-[#055B75] outline-none"
                  />
                </div>
              </div>
            </div>
            <div className="relative h-6 mx-1">
              <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-1.5 bg-gray-200 rounded-full" />
              <div
                className="absolute top-1/2 -translate-y-1/2 h-1.5 bg-[#055B75] rounded-full"
                style={{
                  left: `${((filters.price[0] - priceRangeBounds.min) / (priceRangeBounds.max - priceRangeBounds.min || 1)) * 100}%`,
                  right: `${100 - ((filters.price[1] - priceRangeBounds.min) / (priceRangeBounds.max - priceRangeBounds.min || 1)) * 100}%`
                }}
              />
              <input
                type="range"
                min={priceRangeBounds.min}
                max={priceRangeBounds.max}
                step="500"
                value={filters.price[0]}
                onChange={(e) => onFilterChange('price', [Math.min(parseInt(e.target.value) || priceRangeBounds.min, filters.price[1] - 500), filters.price[1]])}
                className="absolute top-0 left-0 w-full h-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[#055B75] [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:relative [&::-webkit-slider-thumb]:z-30 [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-[#055B75] [&::-moz-range-thumb]:shadow-md [&::-moz-range-thumb]:cursor-pointer"
                style={{ zIndex: filters.price[0] > 25000 ? 20 : 10 }}
              />
              <input
                type="range"
                min={priceRangeBounds.min}
                max={priceRangeBounds.max}
                step="500"
                value={filters.price[1]}
                onChange={(e) => onFilterChange('price', [filters.price[0], Math.max(parseInt(e.target.value) || priceRangeBounds.max, filters.price[0] + 500)])}
                className="absolute top-0 left-0 w-full h-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[#055B75] [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:relative [&::-webkit-slider-thumb]:z-30 [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-[#055B75] [&::-moz-range-thumb]:shadow-md [&::-moz-range-thumb]:cursor-pointer"
                style={{ zIndex: filters.price[1] < 25000 ? 20 : 10 }}
              />
            </div>
            <div className="flex justify-between mt-1.5">
              <span className="text-[10px] text-gray-400">{currencySymbol}{priceRangeBounds.min.toLocaleString()}</span>
              <span className="text-[10px] text-gray-400">{currencySymbol}{priceRangeBounds.max.toLocaleString()}</span>
            </div>
          </div>
        </div>

        <div className="px-5 py-4 border-b border-gray-100">
          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Stops</h4>
          <div className="grid grid-cols-3 gap-1.5">
            {STOP_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => onFilterChange('stops', opt.value)}
                className={`px-2 py-2 rounded-lg text-xs font-medium border text-center transition-all duration-200 ${filters.stops === opt.value
                  ? 'bg-[#055B75] text-white border-[#055B75] shadow-sm'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-[#65B3CF]'
                  }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => onFilterChange('stops', filters.stops === '2' ? 'any' : '2')}
            className={`mt-1.5 w-full px-2 py-2 rounded-lg text-xs font-medium border text-center transition-all duration-200 ${filters.stops === '2'
              ? 'bg-[#055B75] text-white border-[#055B75] shadow-sm'
              : 'bg-white text-gray-600 border-gray-200 hover:border-[#65B3CF]'
              }`}
          >
            2+ Stops
          </button>
        </div>

        <div className="px-5 py-4 border-b border-gray-100">
          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Departure Time</h4>
          <div className="grid grid-cols-2 gap-2">
            {DEPARTURE_TIMES.map(({ value, label, sublabel, Icon }) => {
              const isActive = filters.departureTime === value;
              return (
                <button
                  key={value}
                  onClick={() => onFilterChange('departureTime', isActive ? 'any' : value)}
                  className={`flex flex-col items-center p-2.5 rounded-lg border text-center transition-all duration-200 ${isActive
                    ? 'bg-[#F0FAFC] border-[#055B75] text-[#055B75]'
                    : 'bg-white border-gray-200 text-gray-500 hover:border-[#65B3CF]'
                    }`}
                >
                  <span className={`mb-1 ${isActive ? 'text-[#055B75]' : 'text-gray-400'}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="text-[10px] font-semibold leading-tight">{sublabel}</span>
                  <span className="text-[9px] text-gray-400 mt-0.5">{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="px-5 py-4 border-b border-gray-100">
          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Briefcase className="h-3.5 w-3.5 text-gray-400" />
            Baggage
          </h4>
          <div className="space-y-1.5">
            {BAGGAGE_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`flex items-start gap-2.5 p-2.5 rounded-lg cursor-pointer transition-all duration-200 ${filters.baggage === opt.value
                  ? 'bg-[#F0FAFC] border border-[#055B75]/20'
                  : 'hover:bg-gray-50 border border-transparent'
                  }`}
              >
                <input
                  type="radio"
                  name="baggage"
                  className="mt-0.5 w-3.5 h-3.5 text-[#055B75] border-gray-300 focus:ring-[#055B75]"
                  checked={filters.baggage === opt.value}
                  onChange={() => onFilterChange('baggage', opt.value)}
                />
                <div>
                  <div className="text-xs font-medium text-gray-700">{opt.label}</div>
                  <div className="text-[10px] text-gray-400">{opt.desc}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="px-5 py-4 border-b border-gray-100">
          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-gray-400" />
            Fare Type
          </h4>
          <div className="space-y-1.5">
            {REFUNDABLE_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-all duration-200 ${filters.refundable === opt.value
                  ? 'bg-[#F0FAFC] border border-[#055B75]/20'
                  : 'hover:bg-gray-50 border border-transparent'
                  }`}
              >
                <input
                  type="radio"
                  name="refundable"
                  className="w-3.5 h-3.5 text-[#055B75] border-gray-300 focus:ring-[#055B75]"
                  checked={filters.refundable === opt.value}
                  onChange={() => onFilterChange('refundable', opt.value)}
                />
                <span className="text-xs font-medium text-gray-700">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="px-5 py-4">
          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Airlines</h4>
          {airlines.length > 0 ? (
            <div className="space-y-0.5 max-h-52 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
              {airlines.map(airline => {
                const stats = airlineStats.get(airline);
                const minPrice = stats ? stats.minPrice : null;
                return (
                  <label
                    key={airline}
                    className={`flex items-center justify-between px-2.5 py-2 rounded-lg cursor-pointer transition-all duration-200 ${filters.airlines.includes(airline)
                      ? 'bg-[#F0FAFC]'
                      : 'hover:bg-gray-50'
                      }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        className="w-3.5 h-3.5 text-[#055B75] border-gray-300 rounded focus:ring-[#055B75]"
                        checked={filters.airlines.includes(airline)}
                        onChange={() => onToggleAirline(airline)}
                      />
                      <span className="text-xs text-gray-700 font-medium">{airline}</span>
                    </div>
                    {minPrice !== null && (
                      <span className="text-[10px] text-gray-400 font-medium">
                        {currencySymbol}{Math.round(minPrice).toLocaleString()}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-gray-400 italic">No airlines to filter</p>
          )}
        </div>

      </div>
    </div>
  );
}

export default React.memo(FlightFilterSidebar);
