import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './HeroSection.css';
import { FaMapMarkerAlt, FaCalendarAlt, FaShip, FaAnchor, FaDollarSign, FaSearch, FaStar, FaArrowRight, FaChevronRight, FaAngleDown } from 'react-icons/fa';
import cruiseData from './data/cruiselines.json';
import destinationsData from './data/destinations.json';
import { Search, MapPin, Calendar, DollarSign, ChevronDown, Anchor, Ship, Navigation } from 'lucide-react';

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
  const [availableMonths] = useState([
    'January', 'February', 'March', 'April', 'May', 'June', 
    'July', 'August', 'September', 'October', 'November', 'December'
  ]);
  const [availableYears] = useState([2023, 2024, 2025]);
  const [priceRanges] = useState([
    '$100-$500', '$500-$1000', '$1000-$1500', '$1500-$2000', '$2000+'
  ]);
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredDestinations, setFilteredDestinations] = useState([]);
  const [showDestinationSuggestions, setShowDestinationSuggestions] = useState(false);
  const [selectedPackageType, setSelectedPackageType] = useState('All Inclusive');
  const [selectedDate, setSelectedDate] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [priceRange, setPriceRange] = useState('Any Price');
  const [displayedMonth, setDisplayedMonth] = useState(new Date().getMonth()); 
  const [displayedYear, setDisplayedYear] = useState(new Date().getFullYear());
  const datepickerRef = useRef(null);

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
      
      if (showDatePicker && datepickerRef.current && !datepickerRef.current.contains(event.target)) {
        setShowDatePicker(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [activeField, showDestinationSuggestions, showDatePicker]);

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
  
  const handleSelectDate = (month, year) => {
    const dateString = `${month} ${year}`;
    setSearchValues({
      ...searchValues,
      date: dateString
    });
    setActiveField(null);
  };

  // Generate calendar days for the currently displayed month
  const generateCalendarDays = () => {
    const daysInMonth = new Date(displayedYear, displayedMonth + 1, 0).getDate();
    const firstDayOfMonth = new Date(displayedYear, displayedMonth, 1).getDay();
    let days = Array(firstDayOfMonth).fill(null);
    
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }
    
    return days;
  };
  
  const handleSearch = (e) => {
    e.preventDefault();
    setIsSearching(true);
    
    // Create query parameters from search values
    const queryParams = new URLSearchParams();
    Object.entries(searchValues).forEach(([key, value]) => {
      if (value) queryParams.append(key, value);
    });
    
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
      
      // Filter by price range (basic implementation)
      if (searchValues.price) {
        const priceRange = searchValues.price;
        const cruisePrice = parseInt(cruise.price.replace(/\D/g, ''));
        
        if (priceRange === '$100-$500' && (cruisePrice < 100 || cruisePrice > 500)) {
          matches = false;
        } else if (priceRange === '$500-$1000' && (cruisePrice < 500 || cruisePrice > 1000)) {
          matches = false;
        } else if (priceRange === '$1000-$1500' && (cruisePrice < 1000 || cruisePrice > 1500)) {
          matches = false;
        } else if (priceRange === '$1500-$2000' && (cruisePrice < 1500 || cruisePrice > 2000)) {
          matches = false;
        } else if (priceRange === '$2000+' && cruisePrice < 2000) {
          matches = false;
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
          backgroundImage: "url('https://images.unsplash.com/photo-1548574505-5e239809ee19?q=80&w=2064&auto=format&fit=crop')",
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/50 to-black/60"></div>
      </div>

      {/* Content Container */}
      <div className="container relative z-10 mx-auto px-4 py-16 sm:px-6 lg:px-8">
        {/* Hero Text */}
        <div className="text-center mb-12 space-y-4">
          <div className="inline-flex items-center px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 mb-4">
            {/* <Ship className="w-4 h-4 text-blue-400 mr-2" /> */}
            {/* <span className="text-white/90 text-sm font-medium">Luxury Cruise Experiences</span> */}
          </div>
          
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-white tracking-tight">
            Discover Your Perfect
            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300">
              Cruise Adventure
            </span>
          </h1>
          
          <p className="text-lg md:text-xl text-gray-300 max-w-3xl mx-auto">
            Explore the world's most breathtaking destinations with our handpicked selection of luxury cruise packages
          </p>
        </div>

        {/* Search Form */}
        <div className="max-w-6xl mx-auto">
          <form onSubmit={handleSearch} className="search-container">
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
                <ChevronDown className="absolute right-3 top-1/2 text-gray-400 pointer-events-none" size={16} />
              </div>

              {/* Date */}
              <div className="search-field relative">
                <label className="search-label">
                  <Calendar className="search-icon" />
                  <span>Travel Date</span>
                </label>
                <input
                  type="text"
                  placeholder="Select dates"
                  className="search-input"
                  value={selectedDate}
                  onClick={() => setShowDatePicker(!showDatePicker)}
                  readOnly
                />
                
                {/* Date Picker Popup - Compact Responsive Design */}
                {showDatePicker && (
                  <div 
                    ref={datepickerRef}
                    className="absolute left-0 right-0 top-full bg-white border border-gray-200 rounded-lg shadow-lg z-50 p-2 sm:p-3 mt-2 w-full min-w-[260px] sm:min-w-[280px] md:min-w-[300px] max-w-[320px] mx-auto sm:mx-0"
                  >
                    <div className="flex justify-between items-center mb-2 sm:mb-3">
                      <button 
                        onClick={() => {
                          if (displayedMonth === 0) {
                            setDisplayedMonth(11);
                            setDisplayedYear(displayedYear - 1);
                          } else {
                            setDisplayedMonth(displayedMonth - 1);
                          }
                        }}
                        className="p-1.5 sm:p-2 rounded-full hover:bg-gray-100 transition-colors touch-manipulation"
                        type="button"
                        aria-label="Previous month"
                      >
                        <ChevronDown className="h-3 w-3 sm:h-4 sm:w-4 text-gray-600 rotate-90" />
                      </button>
                      <h3 className="font-medium text-xs sm:text-sm">{availableMonths[displayedMonth]} {displayedYear}</h3>
                      <button 
                        onClick={() => {
                          if (displayedMonth === 11) {
                            setDisplayedMonth(0);
                            setDisplayedYear(displayedYear + 1);
                          } else {
                            setDisplayedMonth(displayedMonth + 1);
                          }
                        }}
                        className="p-1.5 sm:p-2 rounded-full hover:bg-gray-100 transition-colors touch-manipulation"
                        type="button"
                        aria-label="Next month"
                      >
                        <ChevronDown className="h-3 w-3 sm:h-4 sm:w-4 text-gray-600 -rotate-90" />
                      </button>
                    </div>
                    
                    <div className="grid grid-cols-7 gap-0.5 text-center text-xs font-medium text-gray-500 mb-1.5">
                      <div className="py-0.5">Su</div>
                      <div className="py-0.5">Mo</div>
                      <div className="py-0.5">Tu</div>
                      <div className="py-0.5">We</div>
                      <div className="py-0.5">Th</div>
                      <div className="py-0.5">Fr</div>
                      <div className="py-0.5">Sa</div>
                    </div>
                    
                    <div className="grid grid-cols-7 gap-0.5">
                      {generateCalendarDays().map((day, index) => {
                        const date = day !== null ? new Date(displayedYear, displayedMonth, day) : null;
                        const isToday = date && new Date().toDateString() === date.toDateString();
                        const isDisabled = date && date < new Date().setHours(0, 0, 0, 0);
                        
                        return (
                          <div 
                            key={index}
                            onClick={() => {
                              if (day !== null && !isDisabled) {
                                const newDate = new Date(displayedYear, displayedMonth, day);
                                setSelectedDate(`${availableMonths[displayedMonth]} ${day}, ${displayedYear}`);
                                setShowDatePicker(false);
                              }
                            }}
                            className={`
                              h-6 w-full sm:h-7 flex items-center justify-center rounded text-xs font-medium touch-manipulation
                              ${day === null ? 'cursor-default' : isDisabled ? 'text-gray-300 cursor-not-allowed' : 'cursor-pointer hover:bg-blue-100 active:bg-blue-200 transition-colors'}
                              ${isToday ? 'border border-blue-500 bg-blue-50 text-blue-700' : ''}
                            `}
                          >
                            {day}
                          </div>
                        );
                      })}
                    </div>
                    
                    <div className="mt-2 sm:mt-3 flex justify-end gap-1.5">
                      <button 
                        onClick={() => setShowDatePicker(false)}
                        className="px-2 py-1.5 sm:px-3 sm:py-2 bg-gray-500 text-white rounded text-xs font-medium hover:bg-gray-600 transition-colors touch-manipulation"
                        type="button"
                      >
                        Cancel
                      </button>
                      <button 
                        onClick={() => setShowDatePicker(false)}
                        className="px-2 py-1.5 sm:px-3 sm:py-2 bg-[#0061ff] text-white rounded text-xs font-medium hover:bg-blue-700 transition-colors touch-manipulation"
                        type="button"
                      >
                        Done
                      </button>
                    </div>
                  </div>
                )}
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
                  <option value="0-1000">$0 - $1,000</option>
                  <option value="1000-2000">$1,000 - $2,000</option>
                  <option value="2000-5000">$2,000 - $5,000</option>
                  <option value="5000+">$5,000+</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 text-gray-400 pointer-events-none" size={16} />
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