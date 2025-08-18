import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { FaPhone, FaEnvelope, FaComments, FaWhatsapp, FaMapMarkerAlt, FaClock, FaUser, FaBuilding, FaGlobe, FaPaperPlane } from 'react-icons/fa';
import Navbar from './Common/Navbar';
import Footer from './Common/Footer';

const ContactUs = () => {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    company: '',
    subject: '',
    message: ''
  });

  const [selectedSubject, setSelectedSubject] = useState('general');

  const contactMethods = [
    {
      title: "Customer Support",
      description: "24/7 assistance for urgent travel issues",
      icon: <FaComments className="text-4xl text-blue-600" />,
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

  const officeLocations = [
    {
      city: "New York",
      country: "United States",
      address: "123 Travel Plaza, New York, NY 10001",
      phone: "+1 (212) 555-0123",
      email: "nyc@jetsetterss.com",
      hours: "Mon-Fri: 9AM-6PM EST",
      icon: <FaMapMarkerAlt className="text-3xl text-red-500" />
    },
    {
      city: "London",
      country: "United Kingdom",
      address: "456 Travel Street, London, W1A 1AA",
      phone: "+44 20 7946 0958",
      email: "london@jetsetterss.com",
      hours: "Mon-Fri: 9AM-6PM GMT",
      icon: <FaMapMarkerAlt className="text-3xl text-blue-500" />
    },
    {
      city: "Singapore",
      country: "Singapore",
      address: "789 Travel Avenue, Singapore 018956",
      phone: "+65 6789 0123",
      email: "singapore@jetsetterss.com",
      hours: "Mon-Fri: 9AM-6PM SGT",
      icon: <FaMapMarkerAlt className="text-3xl text-green-500" />
    }
  ];

  const subjectOptions = [
    { value: 'general', label: 'General Inquiry' },
    { value: 'booking', label: 'Booking Support' },
    { value: 'technical', label: 'Technical Issue' },
    { value: 'billing', label: 'Billing Question' },
    { value: 'partnership', label: 'Partnership Opportunity' },
    { value: 'feedback', label: 'Feedback & Suggestions' },
    { value: 'complaint', label: 'Complaint' },
    { value: 'other', label: 'Other' }
  ];

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // Handle form submission here
    console.log('Form submitted:', { ...formData, subject: selectedSubject });
    // You can add API call or email service integration here
  };

  return (
    <>
      <Navbar forceScrolled={true} />
      <div className="min-h-screen bg-gray-50">
        {/* Hero Section */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-700 text-white py-20">
          <div className="container mx-auto px-4 text-center">
            <h1 className="text-5xl font-bold mb-6">Contact Us</h1>
            <p className="text-xl max-w-3xl mx-auto">
              We're here to help you plan your next adventure. Get in touch with our travel experts 
              for personalized assistance, support, or just to say hello.
            </p>
          </div>
        </div>

        <div className="container mx-auto px-4 py-16">
          {/* Quick Contact Methods */}
          <section className="mb-20">
            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold text-gray-900 mb-4">Get in Touch</h2>
              <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                Choose the most convenient way to reach our team
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

          {/* Contact Form */}
          <section className="mb-20">
            <div className="max-w-4xl mx-auto">
              <div className="bg-white rounded-2xl shadow-lg p-8">
                <div className="text-center mb-8">
                  <h2 className="text-3xl font-bold text-gray-900 mb-4">Send Us a Message</h2>
                  <p className="text-gray-600 max-w-2xl mx-auto">
                    Fill out the form below and we'll get back to you within 24 hours
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-2">
                        First Name *
                      </label>
                      <input
                        type="text"
                        id="firstName"
                        name="firstName"
                        value={formData.firstName}
                        onChange={handleInputChange}
                        required
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    
                    <div>
                      <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-2">
                        Last Name *
                      </label>
                      <input
                        type="text"
                        id="lastName"
                        name="lastName"
                        value={formData.lastName}
                        onChange={handleInputChange}
                        required
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                        Email Address *
                      </label>
                      <input
                        type="email"
                        id="email"
                        name="email"
                        value={formData.email}
                        onChange={handleInputChange}
                        required
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    
                    <div>
                      <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
                        Phone Number
                      </label>
                      <input
                        type="tel"
                        id="phone"
                        name="phone"
                        value={formData.phone}
                        onChange={handleInputChange}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="company" className="block text-sm font-medium text-gray-700 mb-2">
                      Company (Optional)
                    </label>
                    <input
                      type="text"
                      id="company"
                      name="company"
                      value={formData.company}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label htmlFor="subject" className="block text-sm font-medium text-gray-700 mb-2">
                      Subject *
                    </label>
                    <select
                      id="subject"
                      name="subject"
                      value={selectedSubject}
                      onChange={(e) => setSelectedSubject(e.target.value)}
                      required
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">Select a subject</option>
                      <option value="general">General Inquiry</option>
                      <option value="booking">Booking Support</option>
                      <option value="technical">Technical Support</option>
                      <option value="feedback">Feedback & Suggestions</option>
                      <option value="partnership">Partnership Opportunities</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-2">
                      Message *
                    </label>
                    <textarea
                      id="message"
                      name="message"
                      rows="6"
                      value={formData.message}
                      onChange={handleInputChange}
                      required
                      placeholder="Tell us how we can help you..."
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    ></textarea>
                  </div>

                  <div className="text-center">
                    <button
                      type="submit"
                      className="bg-blue-600 text-white px-8 py-4 rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center gap-2 mx-auto"
                    >
                      <FaPaperPlane />
                      Send Message
                    </button>
                  </div>
                </form>
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

          {/* Need Immediate Assistance */}
          <section className="bg-gradient-to-r from-blue-600 to-purple-700 rounded-2xl p-12 text-center text-white">
            <h2 className="text-3xl font-bold mb-4">Need Immediate Assistance?</h2>
            <p className="text-xl mb-8 max-w-2xl mx-auto">
              For urgent travel issues or last-minute changes, our 24/7 support team is here to help.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a 
                href="tel:+1-800-537-8381"
                className="bg-white text-blue-600 px-8 py-4 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
              >
                Call Now
              </a>
              <Link 
                to="/support"
                className="bg-transparent border-2 border-white text-white px-8 py-4 rounded-lg font-semibold hover:bg-white hover:text-blue-600 transition-colors"
              >
                Visit Support Center
              </Link>
            </div>
          </section>
        </div>
      </div>
      <Footer />
    </>
  );
};

export default ContactUs; 