import React, { useEffect, useState } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { FaShip, FaPhone, FaTimes, FaUser, FaEnvelope, FaCalendarAlt, FaCommentAlt, FaCheckCircle } from 'react-icons/fa';
import Navbar from '../Navbar';
import Footer from '../Footer';
import withPageElements from '../PageWrapper';
import callbackService from '../../../Services/callbackService';
import cruiseLineData from './data/cruiselines.json';
import Price from '../../../Components/Price';
import currencyService from '../../../Services/CurrencyService';

const cruiseHighlights = [
  { title: "Cruise Dining", img: "/images/dining.jpg" },
  { title: "Cruise Party", img: "/images/party.jpg" },
  { title: "Cruise Entertainment", img: "/images/entertainment.jpg" }
];

const reviewers = [
  { id: 1, image: "/images/reviewer1.jpg", isActive: true },
  { id: 2, image: "/images/reviewer2.jpg", isActive: false },
  { id: 3, image: "/images/reviewer3.jpg", isActive: false },
  { id: 4, image: "/images/reviewer4.jpg", isActive: false },
  { id: 5, image: "/images/reviewer5.jpg", isActive: false }
];

const CombinedStyles = () => (
  <style global>{`
    .itinerary-container {
      max-width: 1200px;
      margin: 2rem auto;
      padding: 1rem;
      background-color: transparent;
    }

    .cruise-header {
      background: linear-gradient(to right, #ffffff, #f8faff);
      border-radius: 12px;
      padding: 2rem;
      box-shadow: 0 8px 24px rgba(149, 157, 165, 0.1);
      margin-bottom: 1.5rem;
      position: relative;
      border: 1px solid rgba(230, 235, 245, 0.8);
    }

    .header-top {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 1.5rem;
    }

    .destination-text {
      font-size: 1.5rem;
      font-weight: 800;
      background: linear-gradient(135deg, #1e4799 0%, #1e88e5 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      letter-spacing: -0.02em;
    }

    .arrow-icon {
      color: #1e88e5;
      font-size: 1.5rem;
      font-weight: bold;
      opacity: 0.8;
    }

    .duration {
      background: #e8f3ff;
      color: #1e88e5;
      font-size: 0.875rem;
      font-weight: 600;
      padding: 0.25rem 0.75rem;
      border-radius: 20px;
      margin-left: 0.75rem;
    }

    .booking-info {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      color: #4a5568;
      font-size: 0.938rem;
    }

    .booking-info-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.5rem 0;
      border-bottom: 1px dashed rgba(203, 213, 225, 0.5);
    }

    .booking-info-item:last-child {
      border-bottom: none;
    }

    .price-section {
      position: absolute;
      top: 2rem;
      right: 2rem;
      text-align: right;
    }

    .select-room-btn {
      background: linear-gradient(135deg, #1e4799 0%, #1e88e5 100%);
      color: white;
      padding: 0.875rem 2.5rem;
      border-radius: 50px;
      border: none;
      cursor: pointer;
      font-weight: 600;
      font-size: 1rem;
      transition: all 0.3s ease;
      box-shadow: 0 4px 12px rgba(30, 71, 153, 0.2);
    }

    .select-room-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(30, 71, 153, 0.3);
    }

    .itinerary-section {
      background: linear-gradient(to right, #ffffff, #f8faff);
      border-radius: 12px;
      padding: 2.5rem;
      box-shadow: 0 8px 24px rgba(149, 157, 165, 0.1);
      border: 1px solid rgba(230, 235, 245, 0.8);
    }

    .itinerary-title {
      font-size: 1.75rem;
      font-weight: 700;
      color: #1a202c;
      margin-bottom: 0.5rem;
    }

    .itinerary-subtitle {
      color: #718096;
      font-size: 1rem;
      margin-bottom: 2rem;
    }

    .day-box {
      background: linear-gradient(135deg, #1e4799 0%, #1e88e5 100%);
      color: white;
      width: 64px;
      height: 64px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      border-radius: 12px;
      font-size: 0.875rem;
      box-shadow: 0 4px 12px rgba(30, 71, 153, 0.2);
    }

    .day-box span:last-child {
      font-size: 1.5rem;
      font-weight: 700;
      margin-top: 0.125rem;
    }

    .day-content {
      flex: 1;
      padding-left: 0.5rem;
    }

    .day-title {
      font-size: 1.25rem;
      font-weight: 700;
      color: #1a202c;
      margin-bottom: 0.375rem;
    }

    .day-subtitle {
      color: #1e88e5;
      font-size: 0.875rem;
      font-weight: 600;
      text-transform: uppercase;
      margin-bottom: 0.75rem;
      letter-spacing: 0.05em;
      background: #e8f3ff;
      padding: 0.25rem 0.75rem;
      border-radius: 20px;
      display: inline-block;
    }

    .day-description {
      color: #4a5568;
      font-size: 0.938rem;
      line-height: 1.6;
    }

    .view-more {
      color: #1e88e5;
      font-size: 0.938rem;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-top: 1.5rem;
      background: #e8f3ff;
      border: none;
      cursor: pointer;
      padding: 0.5rem 1rem;
      border-radius: 20px;
      transition: all 0.3s ease;
    }

    .view-more:hover {
      background: #d1e9ff;
      transform: translateX(4px);
    }

    .view-more svg {
      width: 16px;
      height: 16px;
      margin-top: 2px;
    }

    @media (max-width: 768px) {
      .cruise-header {
        padding: 1.5rem;
      }

      .price-section {
        position: static;
        margin-top: 1.5rem;
        text-align: left;
      }

      .select-room-btn {
        width: 100%;
      }

      .header-top {
        flex-wrap: wrap;
      }

      .destination-text {
        font-size: 1.25rem;
      }

      .itinerary-section {
        padding: 1.5rem;
      }

      .day-box {
        width: 56px;
        height: 56px;
      }
    }

    .highlights-section {
      background: linear-gradient(to right, #ffffff, #f8faff);
      border-radius: 12px;
      padding: 3rem;
      box-shadow: 0 8px 24px rgba(149, 157, 165, 0.1);
      margin-top: 1.5rem;
      border: 1px solid rgba(230, 235, 245, 0.8);
    }

    .highlights-section h2 {
      font-size: 1.75rem;
      font-weight: 700;
      color: #1a202c;
      text-align: center;
      margin-bottom: 2rem;
    }

    .highlights-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1.5rem;
      margin-top: 1.5rem;
    }

    .highlight-card {
      border-radius: 12px;
      overflow: hidden;
      height: 200px;
      box-shadow: 0 8px 24px rgba(149, 157, 165, 0.1);
      position: relative;
    }

    .highlight-card::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 50%;
      background: linear-gradient(to top, rgba(0,0,0,0.5), transparent);
      pointer-events: none;
    }

    .highlight-card img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: transform 0.3s ease;
    }

    .highlight-card:hover img {
      transform: scale(1.05);
    }

    .reviews-section {
      background: #D1EFFF;
      border-radius: 12px;
      padding: 3.5rem 2.5rem;
      box-shadow: 0 8px 24px rgba(149, 157, 165, 0.1);
      margin-top: 1.5rem;
      text-align: center;
      border: 1px solid rgba(230, 235, 245, 0.8);
    }

    .reviews-section h2 {
      font-size: 1.75rem;
      font-weight: 700;
      color: #1a202c;
      margin-bottom: 2rem;
    }

    .review-quote {
      font-size: 4rem;
      background: linear-gradient(135deg, #1e4799 0%, #1e88e5 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      line-height: 1;
      margin-bottom: 1.5rem;
      opacity: 0.8;
    }

    .review-text {
      font-size: 1.125rem;
      color: #4a5568;
      line-height: 1.8;
      max-width: 800px;
      margin: 0 auto 2rem;
    }

    .reviewer-name {
      font-size: 1.125rem;
      font-weight: 700;
      color: #1a202c;
      margin-bottom: 0.25rem;
    }

    .reviewer-position {
      font-size: 0.875rem;
      color: #718096;
      margin-bottom: 2rem;
    }

    .reviewer-images {
      display: flex;
      justify-content: center;
      gap: 1rem;
      margin-top: 2rem;
    }

    .reviewer-image {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      overflow: hidden;
      border: 2px solid transparent;
      transition: all 0.3s ease;
      box-shadow: 0 4px 12px rgba(149, 157, 165, 0.1);
    }

    .reviewer-image.active {
      border-color: #1e88e5;
      transform: scale(1.1);
      box-shadow: 0 6px 16px rgba(30, 71, 153, 0.2);
    }

    .reviewer-image img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    @media (max-width: 768px) {
      .highlights-grid {
        grid-template-columns: 1fr;
        gap: 1rem;
      }

      .highlight-card {
        height: 180px;
      }

      .reviews-section {
        padding: 2rem 1rem;
      }

      .review-text {
        font-size: 1rem;
        padding: 0 1rem;
      }
    }
  `}</style>
);

const Itinerary = () => {
  const [searchParams] = useSearchParams();
  const cruiseId = searchParams.get('cruiseId');
  const cruiseLine = searchParams.get('cruiseLine');
  const [isCallbackModalOpen, setIsCallbackModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    preferredDate: '',
    message: ''
  });
  const [formSubmitted, setFormSubmitted] = useState(false);
  const [activeField, setActiveField] = useState(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formSubmitError, setFormSubmitError] = useState('');
  const [formSubmitSuccess, setFormSubmitSuccess] = useState(false);
  const [cruiseData, setCruiseData] = useState(null);

  useEffect(() => {
    // Find the selected cruise from cruiseLineData
    const findCruise = () => {
      const allCruises = cruiseLineData.cruiseLines;
      let selectedCruise;

      if (cruiseId) {
        selectedCruise = allCruises.find(cruise => cruise.id === parseInt(cruiseId));
      } else if (cruiseLine) {
        selectedCruise = allCruises.find(cruise =>
          cruise.name.toLowerCase() === cruiseLine.toLowerCase()
        );
      }

      if (selectedCruise) {
        setCruiseData({
          name: selectedCruise.name,
          route: {
            departure: selectedCruise.departurePorts[0],
            arrival: selectedCruise.destinations[0]
          },
          duration: selectedCruise.duration,
          bookingInfo: {
            embarkation: {
              date: selectedCruise.departureDate,
              time: selectedCruise.departureTime
            },
            disembarkation: {
              date: selectedCruise.returnDate,
              time: selectedCruise.returnTime
            }
          },
          cruiseLine: selectedCruise.name,
          price: {
            amount: selectedCruise.price.replace(/[^0-9]/g, ''),
            note: 'Excl. Tax Per Person in Double Occupancy'
          },
          days: selectedCruise.itinerary || [],
          highlights: selectedCruise.highlights || [],
          reviews: selectedCruise.reviews || {
            text: "The tours in this website are great. The team is very professional and taking care of the customers.",
            reviewer: {
              name: "Happy Traveler",
              position: "Verified Customer"
            }
          }
        });
      }
    };

    findCruise();
  }, [cruiseId, cruiseLine]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate form data
    if (!formData.name || !formData.phone || !formData.email) {
      setFormSubmitError('Please fill in all required fields');
      return;
    }

    setFormSubmitting(true);
    setFormSubmitError('');

    try {
      // Call the callback service and wait for a response
      const result = await callbackService.createCallbackRequest({
        name: formData.name,
        phone: formData.phone,
        email: formData.email,
        preferredTime: formData.preferredDate,
        message: formData.message
      });

      console.log('Callback request successful:', result);

      // Reset form
      setFormData({
        name: '',
        email: '',
        phone: '',
        preferredDate: '',
        message: ''
      });

      setFormSubmitting(false);
      setFormSubmitSuccess(true);

      setTimeout(() => {
        setIsCallbackModalOpen(false);
        setFormSubmitSuccess(false);
      }, 3000);
    } catch (error) {
      console.error('Error submitting callback request:', error);
      setFormSubmitting(false);
      // Display a more user-friendly error message
      setFormSubmitError(
        'We encountered an issue saving your request. Please try again or contact us directly at support@jetsetgo.com'
      );
    }
  };

  const handleFocus = (field) => {
    setActiveField(field);
  };

  const handleBlur = () => {
    setActiveField(null);
  };

  return (
    <>
      <Navbar />

      {/* Hero Header Image */}
      <div className="relative w-full">
        <img
          src="https://images.unsplash.com/photo-1548574505-5e239809ee19?w=1920&q=80"
          alt="Cruise Itinerary"
          className="w-full h-[400px] object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0a2540]/40 via-[#0a2540]/60 to-[#0a2540]/80 flex flex-col items-center justify-center px-4">
          <h1 className="text-4xl md:text-6xl text-white font-bold text-center mb-4 drop-shadow-lg">
            {cruiseData?.name || `${cruiseLine || 'Celebrity Cruises'}`}
          </h1>
          <p className="text-xl md:text-2xl text-white/90 text-center max-w-3xl mx-auto font-light drop-shadow-md">
            {cruiseData?.description || 'Explore your upcoming cruise adventure day by day'}
          </p>
        </div>
      </div>

      <div className="itinerary-container">
        <CombinedStyles />

        {/* Navigation */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
          <Link
            to="/cruises"
            className="bg-[#0066b2] hover:bg-[#005091] text-white font-medium py-2 px-4 rounded-md transition-colors"
          >
            Back to Cruises
          </Link>
        </div>

        {/* Cruise Header */}
        <div className="cruise-header bg-white rounded-[20px] overflow-hidden shadow-lg relative p-6 md:p-10">
          <div className="flex flex-col md:flex-row justify-between items-start gap-6">
            <div className="w-full md:w-3/5">
              <div className="flex items-center gap-2 mb-6">
                <span className="text-2xl md:text-3xl font-bold text-[#0066b2]">
                  {cruiseData?.route?.departure || 'Miami'}
                </span>
                <span className="text-2xl md:text-3xl font-bold text-gray-400">≫</span>
                <span className="text-2xl md:text-3xl font-bold text-[#0066b2]">
                  {cruiseData?.route?.arrival || 'Florida'}
                </span>
                <span className="bg-blue-50 text-[#0066b2] px-3 py-1 rounded-full text-sm font-semibold ml-2">
                  {cruiseData?.duration || '2N/3D'}
                </span>
              </div>

              <div className="space-y-6">
                <div className="flex items-start">
                  <div className="w-8 h-8 mr-4 mt-1 text-[#0066b2] bg-blue-50 rounded-full flex items-center justify-center flex-shrink-0">
                    <FaShip />
                  </div>
                  <div>
                    <span className="block text-gray-800 font-semibold mb-1">Embarkation</span>
                    <span className="text-gray-600">
                      {cruiseData?.bookingInfo?.embarkation?.date || 'Jan 13th'},
                      {cruiseData?.bookingInfo?.embarkation?.time || '4:30 PM'}
                    </span>
                  </div>
                </div>

                <div className="flex items-start">
                  <div className="w-8 h-8 mr-4 mt-1 text-[#0066b2] bg-blue-50 rounded-full flex items-center justify-center flex-shrink-0">
                    <FaShip />
                  </div>
                  <div>
                    <span className="block text-gray-800 font-semibold mb-1">Disembarkation</span>
                    <span className="text-gray-600">
                      {cruiseData?.bookingInfo?.disembarkation?.date || 'Jan 17th'},
                      {cruiseData?.bookingInfo?.disembarkation?.time || '7:30 PM'}
                    </span>
                  </div>
                </div>

                <div className="flex items-start">
                  <div className="w-8 h-8 mr-4 mt-1 text-[#0066b2] bg-blue-50 rounded-full flex items-center justify-center flex-shrink-0">
                    <FaShip />
                  </div>
                  <div>
                    <span className="block text-gray-800 font-semibold mb-1">Cruise Line</span>
                    <span className="text-gray-600">
                      {cruiseData?.cruiseLine || cruiseLine || 'Royal Caribbean'}
                    </span>
                  </div>
                </div>

                <div className="flex items-start">
                  <div className="w-8 h-8 mr-4 mt-1 text-[#0066b2] bg-blue-50 rounded-full flex items-center justify-center flex-shrink-0">
                    <FaShip />
                  </div>
                  <div>
                    <span className="block text-gray-800 font-semibold mb-1">Visiting Ports</span>
                    <span className="text-gray-600">
                      {cruiseData?.days?.map(day => day.port).join(' | ') || 'Miami | Florida'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="w-full md:w-2/5 flex flex-col items-end justify-between">
              <div className="text-right mb-6">
                <div className="text-sm text-gray-500 mb-1">Starting from</div>
                <div className="text-3xl font-bold text-[#0066b2] mb-1">
                  <Price amount={cruiseData?.price?.amount || '200'} />
                </div>
                <div className="text-sm text-gray-500">
                  {cruiseData?.price?.note || 'Excl. Tax Per Person in Double Occupancy'}
                </div>
              </div>

              <button
                className="w-full md:w-auto bg-[#0066b2] hover:bg-[#005091] text-white font-medium py-3 px-8 rounded-full transition-all duration-300 flex items-center justify-center gap-2 mb-3 md:mb-0 md:mr-3"
                onClick={() => setIsCallbackModalOpen(true)}
              >
                <FaPhone size={16} /> Request Call Back
              </button>
              <Link
                to={`/cruise-booking-summary?cruiseId=${cruiseId || ''}&cruiseLine=${encodeURIComponent(cruiseData?.name || cruiseLine || '')}&price=${encodeURIComponent(cruiseData?.price?.amount || '')}&duration=${encodeURIComponent(cruiseData?.duration || '')}&departure=${encodeURIComponent(cruiseData?.route?.departure || '')}&arrival=${encodeURIComponent(cruiseData?.route?.arrival || '')}&departureDate=${encodeURIComponent(cruiseData?.bookingInfo?.embarkation?.date || '')}&returnDate=${encodeURIComponent(cruiseData?.bookingInfo?.disembarkation?.date || '')}`}
                className="w-full md:w-auto bg-[#00b894] hover:bg-[#00a885] text-white font-medium py-3 px-8 rounded-full transition-all duration-300 flex items-center justify-center gap-2"
              >
                <FaShip size={16} /> Book Now
              </Link>
            </div>
          </div>
        </div>

        {/* Itinerary Section */}
        <div className="itinerary-section">
          <h2 className="itinerary-title">Itinerary</h2>
          <p className="itinerary-subtitle">Day wise details of your package</p>

          {cruiseData?.days?.map((day) => (
            <div key={day.day} style={{ display: 'flex', gap: '1.25rem', marginBottom: '2rem' }}>
              <div className="day-box">
                <span>Day</span>
                <span>{day.day}</span>
              </div>
              <div className="day-content">
                <h3 className="day-title">{day.port}</h3>
                <p className="day-subtitle">{day.subtitle || day.arrival}</p>
                <p className="day-description">{day.description || day.activities?.join(', ')}</p>
              </div>
            </div>
          ))}

          <button className="view-more">
            View Full Itinerary
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>

        {/* Cruise Highlights */}
        <div className="highlights-section">
          <h2 className="text-2xl font-bold text-center">Your Cruise Highlight</h2>
          <div className="highlights-grid">
            {cruiseData?.highlights?.map((highlight, index) => (
              <div key={index} className="highlight-card">
                <img src={highlight.img} alt={highlight.title} />
              </div>
            ))}
          </div>
        </div>

        {/* Customer Reviews */}
        <div className="reviews-section">
          <h2>Customer Reviews</h2>
          <div className="review-quote">"</div>
          <p className="review-text">
            {cruiseData?.reviews?.text || "The tours in this website are great. The team is very professional and taking care of the customers."}
          </p>
          <div className="reviewer-name">
            {cruiseData?.reviews?.reviewer?.name || 'Happy Traveler'}
          </div>
          <div className="reviewer-position">
            {cruiseData?.reviews?.reviewer?.position || 'Verified Customer'}
          </div>

          <div className="reviewer-images">
            {cruiseData?.reviews?.reviewers?.map((reviewer) => (
              <div
                key={reviewer.id}
                className={`reviewer-image ${reviewer.isActive ? 'active' : ''}`}
              >
                <img src={reviewer.image} alt={`Reviewer ${reviewer.id}`} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Callback Request Popup */}
      {isCallbackModalOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setIsCallbackModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-0 relative overflow-hidden animate-fadeIn"
            onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside
            style={{
              animation: 'fadeIn 0.3s ease-out',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.2)',
            }}
          >
            <div className="bg-gradient-to-r from-[#0066b2] to-[#1e88e5] pt-6 pb-10 px-5 text-white relative">
              <button
                className="absolute top-3 right-3 text-white hover:text-gray-200 transition-colors"
                onClick={() => setIsCallbackModalOpen(false)}
                aria-label="Close popup"
              >
                <FaTimes size={18} />
              </button>

              <div className="flex items-center mb-2">
                <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center mr-3">
                  <FaPhone className="text-[#0066b2]" size={16} />
                </div>
                <h2 className="text-xl font-bold">Request a Call Back</h2>
              </div>

              <p className="opacity-90 text-xs">
                Our cruise expert will contact you to discuss {cruiseLine || 'Royal Caribbean'} options
              </p>

              <div className="absolute -bottom-5 left-0 right-0 h-10 bg-white rounded-t-[50%]"></div>
            </div>

            <div className="px-5 pb-5 pt-3">
              {formSubmitSuccess ? (
                <div className="text-center py-8 px-3 animate-fadeIn" style={{ animation: 'fadeIn 0.5s ease-out' }}>
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <FaCheckCircle className="text-green-500" size={32} />
                  </div>
                  <h2 className="text-xl font-bold text-gray-800 mb-2">Thank You!</h2>
                  <p className="text-sm text-gray-600 mb-4">
                    Your call back request has been received. Our travel expert will contact you shortly.
                  </p>
                  <div className="w-12 h-1 bg-green-500 mx-auto"></div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4 pt-2">
                  <div className={`transition-all duration-200 ${activeField === 'name' ? 'transform -translate-y-1' : ''}`}>
                    <label className="block text-gray-700 text-xs font-semibold mb-1" htmlFor="name">
                      Full Name*
                    </label>
                    <div className={`relative rounded-lg transition-all duration-300 ${activeField === 'name' ? 'ring-2 ring-[#0066b2]' : 'ring-1 ring-gray-200'}`}>
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <FaUser className={`transition-colors ${activeField === 'name' ? 'text-[#0066b2]' : 'text-gray-400'}`} size={14} />
                      </div>
                      <input
                        type="text"
                        id="name"
                        name="name"
                        value={formData.name}
                        onChange={handleInputChange}
                        onFocus={() => handleFocus('name')}
                        onBlur={handleBlur}
                        required
                        className="w-full bg-gray-50 pl-10 pr-3 py-2.5 text-sm border-none rounded-lg focus:outline-none"
                        placeholder="John Doe"
                      />
                    </div>
                  </div>

                  <div className={`transition-all duration-200 ${activeField === 'email' ? 'transform -translate-y-1' : ''}`}>
                    <label className="block text-gray-700 text-xs font-semibold mb-1" htmlFor="email">
                      Email Address*
                    </label>
                    <div className={`relative rounded-lg transition-all duration-300 ${activeField === 'email' ? 'ring-2 ring-[#0066b2]' : 'ring-1 ring-gray-200'}`}>
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <FaEnvelope className={`transition-colors ${activeField === 'email' ? 'text-[#0066b2]' : 'text-gray-400'}`} size={14} />
                      </div>
                      <input
                        type="email"
                        id="email"
                        name="email"
                        value={formData.email}
                        onChange={handleInputChange}
                        onFocus={() => handleFocus('email')}
                        onBlur={handleBlur}
                        required
                        className="w-full bg-gray-50 pl-10 pr-3 py-2.5 text-sm border-none rounded-lg focus:outline-none"
                        placeholder="john@example.com"
                      />
                    </div>
                  </div>

                  <div className={`transition-all duration-200 ${activeField === 'phone' ? 'transform -translate-y-1' : ''}`}>
                    <label className="block text-gray-700 text-xs font-semibold mb-1" htmlFor="phone">
                      Phone Number*
                    </label>
                    <div className={`relative rounded-lg transition-all duration-300 ${activeField === 'phone' ? 'ring-2 ring-[#0066b2]' : 'ring-1 ring-gray-200'}`}>
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <FaPhone className={`transition-colors ${activeField === 'phone' ? 'text-[#0066b2]' : 'text-gray-400'}`} size={14} />
                      </div>
                      <input
                        type="tel"
                        id="phone"
                        name="phone"
                        value={formData.phone}
                        onChange={handleInputChange}
                        onFocus={() => handleFocus('phone')}
                        onBlur={handleBlur}
                        required
                        className="w-full bg-gray-50 pl-10 pr-3 py-2.5 text-sm border-none rounded-lg focus:outline-none"
                        placeholder="+1 (123) 456-7890"
                      />
                    </div>
                  </div>

                  <div className={`transition-all duration-200 ${activeField === 'preferredDate' ? 'transform -translate-y-1' : ''}`}>
                    <label className="block text-gray-700 text-xs font-semibold mb-1" htmlFor="preferredDate">
                      Preferred Call Time
                    </label>
                    <div className={`relative rounded-lg transition-all duration-300 ${activeField === 'preferredDate' ? 'ring-2 ring-[#0066b2]' : 'ring-1 ring-gray-200'}`}>
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <FaCalendarAlt className={`transition-colors ${activeField === 'preferredDate' ? 'text-[#0066b2]' : 'text-gray-400'}`} size={14} />
                      </div>
                      <input
                        type="text"
                        id="preferredDate"
                        name="preferredDate"
                        value={formData.preferredDate}
                        onChange={handleInputChange}
                        onFocus={() => handleFocus('preferredDate')}
                        onBlur={handleBlur}
                        className="w-full bg-gray-50 pl-10 pr-3 py-2.5 text-sm border-none rounded-lg focus:outline-none"
                        placeholder="E.g. Weekdays after 2 PM"
                      />
                    </div>
                  </div>

                  <div className={`transition-all duration-200 ${activeField === 'message' ? 'transform -translate-y-1' : ''}`}>
                    <label className="block text-gray-700 text-xs font-semibold mb-1" htmlFor="message">
                      Additional Information
                    </label>
                    <div className={`relative rounded-lg transition-all duration-300 ${activeField === 'message' ? 'ring-2 ring-[#0066b2]' : 'ring-1 ring-gray-200'}`}>
                      <div className="absolute top-2.5 left-0 pl-3 flex items-start pointer-events-none">
                        <FaCommentAlt className={`transition-colors ${activeField === 'message' ? 'text-[#0066b2]' : 'text-gray-400'}`} size={14} />
                      </div>
                      <textarea
                        id="message"
                        name="message"
                        value={formData.message}
                        onChange={handleInputChange}
                        onFocus={() => handleFocus('message')}
                        onBlur={handleBlur}
                        rows="2"
                        className="w-full bg-gray-50 pl-10 pr-3 py-2.5 text-sm border-none rounded-lg focus:outline-none resize-none"
                        placeholder="Any specific questions or requirements?"
                      ></textarea>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-gradient-to-r from-[#0066b2] to-[#1e88e5] text-white font-bold py-3 px-4 rounded-xl hover:shadow-lg transition-all duration-300 flex items-center justify-center gap-2 mt-4 text-sm"
                  >
                    <FaPhone size={14} /> Request Call Back
                  </button>

                  <p className="text-[10px] text-center text-gray-500 mt-2">
                    By submitting this form, you agree to our <a href="#" className="text-[#0066b2]">Terms & Conditions</a> and <a href="#" className="text-[#0066b2]">Privacy Policy</a>
                  </p>
                </form>
              )}
            </div>
          </div>

          <style global>{`
            @keyframes fadeIn {
              from { opacity: 0; transform: translateY(20px); }
              to { opacity: 1; transform: translateY(0); }
            }
            .animate-fadeIn {
              animation: fadeIn 0.3s ease-out forwards;
            }
          `}</style>
        </div>
      )}

      <Footer />
    </>
  );
};

export default withPageElements(Itinerary);
