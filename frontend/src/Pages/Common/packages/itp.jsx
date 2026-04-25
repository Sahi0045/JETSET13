import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ChevronDown, MapPin, Calendar, Star, Clock, Users, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { FaHotel, FaPlane, FaUtensils, FaShieldAlt, FaCheck, FaMapMarkerAlt, FaRegClock, FaUsers, FaStar, FaCalendarAlt, FaPhoneAlt, FaEnvelope, FaCheckCircle } from "react-icons/fa";
import itineraryData from '../../../data/itinerarypackages.json'
import packagesData from '../../../data/packages.json'
import Navbar from '../Navbar'
import Footer from '../Footer'
import packageCallbackService from '../../../Services/packageCallbackService';
import withPageElements from "../PageWrapper";
import currencyService from '../../../Services/CurrencyService';
import Price from '../../../Components/Price';

const ItineraryPackage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const destinationParam = queryParams.get('destination');
  const packageIdParam = queryParams.get('id');
  
  const [selectedPackage, setSelectedPackage] = useState(destinationParam || 'dubai');
  const [packageId, setPackageId] = useState(packageIdParam || '1');
  const [expandedDay, setExpandedDay] = useState(null)
  const [showQuoteModal, setShowQuoteModal] = useState(false)
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    request: '',
    isRobot: false,
    travelDate: '',
    guests: '2',
    budget: '500-1000',
    terms: false
  })
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formSubmitSuccess, setFormSubmitSuccess] = useState(false);
  const [formSubmitError, setFormSubmitError] = useState('');

  // Get the specific package data from packages.json
  const specificPackage = packagesData[selectedPackage]?.packages.find(pkg => 
    pkg.id.toString() === packageId.toString()
  );

  // Set up destination images based on the package
  const getPackageImages = () => {
    // Use package-specific images if available, otherwise use default destination images
    if (specificPackage) {
      // Create an array of images from the specific package
      return [{
        url: specificPackage.image,
        caption: specificPackage.title
      }];
    }
    
    // Default image sets by destination
    const defaultImages = {
      dubai: [
        {
          url: "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2340&q=80",
          caption: "Dubai Skyline with Burj Khalifa"
        },
        {
          url: "https://images.unsplash.com/photo-1526495124232-a04e1849168c?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2340&q=80",
          caption: "Dubai Marina at Night"
        },
        {
          url: "https://images.unsplash.com/photo-1584551246679-0daf2d10548a?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2340&q=80",
          caption: "Dubai Desert Safari"
        }
      ],
      europe: [
        {
          url: "https://images.unsplash.com/photo-1499856871958-5b9627545d1a?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2020&q=80",
          caption: "European Landmarks"
        },
        {
          url: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2073&q=80",
          caption: "Paris and Eiffel Tower"
        }
      ],
      kashmir: [
        {
          url: "https://images.unsplash.com/photo-1566837945700-30057527ade0?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2070&q=80",
          caption: "Kashmir Valley"
        },
        {
          url: "https://images.unsplash.com/photo-1566837828676-d71608e815f7?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2070&q=80",
          caption: "Gulmarg Ski Resort"
        }
      ],
      northEast: [
        {
          url: "https://images.unsplash.com/photo-1626014303757-6366ef55c4ab?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2069&q=80",
          caption: "Meghalaya Living Root Bridge"
        },
        {
          url: "https://images.unsplash.com/photo-1626074353765-517a681e40be?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2069&q=80",
          caption: "Darjeeling Tea Gardens"
        }
      ]
    };
    
    return defaultImages[selectedPackage] || defaultImages.dubai;
  };

  // Get the correct package data from itinerary data
  const packageData = itineraryData[selectedPackage]?.packages[0];
  
  // Get the correct image set for the current package
  const currentPackageImages = getPackageImages();

  // Use specificPackage for the title, location and price
  const packageTitle = specificPackage ? specificPackage.title : packageData?.title || 'Travel Package';
  const packageLocation = specificPackage ? specificPackage.location : '';
  const packagePrice = specificPackage ? specificPackage.price : 499;
  const packageDuration = specificPackage ? specificPackage.duration : '4N/5D';

  const nextImage = () => {
    setCurrentImageIndex((prev) => (prev + 1) % currentPackageImages.length);
  };

  const prevImage = () => {
    setCurrentImageIndex((prev) => (prev - 1 + currentPackageImages.length) % currentPackageImages.length);
  };

  // Reset currentImageIndex when destination changes
  useEffect(() => {
    setCurrentImageIndex(0);
  }, [selectedPackage, packageId]);

  // Use effect to update selectedPackage when URL parameter changes
  useEffect(() => {
    if (destinationParam) {
      setSelectedPackage(destinationParam);
    }
    
    if (packageIdParam) {
      setPackageId(packageIdParam);
    }
  }, [destinationParam, packageIdParam]);

  const handleDayClick = (day) => {
    setExpandedDay(expandedDay === day ? null : day)
  }

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate form
    if (!formData.name || !formData.phone || !formData.email) {
      setFormSubmitError('Please fill in all required fields (Name, Email, Phone)');
      return;
    }
    
    // Form validation for email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      setFormSubmitError('Please enter a valid email address');
      return;
    }
    
    // Form validation for phone
    if (formData.phone.length < 10) {
      setFormSubmitError('Please enter a valid phone number');
      return;
    }
    
    setFormSubmitting(true);
    setFormSubmitError('');
    
    try {
      // Call the package callback service to submit the form
      const result = await packageCallbackService.createPackageCallbackRequest({
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        travelDate: formData.travelDate || null,
        guests: formData.guests || '2',
        budget: formData.budget || '500-1000',
        request: formData.request || '',
        packageName: packageData?.title || 'Travel Package'
      });
      
      console.log('Form submission result:', result);
      
      // Reset form on success
      setFormData({
        name: '',
        email: '',
        phone: '',
        request: '',
        isRobot: false,
        travelDate: '',
        guests: '2',
        budget: '500-1000',
        terms: false
      });
      
      setFormSubmitting(false);
      setFormSubmitSuccess(true);
      
      // Close modal after successful submission with a delay
      setTimeout(() => {
        setFormSubmitSuccess(false);
        setShowQuoteModal(false);
      }, 3000);
    } catch (error) {
      console.error('Error submitting form:', error);
      setFormSubmitting(false);
      setFormSubmitError(
        'We encountered an issue saving your request. Please try again or contact us directly.'
      );
    }
  }

  if (!packageData) return null

  return (
    <div className="min-h-screen bg-white">
      <Navbar forceScrolled={true} />
      <div className="container mx-auto px-4">
        {/* Image Gallery Section - Mobile Optimized */}
        <div className="relative w-full h-[300px] md:h-[400px] mb-4 md:mb-8 rounded-xl md:rounded-2xl overflow-hidden group">
          {/* Main Image */}
          <div className="absolute inset-0 transition-transform duration-700 ease-in-out transform">
            <img 
              src={currentPackageImages[currentImageIndex].url}
              alt={currentPackageImages[currentImageIndex].caption}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent">
              <div className="absolute bottom-4 md:bottom-6 left-4 md:left-6 text-white">
                <h1 className="text-2xl md:text-4xl font-bold mb-1 md:mb-2">{packageTitle}</h1>
                <p className="text-sm md:text-lg text-white/90">{currentPackageImages[currentImageIndex].caption}</p>
              </div>
            </div>
          </div>

          {/* Navigation Arrows - Larger touch targets on mobile */}
          <button 
            onClick={prevImage}
            className="absolute left-2 md:left-4 top-1/2 -translate-y-1/2 bg-white/30 hover:bg-white/50 w-10 h-10 rounded-full flex items-center justify-center text-white transition-all duration-300 opacity-70 md:opacity-0 group-hover:opacity-100"
          >
            <ChevronLeft size={24} />
          </button>
          <button 
            onClick={nextImage}
            className="absolute right-2 md:right-4 top-1/2 -translate-y-1/2 bg-white/30 hover:bg-white/50 w-10 h-10 rounded-full flex items-center justify-center text-white transition-all duration-300 opacity-70 md:opacity-0 group-hover:opacity-100"
          >
            <ChevronRight size={24} />
          </button>

          {/* Image Indicators */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
            {currentPackageImages.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentImageIndex(index)}
                className={`w-2 h-2 rounded-full transition-all duration-300 ${
                  index === currentImageIndex ? 'bg-white w-6' : 'bg-white/50'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Thumbnail Gallery - Hide on small screens, show on medium and up */}
        <div className="hidden md:grid grid-cols-5 gap-4 mb-8">
          {currentPackageImages.map((image, index) => (
            <button
              key={index}
              onClick={() => setCurrentImageIndex(index)}
              className={`relative rounded-lg overflow-hidden aspect-[4/3] ${
                index === currentImageIndex ? 'ring-2 ring-blue-500' : ''
              }`}
            >
              <img 
                src={image.url}
                alt={image.caption}
                className="w-full h-full object-cover hover:scale-110 transition-transform duration-300"
              />
            </button>
          ))}
        </div>

        {/* Package Details Card - Mobile Optimized */}
        <div className="bg-white rounded-xl md:rounded-2xl shadow-md hover:shadow-lg transition-all duration-300 mb-8 md:mb-12">
          {/* Top Banner */}
          <div className="bg-gradient-to-r from-blue-50 to-purple-50 px-4 md:px-8 py-3">
            <span className="text-blue-700 font-medium">Featured Package</span>
          </div>

          <div className="px-4 md:px-8 py-4 md:py-6">
            {/* Mobile Layout - Stack vertically */}
            <div className="flex flex-col md:flex-row md:items-start md:justify-between">
              {/* Left Side - Package Info */}
              <div className="flex-1">
                {/* Title Section */}
                <div className="flex items-center gap-3 mb-4 md:mb-8">
                  <h2 className="text-2xl font-bold text-gray-900">{packageTitle}</h2>
                  <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-sm">
                    {packageDuration}
                  </span>
                </div>

                {/* Features Grid - 2 columns on mobile, 2 columns on desktop */}
                <div className="grid grid-cols-2 gap-x-4 md:gap-x-24 gap-y-6 md:gap-y-8">
                  {/* Hotel */}
                  <div className="flex items-center gap-3 md:gap-4">
                    <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl md:rounded-2xl bg-amber-50 flex items-center justify-center">
                      <FaHotel className="text-amber-500 text-lg md:text-xl" />
                    </div>
                    <div>
                      <span className="text-gray-700 font-medium block mb-1">Hotel</span>
                      <div className="flex gap-1">
                        {[1, 2, 3].map((star, i) => (
                          <FaStar key={i} className="text-amber-400 text-sm" />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Meals */}
                  <div className="flex items-center gap-3 md:gap-4">
                    <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl md:rounded-2xl bg-orange-50 flex items-center justify-center">
                      <FaUtensils className="text-orange-500 text-lg md:text-xl" />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-700 font-medium">Meals</span>
                      <div className="w-5 h-5 bg-green-100 rounded-full flex items-center justify-center">
                        <FaCheck className="text-green-600 text-xs" />
                      </div>
                    </div>
                  </div>

                  {/* Travel */}
                  <div className="flex items-center gap-3 md:gap-4">
                    <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl md:rounded-2xl bg-blue-50 flex items-center justify-center">
                      <FaPlane className="text-blue-500 text-lg md:text-xl" />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-700 font-medium">Travel</span>
                      <div className="w-5 h-5 bg-green-100 rounded-full flex items-center justify-center">
                        <FaCheck className="text-green-600 text-xs" />
                      </div>
                    </div>
                  </div>

                  {/* Hygienic */}
                  <div className="flex items-center gap-3 md:gap-4">
                    <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl md:rounded-2xl bg-green-50 flex items-center justify-center">
                      <FaShieldAlt className="text-green-500 text-lg md:text-xl" />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-700 font-medium">Hygienic+</span>
                      <div className="w-5 h-5 bg-green-100 rounded-full flex items-center justify-center">
                        <FaCheck className="text-green-600 text-xs" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Side - Pricing and Booking - Full width on mobile */}
              <div className="mt-6 md:mt-0 md:text-right md:pl-8 border-t pt-4 md:pt-0 md:border-t-0 border-gray-100">
                <p className="text-gray-600 text-sm mb-1">Book now at</p>
                <div className="mb-1">
                  <span className="text-3xl md:text-4xl font-bold text-gray-900">
                    <Price amount={packagePrice} />
                  </span>
                </div>
                <p className="text-sm text-gray-500 mb-4">Excl. Tax Per Person</p>
                
                <div className="flex flex-col md:flex-row gap-3">
                  <button 
                    onClick={() => setShowQuoteModal(true)}
                    className="bg-[#2B4D6F] text-white font-medium py-3 px-8 rounded-xl hover:bg-[#1a3b5c] transition-all duration-300 w-full md:w-auto"
                  >
                    GET QUOTE
                  </button>
                  <button 
                    onClick={() => navigate('/packages/booking-summary')}
                    className="bg-emerald-600 text-white font-medium py-3 px-8 rounded-xl hover:bg-emerald-700 transition-all duration-300 w-full md:w-auto"
                  >
                    BOOK NOW
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Banner */}
          <div className="bg-gradient-to-r from-blue-50 to-green-50 px-4 md:px-8 py-3 text-center">
            <span className="text-blue-700">
              <span className="font-medium">Special Offer:</span> Book now and get free airport transfers!
            </span>
          </div>
        </div>

        {/* Itinerary Section - Mobile Optimized */}
        <div className="mb-8 md:mb-12">
          <h1 className="text-2xl md:text-4xl font-bold mb-1 md:mb-2">Itinerary</h1>
          <p className="text-gray-600">Day wise details of your package</p>
          <hr className="my-4 md:my-6" />

          <div className="space-y-4 md:space-y-6">
            {packageData.itinerary.map((day) => (
              <div key={day.day} className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
                <div className="flex">
                  <div className="bg-[#2B4D6F] text-white py-2 px-3 md:px-4 font-medium w-16 md:w-24 text-center text-sm md:text-base">
                    Day {day.day}
                  </div>
                  <div className="bg-[#F5F8FA] flex-1 py-2 px-3 md:px-4 font-medium text-sm md:text-base">
                    {day.title}
                  </div>
                </div>
                <div className="p-3 md:p-4 md:pl-6 space-y-2 text-sm md:text-base">
                  {day.activities.map((activity, idx) => (
                    <div key={idx} className="mb-3">
                      <span className="font-medium">{activity.time}: </span>
                      <span className="text-gray-700">{activity.description}</span>
                      {activity.details && (
                        <ul className="list-disc pl-5 md:pl-6 mt-2 space-y-1">
                          {activity.details.map((detail, detailIdx) => (
                            <li key={detailIdx} className="text-gray-600 text-sm">
                              {detail}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <button 
            onClick={() => setExpandedDay(null)} 
            className="flex items-center justify-center text-blue-600 mt-4 md:mt-6 mx-auto gap-2 bg-blue-50 px-4 py-2 rounded-full md:bg-transparent md:px-0 md:py-0"
          >
            View Full Itinerary
            <ChevronDown className={expandedDay ? 'rotate-180' : ''} />
          </button>
        </div>

        {/* Inclusions & Exclusions Grid - Stack on mobile, grid on desktop */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8 mb-8 md:mb-12">
          {/* Inclusions */}
          <div className="bg-white rounded-lg border border-gray-200 p-4 md:p-6">
            <h2 className="text-xl font-semibold text-[#2B4D6F] mb-4 md:mb-6">Inclusions</h2>
            
            <div className="space-y-4 md:space-y-6">
              <div>
                <h3 className="font-medium mb-2">Accommodation:</h3>
                <ul className="list-disc pl-5 md:pl-6 space-y-1">
                  {packageData.inclusions.accommodation.map((item, idx) => (
                    <li key={idx} className="text-gray-600 text-sm md:text-base">{item}</li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="font-medium mb-2">Meals:</h3>
                <ul className="list-disc pl-5 md:pl-6 space-y-1">
                  {packageData.inclusions.meals.map((item, idx) => (
                    <li key={idx} className="text-gray-600 text-sm md:text-base">{item}</li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="font-medium mb-2">Transfers:</h3>
                <ul className="list-disc pl-5 md:pl-6 space-y-1">
                  {packageData.inclusions.transfers.map((item, idx) => (
                    <li key={idx} className="text-gray-600 text-sm md:text-base">{item}</li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="font-medium mb-2">Tours & Activities:</h3>
                <ul className="list-disc pl-5 md:pl-6 space-y-1">
                  {packageData.inclusions.tours_activities.map((item, idx) => (
                    <li key={idx} className="text-gray-600 text-sm md:text-base">{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Exclusions */}
          <div className="bg-white rounded-lg border border-gray-200 p-4 md:p-6">
            <h2 className="text-xl font-semibold text-[#2B4D6F] mb-4 md:mb-6">Exclusions</h2>
            
            <div className="space-y-4 md:space-y-6">
              {Object.entries(packageData.exclusions).map(([category, items]) => (
                <div key={category}>
                  <h3 className="font-medium mb-2">{category.replace('_', ' ')}:</h3>
                  <ul className="list-disc pl-5 md:pl-6 space-y-1">
                    {items.map((item, idx) => (
                      <li key={idx} className="text-gray-600 text-sm md:text-base">{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Contact Form - Mobile Optimized */}
        <div className="max-w-md mx-auto bg-[#F5FFFF] rounded-lg p-4 md:p-6 border border-gray-100 mb-8 md:mb-12">
          <h3 className="text-center text-[#2B4D6F] font-medium mb-4 md:mb-6">
            Your Trip, Your Way - Let's Plan Together!
          </h3>
          
          <form onSubmit={handleSubmit} className="space-y-3 md:space-y-4">
            <input
              type="text"
              name="name"
              placeholder="e.g. John Smith"
              value={formData.name}
              onChange={handleInputChange}
              className="w-full p-3 border border-gray-300 rounded-lg text-base"
            />
            
            <input
              type="email"
              name="email"
              placeholder="john@example.com"
              value={formData.email}
              onChange={handleInputChange}
              className="w-full p-3 border border-gray-300 rounded-lg text-base"
            />
            
            <input
              type="tel"
              name="phone"
              placeholder="Enter your 10 digit number"
              value={formData.phone}
              onChange={handleInputChange}
              className="w-full p-3 border border-gray-300 rounded-lg text-base"
            />
            
            <input
              type="text"
              name="request"
              placeholder="Any Special Request"
              value={formData.request}
              onChange={handleInputChange}
              className="w-full p-3 border border-gray-300 rounded-lg text-base"
            />
            
            <div className="border border-gray-300 rounded-lg p-3 flex items-start">
              <div className="flex items-center h-5">
                <input
                  id="robot"
                  name="isRobot"
                  type="checkbox"
                  checked={formData.isRobot}
                  onChange={handleInputChange}
                  className="w-5 h-5 border border-gray-300 rounded text-blue-600 focus:ring-blue-500"
                />
              </div>
              <label htmlFor="robot" className="ml-2 text-sm text-gray-600">
                I'm not a robot
              </label>
              <div className="ml-auto">
                <div className="text-xs text-gray-400">reCAPTCHA</div>
                <div className="text-xs text-gray-400">Privacy-Terms</div>
              </div>
            </div>
            
            <button 
              type="submit"
              className="w-full bg-[#2B4D6F] text-white py-3 rounded-lg font-medium hover:bg-[#1a3b5c] transition-colors text-base"
            >
              Request Call Back
            </button>
          </form>
        </div>

        {/* Trending Destinations - Mobile Optimized */}
        <div className="mb-8 md:mb-12">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-1">Trending destinations</h2>
          <p className="text-center text-gray-600 mb-6 md:mb-8 text-sm md:text-base">Most Popular choices for travelers from Kashmir India</p>
          
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
            {[
              { 
                name: 'Mughal Garden', 
                image: 'https://images.unsplash.com/photo-1566837497312-7be4a47d0c95?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1740&q=80'
              },
              { 
                name: 'Gulmarg', 
                image: 'https://images.unsplash.com/photo-1566837497312-7be4a47d0c95?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1740&q=80'
              },
              { 
                name: 'Srinagar', 
                image: 'https://images.unsplash.com/photo-1593096725460-eb3300e8019b?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1740&q=80'
              },
              { 
                name: 'Pehelgam', 
                image: 'https://images.unsplash.com/photo-1593181629936-11c609b8db9b?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1740&q=80'
              },
              { 
                name: 'Yousmarg', 
                image: 'https://images.unsplash.com/photo-1593181629936-11c609b8db9b?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1740&q=80'
              }
            ].map((destination) => (
              <div key={destination.name} className="text-center group">
                <div className="rounded-lg overflow-hidden mb-1 md:mb-2 aspect-w-4 aspect-h-3">
                  <img 
                    src={destination.image} 
                    alt={destination.name}
                    className="w-full h-32 md:h-48 object-cover transition-transform duration-300 group-hover:scale-110"
                  />
                </div>
                <h3 className="font-medium text-base md:text-lg">{destination.name}</h3>
              </div>
            ))}
          </div>
        </div>

        {/* Quote Request Modal */}
        {showQuoteModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-3 md:p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden animate-fade-in">
              {/* Close button - Larger for mobile */}
              <button 
                onClick={() => setShowQuoteModal(false)} 
                className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-white/90 hover:bg-white shadow-md transition-all"
              >
                <X size={18} />
              </button>
              
              {/* Popup Header with gradient */}
              <div className="h-20 bg-gradient-to-r from-blue-600 to-indigo-600 relative">
                <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-16 h-16 flex items-center justify-center bg-white rounded-full shadow-lg border-4 border-white">
                  <div className="h-12 w-12 rounded-full bg-blue-600 flex items-center justify-center">
                    <FaPlane className="text-white text-lg" />
                  </div>
                </div>
              </div>
              
              <div className="pt-10 px-5 pb-5">
                {/* Title Section with improved design */}
                <div className="text-center mb-4">
                  <h3 className="text-xl font-bold text-gray-900">
                    Get Your Quote
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">
                    Custom travel package just for you
                  </p>
                </div>

                {/* Package Summary with improved design */}
                <div className="bg-gray-50 rounded-lg p-3 mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="text-blue-600">
                      <FaMapMarkerAlt />
                    </div>
                    <div>
                      <h4 className="font-medium text-sm">{packageTitle}</h4>
                      <p className="text-xs text-gray-500">{packageDuration} • from <Price amount={packagePrice} /></p>
                    </div>
                  </div>
                  <div className="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full font-medium">
                    BEST VALUE
                  </div>
                </div>
                
                {/* Form with improved design */}
                {formSubmitSuccess ? (
                  <div className="text-center py-10 px-4">
                    <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                      <FaCheckCircle className="text-green-500" size={40} />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">Thank You!</h3>
                    <p className="text-gray-600">
                      Your quote request has been submitted successfully. Our travel experts will contact you within 24 hours.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-3">
                    {formSubmitError && (
                      <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">
                        {formSubmitError}
                      </div>
                    )}
                    
                    <div className="space-y-3">
                      {/* Full Name, Email, Phone */}
                      <div className="grid grid-cols-1 gap-3">
                        <div className="relative">
                          <input
                            id="name"
                            type="text"
                            name="name"
                            placeholder="Full Name"
                            value={formData.name}
                            onChange={handleInputChange}
                            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
                          />
                          <div className="absolute left-3 top-2.5 text-gray-400">
                            <Users size={15} />
                          </div>
                        </div>
                        
                        <div className="relative">
                          <input
                            id="email"
                            type="email"
                            name="email"
                            placeholder="Email Address"
                            value={formData.email}
                            onChange={handleInputChange}
                            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
                          />
                          <div className="absolute left-3 top-2.5 text-gray-400">
                            <FaEnvelope size={14} />
                          </div>
                        </div>
                        
                        <div className="relative">
                          <input
                            id="phone"
                            type="tel"
                            name="phone"
                            placeholder="Enter your 10 digit number"
                            value={formData.phone}
                            onChange={handleInputChange}
                            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
                          />
                          <div className="absolute left-3 top-2.5 text-gray-400">
                            <FaPhoneAlt size={14} />
                          </div>
                        </div>
                      </div>

                      {/* Travel Info */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="relative">
                          <input
                            id="travelDate"
                            type="date"
                            name="travelDate"
                            value={formData.travelDate || ""}
                            onChange={handleInputChange}
                            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
                          />
                          <div className="absolute left-3 top-2.5 text-gray-400">
                            <Calendar size={15} />
                          </div>
                        </div>
                        
                        <div className="relative">
                          <select
                            id="guests"
                            name="guests"
                            value={formData.guests || "2"}
                            onChange={handleInputChange}
                            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-100 appearance-none"
                          >
                            <option value="1">1 Person</option>
                            <option value="2">2 People</option>
                            <option value="3">3 People</option>
                            <option value="4+">4+ People</option>
                          </select>
                          <div className="absolute left-3 top-2.5 text-gray-400">
                            <Users size={15} />
                          </div>
                          <div className="absolute right-3 top-2.5 text-gray-400">
                            <ChevronDown size={15} />
                          </div>
                        </div>
                      </div>

                      {/* Special Requests */}
                      <div className="relative">
                        <textarea
                          id="request"
                          name="request"
                          rows="2"
                          placeholder="Special requests or questions"
                          value={formData.request}
                          onChange={handleInputChange}
                          className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-100 resize-none"
                        />
                        <div className="absolute left-3 top-2.5 text-gray-400">
                          <FaShieldAlt size={14} />
                        </div>
                      </div>
                    </div>

                    {/* Terms Checkbox */}
                    <div className="flex items-start gap-2">
                      <input
                        id="terms"
                        name="terms"
                        type="checkbox"
                        checked={formData.terms || false}
                        onChange={handleInputChange}
                        className="mt-0.5 w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                      />
                      <label htmlFor="terms" className="text-xs text-gray-500 flex-1">
                        I agree to receive promotional emails about special offers from JetSetters
                      </label>
                    </div>

                    {/* Submit Button */}
                    <div className="pt-2">
                      <button
                        type="submit"
                        disabled={formSubmitting}
                        className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium rounded-lg shadow-sm text-sm flex items-center justify-center gap-1"
                      >
                        {formSubmitting ? (
                          <span>Processing...</span>
                        ) : (
                          <>
                            <span>Get Quote</span>
                            <ChevronRight size={16} />
                          </>
                        )}
                      </button>
                      
                      <p className="text-[10px] text-center text-gray-400 mt-2">
                        A travel expert will contact you within 24 hours
                      </p>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        )}
        
        {/* Add these styles to your CSS */}
        <style>{`
          @keyframes modalEntry {
            from {
              opacity: 0;
              transform: scale(0.95);
            }
            to {
              opacity: 1;
              transform: scale(1);
            }
          }
          .animate-modal-entry {
            animation: modalEntry 0.3s ease-out;
          }
        `}</style>
      </div>
      <Footer />
    </div>
  )
}

export default withPageElements(ItineraryPackage);
