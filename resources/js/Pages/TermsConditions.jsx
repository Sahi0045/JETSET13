import React from 'react';
import { Link } from 'react-router-dom';
import { FaFileContract, FaShieldAlt, FaCreditCard, FaPlane, FaHotel, FaShip, FaExclamationTriangle, FaCheckCircle, FaTimesCircle, FaInfoCircle } from 'react-icons/fa';
import Navbar from './Common/Navbar';
import Footer from './Common/Footer';

const TermsConditions = () => {
  const lastUpdated = "January 15, 2024";

  const serviceTypes = [
    {
      title: "Flight Bookings",
      description: "Airline reservations and ticketing services",
      icon: <FaPlane className="text-3xl text-blue-600" />
    },
    {
      title: "Hotel Accommodations",
      description: "Hotel reservations and accommodation services",
      icon: <FaHotel className="text-3xl text-green-600" />
    },
    {
      title: "Cruise Packages",
      description: "Cruise bookings and vacation packages",
      icon: <FaShip className="text-3xl text-purple-600" />
    },
    {
      title: "Travel Insurance",
      description: "Comprehensive travel protection plans",
      icon: <FaShieldAlt className="text-3xl text-orange-600" />
    }
  ];

  const bookingTerms = [
    {
      title: "Reservation Confirmation",
      description: "Bookings are confirmed only after payment is received and processed"
    },
    {
      title: "Cancellation Policy",
      description: "Cancellation terms vary by service provider and booking type"
    },
    {
      title: "Change Fees",
      description: "Modifications may incur additional charges from service providers"
    },
    {
      title: "Refund Processing",
      description: "Refunds are processed according to provider policies and may take 5-10 business days"
    }
  ];

  const userObligations = [
    {
      title: "Accurate Information",
      description: "Provide accurate and complete information for all bookings",
      icon: <FaCheckCircle className="text-green-500" />
    },
    {
      title: "Valid Documents",
      description: "Ensure all travel documents are valid and up-to-date",
      icon: <FaCheckCircle className="text-green-500" />
    },
    {
      title: "Compliance",
      description: "Comply with all applicable laws and regulations",
      icon: <FaCheckCircle className="text-green-500" />
    },
    {
      title: "Payment Obligations",
      description: "Pay all fees and charges associated with your bookings",
      icon: <FaCheckCircle className="text-green-500" />
    }
  ];

  const prohibitedActivities = [
    "Fraudulent bookings or false information",
    "Reselling or transferring bookings without authorization",
    "Attempting to circumvent our booking systems",
    "Harassment of our staff or other customers",
    "Violation of any applicable laws or regulations"
  ];

  return (
    <>
      <Navbar forceScrolled={true} />
      <div className="min-h-screen bg-gray-50">
        {/* Hero Section */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-700 text-white py-20">
          <div className="container mx-auto px-4 text-center">
            <h1 className="text-5xl font-bold mb-6">Terms & Conditions</h1>
            <p className="text-xl max-w-3xl mx-auto">
              These terms and conditions govern your use of Jetsetterss services. By using our platform, 
              you agree to be bound by these terms and our privacy policy.
            </p>
            <div className="mt-6 text-blue-100">
              Last updated: {lastUpdated}
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 py-16">
          {/* Introduction */}
          <section className="mb-20">
            <div className="max-w-4xl mx-auto">
              <div className="bg-white rounded-xl shadow-lg p-8">
                <div className="text-center mb-8">
                  <FaFileContract className="text-5xl text-blue-600 mx-auto mb-4" />
                  <h2 className="text-3xl font-bold text-gray-900">Agreement to Terms</h2>
                </div>
                <div className="prose prose-lg mx-auto text-gray-600">
                  <p className="mb-6">
                    Welcome to Jetsetterss. These Terms and Conditions ("Terms") constitute a legally binding agreement 
                    between you and Jetsetterss regarding your use of our website, mobile applications, and services 
                    (collectively, the "Services").
                  </p>
                  <p className="mb-6">
                    By accessing or using our Services, you acknowledge that you have read, understood, and agree to be 
                    bound by these Terms. If you do not agree to these Terms, please do not use our Services.
                  </p>
                  <p>
                    We reserve the right to modify these Terms at any time. We will notify you of any changes by posting 
                    the updated Terms on our website. Your continued use of the Services after such modifications constitutes 
                    your acceptance of the updated Terms.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Services Overview */}
          <section className="mb-20">
            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold text-gray-900 mb-4">Our Services</h2>
              <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                Jetsetterss provides comprehensive travel booking and planning services
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              {serviceTypes.map((service, index) => (
                <div key={index} className="bg-white rounded-xl shadow-lg p-8 text-center hover:shadow-xl transition-shadow duration-300">
                  <div className="mb-6">
                    {service.icon}
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-4">{service.title}</h3>
                  <p className="text-gray-600">{service.description}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Booking Terms */}
          <section className="mb-20">
            <div className="bg-white rounded-xl shadow-lg p-8">
              <div className="text-center mb-8">
                <h2 className="text-3xl font-bold text-gray-900 mb-4">Booking Terms and Conditions</h2>
                <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                  Important information about making and managing your travel bookings
                </p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {bookingTerms.map((term, index) => (
                  <div key={index} className="flex items-start gap-4">
                    <div className="w-3 h-3 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-2">{term.title}</h3>
                      <p className="text-gray-600 text-sm">{term.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* User Obligations */}
          <section className="mb-20">
            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold text-gray-900 mb-4">Your Obligations</h2>
              <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                As a user of our services, you agree to the following responsibilities
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {userObligations.map((obligation, index) => (
                <div key={index} className="bg-white rounded-xl shadow-lg p-8 hover:shadow-xl transition-shadow duration-300">
                  <div className="flex items-center gap-4 mb-4">
                    {obligation.icon}
                    <h3 className="text-xl font-bold text-gray-900">{obligation.title}</h3>
                  </div>
                  <p className="text-gray-600">{obligation.description}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Prohibited Activities */}
          <section className="mb-20">
            <div className="bg-red-50 rounded-xl p-8 border border-red-200">
              <div className="text-center mb-8">
                <FaExclamationTriangle className="text-5xl text-red-600 mx-auto mb-4" />
                <h2 className="text-3xl font-bold text-gray-900">Prohibited Activities</h2>
              </div>
              <div className="max-w-3xl mx-auto">
                <p className="text-gray-700 mb-6 text-center">
                  The following activities are strictly prohibited and may result in account termination and legal action:
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {prohibitedActivities.map((activity, index) => (
                    <div key={index} className="flex items-start gap-3">
                      <FaTimesCircle className="text-red-500 mt-1 flex-shrink-0" />
                      <span className="text-gray-700">{activity}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Payment Terms */}
          <section className="mb-20">
            <div className="bg-white rounded-xl shadow-lg p-8">
              <h2 className="text-3xl font-bold text-gray-900 mb-6 text-center">Payment Terms</h2>
              <div className="prose prose-lg mx-auto text-gray-600">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 mb-4">Payment Methods</h3>
                    <ul className="space-y-2">
                      <li className="flex items-center gap-2">
                        <FaCreditCard className="text-blue-500" />
                        <span>Credit and debit cards</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <FaCreditCard className="text-green-500" />
                        <span>Digital wallets (PayPal, Apple Pay)</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <FaCreditCard className="text-purple-500" />
                        <span>Bank transfers (for certain bookings)</span>
                      </li>
                    </ul>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 mb-4">Payment Processing</h3>
                    <ul className="space-y-2">
                      <li className="flex items-center gap-2">
                        <FaCheckCircle className="text-green-500" />
                        <span>Secure payment processing</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <FaCheckCircle className="text-green-500" />
                        <span>Immediate booking confirmation</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <FaCheckCircle className="text-green-500" />
                        <span>Receipt and invoice generation</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Cancellation and Refunds */}
          <section className="mb-20">
            <div className="bg-white rounded-xl shadow-lg p-8">
              <h2 className="text-3xl font-bold text-gray-900 mb-6 text-center">Cancellation and Refund Policy</h2>
              <div className="prose prose-lg mx-auto text-gray-600">
                <p className="mb-6">
                  Our cancellation and refund policies are designed to be fair and transparent. Please note that specific 
                  terms may vary depending on the service provider and booking type.
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 mb-4">Cancellation Deadlines</h3>
                    <ul className="space-y-3">
                      <li className="flex items-start gap-3">
                        <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                        <span><strong>Flights:</strong> Varies by airline and fare type</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                        <span><strong>Hotels:</strong> Usually 24-48 hours before check-in</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                        <span><strong>Cruises:</strong> 30-90 days before departure</span>
                      </li>
                    </ul>
                  </div>
                  
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 mb-4">Refund Processing</h3>
                    <ul className="space-y-3">
                      <li className="flex items-start gap-3">
                        <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
                        <span>Refunds processed within 5-10 business days</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
                        <span>Processing time may vary by payment method</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
                        <span>Service fees may be non-refundable</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Limitation of Liability */}
          <section className="mb-20">
            <div className="bg-yellow-50 rounded-xl p-8 border border-yellow-200">
              <div className="text-center mb-8">
                <FaInfoCircle className="text-5xl text-yellow-600 mx-auto mb-4" />
                <h2 className="text-3xl font-bold text-gray-900">Limitation of Liability</h2>
              </div>
              <div className="max-w-4xl mx-auto text-gray-700">
                <p className="mb-6">
                  Jetsetterss acts as an intermediary between you and travel service providers. While we strive to ensure 
                  the quality of our services, we are not responsible for:
                </p>
                <ul className="space-y-3 mb-6">
                  <li className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-yellow-500 rounded-full mt-2 flex-shrink-0"></div>
                    <span>Service provider errors, delays, or cancellations</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-yellow-500 rounded-full mt-2 flex-shrink-0"></div>
                    <span>Travel disruptions due to weather, strikes, or other events</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-yellow-500 rounded-full mt-2 flex-shrink-0"></div>
                    <span>Loss or damage of personal belongings during travel</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-yellow-500 rounded-full mt-2 flex-shrink-0"></div>
                    <span>Medical emergencies or health-related issues</span>
                  </li>
                </ul>
                <p>
                  We recommend purchasing appropriate travel insurance to protect against such eventualities.
                </p>
              </div>
            </div>
          </section>

          {/* Contact Information */}
          <section className="bg-gradient-to-r from-blue-600 to-purple-700 rounded-2xl p-12 text-center text-white">
            <h2 className="text-3xl font-bold mb-6">Questions About These Terms?</h2>
            <p className="text-xl mb-8 max-w-2xl mx-auto">
              Our legal team is here to help clarify any questions about these terms and conditions.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link 
                to="/contact"
                className="bg-white text-blue-600 px-8 py-4 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
              >
                Contact Us
              </Link>
              <a 
                href="mailto:legal@jetsetterss.com"
                className="bg-transparent border-2 border-white text-white px-8 py-4 rounded-lg font-semibold hover:bg-white hover:text-blue-600 transition-colors"
              >
                Email Legal Team
              </a>
            </div>
          </section>

          {/* Policy Updates */}
          <section className="mt-16 text-center">
            <h3 className="text-2xl font-bold text-gray-900 mb-4">Terms Updates</h3>
            <p className="text-gray-600 mb-6">
              We may update these Terms and Conditions from time to time. We will notify you of any material changes 
              by posting the updated Terms on our website and updating the "Last Updated" date.
            </p>
            <p className="text-sm text-gray-500">
              Last updated: {lastUpdated}
            </p>
          </section>
        </div>
      </div>
      <Footer />
    </>
  );
};

export default TermsConditions; 