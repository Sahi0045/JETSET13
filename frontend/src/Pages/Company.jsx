import React from 'react';
import { Link } from 'react-router-dom';
import { FaGlobe, FaHeart, FaShieldAlt, FaRocket, FaHandshake, FaLightbulb, FaChartLine, FaStar } from 'react-icons/fa';
import Navbar from './Common/Navbar';
import Footer from './Common/Footer';
import Breadcrumb from '../components/Breadcrumb';

const Company = () => {
  const values = [
    {
      title: "Customer First",
      description: "Every decision we make is guided by what's best for our customers. We believe in putting their needs and satisfaction above everything else.",
      icon: <FaHeart className="text-4xl text-red-500" />
    },
    {
      title: "Innovation",
      description: "We constantly push boundaries to create better travel experiences through technology, creativity, and forward-thinking solutions.",
      icon: <FaLightbulb className="text-4xl text-yellow-500" />
    },
    {
      title: "Integrity",
      description: "We operate with complete transparency, honesty, and ethical practices in all our business relationships and customer interactions.",
      icon: <FaShieldAlt className="text-4xl text-blue-500" />
    },
    {
      title: "Excellence",
      description: "We strive for excellence in every aspect of our service, from customer support to the travel experiences we curate.",
      icon: <FaStar className="text-4xl text-purple-500" />
    },
    {
      title: "Collaboration",
      description: "We believe in the power of partnerships and teamwork, both within our organization and with our global network of travel partners.",
      icon: <FaHandshake className="text-4xl text-green-500" />
    },
    {
      title: "Growth",
      description: "We're committed to continuous improvement and growth, both as a company and in helping our customers grow through travel.",
      icon: <FaChartLine className="text-4xl text-orange-500" />
    }
  ];

  return (
    <>
      <Navbar forceScrolled={true} />
      <main className="min-h-screen bg-gray-50">
        <Breadcrumb items={[{ name: 'Company', path: '/company' }]} />
        {/* Hero Section */}
        <section className="bg-gradient-to-r from-blue-600 to-purple-700 text-white py-20">
          <div className="container mx-auto px-4 text-center">
            <h1 className="text-5xl font-bold mb-6">About Jetsetters</h1>
            <p className="text-xl max-w-3xl mx-auto">
              We're more than just a travel company. We're your partners in creating unforgettable experiences 
              and making the world more accessible, one journey at a time.
            </p>
          </div>
        </section>

        <div className="container mx-auto px-4 py-16">
          {/* Who We Are */}
          <section className="mb-20">
            <div className="max-w-4xl mx-auto text-center">
              <h2 className="text-4xl font-bold text-gray-900 mb-8">Who We Are</h2>
              <div className="prose prose-lg mx-auto text-gray-600">
                <p className="mb-6">
                  Jetsetters Corporation is a travel agency based in Tracy, California. We book flights,
                  cruises, holiday packages and visa services, and our team is a phone call or an email
                  away when you need help.
                </p>
                <p>
                  Headquarters: 513 W Bonaventure Ave, Tracy, CA 95391, USA.
                </p>
              </div>
            </div>
          </section>

          {/* Mission & Vision */}
          <section className="mb-20">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
              <div className="bg-white rounded-xl shadow-lg p-8">
                <div className="text-center mb-6">
                  <FaRocket className="text-5xl text-blue-600 mx-auto mb-4" />
                  <h3 className="text-2xl font-bold text-gray-900">Our Mission</h3>
                </div>
                <p className="text-gray-600 text-center">
                  To inspire and enable people to explore the world by providing exceptional travel experiences, 
                  innovative technology, and personalized service that makes every journey extraordinary.
                </p>
              </div>
              
              <div className="bg-white rounded-xl shadow-lg p-8">
                <div className="text-center mb-6">
                  <FaGlobe className="text-5xl text-purple-600 mx-auto mb-4" />
                  <h3 className="text-2xl font-bold text-gray-900">Our Vision</h3>
                </div>
                <p className="text-gray-600 text-center">
                  To be the world's most trusted and innovative travel platform, connecting people with 
                  transformative experiences that enrich their lives and broaden their perspectives.
                </p>
              </div>
            </div>
          </section>

          {/* Our Values */}
          <section className="mb-20">
            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold text-gray-900 mb-4">Our Values</h2>
              <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                The principles that guide everything we do and every decision we make
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {values.map((value, index) => (
                <div key={index} className="bg-white rounded-xl shadow-lg p-8 text-center hover:shadow-xl transition-shadow duration-300">
                  <div className="mb-6">
                    {value.icon}
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-4">{value.title}</h3>
                  <p className="text-gray-600">{value.description}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Call to Action */}
          <section className="bg-gradient-to-r from-blue-600 to-purple-700 rounded-2xl p-12 text-center text-white">
            <h2 className="text-3xl font-bold mb-4">Join Us on Our Journey</h2>
            <p className="text-xl mb-8 max-w-2xl mx-auto">
              Whether you're looking to travel with us or join our team, we'd love to hear from you.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                to="/careers"
                className="bg-white text-blue-600 px-8 py-4 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
              >
                View Careers
              </Link>
              <Link
                to="/contact"
                className="bg-transparent border-2 border-white text-white px-8 py-4 rounded-lg font-semibold hover:bg-white hover:text-blue-600 transition-colors"
              >
                Get in Touch
              </Link>
            </div>
          </section>

          {/* Explore Our Services */}
          <section className="mt-16">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Explore Our Services</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <Link to="/flights" className="bg-white rounded-xl shadow-md p-5 text-center hover:shadow-lg transition-shadow group">
                <FaGlobe className="text-2xl text-gray-400 group-hover:text-blue-600 transition-colors mx-auto mb-2" />
                <span className="text-sm font-medium text-gray-700">Flights</span>
              </Link>
              <Link to="/hotels" className="bg-white rounded-xl shadow-md p-5 text-center hover:shadow-lg transition-shadow group">
                <FaGlobe className="text-2xl text-gray-400 group-hover:text-blue-600 transition-colors mx-auto mb-2" />
                <span className="text-sm font-medium text-gray-700">Hotels</span>
              </Link>
              <Link to="/cruise" className="bg-white rounded-xl shadow-md p-5 text-center hover:shadow-lg transition-shadow group">
                <FaGlobe className="text-2xl text-gray-400 group-hover:text-blue-600 transition-colors mx-auto mb-2" />
                <span className="text-sm font-medium text-gray-700">Cruises</span>
              </Link>
              <Link to="/packages" className="bg-white rounded-xl shadow-md p-5 text-center hover:shadow-lg transition-shadow group">
                <FaGlobe className="text-2xl text-gray-400 group-hover:text-blue-600 transition-colors mx-auto mb-2" />
                <span className="text-sm font-medium text-gray-700">Packages</span>
              </Link>
              <Link to="/visa" className="bg-white rounded-xl shadow-md p-5 text-center hover:shadow-lg transition-shadow group">
                <FaGlobe className="text-2xl text-gray-400 group-hover:text-blue-600 transition-colors mx-auto mb-2" />
                <span className="text-sm font-medium text-gray-700">Visa Services</span>
              </Link>
              <Link to="/destinations" className="bg-white rounded-xl shadow-md p-5 text-center hover:shadow-lg transition-shadow group">
                <FaGlobe className="text-2xl text-gray-400 group-hover:text-blue-600 transition-colors mx-auto mb-2" />
                <span className="text-sm font-medium text-gray-700">Destinations</span>
              </Link>
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
};

export default Company; 