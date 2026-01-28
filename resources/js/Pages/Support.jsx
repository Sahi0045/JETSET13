import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { FaHeadset, FaPhone, FaEnvelope, FaWhatsapp, FaClock, FaMapMarkerAlt, FaSearch, FaQuestionCircle, FaTicketAlt, FaBook, FaUserTie, FaGlobe } from 'react-icons/fa';
import Navbar from './Common/Navbar';
import Footer from './Common/Footer';

const Support = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Safe default for office locations to prevent runtime errors
  const officeLocations = [
    // Add real offices here when available
  ];

  const supportCategories = [
    { id: 'all', name: 'All Topics', icon: <FaGlobe /> },
    { id: 'booking', name: 'Booking & Reservations', icon: <FaTicketAlt /> },
    { id: 'flights', name: 'Flights', icon: <FaGlobe /> },
    { id: 'hotels', name: 'Hotels & Accommodations', icon: <FaBook /> },
    { id: 'cruises', name: 'Cruises', icon: <FaGlobe /> },
    { id: 'payments', name: 'Payments & Billing', icon: <FaGlobe /> },
    { id: 'technical', name: 'Technical Support', icon: <FaGlobe /> }
  ];

  const commonIssues = [
    {
      id: 1,
      title: "How do I change or cancel my booking?",
      category: 'booking',
      description: "Learn how to modify or cancel your existing reservations.",
      solution: "You can modify or cancel your booking through your account dashboard or by contacting our support team.",
      link: "#"
    },
    {
      id: 2,
      title: "What documents do I need for international travel?",
      category: 'flights',
      description: "Essential travel documents and requirements for international flights.",
      solution: "Typically you'll need a valid passport, visa (if required), and any COVID-19 related documents.",
      link: "#"
    },
    {
      id: 3,
      title: "How do I check my flight status?",
      category: 'flights',
      description: "Real-time flight tracking and status updates.",
      solution: "Use our flight tracker or check your booking confirmation for the latest updates.",
      link: "#"
    },
    {
      id: 4,
      title: "What's included in my cruise package?",
      category: 'cruises',
      description: "Understanding what's covered in your cruise booking.",
      solution: "Check your booking details for included amenities, meals, and activities.",
      link: "#"
    },
    {
      id: 5,
      title: "How do I reset my password?",
      category: 'technical',
      description: "Password recovery and account access help.",
      solution: "Use the 'Forgot Password' link on the login page or contact support.",
      link: "#"
    },
    {
      id: 6,
      title: "What payment methods do you accept?",
      category: 'payments',
      description: "Accepted payment options and security information.",
      solution: "We accept major credit cards, debit cards, and digital wallets.",
      link: "#"
    }
  ];

  const contactMethods = [
    {
      title: "24/7 Customer Support",
      description: "Round-the-clock assistance for urgent travel issues",
      icon: <FaHeadset className="text-4xl text-blue-600" />,
      contact: "((877) 538-7380)",
      availability: "Available 24/7",
      response: "Immediate response"
    },
    {
      title: "Email Support",
      description: "Detailed inquiries and non-urgent matters",
      icon: <FaEnvelope className="text-4xl text-green-600" />,
      contact: "support@jetsetterss.com",
      availability: "Mon-Fri, 9AM-6PM EST",
      response: "Within 4 hours"
    },
    {
      title: "WhatsApp Support",
      description: "Quick help via WhatsApp messaging",
      icon: <FaWhatsapp className="text-4xl text-green-500" />,
      contact: "((877) 538-7380)",
      availability: "Mon-Sun, 8AM-10PM EST",
      response: "Within 30 minutes"
    }
  ];

  const filteredIssues = commonIssues.filter(issue => {
    const matchesCategory = selectedCategory === 'all' || issue.category === selectedCategory;
    const matchesSearch = issue.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      issue.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <>
      <Navbar forceScrolled={true} />
      <div className="min-h-screen bg-white">
        {/* Hero Section */}
        <div className="border-b border-gray-200 bg-white py-16">
          <div className="container mx-auto px-4 max-w-7xl">
            <h1 className="text-5xl md:text-6xl font-semibold text-neutral-700 mb-4">Customer Support</h1>
            <p className="text-lg text-neutral-600 max-w-2xl">
              We're here to help you every step of the way.
            </p>
          </div>
        </div>

        <div className="container mx-auto px-4 max-w-7xl py-12">
          {/* Quick Contact Section */}
          <section className="mb-16">
            <div className="mb-10">
              <h2 className="text-3xl font-semibold text-neutral-700 mb-3">How Can We Help You?</h2>
              <p className="text-lg text-neutral-600">
                Choose the most convenient way to get in touch
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {contactMethods.map((method, index) => (
                <div key={index} className="bg-white rounded-xl border border-gray-200 p-8 hover:shadow-lg transition-shadow duration-300">
                  <div className="mb-5 text-neutral-700">
                    {method.icon}
                  </div>
                  <h3 className="text-xl font-semibold text-neutral-700 mb-3">{method.title}</h3>
                  <p className="text-neutral-600 mb-5 text-sm">{method.description}</p>

                  <div className="space-y-2.5 text-sm text-neutral-500 mb-6 pb-6 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                      <FaClock className="text-xs text-neutral-400" />
                      <span>{method.availability}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <FaUserTie className="text-xs text-neutral-400" />
                      <span>{method.response}</span>
                    </div>
                  </div>

                  {method.title === "WhatsApp Support" ? (
                    <a
                      href={`https://wa.me/18005378381`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-full bg-primary-500 text-white py-3 px-6 rounded-xl hover:bg-primary-600 transition-colors font-medium text-center"
                    >
                      {method.contact}
                    </a>
                  ) : (
                    <div className="text-base font-medium text-primary-500">
                      {method.contact}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Search and Help Section */}
          <section className="mb-16">
            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-8">
              <div className="mb-8">
                <h2 className="text-2xl font-semibold text-neutral-700 mb-2">Find Quick Answers</h2>
                <p className="text-neutral-600">
                  Search our knowledge base for instant solutions
                </p>
              </div>

              {/* Search Bar */}
              <div className="max-w-2xl mb-8">
                <div className="relative">
                  <FaSearch className="absolute left-4 top-1/2 transform -translate-y-1/2 text-neutral-400" />
                  <input
                    type="text"
                    placeholder="Search for help articles..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-12 pr-4 py-3.5 border border-gray-300 rounded-xl focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
              </div>

              {/* Category Filter */}
              <div className="flex flex-wrap gap-2 mb-8">
                {supportCategories.map((category) => (
                  <button
                    key={category.id}
                    onClick={() => setSelectedCategory(category.id)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${selectedCategory === category.id
                        ? 'bg-neutral-700 text-white'
                        : 'bg-white text-neutral-700 hover:bg-gray-50 border border-gray-300'
                      }`}
                  >
                    {category.icon}
                    {category.name}
                  </button>
                ))}
              </div>

              {/* Common Issues */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredIssues.map((issue) => (
                  <div key={issue.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-3">
                      <h3 className="text-base font-semibold text-neutral-700 pr-4">{issue.title}</h3>
                      <FaQuestionCircle className="text-primary-500 flex-shrink-0" />
                    </div>
                    <p className="text-sm text-neutral-600 mb-3 leading-relaxed">{issue.description}</p>
                    <p className="text-sm text-neutral-700 mb-3">{issue.solution}</p>
                    <Link
                      to={issue.link}
                      className="text-primary-500 hover:text-primary-600 font-medium text-sm inline-flex items-center"
                    >
                      Learn More
                      <svg className="ml-1 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Office Locations */}
          {Array.isArray(officeLocations) && officeLocations.length > 0 && (
            <section className="mb-16">
              <div className="mb-10">
                <h2 className="text-3xl font-semibold text-neutral-700 mb-3">Visit Our Offices</h2>
                <p className="text-lg text-neutral-600">
                  Drop by for in-person assistance
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {officeLocations.map((office, index) => (
                  <div key={index} className="bg-white rounded-xl border border-gray-200 p-8">
                    <div className="mb-6">
                      {office.icon}
                    </div>
                    <h3 className="text-xl font-semibold text-neutral-700 mb-3">{office.city}</h3>
                    <p className="text-neutral-600 mb-4">
                      {office.address}<br />
                      {office.country}
                    </p>
                    <div className="text-sm text-neutral-500">
                      <div className="flex items-center gap-2 mb-2">
                        <FaClock />
                        <span>{office.hours}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <FaPhone />
                        <span>{office.phone}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Additional Support Options */}
          <section className="bg-gray-50 border border-gray-200 rounded-2xl p-12 text-center">
            <h2 className="text-3xl font-semibold text-neutral-700 mb-3">Still Need Help?</h2>
            <p className="text-lg text-neutral-600 mb-8 max-w-2xl mx-auto">
              Our dedicated support team is committed to ensuring you have the best travel experience.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                to="/contact"
                className="bg-neutral-700 text-white px-8 py-3.5 rounded-xl font-medium hover:bg-neutral-800 transition-colors"
              >
                Contact Us
              </Link>
              <Link
                to="/faqs"
                className="bg-white border-2 border-neutral-700 text-neutral-700 px-8 py-3.5 rounded-xl font-medium hover:bg-gray-50 transition-colors"
              >
                View FAQs
              </Link>
            </div>
          </section>
        </div>
      </div>
      <Footer />
    </>
  );
};

export default Support; 
