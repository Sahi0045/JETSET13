import { Search, MapPin, Star, ArrowRight, Clock, DollarSign, Heart, Plane, X, ChevronDown } from "lucide-react"
import { useState, useEffect, useMemo } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import packagesData from '../../../data/packages.json'
import Navbar from '../Navbar'
import Footer from '../Footer'
import withPageElements from "../PageWrapper"
import currencyService from '../../../Services/CurrencyService'
import Price from '../../../Components/Price'

const SearchPackages = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const searchParams = new URLSearchParams(location.search)

  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || "")
  const [selectedPackageType, setSelectedPackageType] = useState(searchParams.get('type') || "All Inclusive")
  const [likedPackages, setLikedPackages] = useState([])
  const [sortBy, setSortBy] = useState("recommended")
  const [isSearching, setIsSearching] = useState(false)
  const [isTyping, setIsTyping] = useState(false)
  const [typingTimeout, setTypingTimeout] = useState(null)

  // Combine all packages into one array for search
  const allPackages = useMemo(() => [
    ...(packagesData.dubai?.packages || []),
    ...(packagesData.europe?.packages || []),
    ...(packagesData.kashmir?.packages || []),
    ...(packagesData.northEast?.packages || [])
  ], [])

  const packageTypes = ["All Inclusive", "Flight + Hotel", "Activities Only", "Cruise Package"]
  const sortOptions = [
    { value: "recommended", label: "Recommended" },
    { value: "price_low", label: "Price: Low to High" },
    { value: "price_high", label: "Price: High to Low" },
    { value: "rating", label: "Highest Rated" },
    { value: "duration", label: "Duration" }
  ]

  // Update URL and trigger search
  useEffect(() => {
    const params = new URLSearchParams()
    if (searchQuery) params.set('q', searchQuery)
    if (selectedPackageType) params.set('type', selectedPackageType)
    navigate({ search: params.toString() }, { replace: true })
    
    // Show searching state briefly
    setIsSearching(true)
    const timer = setTimeout(() => setIsSearching(false), 300)
    return () => clearTimeout(timer)
  }, [searchQuery, selectedPackageType])

  const toggleLike = (packageId) => {
    setLikedPackages(prev => 
      prev.includes(packageId) 
        ? prev.filter(id => id !== packageId)
        : [...prev, packageId]
    )
  }

  // Enhanced search and filter logic
  const filteredPackages = useMemo(() => {
    const searchTerms = searchQuery.toLowerCase().split(' ').filter(Boolean)
    
    return allPackages
      .filter(pkg => {
        if (!pkg) return false

        // Match all search terms (AND logic)
        const matchesSearch = !searchQuery || searchTerms.every(term => {
          const searchableText = [
            pkg.title,
            pkg.location,
            pkg.description,
            ...(pkg.features || []),
            ...(pkg.highlights || [])
          ].join(' ').toLowerCase()
          
          return searchableText.includes(term)
        })

        const matchesType = selectedPackageType === "All Inclusive" || 
          pkg.features?.includes(selectedPackageType)

        return matchesSearch && matchesType
      })
      .sort((a, b) => {
        switch (sortBy) {
          case "price_low":
            return parseFloat(a.price) - parseFloat(b.price)
          case "price_high":
            return parseFloat(b.price) - parseFloat(a.price)
          case "rating":
            return parseFloat(b.rating) - parseFloat(a.rating)
          case "duration":
            return a.duration.localeCompare(b.duration)
          default:
            // For recommended, prioritize rating and review count
            const aScore = (parseFloat(a.rating) * parseFloat(a.reviews))
            const bScore = (parseFloat(b.rating) * parseFloat(b.reviews))
            return bScore - aScore
        }
      })
  }, [searchQuery, selectedPackageType, sortBy, allPackages])

  // Handle search submit
  const handleSearchSubmit = (e) => {
    e.preventDefault()
    setIsSearching(true)
    setTimeout(() => setIsSearching(false), 300)
  }

  // Handle search input with debounce
  const handleSearchInput = (e) => {
    const value = e.target.value
    setSearchQuery(value)
    setIsTyping(true)

    // Clear any existing timeout
    if (typingTimeout) {
      clearTimeout(typingTimeout)
    }

    // Set new timeout
    const newTimeout = setTimeout(() => {
      setIsTyping(false)
    }, 1000) // Hide back button for 1 second after last keystroke

    setTypingTimeout(newTimeout)
  }

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (typingTimeout) {
        clearTimeout(typingTimeout)
      }
    }
  }, [typingTimeout])

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      
      {/* Search Header */}
      <div className="bg-white shadow-md sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4 md:py-5">
          {/* Search Form Row */}
          <form onSubmit={handleSearchSubmit} className="flex flex-col md:flex-row gap-4 items-center justify-between">
            {/* Enhanced Search Input */}
            <div className="relative flex-1 w-full group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Search 
                  className={`transition-all duration-300 ${
                    isSearching 
                      ? 'text-blue-500 animate-spin' 
                      : 'text-gray-400 group-hover:text-blue-500 group-focus-within:text-blue-500'
                  }`}
                  size={20} 
                />
              </div>
              <input
                type="text"
                placeholder="Search destinations, packages..."
                value={searchQuery}
                onChange={handleSearchInput}
                className="w-full pl-12 pr-12 py-3.5 rounded-lg border border-gray-200 
                  focus:ring-2 focus:ring-blue-500 focus:border-blue-500 
                  hover:border-blue-300 transition-all duration-300
                  placeholder-gray-400 text-gray-700 text-base"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("")
                    setIsTyping(false)
                    if (typingTimeout) {
                      clearTimeout(typingTimeout)
                    }
                  }}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 
                    hover:text-blue-500 transition-colors duration-300"
                >
                  <X size={18} />
                </button>
              )}
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-0 h-0.5 bg-blue-500 
                group-hover:w-[calc(100%-2rem)] group-focus-within:w-[calc(100%-2rem)] 
                transition-all duration-300 rounded-full"
              ></div>
            </div>

            {/* Filters - Stack on mobile, row on desktop */}
            <div className="flex flex-col md:flex-row w-full md:w-auto gap-4 items-center">
              {/* Package Type Filter */}
              <div className="relative w-full md:min-w-[180px] group">
                <select
                  value={selectedPackageType}
                  onChange={(e) => setSelectedPackageType(e.target.value)}
                  className="w-full px-4 py-3.5 rounded-lg border border-gray-200 bg-white pr-10 
                    cursor-pointer hover:border-blue-500 focus:ring-2 focus:ring-blue-500 
                    focus:border-blue-500 transition-all appearance-none text-base"
                >
                  {packageTypes.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
                <ChevronDown 
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 
                    pointer-events-none group-hover:text-blue-500 transition-colors duration-300" 
                  size={20} 
                />
              </div>

              {/* Sort Filter */}
              <div className="relative w-full md:min-w-[180px] group">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="w-full px-4 py-3.5 rounded-lg border border-gray-200 bg-white pr-10 
                    cursor-pointer hover:border-blue-500 focus:ring-2 focus:ring-blue-500 
                    focus:border-blue-500 transition-all appearance-none text-base"
                >
                  {sortOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <ChevronDown 
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 
                    pointer-events-none group-hover:text-blue-500 transition-colors duration-300" 
                  size={20} 
                />
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Results Section */}
      <div className="container mx-auto px-4 py-6 md:py-8">
        {/* Results Count & Clear Filters */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 md:mb-6 gap-2 md:gap-0">
          <h2 className="text-lg md:text-xl font-semibold text-gray-800">
            {isSearching ? (
              <span className="inline-flex items-center gap-2">
                <Plane className="animate-bounce" size={20} />
                Searching...
              </span>
            ) : (
              <span className="inline-flex items-center gap-2">
                {filteredPackages.length} packages found
                {searchQuery && (
                  <span className="text-gray-500 text-sm md:text-base font-normal">
                    for "{searchQuery}"
                  </span>
                )}
              </span>
            )}
          </h2>
          {(searchQuery || selectedPackageType !== "All Inclusive") && (
            <button
              onClick={() => {
                setSearchQuery("")
                setSelectedPackageType("All Inclusive")
              }}
              className="text-blue-600 hover:text-blue-700 flex items-center gap-2 text-sm md:text-base"
            >
              <X size={16} />
              Clear filters
            </button>
          )}
        </div>

        {/* Package Grid - Adjust columns for different screen sizes */}
        <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6 
          transition-opacity duration-300 ${isSearching ? 'opacity-50' : 'opacity-100'}`}
        >
          {filteredPackages.map((pkg) => (
            <div
              key={pkg.id}
              className="group bg-white rounded-xl overflow-hidden shadow-md hover:shadow-xl 
                transition-all duration-500 transform hover:-translate-y-1"
            >
              {/* Package Image */}
              <div className="relative h-40 md:h-48 overflow-hidden">
                <img
                  src={pkg.image}
                  alt={pkg.title}
                  className="w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-80 group-hover:opacity-90 transition-opacity duration-300"></div>
                
                {/* Like Button - Larger touch target on mobile */}
                <button
                  onClick={(e) => {
                    e.preventDefault()
                    toggleLike(pkg.id)
                  }}
                  className="absolute top-3 md:top-4 right-3 md:right-4 p-2 rounded-full bg-white/20 backdrop-blur-sm hover:bg-white/40 transition-all duration-300 transform hover:scale-110"
                >
                  <Heart
                    size={20}
                    className={`${likedPackages.includes(pkg.id) ? 'fill-red-500 text-red-500' : 'text-white'} transition-colors duration-300`}
                  />
                </button>

                {/* Discount Tag */}
                {pkg.discount && (
                  <div className="absolute top-3 md:top-4 left-3 md:left-4 bg-red-500 text-white px-3 py-1 rounded-full text-xs md:text-sm font-medium transform -rotate-2 animate-pulse">
                    {pkg.discount}% OFF
                  </div>
                )}

                {/* Package Info Overlay */}
                <div className="absolute bottom-0 left-0 right-0 p-3 md:p-4">
                  <h3 className="text-white font-semibold text-base md:text-lg mb-0.5 md:mb-1">{pkg.title}</h3>
                  {pkg.location && (
                    <div className="flex items-center gap-1 text-white/90">
                      <MapPin size={14} className="md:w-4 md:h-4" />
                      <span className="text-xs md:text-sm">{pkg.location}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Package Details */}
              <div className="p-3 md:p-4">
                {/* Features */}
                <div className="flex flex-wrap gap-1 md:gap-2 mb-2 md:mb-3">
                  {pkg.features?.slice(0, 3).map((feature, idx) => (
                    <span
                      key={idx}
                      className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 md:py-1 rounded-full"
                    >
                      {feature}
                    </span>
                  ))}
                </div>

                {/* Rating & Duration */}
                <div className="flex items-center justify-between mb-2 md:mb-3">
                  <div className="flex items-center gap-1">
                    <Star className="text-yellow-400 fill-yellow-400" size={14} />
                    <span className="text-xs md:text-sm font-medium">{pkg.rating}</span>
                    <span className="text-gray-500 text-xs md:text-sm">({pkg.reviews})</span>
                  </div>
                  <div className="flex items-center gap-1 text-gray-500">
                    <Clock size={14} />
                    <span className="text-xs md:text-sm">{pkg.duration}</span>
                  </div>
                </div>

                {/* Price & CTA */}
                <div className="flex items-end justify-between border-t pt-2 md:pt-3">
                  <div>
                    <p className="text-gray-500 text-xs md:text-sm">Starting from</p>
                    <div className="flex items-center gap-0.5 md:gap-1">
                      <span className="text-xl md:text-2xl font-bold text-blue-600">
                        <Price amount={pkg.price.toString().replace(/[^0-9.]/g, '')} />
                      </span>
                    </div>
                  </div>
                  <button className="bg-blue-600 text-white px-3 md:px-4 py-1.5 md:py-2 rounded-lg flex items-center gap-1 text-xs md:text-sm font-medium group">
                    View Details
                    <ArrowRight size={14} className="md:w-4 md:h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* No Results */}
        {!isSearching && filteredPackages.length === 0 && (
          <div className="text-center py-8 md:py-12">
            <Plane className="mx-auto text-gray-400 mb-4" size={36} />
            <h3 className="text-lg md:text-xl font-semibold text-gray-800 mb-2">No packages found</h3>
            <p className="text-gray-600 text-sm md:text-base">
              {searchQuery ? (
                <>
                  No results found for "{searchQuery}". Try different keywords or 
                  <button 
                    onClick={() => setSearchQuery("")}
                    className="text-blue-600 ml-1"
                  >
                    clear your search
                  </button>
                </>
              ) : (
                'Try adjusting your filters'
              )}
            </p>
          </div>
        )}
      </div>

      <Footer />
    </div>
  )
}

export default withPageElements(SearchPackages); 