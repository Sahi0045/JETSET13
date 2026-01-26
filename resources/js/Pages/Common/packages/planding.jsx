import { Search, ChevronDown, MapPin, Users, Star, ArrowRight, DollarSign, Tag, Heart, Plane, Sunrise, Coffee, X, Clock, Sparkles } from "lucide-react"
import { useState, useEffect, useRef } from "react"
import packagesData from '../../../data/packages.json'
import { Link } from "react-router-dom"
import Navbar from '../Navbar'
import Footer from '../Footer'
import withPageElements from '../PageWrapper'
import Price from '../../../Components/Price'
import currencyService from '../../../Services/CurrencyService'
import DatePicker from "react-datepicker"
import "react-datepicker/dist/react-datepicker.css"

const TravelPackages = () => {
  const [selectedPackageType, setSelectedPackageType] = useState("All Inclusive")
  const [travelers, setTravelers] = useState(2)
  const [showTravelersDropdown, setShowTravelersDropdown] = useState(false)
  const [likedPackages, setLikedPackages] = useState([])
  const [showSearchPage, setShowSearchPage] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [isMobileView, setIsMobileView] = useState(window.innerWidth < 768)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const searchRef = useRef(null)

  // Date range picker state
  const [startDate, setStartDate] = useState(null)
  const [endDate, setEndDate] = useState(null)

  useEffect(() => {
    const handleResize = () => {
      setIsMobileView(window.innerWidth < 768);
    };

    window.addEventListener('resize', handleResize);

    // Handle clicks outside of search suggestions
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);


  // Helper to get enhanced image for a package
  const getEnhancedImage = (section, id, originalImage) => {
    const overrides = {
      dubai: {
        1: "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2340&q=80",
        2: "https://images.unsplash.com/photo-1540541338287-41700207dee6?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2370&q=80",
        3: "https://images.unsplash.com/photo-1573843981267-be1999ff37cd?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1974&q=80",
        default: "https://images.unsplash.com/photo-1559599746-c0f31b4d2b8e?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2069&q=80"
      },
      europe: {
        1: "https://images.unsplash.com/photo-1522083165195-3424ed129620?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80",
        2: "https://images.unsplash.com/photo-1533929736458-ca588d08c8be?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2370&q=80",
        3: "https://images.unsplash.com/photo-1499856871958-5b9627545d1a?q=80&w=2020&auto=format&fit=crop",
        4: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?q=80&w=2073&auto=format&fit=crop",
        5: "https://images.unsplash.com/photo-1539037116277-4db20889f2d4?q=80&w=2070&auto=format&fit=crop",
        default: "https://images.unsplash.com/photo-1516483638261-f4dbaf036963?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2336&q=80"
      },
      kashmir: {
        1: "https://images.unsplash.com/photo-1595846519845-68e298c2edd8?q=80&w=2070&auto=format&fit=crop",
        2: "https://images.unsplash.com/photo-1566837945700-30057527ade0?q=80&w=2070&auto=format&fit=crop",
        3: "https://images.unsplash.com/photo-1598091383021-15ddea10925d?q=80&w=2070&auto=format&fit=crop",
        4: "https://images.unsplash.com/photo-1595846519845-68e298c2edd8?q=80&w=2070&auto=format&fit=crop",
        5: "https://images.unsplash.com/photo-1470252649378-9c29740c9fa8?q=80&w=2370&auto=format&fit=crop",
        default: "https://images.unsplash.com/photo-1562957942-0f0e21b8c66e?q=80&w=2070&auto=format&fit=crop"
      },
      northEast: {
        1: "https://images.unsplash.com/photo-1544735716-392fe2489ffa?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2370&q=80",
        2: "https://images.unsplash.com/photo-1626074353765-517a681e40be?q=80&w=2069&auto=format&fit=crop",
        3: "https://images.unsplash.com/photo-1605649487212-47bdab064df7?q=80&w=2070&auto=format&fit=crop",
        default: "https://images.unsplash.com/photo-1565019011521-254775ab7675?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2369&q=80"
      }
    }

    const sectionOverrides = overrides[section]
    if (!sectionOverrides) return originalImage

    const result = sectionOverrides[id] || sectionOverrides.default || originalImage
    if (section === 'kashmir' && id === 4) {
      console.log('DEBUG KASHMIR 4', { id, result, overrideHost: sectionOverrides[id], def: sectionOverrides.default });
    }
    return result
  }

  // Create processed data with correct images
  const processedPackages = {
    dubai: {
      ...packagesData.dubai,
      packages: (packagesData.dubai?.packages || []).map(pkg => ({
        ...pkg,
        image: getEnhancedImage('dubai', pkg.id, pkg.image)
      }))
    },
    europe: {
      ...packagesData.europe,
      packages: (packagesData.europe?.packages || []).map(pkg => ({
        ...pkg,
        image: getEnhancedImage('europe', pkg.id, pkg.image)
      }))
    },
    kashmir: {
      ...packagesData.kashmir,
      packages: (packagesData.kashmir?.packages || []).map(pkg => ({
        ...pkg,
        image: getEnhancedImage('kashmir', pkg.id, pkg.image)
      }))
    },
    northEast: {
      ...packagesData.northEast,
      packages: (packagesData.northEast?.packages || []).map(pkg => ({
        ...pkg,
        image: getEnhancedImage('northEast', pkg.id, pkg.image)
      }))
    }
  }

  // Combine all packages into one array for search using the processed data
  const allPackages = [
    ...processedPackages.dubai.packages,
    ...processedPackages.europe.packages,
    ...processedPackages.kashmir.packages,
    ...processedPackages.northEast.packages
  ]

  // Extract available destinations and locations for auto-suggestion
  const availableDestinations = [
    { type: 'destination', value: 'dubai', label: 'Dubai' },
    { type: 'destination', value: 'europe', label: 'Europe' },
    { type: 'destination', value: 'kashmir', label: 'Kashmir' },
    { type: 'destination', value: 'northEast', label: 'North East' }
  ];

  // Extract unique locations from all packages
  const availableLocations = [...new Set(allPackages.map(pkg => pkg.location))]
    .filter(location => location) // Filter out undefined/null
    .map(location => ({ type: 'location', value: location, label: location }));

  // Combine destinations and locations for search suggestions
  const allSuggestions = [...availableDestinations, ...availableLocations];

  const packageTypes = ["All Inclusive", "Flight + Hotel", "Activities Only", "Cruise Package"]

  const toggleLike = (packageId) => {
    setLikedPackages(prev =>
      prev.includes(packageId)
        ? prev.filter(id => id !== packageId)
        : [...prev, packageId]
    )
  }

  const handleSearch = (e) => {
    e.preventDefault()
    setShowSearchPage(true)
    setShowSuggestions(false)
  }

  const handleSearchInputChange = (e) => {
    setSearchQuery(e.target.value);
    setShowSuggestions(true);
  };

  const handleSuggestionClick = (suggestion) => {
    setSearchQuery(suggestion.label);
    setShowSuggestions(false);

    // If it's a destination, filter by that destination
    if (suggestion.type === 'destination') {
      // Optional: Additional logic to filter by destination
    }
  };

  // Filter suggestions based on input
  const filteredSuggestions = allSuggestions.filter(suggestion =>
    suggestion.label.toLowerCase().includes(searchQuery.toLowerCase())
  ).slice(0, 5); // Limit to 5 suggestions

  // Filter packages based on search query and package type
  const filteredPackages = allPackages.filter(pkg => {
    const matchesSearch = !searchQuery ||
      pkg.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (pkg.location && pkg.location.toLowerCase().includes(searchQuery.toLowerCase())) ||
      pkg.destination.toLowerCase() === searchQuery.toLowerCase() ||
      pkg.features.some(feature => feature.toLowerCase().includes(searchQuery.toLowerCase()))

    const matchesType = selectedPackageType === "All Inclusive" ||
      pkg.packageType === selectedPackageType

    return matchesSearch && matchesType
  })

  const renderPackageCard = (pkg) => (
    <div key={pkg.id} className="rounded-xl overflow-hidden shadow-md hover:shadow-lg transition-all duration-300 h-full flex flex-col bg-white">
      {/* Package Image */}
      <div className="relative h-48">
        <img
          src={pkg.image}
          alt={pkg.title}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent"></div>

        {/* Like Button */}
        <button
          onClick={() => toggleLike(pkg.id)}
          className="absolute top-4 right-4 p-2 rounded-full bg-white/20 backdrop-blur-sm hover:bg-white/40 transition-all"
        >
          <Heart
            size={20}
            className={`${likedPackages.includes(pkg.id) ? 'fill-red-500 text-red-500' : 'text-white'}`}
          />
        </button>

        {/* Discount Tag */}
        {pkg.discount && (
          <div className="absolute top-4 left-4 bg-red-500 text-white px-3 py-1 rounded-full text-sm font-medium">
            {pkg.discount}% OFF
          </div>
        )}

        {/* Package Info Overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <h3 className="text-white font-semibold text-lg mb-1">{pkg.title}</h3>
          {pkg.location && (
            <div className="flex items-center gap-1 text-white/90">
              <MapPin size={16} />
              <span className="text-sm">{pkg.location}</span>
            </div>
          )}
        </div>
      </div>

      {/* Package Details */}
      <div className="p-4">
        {/* Features */}
        <div className="flex flex-wrap gap-2 mb-3">
          {pkg.features?.slice(0, 3).map((feature, idx) => (
            <span
              key={`${pkg.id}-feature-${idx}`}
              className="text-xs bg-[#F0FAFC] text-[#055B75] px-2 py-1 rounded-full"
            >
              {feature}
            </span>
          ))}
        </div>

        {/* Rating & Duration */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1">
            <Star className="text-yellow-400 fill-yellow-400" size={16} />
            <span className="text-sm font-medium">{pkg.rating}</span>
            <span className="text-gray-500 text-sm">({pkg.reviews})</span>
          </div>
          <div className="flex items-center gap-1 text-gray-500">
            <Clock size={16} />
            <span className="text-sm">{pkg.duration}</span>
          </div>
        </div>

        {/* Price & CTA */}
        <div className="mt-auto p-4 pt-2 flex items-center justify-between border-t border-gray-100">
          <div>
            <div className="text-xs text-gray-500">Starting from</div>
            <span className="text-2xl font-bold text-[#055B75]">
              <Price amount={typeof pkg.price === 'string' ? pkg.price.replace(/[^0-9.]/g, '') : pkg.price} />
            </span>
          </div>
          <Link to={`/packages/itinerary?destination=${pkg.destination}`}
            className="bg-[#055B75] hover:bg-[#034457] text-white px-5 py-2 rounded-full text-sm font-medium transition-colors">
            View Details
          </Link>
        </div>
      </div>
    </div>
  );

  if (showSearchPage) {
    return (
      <div className="min-h-screen bg-gray-50">
        {/* Back to Landing Button */}
        <button
          onClick={() => setShowSearchPage(false)}
          className="fixed top-4 left-4 z-50 bg-white/90 backdrop-blur-sm px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 text-gray-700"
        >
          <ArrowRight className="rotate-180" size={20} />
          Back to Home
        </button>

        {/* Search Header */}
        <div className="bg-white shadow-md sticky top-0 z-40">
          <div className="container mx-auto px-4 py-4">
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
              {/* Search Input */}
              <div className="relative flex-1 w-full" ref={searchRef}>
                <input
                  type="text"
                  placeholder="Search destinations, packages, or activities..."
                  value={searchQuery}
                  onChange={handleSearchInputChange}
                  onFocus={() => setShowSuggestions(true)}
                  className="w-full pl-12 pr-4 py-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-[#055B75] focus:border-[#055B75]"
                />
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />

                {/* Search Suggestions */}
                {showSuggestions && searchQuery.length > 0 && filteredSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-lg border z-50 max-h-60 overflow-y-auto">
                    {filteredSuggestions.map((suggestion, index) => (
                      <div
                        key={`${suggestion.type}-${index}`}
                        className="px-4 py-3 hover:bg-[#F0FAFC] cursor-pointer flex items-center"
                        onClick={() => handleSuggestionClick(suggestion)}
                      >
                        {suggestion.type === 'destination' ? (
                          <Plane size={16} className="text-[#055B75] mr-2" />
                        ) : (
                          <MapPin size={16} className="text-red-500 mr-2" />
                        )}
                        <span>{suggestion.label}</span>
                        <span className="ml-2 text-xs text-gray-500">
                          {suggestion.type === 'destination' ? 'Destination' : 'Location'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {showSuggestions && searchQuery.length > 0 && filteredSuggestions.length === 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-lg border z-50 p-4 text-center text-gray-500">
                    No matching destinations found
                  </div>
                )}
              </div>

              {/* Package Type Filter */}
              <div className="relative">
                <select
                  value={selectedPackageType}
                  onChange={(e) => setSelectedPackageType(e.target.value)}
                  className="appearance-none px-4 py-3 rounded-lg border border-gray-200 bg-white pr-10 cursor-pointer"
                >
                  {packageTypes.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={20} />
              </div>
            </div>
          </div>
        </div>

        {/* Results Section */}
        <div className="container mx-auto px-4 py-8">
          {/* Results Count */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-800">
              {filteredPackages.length} packages found
            </h2>
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery("")
                  setSelectedPackageType("All Inclusive")
                }}
                className="text-[#055B75] hover:text-[#034457] flex items-center gap-2"
              >
                <X size={16} />
                Clear filters
              </button>
            )}
          </div>

          {/* Package Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredPackages.map((pkg) => renderPackageCard(pkg))}
          </div>

          {/* No Results */}
          {filteredPackages.length === 0 && (
            <div className="text-center py-12">
              <Plane className="mx-auto text-gray-400 mb-4" size={48} />
              <h3 className="text-xl font-semibold text-gray-800 mb-2">No packages found</h3>
              <p className="text-gray-600">Try adjusting your search terms</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-[#f8fafc] text-gray-800">
      <Navbar />

      {/* Special Offer Banner - Below navbar, scrolls with content */}
      <div className={`w-full text-center bg-gradient-to-r from-[#055B75]/90 via-[#034457]/90 to-[#055B75]/90 py-3 backdrop-blur-sm z-40 border-y border-[#65B3CF]/30 ${isMobileView ? 'px-3' : ''}`}>
        <div className="container mx-auto px-2 flex justify-center items-center flex-wrap">
          <Sparkles className="h-5 w-5 text-yellow-300 mr-2 flex-shrink-0" />
          <p className={`text-white ${isMobileView ? 'text-xs' : 'text-base'} font-medium tracking-wide`}>
            <span className="text-yellow-300 font-bold">SUMMER SPECIAL:</span> 15% OFF!{' '}
            <span className="font-bold text-yellow-300 whitespace-nowrap">{isMobileView ? '' : 'Call '}  (877) 538-7380)</span>
          </p>
        </div>
      </div>

      {/* Hero Section */}
      <section
        className="relative min-h-[85vh] md:min-h-[100vh] flex items-center justify-center overflow-hidden pb-16 md:pb-32 lg:pb-40 pt-20 md:pt-24 lg:pt-32"
        style={{
          backgroundImage:
            "url('https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?q=80&w=2070&auto=format&fit=crop')",
          backgroundSize: "cover",
          backgroundPosition: "center 30%",
          backgroundRepeat: "no-repeat",
        }}
      >
        {/* Mobile-specific background - ultra-light overlay (10-15%) */}
        <div className="absolute inset-0 md:hidden bg-gradient-to-b from-black/15 via-black/10 to-black/15"></div>
        {/* Desktop background overlay - ultra-light for maximum brightness */}
        <div className="absolute inset-0 hidden md:block bg-gradient-to-b from-black/15 via-transparent to-black/10"></div>

        <div className="container mx-auto px-4 sm:px-6 lg:px-8 z-10 w-full flex flex-col items-center justify-center relative py-4 sm:py-6 md:py-8">
          {/* Hero content */}
          <div className="text-center mb-6 sm:mb-8 md:mb-10 lg:mb-12 animate-fadeIn w-full max-w-5xl mx-auto">
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold mb-3 sm:mb-4 md:mb-5 lg:mb-6 text-white drop-shadow-2xl px-2 sm:px-4 md:px-6 lg:px-0">
              Discover Your Next Adventure
            </h1>
            <p className="text-sm sm:text-base md:text-lg lg:text-xl xl:text-2xl text-white font-medium drop-shadow-lg px-4 sm:px-6 md:px-8 lg:px-0 max-w-3xl mx-auto leading-relaxed">
              Explore our handpicked destinations and create unforgettable memories
            </p>
          </div>

          {/* Mobile Form - Shown only on small screens */}
          <form onSubmit={handleSearch} className="md:hidden bg-white/95 backdrop-blur-sm rounded-xl p-6 max-w-5xl mx-auto shadow-2xl w-full">
            <div className="flex flex-col gap-6">
              <div className="w-full">
                <label className="block text-gray-800 text-base font-medium mb-2">Destination</label>
                <div className="relative" ref={searchRef}>
                  <input
                    type="text"
                    placeholder="Where do you want to go?"
                    value={searchQuery}
                    onChange={handleSearchInputChange}
                    onFocus={() => setShowSuggestions(true)}
                    className="w-full p-3 pl-10 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#055B75] focus:border-[#055B75] transition-all text-base"
                  />
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-[#055B75]" size={20} />

                  {/* Search Suggestions */}
                  {showSuggestions && searchQuery.length > 0 && filteredSuggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-lg border z-50 max-h-60 overflow-y-auto">
                      {filteredSuggestions.map((suggestion, index) => (
                        <div
                          key={`mobile-${suggestion.type}-${index}`}
                          className="px-4 py-3 hover:bg-[#F0FAFC] cursor-pointer flex items-center"
                          onClick={() => handleSuggestionClick(suggestion)}
                        >
                          {suggestion.type === 'destination' ? (
                            <Plane size={16} className="text-blue-500 mr-2" />
                          ) : (
                            <MapPin size={16} className="text-red-500 mr-2" />
                          )}
                          <span>{suggestion.label}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {showSuggestions && searchQuery.length > 0 && filteredSuggestions.length === 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-lg border z-50 p-4 text-center text-gray-500">
                      No matching destinations found
                    </div>
                  )}
                </div>
              </div>

              <div className="w-full">
                <label className="block text-gray-800 text-base font-medium mb-2">Package Type</label>
                <div className="relative">
                  <select
                    value={selectedPackageType}
                    onChange={(e) => setSelectedPackageType(e.target.value)}
                    className="w-full p-3 pr-10 border border-gray-200 rounded-lg appearance-none focus:ring-2 focus:ring-[#055B75] focus:border-[#055B75] transition-all text-base"
                  >
                    {packageTypes.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-[#055B75]" size={20} />
                </div>
              </div>

              <div className="w-full">
                <label className="block text-gray-800 text-base font-medium mb-2">Travel Date</label>
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
                    className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base bg-white"
                    wrapperClassName="w-full"
                    popperClassName="z-[100]"
                  />
                </div>
              </div>

              <div className="w-full">
                <label className="block text-gray-800 text-base font-medium mb-2">Travelers</label>
                <div className="relative">
                  <div
                    className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:border-blue-500 cursor-pointer transition-all text-base"
                    onClick={() => setShowTravelersDropdown(!showTravelersDropdown)}
                  >
                    <div className="flex items-center gap-2">
                      <Users size={20} className="text-blue-500" />
                      <span>{travelers} Traveler{travelers !== 1 ? 's' : ''}</span>
                    </div>
                    <ChevronDown size={20} className="text-blue-500" />
                  </div>
                  {showTravelersDropdown && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-lg border z-50">
                      {[1, 2, 3, 4, 5, 6].map((num) => (
                        <div
                          key={`traveler-${num}`}
                          className="px-4 py-3 hover:bg-[#F0FAFC] cursor-pointer flex items-center justify-between text-base"
                          onClick={() => {
                            setTravelers(num)
                            setShowTravelersDropdown(false)
                          }}
                        >
                          <span>{num} Traveler{num !== 1 ? 's' : ''}</span>
                          {travelers === num && <Star size={16} className="text-blue-500" />}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="w-full">
                <button type="submit" className="w-full bg-[#055B75] text-white px-6 py-3 rounded-lg hover:bg-[#034457] transition-all duration-300 flex items-center justify-center gap-2 group font-medium shadow-md text-base">
                  <Search size={20} />
                  <span className="group-hover:translate-x-1 transition-transform">
                    Search
                  </span>
                </button>
              </div>
            </div>
          </form>

          {/* Desktop Form - Original layout preserved with enhancements */}
          <form onSubmit={handleSearch} className="hidden md:block bg-white/95 backdrop-blur-sm rounded-xl p-8 max-w-5xl mx-auto shadow-2xl transform hover:scale-[1.02] transition-all duration-300 w-full">
            <div className="flex flex-row gap-6">
              <div className="flex-1" ref={searchRef}>
                <label className="block text-gray-700 text-sm font-medium mb-1">Destination</label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Where do you want to go?"
                    value={searchQuery}
                    onChange={(e) => setLocalSearchParams(prev => ({ ...prev, to: e.target.value }))}
                    onFocus={() => setShowSuggestions(true)}
                    className="w-full p-3 pl-10 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-base"
                  />
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />

                  {/* Search Suggestions */}
                  {showSuggestions && searchQuery.length > 0 && filteredSuggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-md shadow-lg border z-50 max-h-60 overflow-y-auto">
                      {filteredSuggestions.map((suggestion, index) => (
                        <div
                          key={`desktop-${suggestion.type}-${index}`}
                          className="px-4 py-3 hover:bg-[#F0FAFC] cursor-pointer flex items-center"
                          onClick={() => handleSuggestionClick(suggestion)}
                        >
                          {suggestion.type === 'destination' ? (
                            <Plane size={16} className="text-blue-500 mr-2" />
                          ) : (
                            <MapPin size={16} className="text-red-500 mr-2" />
                          )}
                          <span>{suggestion.label}</span>
                          <span className="ml-2 text-xs text-gray-500">
                            {suggestion.type === 'destination' ? 'Destination' : 'Location'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {showSuggestions && searchQuery.length > 0 && filteredSuggestions.length === 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-md shadow-lg border z-50 p-4 text-center text-gray-500">
                      No matching destinations found
                    </div>
                  )}
                </div>
              </div>

              <div className="flex-1">
                <label className="block text-gray-700 text-sm font-medium mb-1">Package Type</label>
                <div className="relative">
                  <select
                    value={selectedPackageType}
                    onChange={(e) => setSelectedPackageType(e.target.value)}
                    className="w-full p-3 border rounded-md appearance-none focus:ring-2 focus:ring-[#055B75] focus:border-[#055B75] transition-all text-base"
                  >
                    {packageTypes.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={18} />
                </div>
              </div>

              <div className="flex-1">
                <label className="block text-gray-700 text-sm font-medium mb-1">Travel Date</label>
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
                    className="w-full p-3 border rounded-md focus:ring-2 focus:ring-[#055B75] focus:border-[#055B75] text-base bg-white"
                    wrapperClassName="w-full"
                    popperClassName="z-[100]"
                  />
                </div>
              </div>

              <div className="flex-1">
                <label className="block text-gray-700 text-sm font-medium mb-1">Travelers</label>
                <div className="relative">
                  <div
                    className="flex items-center justify-between p-3 border rounded-md hover:border-[#055B75] cursor-pointer transition-all text-base"
                    onClick={() => setShowTravelersDropdown(!showTravelersDropdown)}
                  >
                    <div className="flex items-center gap-1.5">
                      <Users size={18} className="text-gray-500" />
                      <span>{travelers} Traveler{travelers !== 1 ? 's' : ''}</span>
                    </div>
                    <ChevronDown size={18} className="text-gray-500" />
                  </div>
                  {showTravelersDropdown && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-md shadow-lg border z-50">
                      {[1, 2, 3, 4, 5, 6].map((num) => (
                        <div
                          key={`traveler-${num}`}
                          className="px-4 py-2.5 hover:bg-[#F0FAFC] cursor-pointer flex items-center justify-between text-sm"
                          onClick={() => {
                            setTravelers(num)
                            setShowTravelersDropdown(false)
                          }}
                        >
                          <span>{num} Traveler{num !== 1 ? 's' : ''}</span>
                          {travelers === num && <Star size={16} className="text-blue-500" />}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-end">
                <button type="submit" className="w-auto min-w-[140px] bg-[#055B75] text-white px-6 lg:px-8 py-2.5 lg:py-3 rounded-lg hover:bg-[#034457] transition-all duration-300 flex items-center justify-center gap-2 group font-semibold shadow-lg hover:shadow-xl text-sm lg:text-base uppercase tracking-wide">
                  <Search size={16} className="lg:w-[18px] lg:h-[18px]" />
                  <span className="group-hover:translate-x-1 transition-transform">
                    Search
                  </span>
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* Scroll Indicator - Only visible on desktop */}
        <div className="absolute bottom-8 hidden md:block left-1/2 -translate-x-1/2 animate-bounce">
          <div className="w-8 h-12 border-2 border-white rounded-full flex items-center justify-center">
            <div className="w-1.5 h-3 bg-white rounded-full animate-scroll"></div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-8 bg-[#B9D0DC]">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="text-4xl font-bold text-[#055B75] mb-2">{packagesData.stats.destinations}</div>
              <div className="text-[#055B75] font-medium">Destinations</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-[#055B75] mb-2">{packagesData.stats.happyTravelers}</div>
              <div className="text-[#055B75] font-medium">Happy Travelers</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-[#055B75] mb-2">{packagesData.stats.packages}</div>
              <div className="text-[#055B75] font-medium">Travel Packages</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-[#055B75] mb-2">{packagesData.stats.support}</div>
              <div className="text-[#055B75] font-medium">Support</div>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Packages - Dubai */}
      <section className="py-6 md:py-10 bg-[#B9D0DC]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-12">
            <div className="text-center mb-8">
              <h4 className="text-[#055B75] font-semibold tracking-wider text-sm uppercase mb-2">
                Luxury Escapes
              </h4>
              <h2 className="text-3xl md:text-4xl font-bold text-[#055B75] mb-3">
                Discover Luxury and Adventure
              </h2>
              <div className="w-20 h-1 bg-[#055B75] mx-auto"></div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 justify-items-center">
              {processedPackages.dubai.packages.map((item) => (
                <div
                  key={item.id}
                  className="group rounded-xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 bg-[#F0FAFC] border border-[#B9D0DC] w-full max-w-sm"
                >
                  {/* Package Image */}
                  <div className="relative h-48">
                    <img
                      src={item.image}
                      alt={item.title}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent"></div>

                    {/* Discount Tag */}
                    {item.discount && (
                      <div className="absolute top-4 left-4 bg-red-500 text-white px-3 py-1 rounded-full text-sm font-medium">
                        {item.discount}% OFF
                      </div>
                    )}

                    {/* Like Button */}
                    <button
                      onClick={() => toggleLike(item.id)}
                      className="absolute top-4 right-4 p-2 rounded-full bg-white/20 backdrop-blur-sm hover:bg-white/40 transition-all"
                    >
                      <Heart
                        size={20}
                        className={`${likedPackages.includes(item.id) ? 'fill-red-500 text-red-500' : 'text-white'}`}
                      />
                    </button>

                    <div className="absolute bottom-0 left-0 right-0 p-4">
                      <h3 className="text-white font-semibold text-lg mb-1">{item.title}</h3>
                      {item.location && (
                        <div className="flex items-center gap-2">
                          <MapPin size={16} className="text-white/80" />
                          <p className="text-white/80 text-sm">{item.location}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Package Details */}
                  <div className="p-4">
                    {/* Features */}
                    <div className="flex flex-wrap gap-2 mb-3">
                      {item.features.map((feature, idx) => (
                        <span key={`${item.id}-feature-${idx}`} className="text-xs bg-[#F0FAFC] text-[#055B75] px-2 py-1 rounded-full">
                          {feature}
                        </span>
                      ))}
                    </div>

                    {/* Highlights */}
                    <div className="mb-3">
                      <h4 className="text-sm font-medium text-gray-600 mb-2">Package Highlights:</h4>
                      <ul className="text-sm text-gray-500 space-y-1">
                        {item.highlights.map((highlight, idx) => (
                          <li key={`${item.id}-highlight-${idx}`} className="flex items-center gap-2">
                            <Sunrise size={14} className="text-[#055B75]" />
                            {highlight}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Rating & Duration */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-1">
                        <Star className="text-yellow-400 fill-yellow-400" size={16} />
                        <span className="text-sm font-medium">{item.rating}</span>
                        <span className="text-gray-500 text-sm">({item.reviews})</span>
                      </div>
                      <div className="flex items-center gap-1 text-gray-500">
                        <Clock size={16} />
                        <span className="text-sm">{item.duration}</span>
                      </div>
                    </div>

                    {/* Price & CTA */}
                    <div className="flex items-end justify-between border-t pt-3">
                      <div>
                        <p className="text-gray-500 text-sm">Starting from</p>
                        <div className="flex items-center gap-1">
                          <span className="text-2xl font-bold text-[#055B75]">
                            <Price amount={typeof item.price === 'string' ? item.price.replace(/[^0-9.]/g, '') : item.price} />
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/packages/itinerary?destination=${item.destination}`}
                          className="bg-[#055B75] text-white px-4 py-2 rounded-lg hover:bg-[#034457] transition-all duration-300 flex items-center gap-1 text-sm font-medium group"
                        >
                          View Itinerary
                          <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Europe Packages Section */}
      <section className="py-16 bg-[#B9D0DC] relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1499856871958-85d111c60e6b?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1974&q=80')] opacity-5 bg-cover bg-center"></div>
        <div className="container mx-auto px-4 relative">
          <div className="text-center mb-12">
            <p className="text-[#055B75] mb-2 uppercase tracking-wider font-medium">{packagesData.europe.title}</p>
            <h2 className="text-4xl md:text-5xl font-bold text-[#055B75] mb-4">{packagesData.europe.subtitle}</h2>
            <div className="w-20 h-1 bg-[#055B75] mx-auto"></div>
          </div>

          <div className="flex flex-col gap-8">
            {/* Top Row: 3 cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 justify-items-center">
              {processedPackages.europe.packages.slice(0, 3).map((item) => (
                <Link
                  key={item.id}
                  to={`/packages/itinerary?destination=${item.destination}`}
                  className="group rounded-xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 bg-[#F0FAFC] border border-[#B9D0DC] w-full max-w-sm flex flex-col"
                >
                  {/* Package Image */}
                  <div className="relative h-48 shrink-0">
                    <img
                      src={item.image}
                      alt={item.title}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-4 left-4 bg-red-500 text-white px-3 py-1 rounded-full text-sm font-medium">
                      15% OFF
                    </div>
                  </div>

                  {/* Package Details Body */}
                  <div className="p-4 flex flex-col grow">
                    <div className="mb-3">
                      <h3 className="text-xl font-bold text-[#055B75] mb-1">{item.title}</h3>
                      <div className="flex items-center gap-2 text-gray-500 text-sm">
                        <MapPin size={14} className="text-[#65B3CF]" />
                        <span>Europe</span>
                      </div>
                    </div>

                    {/* Rating & Duration */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-md border border-slate-100">
                        <Clock size={14} className="text-[#055B75]" />
                        <span className="text-sm font-medium text-slate-600">{item.duration}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Star size={14} className="text-yellow-400 fill-yellow-400" />
                        <span className="text-sm font-medium text-slate-700">4.9 (120)</span>
                      </div>
                    </div>

                    {/* Price & CTA */}
                    <div className="mt-auto pt-4 border-t border-[#B9D0DC]/50 flex items-center justify-between">
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide">Starting from</p>
                        <span className="text-2xl font-bold text-[#055B75]">
                          <Price amount={typeof item.price === 'string' ? item.price.replace(/[^0-9.]/g, '') : item.price} />
                        </span>
                      </div>
                      <span className="bg-[#055B75] text-white px-4 py-2 rounded-lg text-sm font-medium group-hover:bg-[#034457] transition-colors">
                        View Details
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {/* Bottom Row: Remaining cards centered */}
            <div className="flex flex-wrap justify-center gap-8">
              {processedPackages.europe.packages.slice(3).map((item) => (
                <Link
                  key={item.id}
                  to={`/packages/itinerary?destination=${item.destination}`}
                  className="group rounded-xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 bg-[#F0FAFC] border border-[#B9D0DC] w-full max-w-sm flex flex-col"
                >
                  {/* Package Image */}
                  <div className="relative h-48 shrink-0">
                    <img
                      src={item.image}
                      alt={item.title}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-4 left-4 bg-red-500 text-white px-3 py-1 rounded-full text-sm font-medium">
                      15% OFF
                    </div>
                  </div>

                  {/* Package Details Body */}
                  <div className="p-4 flex flex-col grow">
                    <div className="mb-3">
                      <h3 className="text-xl font-bold text-[#055B75] mb-1">{item.title}</h3>
                      <div className="flex items-center gap-2 text-gray-500 text-sm">
                        <MapPin size={14} className="text-[#65B3CF]" />
                        <span>Europe</span>
                      </div>
                    </div>

                    {/* Rating & Duration */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-md border border-slate-100">
                        <Clock size={14} className="text-[#055B75]" />
                        <span className="text-sm font-medium text-slate-600">{item.duration}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Star size={14} className="text-yellow-400 fill-yellow-400" />
                        <span className="text-sm font-medium text-slate-700">4.9 (120)</span>
                      </div>
                    </div>

                    {/* Price & CTA */}
                    <div className="mt-auto pt-4 border-t border-[#B9D0DC]/50 flex items-center justify-between">
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide">Starting from</p>
                        <span className="text-2xl font-bold text-[#055B75]">
                          <Price amount={typeof item.price === 'string' ? item.price.replace(/[^0-9.]/g, '') : item.price} />
                        </span>
                      </div>
                      <span className="bg-[#055B75] text-white px-4 py-2 rounded-lg text-sm font-medium group-hover:bg-[#034457] transition-colors">
                        View Details
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Kashmir Packages Section */}
      <section className="py-16 bg-[#B9D0DC]">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <p className="text-[#055B75] mb-2 uppercase tracking-wider font-medium">{packagesData.kashmir.title}</p>
            <h2 className="text-4xl font-bold text-[#055B75] mb-4">{packagesData.kashmir.subtitle}</h2>
            <div className="w-20 h-1 bg-[#055B75] mx-auto"></div>
          </div>

          <div className="flex flex-col gap-8">
            {/* Top Row: 3 cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 justify-items-center">
              {processedPackages.kashmir.packages.slice(0, 3).map((item) => (
                <Link
                  key={item.id}
                  to={`/packages/itinerary?destination=${item.destination}`}
                  className="group rounded-xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 bg-[#F0FAFC] border border-[#B9D0DC] w-full max-w-sm flex flex-col"
                >
                  {/* Package Image */}
                  <div className="relative h-48 shrink-0">
                    <img
                      src={item.image}
                      alt={item.title}
                      className="w-full h-full object-cover"
                    />
                    {/* Discount Badge */}
                    <div className="absolute top-4 left-4 bg-red-500 text-white px-3 py-1 rounded-full text-sm font-medium">
                      15% OFF
                    </div>
                  </div>

                  {/* Package Details Body */}
                  <div className="p-4 flex flex-col grow">
                    <div className="mb-3">
                      <h3 className="text-xl font-bold text-[#055B75] mb-1">{item.title}</h3>
                      <div className="flex items-center gap-2 text-gray-500 text-sm">
                        <MapPin size={14} className="text-[#65B3CF]" />
                        <span>Kashmir, India</span>
                      </div>
                    </div>

                    {/* Rating & Duration */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-md border border-slate-100">
                        <Clock size={14} className="text-[#055B75]" />
                        <span className="text-sm font-medium text-slate-600">{item.duration}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Star size={14} className="text-yellow-400 fill-yellow-400" />
                        <span className="text-sm font-medium text-slate-700">4.8 (85)</span>
                      </div>
                    </div>

                    {/* Price & CTA */}
                    <div className="mt-auto pt-4 border-t border-[#B9D0DC]/50 flex items-center justify-between">
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide">Starting from</p>
                        <span className="text-2xl font-bold text-[#055B75]">
                          <Price amount={typeof item.price === 'string' ? item.price.replace(/[^0-9.]/g, '') : item.price} />
                        </span>
                      </div>
                      <span className="bg-[#055B75] text-white px-4 py-2 rounded-lg text-sm font-medium group-hover:bg-[#034457] transition-colors">
                        View Details
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {/* Bottom Row: Remaining cards centered */}
            <div className="flex flex-wrap justify-center gap-8">
              {processedPackages.kashmir.packages.slice(3).map((item) => (
                <Link
                  key={item.id}
                  to={`/packages/itinerary?destination=${item.destination}`}
                  className="group rounded-xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 bg-[#F0FAFC] border border-[#B9D0DC] w-full max-w-sm flex flex-col"
                >
                  {/* Package Image */}
                  <div className="relative h-48 shrink-0">
                    <img
                      src={item.image}
                      alt={item.title}
                      className="w-full h-full object-cover"
                    />
                    {/* Discount Badge */}
                    <div className="absolute top-4 left-4 bg-red-500 text-white px-3 py-1 rounded-full text-sm font-medium">
                      15% OFF
                    </div>
                  </div>

                  {/* Package Details Body */}
                  <div className="p-4 flex flex-col grow">
                    <div className="mb-3">
                      <h3 className="text-xl font-bold text-[#055B75] mb-1">{item.title}</h3>
                      <div className="flex items-center gap-2 text-gray-500 text-sm">
                        <MapPin size={14} className="text-[#65B3CF]" />
                        <span>Kashmir, India</span>
                      </div>
                    </div>

                    {/* Rating & Duration */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-md border border-slate-100">
                        <Clock size={14} className="text-[#055B75]" />
                        <span className="text-sm font-medium text-slate-600">{item.duration}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Star size={14} className="text-yellow-400 fill-yellow-400" />
                        <span className="text-sm font-medium text-slate-700">4.8 (85)</span>
                      </div>
                    </div>

                    {/* Price & CTA */}
                    <div className="mt-auto pt-4 border-t border-[#B9D0DC]/50 flex items-center justify-between">
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide">Starting from</p>
                        <span className="text-2xl font-bold text-[#055B75]">
                          <Price amount={typeof item.price === 'string' ? item.price.replace(/[^0-9.]/g, '') : item.price} />
                        </span>
                      </div>
                      <span className="bg-[#055B75] text-white px-4 py-2 rounded-lg text-sm font-medium group-hover:bg-[#034457] transition-colors">
                        View Details
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* North East & Bhutan Section */}
      <section className="py-16 bg-[#B9D0DC]">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <p className="text-[#055B75] mb-2 uppercase tracking-wider font-medium">{packagesData.northEast.title}</p>
            <h2 className="text-4xl font-bold text-[#055B75] mb-4">{packagesData.northEast.subtitle}</h2>
            <div className="w-20 h-1 bg-[#055B75] mx-auto"></div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 justify-items-center">
            {processedPackages.northEast.packages.map((item) => (
              <Link
                key={item.id}
                to={`/packages/itinerary?destination=${item.destination}`}
                className="group rounded-xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 bg-[#F0FAFC] border border-[#B9D0DC] w-full max-w-sm flex flex-col"
              >
                {/* Package Image */}
                <div className="relative h-48 shrink-0">
                  <img
                    src={item.image}
                    alt={item.title}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-4 left-4 bg-red-500 text-white px-3 py-1 rounded-full text-sm font-medium">
                    15% OFF
                  </div>
                </div>

                {/* Package Details Body */}
                <div className="p-4 flex flex-col grow">
                  <div className="mb-3">
                    <h3 className="text-xl font-bold text-[#055B75] mb-1">{item.title}</h3>
                    <div className="flex items-center gap-2 text-gray-500 text-sm">
                      <MapPin size={14} className="text-[#65B3CF]" />
                      <span>North East India</span>
                    </div>
                  </div>

                  {/* Rating & Duration */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-md border border-slate-100">
                      <Clock size={14} className="text-[#055B75]" />
                      <span className="text-sm font-medium text-slate-600">{item.duration}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Star size={14} className="text-yellow-400 fill-yellow-400" />
                      <span className="text-sm font-medium text-slate-700">4.7 (62)</span>
                    </div>
                  </div>

                  {/* Price & CTA */}
                  <div className="mt-auto pt-4 border-t border-[#B9D0DC]/50 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Starting from</p>
                      <span className="text-2xl font-bold text-[#055B75]">
                        <Price amount={typeof item.price === 'string' ? item.price.replace(/[^0-9.]/g, '') : item.price} />
                      </span>
                    </div>
                    <span className="bg-[#055B75] text-white px-4 py-2 rounded-lg text-sm font-medium group-hover:bg-[#034457] transition-colors">
                      View Details
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Newsletter Section */}
      <section className="py-20 bg-gradient-to-r from-[#055B75] to-[#034457] relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1599640842225-85d111c60e6b?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1974&q=80')] opacity-10 bg-cover bg-center"></div>
        <div className="container mx-auto px-4 relative">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">Get Exclusive Travel Deals</h2>
            <p className="text-xl text-[#F0FAFC] mb-8">Subscribe to our newsletter and receive up to 50% off on your next adventure!</p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center max-w-xl mx-auto">
              <input
                type="email"
                placeholder="Enter your email"
                className="px-6 py-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#65B3CF] flex-1 text-lg shadow-lg"
              />
              <button className="bg-white text-[#055B75] px-8 py-4 rounded-lg font-semibold text-lg shadow-lg">
                Subscribe Now
              </button>
            </div>
            <p className="text-[#F0FAFC]/70 mt-4 text-sm">*By subscribing, you agree to receive marketing emails from us.</p>
          </div>
        </div>
      </section>

      {/* Add custom styles for animations */}
      <style>{`
        @keyframes scroll {
          0% { transform: translateY(0); }
          50% { transform: translateY(6px); }
          100% { transform: translateY(0); }
        }
        .animate-scroll {
          animation: scroll 2s infinite;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 1s ease-out;
        }
        .react-datepicker-popper {
          z-index: 100 !important;
        }
        .react-datepicker {
          border: 1px solid #e5e7eb !important;
          border-radius: 0.5rem !important;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1) !important;
        }
      `}</style>

      <Footer />
    </div >
  );
};

export default withPageElements(TravelPackages);
