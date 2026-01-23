import React, { useEffect, useState } from 'react';
import HeroSection from './HeroSection';
import DestinationSection from './DestinationSection';
import CruiseLineSection from './CruiseLineSection';
import { FaShip, FaAnchor, FaStar, FaLifeRing, FaUsers, FaCheckCircle, FaTimes, FaQuoteRight, FaUser, FaEnvelope, FaCommentAlt, FaTripadvisor } from 'react-icons/fa';
import { Link } from 'react-router-dom';
import Navbar from '../Navbar';
import Footer from '../Footer';
import withPageElements from '../PageWrapper';
import WhyChooseUsSection from './WhyChooseUsSection';
import ContactSection from './ContactSection';
import supabase from '../../../lib/supabase';
import { Sparkles } from 'lucide-react';

// CSS for page and section styling
const styles = {
  homePageWrapper: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100vh',
    width: '100%',
    overflowX: 'hidden',
  },
  main: {
    flex: '1 0 auto',
  },
  section: {
    marginTop: '3rem',
    marginBottom: '3rem',
    scrollMarginTop: '80px', // For smooth scrolling with fixed header
  },
  firstSection: {
    marginTop: '0',
  },
  lastSection: {
    marginBottom: '0',
  }
};

const TrustIndicators = () => {
  return (
    <div className="py-8 md:py-10 bg-transparent">
      <div className="max-w-7xl mx-auto px-4">
        <div className="text-center mb-6 md:mb-8">
          <h3 className="text-xl md:text-2xl font-bold text-[#0066b2]">Trusted by Thousands</h3>
        </div>

        <div className="flex flex-wrap justify-center gap-8 md:gap-16">
          <div className="text-center">
            <div className="text-2xl md:text-3xl font-bold text-[#0066b2] mb-1">500+</div>
            <div className="text-gray-500 text-sm">Happy Customers</div>
          </div>

          <div className="text-center">
            <div className="text-2xl md:text-3xl font-bold text-[#0066b2] mb-1">50+</div>
            <div className="text-gray-500 text-sm">Destinations</div>
          </div>

          <div className="text-center">
            <div className="text-2xl md:text-3xl font-bold text-[#0066b2] mb-1">98%</div>
            <div className="text-gray-500 text-sm">Satisfaction Rate</div>
          </div>

          <div className="text-center">
            <div className="text-2xl md:text-3xl font-bold text-[#0066b2] mb-1">24/7</div>
            <div className="text-gray-500 text-sm">Customer Support</div>
          </div>
        </div>

        <div className="mt-6 md:mt-8 flex justify-center">
          <div className="grid grid-cols-3 gap-4 md:flex md:gap-8 justify-center items-center">
            <img src="/images/logos/forbes.svg" alt="Forbes" className="h-8 md:h-10 opacity-90" />
            <img src="/images/logos/travelandleisure.svg" alt="Travel+Leisure" className="h-8 md:h-10 opacity-90" />
            <img src="/images/logos/cruisecritic.svg" alt="Cruise Critic" className="h-8 md:h-10 opacity-90" />
            <div className="flex items-center gap-2 opacity-90 hidden md:flex">
              <FaTripadvisor className="text-[#6B7280] text-3xl" />
              <div className="flex flex-col items-start leading-none">
                <span className="text-[#6B7280] font-bold text-[10px] tracking-wide">TRIPADVISOR</span>
                <span className="text-[#6B7280] text-[8px] tracking-wider">REVIEWS</span>
              </div>
            </div>
            <img src="/images/logos/cntraveler.svg" alt="CN Traveler" className="h-8 md:h-10 hidden md:block opacity-90" />
          </div>
        </div>
      </div>
    </div>
  );
};

const TestimonialBanner = () => {
  const [showContactForm, setShowContactForm] = useState(false);
  const [showTestimonials, setShowTestimonials] = useState(false);
  const [contactForm, setContactForm] = useState({
    name: '',
    email: '',
    message: ''
  });
  const [submitted, setSubmitted] = useState(false);
  const [activeField, setActiveField] = useState(null);
  const [currentTestimonial, setCurrentTestimonial] = useState(0);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setContactForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log("Contact form submitted:", contactForm);
    setSubmitted(true);

    // Reset form after 3 seconds
    setTimeout(() => {
      setSubmitted(false);
      setShowContactForm(false);
      setContactForm({
        name: '',
        email: '',
        message: ''
      });
    }, 3000);
  };

  const handleFocus = (field) => {
    setActiveField(field);
  };

  const handleBlur = () => {
    setActiveField(null);
  };

  const testimonialItems = [
    {
      name: "Sarah Johnson",
      position: "Travels with Royal Caribbean",
      text: "The best cruise booking experience I've ever had! Their customer service team went above and beyond to help me find the perfect cruise for my family. The booking process was seamless and everything was organized perfectly.",
      rating: 5,
      image: "/images/reviewer1.jpg"
    },
    {
      name: "Michael Chen",
      position: "Frequent Cruiser",
      text: "I've booked multiple cruises through this website and have never been disappointed. The prices are competitive and the booking process is seamless. Their support team is always available to answer questions.",
      rating: 5,
      image: "/images/reviewer2.jpg"
    },
    {
      name: "Emily Rodriguez",
      position: "First-time Cruiser",
      text: "As someone new to cruising, I appreciated how easy it was to find information and compare options. They made the whole experience stress-free! I'll definitely be booking my next cruise here too.",
      rating: 5,
      image: "/images/reviewer3.jpg"
    }
  ];

  useEffect(() => {
    if (showTestimonials) {
      const interval = setInterval(() => {
        setCurrentTestimonial((prev) => (prev + 1) % testimonialItems.length);
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [showTestimonials, testimonialItems.length]);

  return (
    <div className="py-16 md:py-20 bg-transparent text-white relative">
      <div className="max-w-6xl mx-auto px-6 md:px-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-8">
          {/* Testimonial Content */}
          <div className="md:w-3/5 text-center md:text-left space-y-5">
            {/* Quote - Main Focus */}
            <blockquote className="text-2xl md:text-4xl font-light italic leading-relaxed tracking-tight">
              "The best cruise booking experience I've ever had!"
            </blockquote>

            {/* Author Attribution */}
            <p className="text-white/75 text-base font-medium tracking-wide">
              — Sarah Johnson, <span className="font-normal">traveled with Royal Caribbean</span>
            </p>

            {/* Star Rating - Refined */}
            <div className="flex items-center justify-center gap-1 pt-2">
              <div className="flex gap-0.5">
                <FaStar className="text-amber-300 text-sm" />
                <FaStar className="text-amber-300 text-sm" />
                <FaStar className="text-amber-300 text-sm" />
                <FaStar className="text-amber-300 text-sm" />
                <FaStar className="text-amber-300 text-sm" />
              </div>
              <span className="ml-3 text-sm text-white/60 font-light">5.0 from over 3,200 reviews</span>
            </div>
          </div>

          {/* CTAs - Reduced Prominence */}
          <div className="flex flex-col sm:flex-row gap-3 md:flex-col lg:flex-row">
            <button
              className="px-5 py-2.5 text-sm font-medium rounded-full border border-white/40 text-white bg-white/10 hover:bg-white/20 transition-all duration-200 flex items-center justify-center backdrop-blur-sm"
              onClick={() => setShowTestimonials(true)}
            >
              <FaUsers className="mr-2 text-xs opacity-80" /> Read Testimonials
            </button>
            <button
              className="px-5 py-2.5 text-sm font-medium rounded-full border border-white/30 text-white/80 hover:text-white hover:border-white/50 transition-all duration-200 flex items-center justify-center"
              onClick={() => setShowContactForm(true)}
            >
              <FaLifeRing className="mr-2 text-xs opacity-70" /> Contact Support
            </button>
          </div>
        </div>
      </div>

      {/* Contact Support Modal */}
      {showContactForm && (
        <div
          className="fixed inset-0 bg-transparent backdrop-blur-[2px] flex items-center justify-center z-50 p-2 sm:p-4 animate-fadeIn overflow-y-auto"
          onClick={() => setShowContactForm(false)}
          style={{
            animation: 'fadeIn 0.3s ease-out',
          }}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-0 relative overflow-hidden my-auto"
            onClick={(e) => e.stopPropagation()}
            style={{
              animation: 'slideUp 0.4s ease-out',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.15)',
            }}
          >
            <div className="bg-gradient-to-r from-[#055B75] to-[#034457] pt-6 sm:pt-8 pb-10 sm:pb-12 px-4 sm:px-6 text-white relative">
              <button
                className="absolute top-3 sm:top-4 right-3 sm:right-4 text-white hover:text-gray-200 transition-colors z-10"
                onClick={() => setShowContactForm(false)}
                aria-label="Close popup"
              >
                <FaTimes className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>

              <div className="flex items-center mb-2">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white flex items-center justify-center mr-3 sm:mr-4">
                  <FaLifeRing className="text-[#055B75] w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold">Contact Our Support Team</h2>
              </div>

              <p className="opacity-90 text-xs sm:text-sm">
                Our cruise experts are here to assist you with any questions
              </p>

              <div className="absolute -bottom-6 left-0 right-0 h-12 bg-white rounded-t-[50%]"></div>
            </div>

            <div className="px-4 sm:px-6 pb-4 sm:pb-6 pt-6 sm:pt-8">
              {submitted ? (
                <div className="text-center py-8 sm:py-10 px-4 animate-fadeIn">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 sm:mb-6">
                    <FaCheckCircle className="text-green-500 w-10 h-10 sm:w-12 sm:h-12" />
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold text-gray-800 mb-2 sm:mb-3">Thank You!</h3>
                  <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-6">
                    We've received your message and will get back to you within 24 hours.
                  </p>
                  <div className="w-12 sm:w-16 h-1 bg-green-500 mx-auto"></div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
                  <div className={`transition-all duration-200 ${activeField === 'name' ? 'transform -translate-y-1' : ''}`}>
                    <label className="block text-gray-700 text-xs sm:text-sm font-semibold mb-2" htmlFor="name">
                      Your Name
                    </label>
                    <div className={`relative rounded-lg transition-all duration-300 ${activeField === 'name' ? 'ring-2 ring-[#0066b2]' : 'ring-1 ring-gray-200'}`}>
                      <div className="absolute inset-y-0 left-0 pl-3 sm:pl-4 flex items-center pointer-events-none">
                        <FaUser className={`w-4 h-4 sm:w-5 sm:h-5 transition-colors ${activeField === 'name' ? 'text-[#0066b2]' : 'text-gray-400'}`} />
                      </div>
                      <input
                        type="text"
                        id="name"
                        name="name"
                        value={contactForm.name}
                        onChange={handleInputChange}
                        onFocus={() => handleFocus('name')}
                        onBlur={handleBlur}
                        required
                        className="w-full bg-gray-50 pl-10 sm:pl-12 pr-3 sm:pr-4 py-2.5 sm:py-3 border-none rounded-lg focus:outline-none text-sm sm:text-base"
                        placeholder="John Doe"
                      />
                    </div>
                  </div>

                  <div className={`transition-all duration-200 ${activeField === 'email' ? 'transform -translate-y-1' : ''}`}>
                    <label className="block text-gray-700 text-xs sm:text-sm font-semibold mb-2" htmlFor="email">
                      Email Address
                    </label>
                    <div className={`relative rounded-lg transition-all duration-300 ${activeField === 'email' ? 'ring-2 ring-[#0066b2]' : 'ring-1 ring-gray-200'}`}>
                      <div className="absolute inset-y-0 left-0 pl-3 sm:pl-4 flex items-center pointer-events-none">
                        <FaEnvelope className={`w-4 h-4 sm:w-5 sm:h-5 transition-colors ${activeField === 'email' ? 'text-[#0066b2]' : 'text-gray-400'}`} />
                      </div>
                      <input
                        type="email"
                        id="email"
                        name="email"
                        value={contactForm.email}
                        onChange={handleInputChange}
                        onFocus={() => handleFocus('email')}
                        onBlur={handleBlur}
                        required
                        className="w-full bg-gray-50 pl-10 sm:pl-12 pr-3 sm:pr-4 py-2.5 sm:py-3 border-none rounded-lg focus:outline-none text-sm sm:text-base"
                        placeholder="john@example.com"
                      />
                    </div>
                  </div>

                  <div className={`transition-all duration-200 ${activeField === 'message' ? 'transform -translate-y-1' : ''}`}>
                    <label className="block text-gray-700 text-xs sm:text-sm font-semibold mb-2" htmlFor="message">
                      How can we help?
                    </label>
                    <div className={`relative rounded-lg transition-all duration-300 ${activeField === 'message' ? 'ring-2 ring-[#0066b2]' : 'ring-1 ring-gray-200'}`}>
                      <div className="absolute top-2.5 sm:top-3 left-0 pl-3 sm:pl-4 flex items-start pointer-events-none">
                        <FaCommentAlt className={`w-4 h-4 sm:w-5 sm:h-5 transition-colors ${activeField === 'message' ? 'text-[#0066b2]' : 'text-gray-400'}`} />
                      </div>
                      <textarea
                        id="message"
                        name="message"
                        value={contactForm.message}
                        onChange={handleInputChange}
                        onFocus={() => handleFocus('message')}
                        onBlur={handleBlur}
                        required
                        rows="4"
                        className="w-full bg-gray-50 pl-10 sm:pl-12 pr-3 sm:pr-4 py-2.5 sm:py-3 border-none rounded-lg focus:outline-none resize-none text-sm sm:text-base"
                        placeholder="Please describe your question or issue..."
                      ></textarea>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-gradient-to-r from-[#0066b2] to-[#1e88e5] text-white font-bold py-3 sm:py-4 px-4 rounded-xl hover:shadow-lg transition-all duration-300 flex items-center justify-center mt-4 sm:mt-6 text-sm sm:text-base"
                  >
                    Submit Request
                  </button>

                  <p className="text-xs text-center text-gray-500 mt-3 sm:mt-4">
                    We typically respond within 24 hours
                  </p>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Testimonials Modal */}
      {showTestimonials && (
        <div
          className="fixed inset-0 bg-transparent backdrop-blur-[2px] flex items-center justify-center z-50 p-2 sm:p-4 animate-fadeIn overflow-y-auto"
          onClick={() => setShowTestimonials(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full p-0 relative overflow-hidden my-auto max-h-[95vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
            style={{
              animation: 'slideUp 0.4s ease-out',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.15)',
            }}
          >
            <div className="bg-gradient-to-r from-[#0066b2] to-[#1e88e5] pt-6 sm:pt-8 pb-10 sm:pb-12 px-4 sm:px-6 text-white relative">
              <button
                className="absolute top-3 sm:top-4 right-3 sm:right-4 text-white hover:text-gray-200 transition-colors z-10"
                onClick={() => setShowTestimonials(false)}
                aria-label="Close popup"
              >
                <FaTimes className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>

              <div className="flex items-center mb-2">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white flex items-center justify-center mr-3 sm:mr-4">
                  <FaUsers className="text-[#055B75] w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold">What Our Customers Say</h2>
              </div>

              <p className="opacity-90 text-xs sm:text-sm">
                Real experiences from verified customers
              </p>

              <div className="absolute -bottom-6 left-0 right-0 h-12 bg-white rounded-t-[50%]"></div>
            </div>

            <div className="px-4 sm:px-6 pb-6 sm:pb-8 pt-6 sm:pt-8">
              {/* Featured Testimonial */}
              <div className="mb-6 sm:mb-8 p-4 sm:p-6 bg-blue-50 rounded-xl relative animate-fadeIn">
                <div className="absolute right-4 sm:right-6 top-4 sm:top-6 text-blue-200">
                  <FaQuoteRight className="w-8 h-8 sm:w-10 sm:h-10" />
                </div>
                <div className="flex flex-col sm:flex-row items-start">
                  <img
                    src={testimonialItems[currentTestimonial].image}
                    alt={testimonialItems[currentTestimonial].name}
                    className="w-14 h-14 sm:w-16 sm:h-16 rounded-full mb-3 sm:mb-0 sm:mr-4 object-cover border-4 border-white shadow-md"
                  />
                  <div className="flex-1">
                    <h4 className="text-lg sm:text-xl font-bold text-gray-800">{testimonialItems[currentTestimonial].name}</h4>
                    <p className="text-xs sm:text-sm text-gray-600 mb-2 sm:mb-3">{testimonialItems[currentTestimonial].position}</p>
                    <div className="flex mb-3 sm:mb-4">
                      {[...Array(testimonialItems[currentTestimonial].rating)].map((_, i) => (
                        <FaStar key={i} className="text-yellow-400 text-sm sm:text-base mr-1" />
                      ))}
                    </div>
                    <p className="text-sm sm:text-base text-gray-700 italic">"{testimonialItems[currentTestimonial].text}"</p>
                  </div>
                </div>

                {/* Dots for navigation */}
                <div className="flex justify-center mt-4 sm:mt-6 space-x-2">
                  {testimonialItems.map((_, index) => (
                    <button
                      key={index}
                      className={`w-2 h-2 sm:w-3 sm:h-3 rounded-full transition-all duration-300 ${currentTestimonial === index ? 'bg-blue-500 w-4 sm:w-6' : 'bg-gray-300'}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setCurrentTestimonial(index);
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Additional Testimonials Grid */}
              <h3 className="text-base sm:text-lg font-bold text-gray-800 mb-3 sm:mb-4">More Customer Stories</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 max-h-[200px] sm:max-h-[250px] overflow-y-auto pr-2">
                {testimonialItems.filter((_, i) => i !== currentTestimonial).map((item, index) => (
                  <div
                    key={index}
                    className="bg-gray-50 p-3 sm:p-4 rounded-lg hover:shadow-md transition-all duration-300 cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCurrentTestimonial(testimonialItems.findIndex(t => t.name === item.name));
                    }}
                  >
                    <div className="flex items-center">
                      <img src={item.image} alt={item.name} className="w-8 h-8 sm:w-10 sm:h-10 rounded-full mr-2 sm:mr-3 object-cover" />
                      <div>
                        <h4 className="text-sm sm:text-base font-bold text-gray-800">{item.name}</h4>
                        <div className="flex">
                          {[...Array(item.rating)].map((_, i) => (
                            <FaStar key={i} className="text-yellow-400 text-xs mr-1" />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 sm:mt-6 text-center">
                <Link to="/reviews" className="text-[#055B75] font-bold hover:underline flex items-center justify-center text-sm sm:text-base">
                  View All Customer Reviews
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-5 sm:w-5 ml-1" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L12.586 11H5a1 1 0 110-2h7.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </Link>
              </div>
            </div>
          </div>

          <style jsx global>{`
            @keyframes fadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            @keyframes slideUp {
              from { opacity: 0; transform: translateY(30px); }
              to { opacity: 1; transform: translateY(0); }
            }
            .animate-fadeIn {
              animation: fadeIn 0.3s ease-out forwards;
            }
          `}</style>
        </div>
      )}
    </div>
  );
};

const PromoSection = () => {
  return (
    <div className="py-8 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 md:px-0">
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          <div className="flex flex-col md:flex-row">
            <div className="md:w-1/2 relative">
              <img
                src="/images/Rectangle 1434 (2).png"
                alt="Limited Time Offer"
                className="w-full h-full object-cover"
              />
              <div className="absolute top-4 left-4 bg-red-500 text-white px-4 py-2 rounded-full text-sm font-bold">
                Limited Time
              </div>
            </div>

            <div className="md:w-1/2 p-8 md:p-12 flex flex-col justify-center">
              <h3 className="text-2xl md:text-3xl font-bold text-gray-800 mb-4">Summer Cruise Special</h3>
              <p className="text-gray-600 mb-6">Book your summer cruise now and get up to 30% off on select destinations. Plus, receive a complimentary beverage package for two.</p>

              <ul className="mb-8">
                {['Up to 30% off select cruises', 'Free beverage package', 'Flexible cancellation policy', 'Kids sail free on select cruises'].map((item, index) => (
                  <li key={index} className="flex items-center mb-3">
                    <FaCheckCircle className="text-green-500 mr-3" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              <button className="bg-[#0066b2] hover:bg-[#005091] text-white font-bold py-3 px-8 rounded-md transition-colors self-start">
                View Special Offers
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const HomePage = () => {
  const [subscriptionEmail, setSubscriptionEmail] = useState('');
  const [subscriptionSubmitted, setSubscriptionSubmitted] = useState(false);
  const [subscriptionError, setSubscriptionError] = useState('');
  const [isMobileView, setIsMobileView] = useState(window.innerWidth < 768);

  useEffect(() => {
    // Scroll to top when component mounts
    window.scrollTo(0, 0);

    // Add smooth scrolling for better UX
    document.documentElement.style.scrollBehavior = 'smooth';

    // Handle screen resize for mobile detection
    const handleResize = () => {
      setIsMobileView(window.innerWidth < 768);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      document.documentElement.style.scrollBehavior = 'auto';
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const handleSubscriptionSubmit = async (e) => {
    e.preventDefault();
    setSubscriptionError('');

    try {
      const { data, error } = await supabase
        .from('subscriptions')
        .insert([
          { email: subscriptionEmail }
        ]);

      if (error) {
        if (error.code === '23505') { // Unique violation
          setSubscriptionError('This email is already subscribed.');
        } else {
          setSubscriptionError('An error occurred. Please try again.');
        }
        return;
      }

      setSubscriptionSubmitted(true);
      setSubscriptionEmail('');

      // Reset the success message after 3 seconds
      setTimeout(() => {
        setSubscriptionSubmitted(false);
      }, 3000);
    } catch (error) {
      setSubscriptionError('An unexpected error occurred. Please try again.');
    }
  };

  return (
    <div className="home-page-wrapper" style={styles.homePageWrapper}>


      {/* Special Offer Banner - positioned with absolute for better placement */}
      <div className="relative">
        <div className={`w-full text-center bg-gradient-to-r from-blue-900/90 via-blue-800/90 to-blue-900/90 py-3 backdrop-blur-sm z-20 border-y border-blue-500/30 ${isMobileView ? 'px-3' : ''}`}>
          <div className="container mx-auto px-2 flex justify-center items-center flex-wrap">
            <Sparkles className="h-5 w-5 text-yellow-300 mr-2 flex-shrink-0" />
            <p className={`text-white ${isMobileView ? 'text-xs' : 'text-base'} font-medium tracking-wide`}>
              <span className="font-bold">Self-Service Portal will be available very soon...</span> Meanwhile please Call <span className="text-yellow-300 font-bold whitespace-nowrap">((877) 538-7380)</span> or Email <a href="mailto:support@jetsetterss.com" className="underline text-yellow-300 font-bold">support@jetsetterss.com</a> for all your travel needs. Team Jetsetters!
            </p>
          </div>
        </div>
      </div>

      {/* Main content */}
      <main style={styles.main}>
        {/* Hero Section - immediately below navbar */}
        <section id="hero" style={{ ...styles.section, ...styles.firstSection }}>
          <HeroSection />
        </section>

        {/* Primary Content Sections */}
        <section id="destinations" style={styles.section}>
          <DestinationSection />
        </section>

        <section id="cruise-lines" style={styles.section}>
          <CruiseLineSection />
        </section>

        {/* Promotional and Partners */}
        <section id="promo" className="mb-0">
          <PromoSection />
        </section>

        {/* Unified Trust & Testimonials Section */}
        <section className="bg-white">
          <TrustIndicators />
        </section>

        <section className="bg-gradient-to-r from-[#055B75] to-[#034457]">
          <TestimonialBanner />
        </section>


        {/* Simple Email Subscription Section */}
        <section className="subscription-section py-8 relative" style={{
          backgroundImage: "url('https://images.unsplash.com/photo-1599640842225-85d111c60e6b?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1974&q=80')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat"
        }}>
          {/* Overlay with matched gradient */}
          <div className="absolute inset-0 bg-gradient-to-r from-[#055B75] to-[#034457] opacity-95"></div>

          <div className="container mx-auto px-4 md:px-6 relative z-10">
            <div className="max-w-xl mx-auto bg-white bg-opacity-10 backdrop-blur-sm rounded-2xl p-6 md:p-8 border border-white border-opacity-20 shadow-lg">
              <div className="flex flex-col items-center text-center">
                <div className="mb-2">
                  <FaEnvelope className="text-white text-2xl" />
                </div>
                <h3 className="text-2xl md:text-3xl font-bold text-white mb-2">Stay Updated</h3>
                <p className="text-white text-opacity-90 mb-6">Subscribe to receive the latest cruise deals and travel tips directly to your inbox.</p>

                <div className="flex items-center gap-2 mb-6 hidden md:flex">
                  <div className="flex -space-x-2">
                    <img className="inline-block h-8 w-8 rounded-full ring-2 ring-white" src="https://images.unsplash.com/photo-1491528323818-fdd1faba62cc?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80" alt="" />
                    <img className="inline-block h-8 w-8 rounded-full ring-2 ring-white" src="https://images.unsplash.com/photo-1550525811-e5869dd03032?ixlib=rb-1.2.1&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80" alt="" />
                    <img className="inline-block h-8 w-8 rounded-full ring-2 ring-white" src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2.25&w=256&h=256&q=80" alt="" />
                  </div>
                  <span className="text-sm text-white">Join 25,000+ subscribers</span>
                </div>

                {subscriptionSubmitted ? (
                  <div className="w-full bg-green-500 bg-opacity-20 backdrop-blur-sm rounded-lg p-4 text-white animate-fadeIn">
                    <div className="flex items-center justify-center">
                      <FaCheckCircle className="text-green-400 mr-2" />
                      <span>Successfully subscribed! Thank you.</span>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleSubscriptionSubmit} className="w-full">
                    <div className="flex flex-col md:flex-row md:items-center gap-2">
                      <input
                        type="email"
                        value={subscriptionEmail}
                        onChange={(e) => setSubscriptionEmail(e.target.value)}
                        placeholder="Enter your email address"
                        className="w-full md:flex-1 px-4 py-3 rounded-lg md:rounded-l-lg md:rounded-r-none bg-white border-0 focus:outline-none focus:ring-2 focus:ring-blue-300"
                        required
                      />
                      <button
                        type="submit"
                        className="w-full md:w-auto mt-2 md:mt-0 px-4 py-3 bg-[#65B3CF] hover:bg-[#5aa3be] text-white font-bold rounded-lg md:rounded-l-none md:rounded-r-lg flex items-center justify-center md:justify-start transition-colors"
                      >
                        Subscribe
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                        </svg>
                      </button>
                    </div>
                    {subscriptionError && (
                      <div className="mt-2 text-red-400 text-sm text-center">
                        {subscriptionError}
                      </div>
                    )}
                  </form>
                )}

                <div className="mt-4">
                  <p className="text-white text-opacity-80 text-xs">By subscribing, you agree to our <a href="#" className="underline hover:text-white">Privacy Policy</a></p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* <PopularPorts /> */}

      {/* <NewsletterSection /> */}

      {/* <ContactSection /> */}



      {/* Mobile scroll to top button - only visible on small screens */}
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        className="fixed bottom-6 right-6 bg-blue-600 text-white p-3 rounded-full shadow-lg z-50 hover:bg-blue-700 transition-colors md:hidden"
        aria-label="Scroll to top"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
        </svg>
      </button>
    </div>
  );
};

export default withPageElements(HomePage);
