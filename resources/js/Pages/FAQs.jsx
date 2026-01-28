import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { FaSearch, FaChevronDown, FaChevronUp, FaQuestionCircle, FaPlane, FaHotel, FaShip, FaCreditCard, FaPassport, FaGlobe } from 'react-icons/fa';
import Navbar from './Common/Navbar';
import Footer from './Common/Footer';

const FAQs = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedItems, setExpandedItems] = useState(new Set([1, 2])); // Start with first two expanded

  const faqCategories = [
    {
      id: 'general',
      name: 'General Travel',
      icon: <FaGlobe />,
      color: 'blue'
    },
    {
      id: 'flights',
      name: 'Flights',
      icon: <FaPlane />,
      color: 'green'
    },
    {
      id: 'hotels',
      name: 'Hotels & Accommodations',
      icon: <FaHotel />,
      color: 'purple'
    },
    {
      id: 'cruises',
      name: 'Cruises',
      icon: <FaShip />,
      color: 'teal'
    },
    {
      id: 'payments',
      name: 'Payments & Billing',
      icon: <FaCreditCard />,
      color: 'orange'
    },
    {
      id: 'documents',
      name: 'Travel Documents',
      icon: <FaPassport />,
      color: 'red'
    }
  ];

  const faqItems = [
    // General Travel
    {
      id: 1,
      category: 'general',
      question: "What is Jetsetterss and how does it work?",
      answer: "Jetsetterss is a comprehensive travel platform that helps you plan, book, and manage your travel experiences. We offer flights, hotels, cruises, and vacation packages. Simply search for your desired destination, compare options, and book directly through our secure platform. Our team of travel experts is also available to provide personalized assistance and recommendations."
    },
    {
      id: 2,
      category: 'general',
      question: "How far in advance should I book my travel?",
      answer: "For flights, it's generally recommended to book 2-8 weeks in advance for domestic travel and 3-6 months for international trips. Hotels can be booked closer to your travel date, but booking 1-3 months ahead often provides better rates. Cruises should be booked 6-12 months in advance for the best selection and prices. However, last-minute deals are sometimes available."
    },
    {
      id: 3,
      category: 'general',
      question: "What should I do if I need to change or cancel my booking?",
      answer: "You can modify or cancel most bookings through your account dashboard. For changes, check the specific terms of your booking as some may have change fees. Cancellations are subject to the cancellation policy of your booking. If you need assistance, our customer support team is available 24/7 to help with modifications and cancellations."
    },
    {
      id: 4,
      category: 'general',
      question: "Do you offer travel insurance?",
      answer: "Yes, we offer comprehensive travel insurance options to protect your investment and provide peace of mind. Our insurance covers trip cancellation, medical emergencies, lost luggage, and more. We recommend purchasing insurance when you book your trip to ensure maximum coverage. Contact our team for detailed information about available plans."
    },

    // Flights
    {
      id: 5,
      category: 'flights',
      question: "How do I check my flight status?",
      answer: "You can check your flight status in several ways: through your booking confirmation email, in your account dashboard, using our flight tracker tool, or by contacting our support team. We also provide real-time updates for any schedule changes or delays. For the most accurate information, you can also check directly with the airline."
    },
    {
      id: 6,
      category: 'flights',
      question: "What documents do I need for international flights?",
      answer: "For international flights, you'll typically need a valid passport (with at least 6 months validity beyond your return date), a visa (if required by your destination), and any COVID-19 related documents such as vaccination certificates or test results. Some countries may also require proof of onward travel or sufficient funds. Always check the specific requirements for your destination."
    },
    {
      id: 7,
      category: 'flights',
      question: "Can I select my seat on flights?",
      answer: "Yes, seat selection is available for most flights. You can choose your seat during the booking process or later through your account dashboard. Some airlines offer free seat selection, while others may charge a fee for preferred seats or early seat selection. Economy, premium economy, business, and first-class seats all have different selection options."
    },
    {
      id: 8,
      category: 'flights',
      question: "What's included in my flight ticket?",
      answer: "Your flight ticket typically includes your seat on the plane and a checked baggage allowance (varies by airline and fare class). Most tickets also include a carry-on bag and personal item. Meals, entertainment, and additional services may be included depending on the airline and flight duration. Budget airlines may charge extra for these amenities."
    },

    // Hotels
    {
      id: 9,
      category: 'hotels',
      question: "How do I know if a hotel is right for me?",
      answer: "We provide detailed information about each property including photos, amenities, guest reviews, and ratings. Consider factors like location, price, amenities, and guest feedback. Our hotel experts can also provide personalized recommendations based on your preferences and travel style. Don't hesitate to contact us for specific advice about particular properties."
    },
    {
      id: 10,
      category: 'hotels',
      question: "What's the difference between refundable and non-refundable rates?",
      answer: "Refundable rates allow you to cancel your booking and receive a full or partial refund, usually up to 24-48 hours before check-in. Non-refundable rates are typically cheaper but offer no refund if you cancel. Some hotels offer partially refundable options. Always read the cancellation policy carefully before booking to understand your options."
    },
    {
      id: 11,
      category: 'hotels',
      question: "Can I request early check-in or late check-out?",
      answer: "Early check-in and late check-out requests can be made but are subject to availability and may incur additional charges. It's best to request these when booking or at least 24 hours in advance. Some hotels offer these services for free to loyalty members or for a fee. Contact the hotel directly or our support team to make these arrangements."
    },

    // Cruises
    {
      id: 12,
      category: 'cruises',
      question: "What's included in my cruise package?",
      answer: "Cruise packages typically include your cabin, most meals in the main dining areas, basic entertainment, and access to most onboard facilities. Some cruise lines include alcoholic beverages, specialty dining, shore excursions, and gratuities. Check your specific booking details as inclusions vary by cruise line and package type. Additional services like spa treatments and premium dining usually cost extra."
    },
    {
      id: 13,
      category: 'cruises',
      question: "Do I need a passport for cruises?",
      answer: "Passport requirements depend on your cruise itinerary. For closed-loop cruises (starting and ending in the same US port), a birth certificate and government-issued ID may suffice. For international cruises or those visiting foreign ports, a passport is required. We recommend carrying a passport for all cruises to avoid any complications."
    },

    // Payments
    {
      id: 14,
      category: 'payments',
      question: "What payment methods do you accept?",
      answer: "We accept all major credit cards (Visa, MasterCard, American Express, Discover), debit cards, and digital wallets (PayPal, Apple Pay, Google Pay). Some bookings may also accept bank transfers. All payments are processed securely through encrypted channels. We don't store your payment information for security reasons."
    },
    {
      id: 15,
      category: 'payments',
      question: "Are there any hidden fees?",
      answer: "We believe in transparent pricing. All fees are clearly displayed during the booking process. This includes taxes, service fees, and any applicable charges. There are no hidden fees or surprise charges. If you have questions about any charges, our support team is happy to explain them in detail."
    },

    // Documents
    {
      id: 16,
      category: 'documents',
      question: "How do I get a copy of my booking confirmation?",
      answer: "Your booking confirmation is automatically sent to your email when you complete a booking. You can also access it anytime through your account dashboard. If you need a copy, simply log into your account or contact our support team. We can resend confirmations or provide them in different formats if needed."
    }
  ];

  const filteredFAQs = faqItems.filter(item => {
    const matchesSearch = item.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.answer.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const toggleItem = (id) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedItems(newExpanded);
  };

  const getCategoryColor = (color) => {
    const colors = {
      blue: 'bg-blue-100 text-blue-800',
      green: 'bg-green-100 text-green-800',
      purple: 'bg-purple-100 text-purple-800',
      teal: 'bg-teal-100 text-teal-800',
      orange: 'bg-orange-100 text-orange-800',
      red: 'bg-red-100 text-red-800'
    };
    return colors[color] || 'bg-gray-100 text-gray-800';
  };

  return (
    <>
      <Navbar forceScrolled={true} />
      <div className="min-h-screen bg-white">
        {/* Hero Section */}
        <div className="border-b border-gray-200 bg-white py-16">
          <div className="container mx-auto px-4 max-w-7xl">
            <h1 className="text-5xl md:text-6xl font-semibold text-neutral-700 mb-4">Frequently Asked Questions</h1>
            <p className="text-lg text-neutral-600 max-w-2xl">
              Find answers to common questions about travel, bookings, and our services.
            </p>
          </div>
        </div>

        <div className="container mx-auto px-4 max-w-7xl py-12">
          {/* Search Section */}
          <section className="max-w-3xl mx-auto mb-16">
            <div className="relative">
              <FaSearch className="absolute left-4 top-1/2 transform -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                placeholder="Search for answers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-4 border border-gray-300 rounded-xl focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <p className="text-center text-neutral-500 mt-4 text-sm">
              {filteredFAQs.length} questions found
            </p>
          </section>

          {/* Category Overview */}
          <section className="mb-16">
            <h2 className="text-2xl font-semibold text-neutral-700 mb-8">Browse by Category</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {faqCategories.map((category) => (
                <div key={category.id} className="text-center">
                  <div className={`w-14 h-14 mx-auto mb-3 rounded-full flex items-center justify-center text-lg ${getCategoryColor(category.color)}`}>
                    {category.icon}
                  </div>
                  <h3 className="text-xs font-medium text-neutral-700">{category.name}</h3>
                </div>
              ))}
            </div>
          </section>

          {/* FAQ Items */}
          <section className="max-w-4xl mx-auto">
            <h2 className="text-2xl font-semibold text-neutral-700 mb-8">Common Questions</h2>

            <div className="space-y-3">
              {filteredFAQs.map((item) => (
                <div key={item.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
                  <button
                    onClick={() => toggleItem(item.id)}
                    className="w-full px-6 py-5 text-left flex items-center justify-between hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-start gap-4 flex-1">
                      <div className={`mt-1 p-2 rounded-full flex-shrink-0 ${getCategoryColor(faqCategories.find(cat => cat.id === item.category)?.color || 'gray')}`}>
                        <FaQuestionCircle className="text-xs" />
                      </div>
                      <h3 className="text-base font-semibold text-neutral-700 pr-4">{item.question}</h3>
                    </div>
                    {expandedItems.has(item.id) ? (
                      <FaChevronUp className="text-neutral-400 flex-shrink-0 text-sm" />
                    ) : (
                      <FaChevronDown className="text-neutral-400 flex-shrink-0 text-sm" />
                    )}
                  </button>

                  {expandedItems.has(item.id) && (
                    <div className="px-6 pb-5">
                      <div className="pl-14">
                        <p className="text-neutral-600 leading-relaxed text-sm">{item.answer}</p>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Still Need Help Section */}
          <section className="mt-20 bg-gray-50 border border-gray-200 rounded-2xl p-12 text-center">
            <h2 className="text-3xl font-semibold text-neutral-700 mb-3">Still Have Questions?</h2>
            <p className="text-lg text-neutral-600 mb-8 max-w-2xl mx-auto">
              Our support team is here to help with any questions not covered in our FAQs.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                to="/support"
                className="bg-neutral-700 text-white px-8 py-3.5 rounded-xl font-medium hover:bg-neutral-800 transition-colors"
              >
                Contact Support
              </Link>
              <Link
                to="/contact"
                className="bg-white border-2 border-neutral-700 text-neutral-700 px-8 py-3.5 rounded-xl font-medium hover:bg-gray-50 transition-colors"
              >
                Get in Touch
              </Link>
            </div>
          </section>

          {/* Quick Links */}
          <section className="mt-16">
            <h3 className="text-xl font-semibold text-neutral-700 mb-6">Quick Links</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Link
                to="/resources"
                className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow"
              >
                <h4 className="text-base font-semibold text-neutral-700 mb-2">Travel Resources</h4>
                <p className="text-neutral-600 text-sm">Guides, tips, and tools for better travel</p>
              </Link>
              <Link
                to="/destinations"
                className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow"
              >
                <h4 className="text-base font-semibold text-neutral-700 mb-2">Destinations</h4>
                <p className="text-neutral-600 text-sm">Explore amazing places around the world</p>
              </Link>
              <Link
                to="/travel-blog"
                className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow"
              >
                <h4 className="text-base font-semibold text-neutral-700 mb-2">Travel Blog</h4>
                <p className="text-neutral-600 text-sm">Stories, tips, and travel inspiration</p>
              </Link>
            </div>
          </section>
        </div>
      </div>
      <Footer />
    </>
  );
};

export default FAQs; 