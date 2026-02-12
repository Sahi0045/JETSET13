import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './HeroSection.css';
import { FaMapMarkerAlt, FaCalendarAlt, FaShip, FaAnchor, FaDollarSign, FaSearch, FaStar, FaArrowRight, FaChevronRight, FaAngleDown } from 'react-icons/fa';
import cruiseData from './data/cruiselines.json';
import destinationsData from './data/destinations.json';
import { Search, MapPin, DollarSign, ChevronDown, Anchor, Ship, Navigation } from 'lucide-react';
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { formatDateToISO } from "../../../utils/dateUtils";
import currencyService from "../../../Services/CurrencyService";

const HeroSection = () => {
  const navigate = useNavigate();
  const [activeField, setActiveField] = useState(null);
  const [searchValues, setSearchValues] = useState({
    location: '',
    date: '',
    cruiseLine: '',
    departure: '',
    price: ''
  });
  const [cruiseLines, setCruiseLines] = useState([]);
  const [cruiseLinesDetails, setCruiseLinesDetails] = useState([]);
  const [destinations, setDestinations] = useState([]);
  const [departurePorts, setDeparturePorts] = useState([]);
  const [scrolled, setScrolled] = useState(false);
  const [priceRanges] = useState([
    `${currencyService.getCurrencySymbol()}100-${currencyService.getCurrencySymbol()}500`,
    `${currencyService.getCurrencySymbol()}500-${currencyService.getCurrencySymbol()}1000`,
    `${currencyService.getCurrencySymbol()}1000-${currencyService.getCurrencySymbol()}1500`,
    `${currencyService.getCurrencySymbol()}1500-${currencyService.getCurrencySymbol()}2000`,
    `${currencyService.getCurrencySymbol()}2000+`
  ]);
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredDestinations, setFilteredDestinations] = useState([]);
  const [showDestinationSuggestions, setShowDestinationSuggestions] = useState(false);
  const [selectedPackageType, setSelectedPackageType] = useState('All Inclusive');
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [priceRange, setPriceRange] = useState('Any Price');

  useEffect(() => {
    // Extract cruise lines and unique destinations from the JSON data
    if (cruiseData && cruiseData.cruiseLines) {
      const lines = cruiseData.cruiseLines.map(line => line.name);
      setCruiseLines(lines);
      setCruiseLinesDetails(cruiseData.cruiseLines);

      // Extract all unique destinations
      const allDestinations = new Set();
      cruiseData.cruiseLines.forEach(line => {
        line.destinations.forEach(destination => {
          allDestinations.add(destination);
        });
      });
      setDestinations(Array.from(allDestinations).sort());
    }

    // Load destination data from JSON if available
    if (destinationsData && destinationsData.destinations) {
      // Extract unique departure ports from destinations data
      const ports = new Set();
      destinationsData.destinations.forEach(dest => {
        if (dest.departurePorts) {
          dest.departurePorts.forEach(port => ports.add(port));
        }
      });

      // If we have ports from destinations, use those, otherwise fallback to default list
      if (ports.size > 0) {
        setDeparturePorts(Array.from(ports).sort());
      } else {
        setDeparturePorts(['Miami', 'Vancouver', 'Seattle', 'New York', 'Barcelona', 'Sydney', 'Los Angeles', 'Singapore', 'Tokyo', 'Venice', 'Reykjavik']);
      }
    }
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      const isScrolled = window.scrollY > 50;
      if (isScrolled !== scrolled) {
        setScrolled(isScrolled);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [scrolled]);

  const handleFocus = (field) => {
    setActiveField(field);
  };

  const handleBlur = (e) => {
    // Delay closing to allow click events on dropdown items
    setTimeout(() => {
      setActiveField(null);
    }, 200);
  };

  useEffect(() => {
    function handleClickOutside(event) {
      if (activeField && !event.target.closest('.search-item')) {
        setActiveField(null);
      }

      if (showDestinationSuggestions && !event.target.closest('.search-field')) {
        setShowDestinationSuggestions(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [activeField, showDestinationSuggestions]);

  const handleQuickSelect = (value, field) => {
    setSearchValues({
      ...searchValues,
      [field]: value
    });

    // If selecting a cruise line, filter the destinations
    if (field === 'cruiseLine') {
      filterDestinationsByCruiseLine(value);
    }

    // If selecting a destination, filter the cruise lines
    if (field === 'location') {
      filterCruiseLinesByDestination(value);
    }
  };

  const filterDestinationsByCruiseLine = (cruiseLineName) => {
    if (!cruiseLineName) return;

    const selectedCruiseLine = cruiseLinesDetails.find(line => line.name === cruiseLineName);
    if (selectedCruiseLine && selectedCruiseLine.destinations) {
      // If the currently selected location isn't offered by this cruise line, clear it
      if (searchValues.location && !selectedCruiseLine.destinations.includes(searchValues.location)) {
        setSearchValues(prev => ({
          ...prev,
          location: ''
        }));
      }
    }
  };

  const filterCruiseLinesByDestination = (destination) => {
    if (!destination) return;

    // Find cruise lines that offer this destination
    const linesWithDestination = cruiseLinesDetails.filter(line =>
      line.destinations && line.destinations.includes(destination)
    );

    // If the currently selected cruise line doesn't offer this destination, clear it
    if (searchValues.cruiseLine && !linesWithDestination.some(line => line.name === searchValues.cruiseLine)) {
      setSearchValues(prev => ({
        ...prev,
        cruiseLine: ''
      }));
    }
  };


  const handleSearch = (e) => {
    e.preventDefault();
    setIsSearching(true);

    // Create query parameters from search values
    const queryParams = new URLSearchParams();
    Object.entries(searchValues).forEach(([key, value]) => {
      if (value) queryParams.append(key, value);
    });

    // Add date range if selected
    if (startDate) queryParams.append('startDate', formatDateToISO(startDate));
    if (endDate) queryParams.append('endDate', formatDateToISO(endDate));

    // Filter cruise results based on search criteria
    const filteredResults = cruiseData.cruiseLines.filter(cruise => {
      let matches = true;

      // Filter by cruise line
      if (searchValues.cruiseLine && cruise.name !== searchValues.cruiseLine) {
        matches = false;
      }

      // Filter by destination
      if (searchValues.location && !cruise.destinations.includes(searchValues.location)) {
        matches = false;
      }

      // Filter by price range (dynamic currency-aware implementation)
      if (searchValues.price) {
        const priceRange = searchValues.price;
        const cruisePrice = parseInt(cruise.price.replace(/\D/g, ''));

        // Extract numeric values from price range (handles any currency symbol)
        const rangeMatch = priceRange.match(/([0-9]+)-?([0-9]+)?\+?/);
        if (rangeMatch) {
          const minPrice = parseInt(rangeMatch[1]);
          const maxPrice = rangeMatch[2] ? parseInt(rangeMatch[2]) : null;

          if (priceRange.includes('+')) {
            // Open-ended range (e.g., $2000+)
            if (cruisePrice < minPrice) {
              matches = false;
            }
          } else if (maxPrice) {
            // Closed range (e.g., $100-$500)
            if (cruisePrice < minPrice || cruisePrice > maxPrice) {
              matches = false;
            }
          }
        }
      }

      return matches;
    });

    setSearchResults(filteredResults);

    // Navigate to cruises page with search parameters
    setTimeout(() => {
      setIsSearching(false);
      navigate(`/cruises?${queryParams.toString()}`);
    }, 500);
  };

  // Function to get available destinations based on selected cruise line
  const getAvailableDestinations = () => {
    if (!searchValues.cruiseLine) {
      return destinations;
    }

    const selectedCruiseLine = cruiseLinesDetails.find(line => line.name === searchValues.cruiseLine);
    if (selectedCruiseLine && selectedCruiseLine.destinations) {
      return selectedCruiseLine.destinations.sort();
    }

    return destinations;
  };

  // Function to get available cruise lines based on selected destination
  const getAvailableCruiseLines = () => {
    if (!searchValues.location) {
      return cruiseLinesDetails;
    }

    return cruiseLinesDetails.filter(line =>
      line.destinations && line.destinations.includes(searchValues.location)
    );
  };

  return (
    <section className="hero-section">
      {/* Background Image with Overlay */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: "url('https://images.unsplash.com/photo-1548574187-57588b4d8c7c?q=80&w=2072&auto=format&fit=crop')",
        }}
      >
      </div>

      {/* Content Container */}
      <div className="container relative z-10 mx-auto px-4 pt-4 pb-16 sm:px-6 lg:px-8 w-full flex flex-col items-center justify-center">
        {/* Hero Text */}
        <div className="text-center mb-8 space-y-4 w-full max-w-6xl mx-auto">

          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-white tracking-tight drop-shadow-2xl">
            Discover Your Perfect
            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300 drop-shadow-lg">
              Cruise Adventure
            </span>
          </h1>

          <p className="text-lg md:text-xl text-white max-w-3xl mx-auto font-medium drop-shadow-lg">
            Explore the world's most breathtaking destinations with our handpicked selection of luxury cruise packages
          </p>
        </div>

        {/* Search Form */}
        <div className="max-w-6xl mx-auto w-full">
          <form onSubmit={handleSearch} className="search-container w-full">
            <div className="search-grid">
              {/* Destination */}
              <div className="search-field relative">
                <label className="search-label">
                  <MapPin className="search-icon" />
                  <span>Destination</span>
                </label>
                <input
                  type="text"
                  placeholder="Where would you like to go?"
                  className="search-input"
                  value={searchQuery}
                  onChange={(e) => {
                    const query = e.target.value;
                    setSearchQuery(query);

                    // Filter destinations based on input
                    if (query.length > 0) {
                      const filtered = destinations.filter(dest =>
                        dest.toLowerCase().includes(query.toLowerCase())
                      );
                      setFilteredDestinations(filtered);
                      setShowDestinationSuggestions(true);
                    } else {
                      setShowDestinationSuggestions(false);
                    }
                  }}
                  onFocus={() => {
                    if (searchQuery.length > 0) {
                      setShowDestinationSuggestions(true);
                    }
                  }}
                />

                {/* Destination Suggestions */}
                {showDestinationSuggestions && filteredDestinations.length > 0 && (
                  <div className="absolute left-0 right-0 top-full bg-white border border-gray-200 rounded-xl shadow-xl z-30 mt-2 max-h-64 overflow-y-auto">
                    <ul className="py-2">
                      {filteredDestinations.map((destination, index) => (
                        <li
                          key={index}
                          className="px-4 py-2 hover:bg-blue-50 cursor-pointer"
                          onClick={() => {
                            setSearchQuery(destination);
                            setShowDestinationSuggestions(false);
                          }}
                        >
                          <div className="flex items-center">
                            <MapPin className="h-4 w-4 text-blue-600 mr-2" />
                            <span>{destination}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Cruise Type */}
              <div className="search-field">
                <label className="search-label">
                  <Anchor className="search-icon" />
                  <span>Cruise Type</span>
                </label>
                <select
                  className="search-input"
                  value={selectedPackageType}
                  onChange={(e) => setSelectedPackageType(e.target.value)}
                >
                  <option value="All Inclusive">All Inclusive</option>
                  <option value="Luxury">Luxury Cruise</option>
                  <option value="Adventure">Adventure Cruise</option>
                  <option value="Family">Family Cruise</option>
                  <option value="Romantic">Romantic Getaway</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
              </div>

              {/* Date */}
              <div className="search-field relative">
                <label className="search-label">
                  <span>Travel Date</span>
                </label>
                <div className="relative">
                  <DatePicker
                    selected={startDate}
                    onChange={(dates) => {
                      const [start, end] = dates;
                      setStartDate(start);
                      setEndDate(end);
                    }}
                    startDate={startDate}
                    endDate={endDate}
                    selectsRange
                    minDate={new Date()}
                    placeholderText="Select dates"
                    className="search-input"
                    wrapperClassName="w-full"
                    popperClassName="z-[100]"
                  />
                </div>
              </div>

              {/* Price Range */}
              <div className="search-field">
                <label className="search-label">
                  <DollarSign className="search-icon" />
                  <span>Budget</span>
                </label>
                <select
                  className="search-input"
                  value={priceRange}
                  onChange={(e) => setPriceRange(e.target.value)}
                >
                  <option value="Any Price">Any Price</option>
                  <option value="0-1000">{currencyService.getCurrencySymbol()}0 - {currencyService.getCurrencySymbol()}1,000</option>
                  <option value="1000-2000">{currencyService.getCurrencySymbol()}1,000 - {currencyService.getCurrencySymbol()}2,000</option>
                  <option value="2000-5000">{currencyService.getCurrencySymbol()}2,000 - {currencyService.getCurrencySymbol()}5,000</option>
                  <option value="5000+">{currencyService.getCurrencySymbol()}5,000+</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
              </div>
            </div>

            {/* Search Button */}
            <button type="submit" className="search-submit">
              <Search className="w-5 h-5 mr-2" />
              <span>Search Cruises</span>
            </button>
          </form>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;