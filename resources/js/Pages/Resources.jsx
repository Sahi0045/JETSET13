import React from 'react';
import { Link } from 'react-router-dom';
import { FaMapMarkedAlt, FaPlane, FaHotel, FaShip, FaCar, FaPassport, FaGlobe, FaCalendarAlt, FaCreditCard, FaShieldAlt } from 'react-icons/fa';
import Navbar from './Common/Navbar';
import Footer from './Common/Footer';

const Resources = () => {
  const travelGuides = [
    {
      title: "First-Time Traveler's Guide",
      description: "Essential tips and advice for new travelers embarking on their first adventure.",
      icon: <FaPassport className="text-3xl text-blue-600" />,
      link: "#"
    },
    {
      title: "Budget Travel Tips",
      description: "Smart strategies to make your dream vacation affordable without compromising quality.",
      icon: <FaCreditCard className="text-3xl text-green-600" />,
      link: "#"
    },
    {
      title: "Travel Safety Guide",
      description: "Important safety tips and precautions for traveling to different destinations.",
      icon: <FaShieldAlt className="text-3xl text-red-600" />,
      link: "#"
    }
  ];

  const travelTools = [
    {
      title: "Currency Converter",
      description: "Real-time exchange rates and currency conversion for global destinations.",
      icon: <FaGlobe className="text-3xl text-purple-600" />,
      link: "#"
    },
    {
      title: "Travel Checklist",
      description: "Comprehensive packing lists and travel preparation checklists.",
      icon: <FaCalendarAlt className="text-3xl text-orange-600" />,
      link: "#"
    },
    {
      title: "Visa Requirements",
      description: "Up-to-date visa information for countries around the world.",
      icon: <FaPassport className="text-3xl text-indigo-600" />,
      link: "#"
    }
  ];

  const transportationGuides = [
    {
      title: "Flight Booking Guide",
      description: "Tips for finding the best flight deals and booking strategies.",
      icon: <FaPlane className="text-3xl text-blue-600" />,
      link: "#"
    },
    {
      title: "Hotel Selection Tips",
      description: "How to choose the perfect accommodation for your travel style.",
      icon: <FaHotel className="text-3xl text-green-600" />,
      link: "#"
    },
    {
      title: "Cruise Planning",
      description: "Everything you need to know about planning the perfect cruise vacation.",
      icon: <FaShip className="text-3xl text-teal-600" />,
      link: "#"
    },
    {
      title: "Car Rental Guide",
      description: "Smart tips for renting cars and navigating foreign roads.",
      icon: <FaCar className="text-3xl text-orange-600" />,
      link: "#"
    }
  ];

  return (
    <>
      <Navbar forceScrolled={true} />
      <div className="min-h-screen bg-gray-50">
        {/* Hero Section */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-700 text-white py-20">
          <div className="container mx-auto px-4 text-center">
            <h1 className="text-5xl font-bold mb-6">Travel Resources</h1>
            <p className="text-xl max-w-3xl mx-auto">
              Your comprehensive guide to smarter, safer, and more enjoyable travel experiences. 
              Discover expert tips, essential tools, and insider knowledge to make every journey extraordinary.
            </p>
          </div>
        </div>

        <div className="container mx-auto px-4 py-16">
          {/* Travel Guides Section */}
          <section className="mb-20">
            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold text-gray-900 mb-4">Essential Travel Guides</h2>
              <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                Expert advice and comprehensive guides to help you plan and enjoy your travels
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {travelGuides.map((guide, index) => (
                <div key={index} className="bg-white rounded-xl shadow-lg p-8 hover:shadow-xl transition-shadow duration-300">
                  <div className="text-center mb-6">
                    {guide.icon}
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-4 text-center">{guide.title}</h3>
                  <p className="text-gray-600 text-center mb-6">{guide.description}</p>
                  <div className="text-center">
                    <Link 
                      to={guide.link}
                      className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Read More
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Travel Tools Section */}
          <section className="mb-20">
            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold text-gray-900 mb-4">Travel Tools & Calculators</h2>
              <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                Practical tools to help you plan, budget, and prepare for your adventures
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {travelTools.map((tool, index) => (
                <div key={index} className="bg-white rounded-xl shadow-lg p-8 hover:shadow-xl transition-shadow duration-300">
                  <div className="text-center mb-6">
                    {tool.icon}
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-4 text-center">{tool.title}</h3>
                  <p className="text-gray-600 text-center mb-6">{tool.description}</p>
                  <div className="text-center">
                    <Link 
                      to={tool.link}
                      className="inline-block bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors"
                    >
                      Access Tool
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Transportation Guides Section */}
          <section className="mb-20">
            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold text-gray-900 mb-4">Transportation & Accommodation</h2>
              <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                Comprehensive guides for all your transportation and lodging needs
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              {transportationGuides.map((guide, index) => (
                <div key={index} className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow duration-300">
                  <div className="text-center mb-4">
                    {guide.icon}
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-3 text-center">{guide.title}</h3>
                  <p className="text-gray-600 text-center mb-4 text-sm">{guide.description}</p>
                  <div className="text-center">
                    <Link 
                      to={guide.link}
                      className="inline-block bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors text-sm"
                    >
                      Learn More
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Call to Action */}
          <section className="bg-gradient-to-r from-blue-600 to-purple-700 rounded-2xl p-12 text-center text-white">
            <h2 className="text-3xl font-bold mb-4">Ready to Start Your Journey?</h2>
            <p className="text-xl mb-8 max-w-2xl mx-auto">
              Explore our comprehensive resources and start planning your next adventure with confidence.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link 
                to="/flights"
                className="bg-white text-blue-600 px-8 py-4 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
              >
                Book Your Flight
              </Link>
              <Link 
                to="/cruises"
                className="bg-transparent border-2 border-white text-white px-8 py-4 rounded-lg font-semibold hover:bg-white hover:text-blue-600 transition-colors"
              >
                Explore Cruises
              </Link>
            </div>
          </section>
        </div>
      </div>
      <Footer />
    </>
  );
};

export default Resources; 