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
            <div className="space-y-12">
              {filteredCruises.map((cruise) => (
                <div
                  key={cruise.id}
                  className="bg-white rounded-[24px] overflow-hidden flex flex-col md:flex-row shadow-xl relative transform transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl"
                >
                  <div className="w-full md:w-2/5 h-[300px] md:h-[450px]">
                    <img
                      src={cruise.image}
                      alt={cruise.name}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-4 left-4 bg-[#0066b2]/90 text-white py-1 px-3 rounded-full text-sm font-medium">
                      {cruise.name}
                    </div>
                  </div>

                  <div className="w-full md:w-3/5 p-6 md:p-10 flex flex-col justify-center">
                    <h2 className="text-2xl md:text-3xl font-bold text-gray-800 mb-3">
                      {cruise.duration} {cruise.description}
                    </h2>
                    <div className="flex items-center text-gray-500 mb-6">
                      <FaShip className="mr-2" />
                      <span className="text-lg">{cruise.name}</span>
                    </div>

                    <div className="space-y-6 md:space-y-6 mb-8">
                      <div className="flex items-start">
                        <div className="w-8 h-8 mr-4 mt-1 text-[#0066b2] bg-blue-50 rounded-full flex items-center justify-center flex-shrink-0">
                          <FaMapMarkerAlt />
                        </div>
                        <div>
                          <span className="block text-gray-800 font-semibold mb-1">Destinations</span>
                          <span className="text-gray-600">{cruise.destinations.join(', ')}</span>
                        </div>
                      </div>

                      <div className="flex items-start">
                        <div className="w-8 h-8 mr-4 mt-1 text-[#0066b2] bg-blue-50 rounded-full flex items-center justify-center flex-shrink-0">
                          <FaCalendar />
                        </div>
                        <div>
                          <span className="block text-gray-800 font-semibold mb-1">Departure Ports</span>
                          <span className="text-gray-600">{cruise.departurePorts.join(', ')}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-auto">
                      <div className="text-2xl font-bold text-blue-600">
                        <Price amount={cruise.priceValue} showCode={true} />
                      </div>
                      <Link
                        to={`/itinerary?cruiseId=${cruise.id}`}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors duration-200"
                      >
                        View Details
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