import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { FaHeadset, FaPhone, FaEnvelope, FaComments, FaWhatsapp, FaClock, FaMapMarkerAlt, FaSearch, FaQuestionCircle, FaTicketAlt, FaBook, FaUserTie, FaGlobe } from 'react-icons/fa';
import Navbar from './Common/Navbar';
import Footer from './Common/Footer';

const Support = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

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
      contact: "+1 (800) JET-SET-1",
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
      title: "Live Chat",
      description: "Real-time assistance with our travel experts",
      icon: <FaComments className="text-4xl text-purple-600" />,
      contact: "Start Chat",
      availability: "Mon-Sun, 8AM-10PM EST",
      response: "Instant response"
    },
    {
      title: "WhatsApp Support",
      description: "Quick help via WhatsApp messaging",
      icon: <FaWhatsapp className="text-4xl text-green-500" />,
      contact: "+1 (800) JET-SET-1",
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
      <div className="min-h-screen bg-gray-50">
        {/* Hero Section */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-700 text-white py-20">
          <div className="container mx-auto px-4 text-center">
            <h1 className="text-5xl font-bold mb-6">Customer Support</h1>
            <p className="text-xl max-w-3xl mx-auto">
              We're here to help you every step of the way. Get assistance with bookings, 
              travel questions, or any other concerns you might have.
            </p>
          </div>
        </div>

        <div className="container mx-auto px-4 py-16">
          {/* Quick Contact Section */}
          <section className="mb-20">
            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold text-gray-900 mb-4">How Can We Help You?</h2>
              <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                Choose the most convenient way to get in touch with our support team
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              {contactMethods.map((method, index) => (
                <div key={index} className="bg-white rounded-xl shadow-lg p-8 text-center hover:shadow-xl transition-shadow duration-300">
                  <div className="mb-6">
                    {method.icon}
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">{method.title}</h3>
                  <p className="text-gray-600 mb-4">{method.description}</p>
                  
                  <div className="space-y-2 text-sm text-gray-600 mb-6">
                    <div className="flex items-center justify-center gap-2">
                      <FaClock className="text-blue-500" />
                      <span>{method.availability}</span>
                    </div>
                    <div className="flex items-center justify-center gap-2">
                      <FaUserTie className="text-green-500" />
                      <span>{method.response}</span>
                    </div>
                  </div>

                  {method.title === "Live Chat" ? (
                    <button className="w-full bg-purple-600 text-white py-3 px-6 rounded-lg hover:bg-purple-700 transition-colors font-medium">
                      {method.contact}
                    </button>
                  ) : method.title === "WhatsApp Support" ? (
                    <a 
                      href={`https://wa.me/18005378381`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-full bg-green-500 text-white py-3 px-6 rounded-lg hover:bg-green-700 transition-colors font-medium"
                    >
                      {method.contact}
                    </a>
                  ) : (
                    <div className="text-lg font-semibold text-blue-600">
                      {method.contact}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Search and Help Section */}
          <section className="mb-20">
            <div className="bg-white rounded-2xl shadow-lg p-8">
              <div className="text-center mb-8">
                <h2 className="text-3xl font-bold text-gray-900 mb-4">Find Quick Answers</h2>
                <p className="text-gray-600 max-w-2xl mx-auto">
                  Search our knowledge base for instant solutions to common questions
                </p>
              </div>

              {/* Search Bar */}
              <div className="max-w-2xl mx-auto mb-8">
                <div className="relative">
                  <FaSearch className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 text-xl" />
                  <input
                    type="text"
                    placeholder="Search for help articles, FAQs, or common issues..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-12 pr-4 py-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
                  />
                </div>
              </div>

              {/* Category Filter */}
              <div className="flex flex-wrap justify-center gap-3 mb-8">
                {supportCategories.map((category) => (
                  <button
                    key={category.id}
                    onClick={() => setSelectedCategory(category.id)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
                      selectedCategory === category.id
                        ? 'bg-blue-600 text-white shadow-lg'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {category.icon}
                    {category.name}
                  </button>
                ))}
              </div>

              {/* Common Issues */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {filteredIssues.map((issue) => (
                  <div key={issue.id} className="bg-gray-50 rounded-lg p-6 hover:bg-gray-100 transition-colors">
                    <div className="flex items-start justify-between mb-3">
                      <h3 className="text-lg font-semibold text-gray-900">{issue.title}</h3>
                      <FaQuestionCircle className="text-blue-500 mt-1" />
                    </div>
                    <p className="text-gray-600 mb-3">{issue.description}</p>
                    <p className="text-sm text-gray-700 mb-4 font-medium">{issue.solution}</p>
                    <Link 
                      to={issue.link}
                      className="text-blue-600 hover:text-blue-700 font-medium text-sm"
                    >
                      Learn More →
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Office Locations */}
          <section className="mb-20">
            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold text-gray-900 mb-4">Visit Our Offices</h2>
              <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                Drop by our offices for in-person assistance and travel consultations
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {officeLocations.map((office, index) => (
                <div key={index} className="bg-white rounded-xl shadow-lg p-8 text-center">
                  <div className="mb-6">
                    {office.icon}
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">{office.city}</h3>
                  <p className="text-gray-600 mb-4">
                    {office.address}<br />
                    {office.country}
                  </p>
                  <div className="text-sm text-gray-500">
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <FaClock />
                      <span>{office.hours}</span>
                    </div>
                    <div className="flex items-center justify-center gap-2">
                      <FaPhone />
                      <span>{office.phone}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Additional Support Options */}
          <section className="bg-gradient-to-r from-blue-600 to-purple-700 rounded-2xl p-12 text-center text-white">
            <h2 className="text-3xl font-bold mb-4">Still Need Help?</h2>
            <p className="text-xl mb-8 max-w-2xl mx-auto">
              Our dedicated support team is committed to ensuring you have the best travel experience possible.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link 
                to="/contact"
                className="bg-white text-blue-600 px-8 py-4 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
              >
                Contact Us
              </Link>
              <Link 
                to="/faqs"
                className="bg-transparent border-2 border-white text-white px-8 py-4 rounded-lg font-semibold hover:bg-white hover:text-blue-600 transition-colors"
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