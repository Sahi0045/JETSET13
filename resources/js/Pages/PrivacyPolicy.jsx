import React from 'react';
import { Link } from 'react-router-dom';
import { FaShieldAlt, FaEye, FaLock, FaUser, FaGlobe, FaEnvelope, FaPhone, FaCreditCard, FaCalendar, FaMapMarkerAlt } from 'react-icons/fa';
import Navbar from './Common/Navbar';
import Footer from './Common/Footer';

const PrivacyPolicy = () => {
  const lastUpdated = "January 15, 2024";

  const dataCategories = [
    {
      title: "Personal Information",
      description: "Name, email address, phone number, and contact details",
      icon: <FaUser className="text-3xl text-blue-600" />
    },
    {
      title: "Travel Preferences",
      description: "Destination preferences, travel dates, and accommodation choices",
      icon: <FaGlobe className="text-3xl text-green-600" />
    },
    {
      title: "Payment Information",
      description: "Credit card details, billing addresses, and payment history",
      icon: <FaCreditCard className="text-3xl text-purple-600" />
    },
    {
      title: "Usage Data",
      description: "Website interactions, search history, and booking patterns",
      icon: <FaEye className="text-3xl text-orange-600" />
    }
  ];

  const dataUses = [
    {
      title: "Service Provision",
      description: "To provide and manage your travel bookings and reservations"
    },
    {
      title: "Customer Support",
      description: "To assist you with inquiries, changes, and support requests"
    },
    {
      title: "Personalization",
      description: "To offer personalized travel recommendations and deals"
    },
    {
      title: "Communication",
      description: "To send booking confirmations, updates, and travel information"
    },
    {
      title: "Improvement",
      description: "To enhance our services and develop new features"
    },
    {
      title: "Legal Compliance",
      description: "To comply with applicable laws and regulations"
    }
  ];

  const dataProtection = [
    {
      title: "Encryption",
      description: "All data is encrypted using industry-standard SSL/TLS protocols"
    },
    {
      title: "Access Control",
      description: "Strict access controls limit who can view your personal information"
    },
    {
      title: "Regular Audits",
      description: "We conduct regular security audits and assessments"
    },
    {
      title: "Employee Training",
      description: "All employees receive regular privacy and security training"
    }
  ];

  return (
    <>
      <Navbar forceScrolled={true} />
      <div className="min-h-screen bg-gray-50">
        {/* Hero Section */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-700 text-white py-20">
          <div className="container mx-auto px-4 text-center">
            <h1 className="text-5xl font-bold mb-6">Privacy Policy</h1>
            <p className="text-xl max-w-3xl mx-auto">
              Your privacy is important to us. This policy explains how we collect, use, and protect your personal information 
              to provide you with the best travel experience possible.
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
                  <FaShieldAlt className="text-5xl text-blue-600 mx-auto mb-4" />
                  <h2 className="text-3xl font-bold text-gray-900">Our Commitment to Privacy</h2>
                </div>
                <div className="prose prose-lg mx-auto text-gray-600">
                  <p className="mb-6">
                    At Jetsetterss, we are committed to protecting your privacy and ensuring the security of your personal information. 
                    This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our website, 
                    mobile applications, or services.
                  </p>
                  <p className="mb-6">
                    We believe in transparency and want you to understand exactly how your information is used to provide you with 
                    exceptional travel experiences. By using our services, you agree to the collection and use of information in 
                    accordance with this policy.
                  </p>
                  <p>
                    If you have any questions about this Privacy Policy or our data practices, please contact us using the 
                    information provided at the end of this document.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Information We Collect */}
          <section className="mb-20">
            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold text-gray-900 mb-4">Information We Collect</h2>
              <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                We collect various types of information to provide and improve our services
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {dataCategories.map((category, index) => (
                <div key={index} className="bg-white rounded-xl shadow-lg p-8 hover:shadow-xl transition-shadow duration-300">
                  <div className="text-center mb-6">
                    {category.icon}
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-4 text-center">{category.title}</h3>
                  <p className="text-gray-600 text-center">{category.description}</p>
                </div>
              ))}
            </div>
          </section>

          {/* How We Use Your Information */}
          <section className="mb-20">
            <div className="bg-white rounded-xl shadow-lg p-8">
              <div className="text-center mb-8">
                <h2 className="text-3xl font-bold text-gray-900 mb-4">How We Use Your Information</h2>
                <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                  Your information helps us provide better services and improve your travel experience
                </p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {dataUses.map((use, index) => (
                  <div key={index} className="flex items-start gap-4">
                    <div className="w-3 h-3 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-2">{use.title}</h3>
                      <p className="text-gray-600 text-sm">{use.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Data Protection */}
          <section className="mb-20">
            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold text-gray-900 mb-4">How We Protect Your Data</h2>
              <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                We implement comprehensive security measures to keep your information safe
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              {dataProtection.map((protection, index) => (
                <div key={index} className="bg-white rounded-xl shadow-lg p-8 text-center hover:shadow-xl transition-shadow duration-300">
                  <div className="mb-6">
                    <FaLock className="text-4xl text-green-600 mx-auto" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-4">{protection.title}</h3>
                  <p className="text-gray-600">{protection.description}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Data Sharing */}
          <section className="mb-20">
            <div className="bg-white rounded-xl shadow-lg p-8">
              <h2 className="text-3xl font-bold text-gray-900 mb-6 text-center">Data Sharing and Disclosure</h2>
              <div className="prose prose-lg mx-auto text-gray-600">
                <p className="mb-4">
                  We do not sell, trade, or otherwise transfer your personal information to third parties without your consent, 
                  except in the following circumstances:
                </p>
                <ul className="space-y-3">
                  <li className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                    <span><strong>Service Providers:</strong> We may share information with trusted third-party service providers who assist us in operating our website, conducting business, or servicing you.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                    <span><strong>Travel Partners:</strong> We may share necessary information with airlines, hotels, and other travel service providers to fulfill your bookings.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                    <span><strong>Legal Requirements:</strong> We may disclose information when required by law or to protect our rights, property, or safety.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                    <span><strong>Business Transfers:</strong> In the event of a merger, acquisition, or sale of assets, your information may be transferred as part of the business transaction.</span>
                  </li>
                </ul>
              </div>
            </div>
          </section>

          {/* Your Rights */}
          <section className="mb-20">
            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold text-gray-900 mb-4">Your Privacy Rights</h2>
              <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                You have control over your personal information and how it's used
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="bg-white rounded-xl shadow-lg p-8">
                <h3 className="text-xl font-bold text-gray-900 mb-4">Access and Control</h3>
                <ul className="space-y-3 text-gray-600">
                  <li className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                    <span>Access your personal information</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                    <span>Update or correct your information</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                    <span>Request deletion of your data</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                    <span>Opt-out of marketing communications</span>
                  </li>
                </ul>
              </div>
              
              <div className="bg-white rounded-xl shadow-lg p-8">
                <h3 className="text-xl font-bold text-gray-900 mb-4">Data Portability</h3>
                <ul className="space-y-3 text-gray-600">
                  <li className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
                    <span>Export your data in a portable format</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
                    <span>Transfer your data to another service</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
                    <span>Request data processing restrictions</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
                    <span>Object to certain data processing</span>
                  </li>
                </ul>
              </div>
            </div>
          </section>

          {/* Cookies and Tracking */}
          <section className="mb-20">
            <div className="bg-white rounded-xl shadow-lg p-8">
              <h2 className="text-3xl font-bold text-gray-900 mb-6 text-center">Cookies and Tracking Technologies</h2>
              <div className="prose prose-lg mx-auto text-gray-600">
                <p className="mb-4">
                  We use cookies and similar tracking technologies to enhance your browsing experience, analyze website traffic, 
                  and understand where our visitors are coming from. These technologies help us:
                </p>
                <ul className="space-y-3 mb-6">
                  <li className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                    <span>Remember your preferences and settings</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                    <span>Provide personalized content and recommendations</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                    <span>Improve our website performance and functionality</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                    <span>Analyze usage patterns and trends</span>
                  </li>
                </ul>
                <p>
                  You can control cookie settings through your browser preferences. However, disabling certain cookies may 
                  affect the functionality of our website.
                </p>
              </div>
            </div>
          </section>

          {/* Contact Information */}
          <section className="bg-gradient-to-r from-blue-600 to-purple-700 rounded-2xl p-12 text-center text-white">
            <h2 className="text-3xl font-bold mb-6">Questions About Your Privacy?</h2>
            <p className="text-xl mb-8 max-w-2xl mx-auto">
              We're here to help. Contact our privacy team with any questions or concerns about your data.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link 
                to="/contact"
                className="bg-white text-blue-600 px-8 py-4 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
              >
                Contact Us
              </Link>
              <a 
                href="mailto:privacy@jetsetterss.com"
                className="bg-transparent border-2 border-white text-white px-8 py-4 rounded-lg font-semibold hover:bg-white hover:text-blue-600 transition-colors"
              >
                Email Privacy Team
              </a>
            </div>
          </section>

          {/* Policy Updates */}
          <section className="mt-16 text-center">
            <h3 className="text-2xl font-bold text-gray-900 mb-4">Policy Updates</h3>
            <p className="text-gray-600 mb-6">
              We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new 
              Privacy Policy on this page and updating the "Last Updated" date.
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

export default PrivacyPolicy; 