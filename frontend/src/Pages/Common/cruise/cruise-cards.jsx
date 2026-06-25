import React, { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { FaMapMarkerAlt, FaCalendarAlt, FaArrowLeft, FaShip, FaSearch, FaSpinner, FaExclamationTriangle, FaAnchor, FaStar, FaChevronRight } from 'react-icons/fa';
import { loadCruiseLines } from './data/cruiselinesLoader';
import destinationsData from './data/destinations.json';
import Navbar from '../Navbar';
import Footer from '../Footer';
import withPageElements from '../PageWrapper';
import Price from '../../../Components/Price';
import currencyService from '../../../Services/CurrencyService';

const CruiseCards = () => {
  const [searchParams] = useSearchParams();
  const cruiseLineParam = searchParams.get('cruiseLine');
  const destinationParam = searchParams.get('destination');
  const countryParam = searchParams.get('country');

  const [title, setTitle] = useState("All Cruises");
  const [filteredCruises, setFilteredCruises] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [usingFallback, setUsingFallback] = useState(false);

  const applyFiltersAndTitle = (cruises) => {
    let filtered = cruises;
    let nextTitle = "All Cruises";

    if (cruiseLineParam) {
      filtered = filtered.filter(cruise =>
        (cruise.name || '').toLowerCase().includes(cruiseLineParam.toLowerCase())
      );
      nextTitle = `${cruiseLineParam} Cruises`;
    }

    if (destinationParam) {
      const selectedDestination = destinationsData.destinations.find(dest =>
        dest.name.toLowerCase() === destinationParam.toLowerCase()
      );

      if (selectedDestination) {
        filtered = filtered.filter(cruise =>
          selectedDestination.cruiseLines.includes(cruise.name)
        );
        nextTitle = `${selectedDestination.name} Cruises`;
      }
    }

    if (countryParam) {
      filtered = filtered.filter(cruise =>
        (cruise.departurePorts || []).some(port =>
          (port || '').toLowerCase().includes(countryParam.toLowerCase())
        )
      );
      nextTitle = `Cruises from ${countryParam}`;
    }

    setTitle(nextTitle);
    return filtered;
  };

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    // Kick off the fallback load in parallel so the catch branch doesn't have
    // to wait for the JSON parse after the API has already failed.
    const fallbackPromise = loadCruiseLines();

    const fetchCruiseData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/cruises', { signal: controller.signal });

        if (!response.ok) {
          throw new Error('Failed to fetch cruise data');
        }

        const apiResponse = await response.json();
        if (cancelled) return;

        const transformedCruises = apiResponse.data.map((cruise, idx) => ({
          id: cruise.id || `${cruise.cruise_line || 'cruise'}-${cruise.departure_date || ''}-${cruise.departure_port || ''}-${idx}`,
          name: cruise.cruise_line,
          image: cruise.image || '/images/default-cruise.jpg',
          duration: `${cruise.duration} Days`,
          description: cruise.name,
          destinations: cruise.destinations,
          departurePorts: [cruise.departure_port],
          price: cruise.price_per_person,
          priceValue: cruise.price_per_person,
          departureDate: cruise.departure_date
        }));

        setFilteredCruises(applyFiltersAndTitle(transformedCruises));
        setUsingFallback(false);
      } catch (apiError) {
        if (cancelled || apiError.name === 'AbortError') return;
        console.error('Error fetching cruise data:', apiError);
        setError('Unable to fetch live cruise data. Using fallback data.');
        setUsingFallback(true);

        const fallback = await fallbackPromise;
        if (cancelled) return;
        setFilteredCruises(applyFiltersAndTitle(fallback.cruiseLines));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchCruiseData();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [cruiseLineParam, destinationParam, countryParam]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(180deg, #F0FAFC 0%, #E3F1F6 100%)' }}>
        <div className="fixed top-0 left-0 right-0 z-50">
          <Navbar forceScrolled={true} />
        </div>
        <div className="text-center mt-16">
          <FaSpinner className="text-[#055B75] text-5xl animate-spin mx-auto mb-4" />
          <p className="text-gray-600 font-medium">Loading cruise data...</p>
        </div>
      </div>
    );
  }

  if (error && !usingFallback) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(180deg, #F0FAFC 0%, #E3F1F6 100%)' }}>
        <div className="fixed top-0 left-0 right-0 z-50">
          <Navbar forceScrolled={true} />
        </div>
        <div className="text-center max-w-md mx-auto px-4 mt-16">
          <div className="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-5">
            <FaExclamationTriangle className="text-3xl" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Error Loading Data</h2>
          <p className="text-gray-500 mb-6">{error}</p>
          <Link to="/" className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-br from-[#055B75] to-[#034457] text-white font-semibold rounded-lg hover:shadow-lg transition-all">
            <FaArrowLeft /> Back to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(180deg, #F0FAFC 0%, #E3F1F6 100%)' }}>
      <div className="fixed top-0 left-0 right-0 z-50">
        <Navbar forceScrolled={true} />
      </div>

      {/* Hero / Title banner */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#034457] via-[#055B75] to-[#0890BC] pt-[140px] pb-20 md:pb-24 text-center">
        <div className="absolute inset-0 opacity-10 pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, #fff 1px, transparent 0)', backgroundSize: '26px 26px' }} />
        <div className="relative z-10 max-w-4xl mx-auto px-4">
          <Link to="/cruises" className="inline-flex items-center gap-2 text-white/80 hover:text-white text-sm font-medium mb-4 transition-colors">
            <FaArrowLeft /> All Cruises
          </Link>
          <h1 className="text-3xl md:text-5xl font-bold text-white mb-2 leading-tight tracking-tight flex items-center justify-center gap-3">
            <FaAnchor className="hidden md:inline text-[#65B3CF]" />
            {title}
          </h1>
          <p className="text-white/85 text-base md:text-lg">
            {filteredCruises.length} {filteredCruises.length === 1 ? 'voyage' : 'voyages'} available
          </p>
          {usingFallback && (
            <span className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-amber-800 bg-amber-100 px-3 py-1.5 rounded-full border border-amber-200">
              <FaExclamationTriangle /> Showing sample data
            </span>
          )}
        </div>
      </section>

      {/* Main content — floats up over hero */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-12 relative z-20 pb-16">
        {filteredCruises.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_15px_30px_-5px_rgba(5,91,117,0.12)] p-12 text-center">
            <div className="w-20 h-20 bg-[#055B75]/10 text-[#055B75] rounded-2xl flex items-center justify-center mx-auto mb-5">
              <FaSearch className="text-3xl" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">No cruises found</h2>
            <p className="text-gray-500 mb-6">Try adjusting your search criteria or browse all cruises.</p>
            <Link to="/cruises" className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-br from-[#055B75] to-[#034457] text-white font-semibold rounded-lg hover:shadow-lg transition-all">
              View All Cruises <FaChevronRight />
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {filteredCruises.map((cruise) => (
              <div
                key={cruise.id}
                className="group bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-[0_15px_30px_-5px_rgba(5,91,117,0.12)] hover:shadow-[0_25px_50px_-12px_rgba(5,91,117,0.25)] hover:-translate-y-1 transition-all duration-300 flex flex-col"
              >
                {/* Image */}
                <div className="relative h-52 overflow-hidden flex-shrink-0">
                  <img loading="lazy" decoding="async"
                    src={cruise.image}
                    alt={cruise.name}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#034457]/85 via-[#034457]/25 to-transparent"></div>

                  {/* Cruise line badge */}
                  <div className="absolute top-4 left-4 inline-flex items-center gap-1.5 bg-white/95 backdrop-blur-sm text-[#055B75] py-1.5 px-3.5 rounded-full text-sm font-bold shadow-md">
                    <FaShip className="text-xs" /> {cruise.name}
                  </div>

                  {/* Duration chip */}
                  <div className="absolute top-4 right-4 inline-flex items-center gap-1.5 bg-[#055B75] text-white py-1.5 px-3 rounded-full text-xs font-semibold shadow-md">
                    <FaCalendarAlt className="text-[10px]" /> {cruise.duration}
                  </div>

                  {/* Title overlay */}
                  <div className="absolute bottom-0 left-0 right-0 p-5 text-white">
                    <h3 className="text-xl md:text-2xl font-bold drop-shadow-lg leading-tight">
                      {cruise.description}
                    </h3>
                  </div>
                </div>

                {/* Body */}
                <div className="p-5 md:p-6 flex flex-col flex-grow">
                  <div className="flex items-center gap-2 mb-4 pb-4 border-b border-gray-100">
                    <div className="w-8 h-8 rounded-lg bg-[#055B75]/10 text-[#055B75] flex items-center justify-center flex-shrink-0">
                      <FaAnchor className="text-xs" />
                    </div>
                    <span className="text-sm font-semibold text-gray-700">{cruise.name}</span>
                  </div>

                  {/* Details */}
                  <div className="space-y-3.5 mb-5 flex-grow">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 text-[#055B75] bg-[#F0FAFC] rounded-lg flex items-center justify-center flex-shrink-0 border border-[#D1E9F0]">
                        <FaMapMarkerAlt className="text-sm" />
                      </div>
                      <div className="min-w-0">
                        <span className="block text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">Destinations</span>
                        <span className="text-gray-600 text-sm leading-relaxed">
                          {cruise.destinations.slice(0, 4).map((dest, idx, arr) => (
                            <span key={dest}>
                              <span className="text-[#055B75] font-medium">{dest}</span>
                              {idx < arr.length - 1 && <span className="text-gray-400">, </span>}
                            </span>
                          ))}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 text-[#055B75] bg-[#F0FAFC] rounded-lg flex items-center justify-center flex-shrink-0 border border-[#D1E9F0]">
                        <FaShip className="text-sm" />
                      </div>
                      <div className="min-w-0">
                        <span className="block text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">Departure Ports</span>
                        <span className="text-gray-600 text-sm leading-relaxed">
                          {cruise.departurePorts.slice(0, 2).map((port, idx, arr) => (
                            <span key={port}>
                              <span className="text-[#055B75] font-medium">{port}</span>
                              {idx < arr.length - 1 && <span className="text-gray-400">, </span>}
                            </span>
                          ))}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-4 border-t border-gray-100 gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">Starting from</div>
                      <div className="text-2xl font-bold text-[#055B75]">
                        <Price amount={cruise.priceValue} showCode={true} />
                      </div>
                    </div>
                    <Link
                      to={`/itinerary?cruiseId=${cruise.id}`}
                      className="inline-flex items-center gap-2 bg-gradient-to-br from-[#055B75] to-[#034457] hover:shadow-lg hover:shadow-[#055B75]/30 text-white px-5 py-3 rounded-xl font-semibold transition-all duration-300 hover:-translate-y-0.5 whitespace-nowrap"
                    >
                      View Details
                      <FaChevronRight className="w-3 h-3 transition-transform duration-300 group-hover:translate-x-1" />
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
};

export default withPageElements(CruiseCards);
