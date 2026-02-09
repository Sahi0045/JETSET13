import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FaMapMarkerAlt,
  FaStar,
  FaPlane,
  FaCalendarAlt,
  FaUsers,
  FaGlobe,
  FaShip,
  FaHotel,
  FaCar
} from 'react-icons/fa';
import Navbar from './Common/Navbar';
import Footer from './Common/Footer';
import Price from '../Components/Price';

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
    // ===== NORTH AMERICA =====
    {
      id: 1,
      name: 'New York City, USA',
      category: 'city',
      image: 'https://images.unsplash.com/photo-1534447677768-be436bb09401',
      description: 'The city that never sleeps, offering iconic landmarks and vibrant culture.',
      rating: 4.9,
      reviews: 2543,
      price: 999,
      duration: '3–7 days',
      highlights: ['Broadway', 'Statue of Liberty', 'Central Park'],
      bestTime: 'Apr–Jun, Sep–Nov'
    },
    {
      id: 2,
      name: 'Los Angeles, USA',
      category: 'city',
      image: 'https://images.unsplash.com/photo-1502920514313-52581002a659',
      description: 'Hollywood glamour, beaches, and endless entertainment.',
      rating: 4.7,
      reviews: 1820,
      price: 1099,
      duration: '4–8 days',
      highlights: ['Hollywood', 'Santa Monica', 'Beverly Hills'],
      bestTime: 'Mar–Oct'
    },
    {
      id: 3,
      name: 'Miami, USA',
      category: 'beach',
      image: 'https://images.unsplash.com/photo-1505731132164-cca903a55486',
      description: 'Tropical beaches, nightlife, and Latin culture.',
      rating: 4.8,
      reviews: 1432,
      price: 899,
      duration: '3–6 days',
      highlights: ['South Beach', 'Nightlife', 'Cruises'],
      bestTime: 'Nov–Apr'
    },
    {
      id: 4,
      name: 'Toronto, Canada',
      category: 'city',
      image: 'https://images.unsplash.com/photo-1507992781348-310259076fe0',
      description: 'Cosmopolitan city with iconic skyline and cultural diversity.',
      rating: 4.7,
      reviews: 1103,
      price: 1049,
      duration: '4–7 days',
      highlights: ['CN Tower', 'Niagara Falls', 'Downtown'],
      bestTime: 'May–Sep'
    },
    {
      id: 5,
      name: 'Vancouver, Canada',
      category: 'adventure',
      image: 'https://images.unsplash.com/photo-1506045412240-22980140a405',
      description: 'Mountains, ocean, and outdoor adventures.',
      rating: 4.8,
      reviews: 980,
      price: 1199,
      duration: '5–9 days',
      highlights: ['Stanley Park', 'Hiking', 'Whistler'],
      bestTime: 'Jun–Sep'
    },

    // ===== INDIA =====
    {
      id: 6,
      name: 'Mumbai, India',
      category: 'city',
      image: 'https://images.unsplash.com/photo-1595658658481-d53d3f999875',
      description: 'The financial capital of India with vibrant nightlife.',
      rating: 4.6,
      reviews: 1650,
      price: 499,
      duration: '3–6 days',
      highlights: ['Marine Drive', 'Gateway of India', 'Street Food'],
      bestTime: 'Nov–Feb'
    },
    {
      id: 7,
      name: 'Delhi, India',
      category: 'cultural',
      image: 'https://images.unsplash.com/photo-1587474260584-136574528ed5',
      description: 'Historic capital rich in culture and heritage.',
      rating: 4.5,
      reviews: 1490,
      price: 449,
      duration: '3–5 days',
      highlights: ['Red Fort', 'Qutub Minar', 'Old Delhi'],
      bestTime: 'Oct–Mar'
    },
    {
      id: 8,
      name: 'Goa, India',
      category: 'beach',
      image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e',
      description: 'India\'s most popular beach destination.',
      rating: 4.8,
      reviews: 2310,
      price: 399,
      duration: '4–7 days',
      highlights: ['Beaches', 'Nightlife', 'Water Sports'],
      bestTime: 'Nov–Feb'
    },
    {
      id: 9,
      name: 'Jaipur, India',
      category: 'cultural',
      image: 'https://images.unsplash.com/photo-1548013146-72479768bada',
      description: 'The Pink City with royal palaces and forts.',
      rating: 4.7,
      reviews: 1215,
      price: 499,
      duration: '3–5 days',
      highlights: ['Amber Fort', 'Hawa Mahal', 'City Palace'],
      bestTime: 'Oct–Mar'
    },

    // ===== FRANCE =====
    {
      id: 10,
      name: 'Paris, France',
      category: 'city',
      image: 'https://images.unsplash.com/photo-1502602898536-47ad22581b52',
      description: 'The City of Light with art, romance, and cuisine.',
      rating: 4.9,
      reviews: 2156,
      price: 1299,
      duration: '5–10 days',
      highlights: ['Eiffel Tower', 'Louvre', 'Seine Cruise'],
      bestTime: 'Apr–Jun, Sep–Oct'
    },
    {
      id: 11,
      name: 'Nice, France',
      category: 'beach',
      image: 'https://images.unsplash.com/photo-1505739772255-7f1fd0f2c0be',
      description: 'French Riviera beauty with Mediterranean charm.',
      rating: 4.8,
      reviews: 890,
      price: 1199,
      duration: '4–7 days',
      highlights: ['Promenade', 'Beaches', 'Old Town'],
      bestTime: 'May–Sep'
    },
    {
      id: 12,
      name: 'Marseille, France',
      category: 'cultural',
      image: 'https://images.unsplash.com/photo-1605113286275-ec1d80d048bb',
      description: 'Historic port city with stunning coastline.',
      rating: 4.6,
      reviews: 670,
      price: 1049,
      duration: '4–6 days',
      highlights: ['Old Port', 'Calanques', 'Seafood'],
      bestTime: 'Apr–Oct'
    },
    {
      id: 13,
      name: 'Lyon, France',
      category: 'cultural',
      image: 'https://images.unsplash.com/photo-1599134842279-fe807d23316e',
      description: 'Gastronomic capital of France.',
      rating: 4.7,
      reviews: 540,
      price: 1099,
      duration: '3–5 days',
      highlights: ['Cuisine', 'Old Town', 'Rivers'],
      bestTime: 'Apr–Jun, Sep'
    }
  ];

  const filteredDestinations =
    selectedCategory === 'all'
      ? destinations
      : destinations.filter(d => d.category === selectedCategory);

  return (
    <>
      <Navbar forceScrolled />

      <main className="min-h-screen bg-white">
        {/* HERO */}
        <section className="border-b border-gray-200 bg-white py-16">
          <div className="container mx-auto px-4 max-w-7xl">
            <h1 className="text-5xl md:text-6xl font-semibold text-neutral-700 mb-4">
              Explore Destinations
            </h1>
            <p className="text-lg text-neutral-600 max-w-2xl">
              Discover the world's most beautiful cities, beaches, and cultural landmarks.
            </p>
          </div>
        </section>

        {/* CONTENT */}
        <section className="container mx-auto px-4 max-w-7xl py-12">
          {/* FILTER */}
          <div className="flex flex-wrap gap-3 mb-12">
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium transition-all duration-200 ${selectedCategory === cat.id
                  ? 'bg-neutral-700 text-white'
                  : 'bg-white text-neutral-700 hover:bg-gray-50 border border-gray-300'
                  }`}
              >
                {cat.icon}
                {cat.name}
              </button>
            ))}
          </div>

          {/* GRID */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredDestinations.map(dest => (
              <div
                key={dest.id}
                className="group bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg transition-all duration-300"
              >
                <div className="relative">
                  <img
                    src={dest.image}
                    alt={dest.name}
                    className="h-56 w-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                </div>
                <div className="p-5">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-semibold text-lg text-neutral-700 line-clamp-1">{dest.name}</h3>
                    <span className="flex items-center gap-1 text-sm flex-shrink-0 ml-2">
                      <FaStar className="text-neutral-700 text-xs" />
                      <span className="font-medium text-neutral-700">{dest.rating}</span>
                    </span>
                  </div>

                  <p className="text-sm text-neutral-600 mb-4 line-clamp-2 leading-relaxed">
                    {dest.description}
                  </p>

                  <div className="space-y-2 mb-4 pb-4 border-b border-gray-100">
                    <div className="flex justify-between text-xs text-neutral-500">
                      <span>{dest.duration}</span>
                      <span className="font-medium text-neutral-700">From <Price amount={dest.price} /></span>
                    </div>
                  </div>

                  <Link
                    to={`/destination/${dest.id}`}
                    className="block w-full bg-neutral-700 text-white text-center py-2.5 rounded-xl hover:bg-neutral-800 transition-colors font-medium text-sm"
                  >
                    View Details
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
};

export default Destinations;
