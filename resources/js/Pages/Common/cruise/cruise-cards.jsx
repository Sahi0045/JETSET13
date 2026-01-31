import React, { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { FaMapMarkerAlt, FaCalendar, FaArrowLeft, FaShip, FaSearch, FaSpinner, FaExclamationTriangle } from 'react-icons/fa';
// import './cruise-cards.css';
import cruiseLineData from './data/cruiselines.json';
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

  const fetchCruiseData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Fetch cruise data from our API endpoint
      const response = await fetch('/api/cruises');

      if (!response.ok) {
        throw new Error('Failed to fetch cruise data');
      }

      const apiResponse = await response.json();

      // Transform API data to match our local data structure
      const transformedCruises = apiResponse.data.map(cruise => ({
        id: cruise.id || Math.random().toString(36).substr(2, 9),
        name: cruise.cruise_line,
        image: cruise.image || '/images/default-cruise.jpg',
        duration: `${cruise.duration} Days`,
        description: cruise.name,
        destinations: cruise.destinations,
        departurePorts: [cruise.departure_port],
        price: `$${cruise.price_per_person}`,
        priceValue: cruise.price_per_person,
        departureDate: cruise.departure_date
      }));

      const filtered = applyFiltersAndTitle(transformedCruises);
      setFilteredCruises(filtered);
      setUsingFallback(false);
    } catch (apiError) {
      console.error('Error fetching cruise data:', apiError);
      setError('Unable to fetch live cruise data. Using fallback data.');
      setUsingFallback(true);

      // Fallback to local JSON data
      const filtered = applyFiltersAndTitle(cruiseLineData.cruiseLines);
      setFilteredCruises(filtered);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCruiseData();
  }, [cruiseLineParam, destinationParam, countryParam]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <FaSpinner className="text-blue-600 text-5xl animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading cruise data...</p>
        </div>
      </div>
    );
  }

  if (error && !usingFallback) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <FaExclamationTriangle className="text-red-500 text-5xl mx-auto mb-4" />
          <h2 className="text-2xl font-semibold text-gray-700 mb-2">Error Loading Data</h2>
          <p className="text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="fixed top-0 left-0 right-0 z-50">
        <Navbar forceScrolled={true} />
      </div>

      <div className="pt-[80px]"> {/* Add padding-top to account for fixed Navbar */}
        <div className="bg-white border-b border-gray-200">
          <div className="container mx-auto px-4 h-16 flex items-center justify-center">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-gray-800">{title}</h1>
              {usingFallback && (
                <span className="ml-2 text-sm text-yellow-600 bg-yellow-100 px-2 py-1 rounded">
                  Using Fallback Data
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 py-8">
          {filteredCruises.length === 0 ? (
            <div className="text-center py-12">
              <FaSearch className="text-gray-400 text-5xl mx-auto mb-4" />
              <h2 className="text-2xl font-semibold text-gray-700 mb-2">No cruises found</h2>
              <p className="text-gray-500">Try adjusting your search criteria</p>
            </div>
          ) : (
            <div className="space-y-10">
              {filteredCruises.map((cruise) => (
                <div
                  key={cruise.id}
                  className="bg-white rounded-[20px] overflow-hidden flex flex-col md:flex-row shadow-[0_8px_30px_rgb(0,0,0,0.12)] relative transform transition-all duration-500 hover:shadow-[0_20px_50px_rgba(0,102,178,0.2)] group"
                  style={{ minHeight: '380px' }}
                >
                  {/* Image Section with Overlay */}
                  <div className="w-full md:w-[42%] h-[280px] md:h-auto relative overflow-hidden">
                    <img
                      src={cruise.image}
                      alt={cruise.name}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                    />
                    {/* Gradient Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0a2540]/90 via-[#0a2540]/40 to-transparent"></div>

                    {/* Cruise Line Badge */}
                    <div className="absolute top-5 left-5 bg-[#0066b2] text-white py-1.5 px-4 rounded-full text-sm font-semibold shadow-lg backdrop-blur-sm">
                      {cruise.name}
                    </div>

                    {/* Overlay Text */}
                    <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
                      <h3 className="text-2xl md:text-2xl font-bold mb-1 drop-shadow-lg">
                        {cruise.description}
                      </h3>
                      <p className="text-white/90 text-sm font-medium flex items-center gap-2">
                        <FaShip className="text-[#4dc3ff]" />
                        {cruise.name} • {cruise.duration}
                      </p>
                    </div>
                  </div>

                  {/* Content Section */}
                  <div className="w-full md:w-[58%] p-6 md:p-8 lg:p-10 flex flex-col justify-between bg-gradient-to-br from-white to-slate-50">
                    <div>
                      <h2 className="text-xl md:text-2xl lg:text-[1.65rem] font-bold text-gray-800 mb-2 leading-tight">
                        {cruise.duration} {cruise.description}
                      </h2>
                      <div className="flex items-center text-gray-500 mb-5 pb-4 border-b border-gray-100">
                        <FaShip className="mr-2 text-[#0066b2]" />
                        <span className="text-base font-medium">{cruise.name}</span>
                      </div>

                      <div className="space-y-4 mb-6">
                        <div className="flex items-start group/item">
                          <div className="w-9 h-9 mr-4 text-[#0066b2] bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm transition-all duration-300 group-hover/item:scale-110 group-hover/item:shadow-md">
                            <FaMapMarkerAlt className="text-sm" />
                          </div>
                          <div>
                            <span className="block text-gray-800 font-semibold text-sm mb-0.5">Destinations</span>
                            <span className="text-gray-600 text-sm leading-relaxed">
                              {cruise.destinations.slice(0, 4).map((dest, idx, arr) => (
                                <span key={dest}>
                                  <span className="text-[#0066b2] font-medium">{dest}</span>
                                  {idx < arr.length - 1 && <span className="text-gray-400">, </span>}
                                </span>
                              ))}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-start group/item">
                          <div className="w-9 h-9 mr-4 text-[#0066b2] bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm transition-all duration-300 group-hover/item:scale-110 group-hover/item:shadow-md">
                            <FaCalendar className="text-sm" />
                          </div>
                          <div>
                            <span className="block text-gray-800 font-semibold text-sm mb-0.5">Departure Ports</span>
                            <span className="text-gray-600 text-sm leading-relaxed">
                              {cruise.departurePorts.slice(0, 2).map((port, idx, arr) => (
                                <span key={port}>
                                  <span className="text-[#0066b2] font-medium">{port}</span>
                                  {idx < arr.length - 1 && <span className="text-gray-400">, </span>}
                                </span>
                              ))}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                      <div>
                        <div className="text-sm text-gray-500 mb-0.5">Starting from</div>
                        <div className="text-2xl md:text-[1.75rem] font-bold bg-gradient-to-r from-[#0066b2] to-[#0099ff] bg-clip-text text-transparent">
                          <Price amount={cruise.priceValue} showCode={true} />
                        </div>
                      </div>
                      <Link
                        to={`/itinerary?cruiseId=${cruise.id}`}
                        className="bg-gradient-to-r from-[#0066b2] to-[#0088dd] hover:from-[#005599] hover:to-[#0077cc] text-white px-6 py-3.5 rounded-xl font-semibold transition-all duration-300 shadow-lg hover:shadow-xl hover:-translate-y-0.5 flex items-center gap-2"
                      >
                        View Details
                        <svg className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default withPageElements(CruiseCards); 