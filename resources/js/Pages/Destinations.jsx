import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { FaMapMarkerAlt, FaStar, FaPlane, FaHotel, FaShip, FaCar, FaCalendarAlt, FaUsers, FaGlobe } from 'react-icons/fa';
import Navbar from './Common/Navbar';
import Footer from './Common/Footer';

const Destinations = () => {
  const [selectedCategory, setSelectedCategory] = useState('all');

  const categories = [
    { id: 'all', name: 'All Destinations', icon: <FaGlobe /> },
    { id: 'beach', name: 'Beach Getaways', icon: <FaShip /> },
    { id: 'city', name: 'City Breaks', icon: <FaHotel /> },
    { id: 'adventure', name: 'Adventure', icon: <FaCar /> },
    { id: 'cultural', name: 'Cultural', icon: <FaUsers /> }
  ];

  const destinations = [
    {
      id: 1,
      name: 'Bali, Indonesia',
      category: 'beach',
      image: 'https://images.unsplash.com/photo-1537953773345-d172ccf13cf1?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2072&q=80',
      description: 'Tropical paradise with pristine beaches, ancient temples, and vibrant culture.',
      rating: 4.8,
      reviews: 1247,
      price: 'From $899',
      duration: '7-14 days',
      highlights: ['Beach Resorts', 'Temple Tours', 'Rice Terraces', 'Water Sports'],
      bestTime: 'April to October'
    },
    {
      id: 2,
      name: 'Paris, France',
      category: 'city',
      image: 'https://images.unsplash.com/photo-1502602898536-47ad22581b52?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2070&q=80',
      description: 'The City of Light offers world-class art, cuisine, and iconic landmarks.',
      rating: 4.9,
      reviews: 2156,
      price: 'From $1,299',
      duration: '5-10 days',
      highlights: ['Eiffel Tower', 'Louvre Museum', 'Notre-Dame', 'Champs-Élysées'],
      bestTime: 'April to June, September to October'
    },
    {
      id: 3,
      name: 'Santorini, Greece',
      category: 'beach',
      image: 'https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2070&q=80',
      description: 'Stunning volcanic island with dramatic cliffs and breathtaking sunsets.',
      rating: 4.9,
      reviews: 1893,
      price: 'From $1,199',
      duration: '5-8 days',
      highlights: ['Caldera Views', 'Sunset Cruises', 'Wine Tasting', 'Beach Clubs'],
      bestTime: 'June to September'
    },
    {
      id: 4,
      name: 'Tokyo, Japan',
      category: 'city',
      image: 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2071&q=80',
      description: 'Futuristic metropolis blending cutting-edge technology with ancient traditions.',
      rating: 4.7,
      reviews: 1678,
      price: 'From $1,499',
      duration: '7-12 days',
      highlights: ['Shibuya Crossing', 'Senso-ji Temple', 'Tsukiji Market', 'Mount Fuji'],
      bestTime: 'March to May, September to November'
    },
    {
      id: 5,
      name: 'Machu Picchu, Peru',
      category: 'adventure',
      image: 'https://images.unsplash.com/photo-1587595431973-160d0d94add1?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2070&q=80',
      description: 'Ancient Incan citadel nestled high in the Andes Mountains.',
      rating: 4.8,
      reviews: 892,
      price: 'From $1,399',
      duration: '8-12 days',
      highlights: ['Inca Trail', 'Sacred Valley', 'Cusco City', 'Rainbow Mountain'],
      bestTime: 'May to September'
    },
    {
      id: 6,
      name: 'Marrakech, Morocco',
      category: 'cultural',
      image: 'https://images.unsplash.com/photo-1518548419970-58e3b4079ab2?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2070&q=80',
      description: 'Exotic city with bustling souks, stunning architecture, and rich history.',
      rating: 4.6,
      reviews: 756,
      price: 'From $999',
      duration: '5-8 days',
      highlights: ['Jemaa el-Fnaa', 'Majorelle Garden', 'Medina Tours', 'Atlas Mountains'],
      bestTime: 'March to May, September to November'
    },
    {
      id: 7,
      name: 'New Zealand',
      category: 'adventure',
      image: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2070&q=80',
      description: 'Land of stunning landscapes, adventure sports, and Maori culture.',
      rating: 4.9,
      reviews: 1345,
      price: 'From $2,199',
      duration: '14-21 days',
      highlights: ['Milford Sound', 'Hobbiton', 'Queenstown', 'Waitomo Caves'],
      bestTime: 'December to February (Summer)'
    },
    {
      id: 8,
      name: 'Istanbul, Turkey',
      category: 'cultural',
      image: 'https://images.unsplash.com/photo-1524231757912-21f4fe3a7200?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2071&q=80',
      description: 'Where East meets West in a city rich with history and culture.',
      rating: 4.7,
      reviews: 1123,
      price: 'From $1,099',
      duration: '6-10 days',
      highlights: ['Hagia Sophia', 'Blue Mosque', 'Grand Bazaar', 'Bosphorus Cruise'],
      bestTime: 'April to May, September to October'
    }
  ];

  const filteredDestinations = selectedCategory === 'all' 
    ? destinations 
    : destinations.filter(dest => dest.category === selectedCategory);

  return (
    <>
      <Navbar forceScrolled={true} />
      <div className="min-h-screen bg-gray-50">
        {/* Hero Section */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-700 text-white py-20">
          <div className="container mx-auto px-4 text-center">
            <h1 className="text-5xl font-bold mb-6">Explore Amazing Destinations</h1>
            <p className="text-xl max-w-3xl mx-auto">
              Discover the world's most incredible places with Jetsetterss. From pristine beaches to bustling cities, 
              find your perfect destination and start planning your next adventure.
            </p>
          </div>
        </div>

        <div className="container mx-auto px-4 py-16">
          {/* Category Filter */}
          <section className="mb-12">
            <div className="flex flex-wrap justify-center gap-4">
              {categories.map((category) => (
                <button
                  key={category.id}
                  onClick={() => setSelectedCategory(category.id)}
                  className={`flex items-center gap-2 px-6 py-3 rounded-full font-medium transition-all duration-300 ${
                    selectedCategory === category.id
                      ? 'bg-blue-600 text-white shadow-lg'
                      : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                  }`}
                >
                  {category.icon}
                  {category.name}
                </button>
              ))}
            </div>
          </section>

          {/* Destinations Grid */}
          <section className="mb-20">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
              {filteredDestinations.map((destination) => (
                <div key={destination.id} className="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow duration-300">
                  {/* Destination Image */}
                  <div className="relative h-48 overflow-hidden">
                    <img 
                      src={destination.image} 
                      alt={destination.name}
                      className="w-full h-full object-cover hover:scale-110 transition-transform duration-300"
                    />
                    <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm px-3 py-1 rounded-full text-sm font-semibold text-gray-800">
                      {destination.price}
                    </div>
                  </div>

                  {/* Destination Info */}
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-xl font-bold text-gray-900">{destination.name}</h3>
                      <div className="flex items-center gap-1">
                        <FaStar className="text-yellow-400" />
                        <span className="text-sm font-semibold">{destination.rating}</span>
                      </div>
                    </div>

                    <p className="text-gray-600 mb-4 line-clamp-2">{destination.description}</p>

                    {/* Highlights */}
                    <div className="mb-4">
                      <div className="flex flex-wrap gap-2">
                        {destination.highlights.slice(0, 3).map((highlight, index) => (
                          <span 
                            key={index}
                            className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full"
                          >
                            {highlight}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Details */}
                    <div className="grid grid-cols-2 gap-4 mb-6 text-sm text-gray-600">
                      <div className="flex items-center gap-2">
                        <FaCalendarAlt className="text-blue-500" />
                        <span>{destination.duration}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <FaMapMarkerAlt className="text-red-500" />
                        <span>{destination.bestTime}</span>
                      </div>
                    </div>

                    {/* Reviews */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <FaUsers />
                        <span>{destination.reviews} reviews</span>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-2">
                      <Link 
                        to={`/destination/${destination.id}`}
                        className="flex-1 bg-blue-600 text-white text-center py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors font-medium"
                      >
                        View Details
                      </Link>
                      <Link 
                        to="/flights"
                        className="bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 transition-colors font-medium"
                      >
                        <FaPlane className="inline mr-1" />
                        Book
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Call to Action */}
          <section className="bg-gradient-to-r from-blue-600 to-purple-700 rounded-2xl p-12 text-center text-white">
            <h2 className="text-3xl font-bold mb-4">Can't Find Your Dream Destination?</h2>
            <p className="text-xl mb-8 max-w-2xl mx-auto">
              Our travel experts are here to help you discover hidden gems and create the perfect itinerary.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link 
                to="/contact"
                className="bg-white text-blue-600 px-8 py-4 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
              >
                Contact Our Experts
              </Link>
              <Link 
                to="/flights"
                className="bg-transparent border-2 border-white text-white px-8 py-4 rounded-lg font-semibold hover:bg-white hover:text-blue-600 transition-colors"
              >
                Search Flights
              </Link>
            </div>
          </section>
        </div>
      </div>
      <Footer />
    </>
  );
};

export default Destinations; 