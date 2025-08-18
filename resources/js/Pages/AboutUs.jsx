import React from 'react';
import { Link } from 'react-router-dom';
import { FaHeart, FaShieldAlt, FaUsers, FaGlobe, FaAward, FaHandshake, FaLightbulb, FaRocket, FaStar, FaCheckCircle } from 'react-icons/fa';
import Navbar from './Common/Navbar';
import Footer from './Common/Footer';

const AboutUs = () => {
  const companyHighlights = [
    {
      title: "Global Reach",
      description: "Serving travelers in over 150 countries worldwide",
      icon: <FaGlobe className="text-4xl text-blue-600" />
    },
    {
      title: "Expert Team",
      description: "Over 500 travel professionals with decades of combined experience",
      icon: <FaUsers className="text-4xl text-green-600" />
    },
    {
      title: "Innovation Leader",
      description: "Pioneering AI-powered travel recommendations and mobile solutions",
      icon: <FaLightbulb className="text-4xl text-yellow-600" />
    },
    {
      title: "Customer Satisfaction",
      description: "4.9/5 rating from over 2 million satisfied customers",
      icon: <FaStar className="text-4xl text-purple-600" />
    }
  ];

  const services = [
    {
      title: "Flight Bookings",
      description: "Comprehensive flight search and booking with 500+ airlines worldwide",
      icon: <FaRocket className="text-3xl text-blue-600" />,
      features: ["Best Price Guarantee", "24/7 Support", "Flexible Booking Options"]
    },
    {
      title: "Hotel Accommodations",
      description: "Over 2 million properties from budget to luxury accommodations",
      icon: <FaHandshake className="text-3xl text-green-600" />,
      features: ["Verified Reviews", "Best Rate Guarantee", "Free Cancellation"]
    },
    {
      title: "Cruise Vacations",
      description: "Curated cruise experiences with major cruise lines globally",
      icon: <FaAward className="text-3xl text-purple-600" />,
      features: ["Expert Cruise Planning", "Exclusive Deals", "Shore Excursions"]
    },
    {
      title: "Vacation Packages",
      description: "All-inclusive packages combining flights, hotels, and activities",
      icon: <FaCheckCircle className="text-3xl text-orange-600" />,
      features: ["Custom Itineraries", "Group Discounts", "Travel Insurance"]
    }
  ];

  const achievements = [
    {
      year: "2009",
      achievement: "Company Founded",
      description: "Started with a vision to democratize luxury travel"
    },
    {
      year: "2012",
      achievement: "First Million Customers",
      description: "Reached our first million happy travelers milestone"
    },
    {
      year: "2015",
      achievement: "Global Expansion",
      description: "Expanded to serve customers in over 50 countries"
    },
    {
      year: "2018",
      achievement: "Technology Innovation",
      description: "Launched AI-powered travel recommendation engine"
    },
    {
      year: "2021",
      achievement: "Sustainability Commitment",
      description: "Committed to carbon-neutral operations"
    },
    {
      year: "2024",
      achievement: "Industry Recognition",
      description: "Named one of the top 10 travel companies globally"
    }
  ];

  const teamValues = [
    {
      title: "Passion for Travel",
      description: "Every team member shares a deep love for exploration and discovery",
      icon: <FaHeart className="text-3xl text-red-500" />
    },
    {
      title: "Customer-Centric",
      description: "We put our customers' needs and satisfaction first in everything we do",
      icon: <FaUsers className="text-3xl text-blue-500" />
    },
    {
      title: "Innovation",
      description: "Constantly pushing boundaries to create better travel experiences",
      icon: <FaLightbulb className="text-3xl text-yellow-500" />
    },
    {
      title: "Integrity",
      description: "Operating with complete transparency and ethical practices",
      icon: <FaShieldAlt className="text-3xl text-green-500" />
    }
  ];

  return (
    <>
      <Navbar forceScrolled={true} />
      <div className="min-h-screen bg-gray-50">
        {/* Hero Section */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-700 text-white py-20">
          <div className="container mx-auto px-4 text-center">
            <h1 className="text-5xl font-bold mb-6">About Jetsetterss</h1>
            <p className="text-xl max-w-3xl mx-auto">
              We're passionate about creating extraordinary travel experiences that inspire, 
              connect, and transform lives. Discover what makes us different and why millions 
              of travelers choose Jetsetterss for their adventures.
            </p>
          </div>
        </div>

        <div className="container mx-auto px-4 py-16">
          {/* Who We Are */}
          <section className="mb-20">
            <div className="max-w-4xl mx-auto text-center">
              <h2 className="text-4xl font-bold text-gray-900 mb-8">Who We Are</h2>
              <div className="prose prose-lg mx-auto text-gray-600">
                <p className="mb-6">
                  Jetsetterss is more than just a travel company – we're a community of passionate explorers, 
                  dreamers, and adventure-seekers. Founded in 2009, we've been helping people discover the 
                  world's most incredible destinations for over 15 years.
                </p>
                <p className="mb-6">
                  Our team consists of experienced travelers, industry experts, and technology innovators 
                  who understand that every journey is unique. We believe that travel has the power to 
                  transform lives, broaden perspectives, and create lasting memories.
                </p>
                <p>
                  From the moment you start planning your trip to the day you return home, we're here to 
                  ensure every detail is perfect. We're not just selling travel – we're creating experiences 
                  that will stay with you forever.
                </p>
              </div>
            </div>
          </section>

          {/* Why Choose Jetsetterss */}
          <section className="mb-20">
            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold text-gray-900 mb-4">Why Choose Jetsetterss?</h2>
              <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                Discover what sets us apart and why travelers trust us with their most precious moments
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {companyHighlights.map((highlight, index) => (
                <div key={index} className="bg-white rounded-xl shadow-lg p-8 text-center hover:shadow-xl transition-shadow duration-300">
                  <div className="mb-6">
                    {highlight.icon}
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-4">{highlight.title}</h3>
                  <p className="text-gray-600">{highlight.description}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Comprehensive Travel Services */}
          <section className="mb-20">
            <div className="bg-white rounded-2xl shadow-lg p-12">
              <div className="text-center mb-12">
                <h2 className="text-4xl font-bold text-gray-900 mb-4">Comprehensive Travel Services</h2>
                <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                  From flights to accommodations, we handle every aspect of your journey
                </p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                {services.map((service, index) => (
                  <div key={index} className="text-center">
                    <div className="mb-4">
                      {service.icon}
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 mb-2">{service.title}</h3>
                    <p className="text-gray-600 text-sm">{service.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Our Journey Through the Years */}
          <section className="mb-20">
            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold text-gray-900 mb-4">Our Journey Through the Years</h2>
              <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                Key milestones and achievements that have shaped our company's success
              </p>
            </div>
            
            <div className="max-w-5xl mx-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {achievements.map((achievement, index) => (
                  <div key={index} className="bg-white rounded-xl shadow-lg p-6 text-center hover:shadow-lg transition-shadow duration-300">
                    <div className="text-3xl font-bold text-blue-600 mb-2">{achievement.year}</div>
                    <div className="text-gray-600 font-medium">{achievement.achievement}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* What Drives Our Team */}
          <section className="mb-20">
            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold text-gray-900 mb-4">What Drives Our Team</h2>
              <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                The core values and principles that guide everything we do
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {teamValues.map((value, index) => (
                <div key={index} className="bg-white rounded-xl shadow-lg p-8 hover:shadow-xl transition-shadow duration-300">
                  <div className="flex items-center gap-4 mb-4">
                    {value.icon}
                    <h3 className="text-xl font-bold text-gray-900">{value.title}</h3>
                  </div>
                  <p className="text-gray-600">{value.description}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Commitment to Excellence */}
          <section className="mb-20">
            <div className="bg-gradient-to-r from-blue-600 to-purple-700 rounded-2xl p-12 text-white">
              <div className="text-center mb-8">
                <h2 className="text-3xl font-bold mb-4">Our Commitment to Excellence</h2>
                <p className="text-xl max-w-2xl mx-auto">
                  We're committed to providing the highest level of service and creating 
                  experiences that exceed your expectations
                </p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {companyHighlights.map((commitment, index) => (
                  <div key={index} className="text-center">
                    <div className="mb-4">
                      {commitment.icon}
                    </div>
                    <h3 className="text-xl font-bold mb-2">{commitment.title}</h3>
                    <p className="text-blue-100">{commitment.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Call to Action */}
          <section className="text-center">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Ready to Start Your Journey?</h2>
            <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
              Join millions of travelers who have already discovered the world with Jetsetterss
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link 
                to="/flights"
                className="bg-blue-600 text-white px-8 py-4 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
              >
                Start Planning
              </Link>
              <Link 
                to="/contact"
                className="bg-transparent border-2 border-blue-600 text-blue-600 px-8 py-4 rounded-lg font-semibold hover:bg-blue-600 hover:text-white transition-colors"
              >
                Get in Touch
              </Link>
            </div>
          </section>
        </div>
      </div>
      <Footer />
    </>
  );
};

export default AboutUs; 