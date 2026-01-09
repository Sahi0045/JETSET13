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
      price: 'From $999',
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
      price: 'From $1,099',
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
      price: 'From $899',
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
      price: 'From $1,049',
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
      price: 'From $1,199',
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
      price: 'From $499',
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
      price: 'From $449',
      duration: '3–5 days',
      highlights: ['Red Fort', 'Qutub Minar', 'Old Delhi'],
      bestTime: 'Oct–Mar'
    },
    {
      id: 8,
      name: 'Goa, India',
      category: 'beach',
      image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e',
      description: 'India’s most popular beach destination.',
      rating: 4.8,
      reviews: 2310,
      price: 'From $399',
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
      price: 'From $499',
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
      price: 'From $1,299',
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
      price: 'From $1,199',
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
      price: 'From $1,049',
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
      price: 'From $1,099',
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

      <main className="min-h-screen bg-gray-50">
        {/* HERO */}
        <section className="bg-gradient-to-r from-blue-600 to-purple-700 text-white py-20">
          <div className="container mx-auto px-4 text-center">
            <h1 className="text-4xl md:text-5xl font-bold mb-6">
              Explore Amazing Destinations
            </h1>
            <p className="text-lg md:text-xl max-w-3xl mx-auto">
              Discover the world’s most beautiful cities, beaches, and cultural landmarks.
            </p>
          </div>
        </section>

        {/* CONTENT */}
        <section className="container mx-auto px-4 py-16">
          {/* FILTER */}
          <div className="flex flex-wrap justify-center gap-4 mb-12">
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`flex items-center gap-2 px-6 py-3 rounded-full transition ${
                  selectedCategory === cat.id
                    ? 'bg-blue-600 text-white shadow'
                    : 'bg-white border text-gray-700 hover:bg-gray-100'
                }`}
              >
                {cat.icon}
                {cat.name}
              </button>
            ))}
          </div>

          {/* GRID */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
            {filteredDestinations.map(dest => (
              <div
                key={dest.id}
                className="bg-white rounded-xl shadow hover:shadow-xl transition overflow-hidden"
              >
                <img
                  src={dest.image}
                  alt={dest.name}
                  className="h-48 w-full object-cover"
                />
                <div className="p-6">
                  <div className="flex justify-between mb-2">
                    <h3 className="font-bold text-lg">{dest.name}</h3>
                    <span className="flex items-center gap-1 text-sm">
                      <FaStar className="text-yellow-400" />
                      {dest.rating}
                    </span>
                  </div>

                  <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                    {dest.description}
                  </p>

                  <div className="flex justify-between text-sm text-gray-500 mb-4">
                    <span className="flex items-center gap-1">
                      <FaCalendarAlt /> {dest.duration}
                    </span>
                    <span className="flex items-center gap-1">
                      <FaMapMarkerAlt /> {dest.bestTime}
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <Link
                      to={`/destination/${dest.id}`}
                      className="flex-1 bg-blue-600 text-white text-center py-2 rounded hover:bg-blue-700"
                    >
                      View
                    </Link>
                    <Link
                      to="/flights"
                      className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
                    >
                      <FaPlane />
                    </Link>
                  </div>
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
