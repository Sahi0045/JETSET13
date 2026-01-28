import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FaPhone,
  FaEnvelope,
  FaMapMarkerAlt,
  FaLinkedin,
  FaTwitter,
  FaInstagram,
  FaFacebook,
  FaCheckCircle,
  FaPlane,
  FaArrowRight
} from 'react-icons/fa';
import Navbar from './Common/Navbar';
import Footer from './Common/Footer';

const ContactUs = () => {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    company: '',
    message: '',
    agreeToPrivacy: false
  });

  const [submitted, setSubmitted] = useState(false);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log('Contact Form Data:', formData);
    setSubmitted(true);

    // Reset form after 3 seconds
    setTimeout(() => {
      setSubmitted(false);
      setFormData({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        company: '',
        message: '',
        agreeToPrivacy: false
      });
    }, 3000);
  };

  const contactInfo = [
    {
      icon: <FaPhone className="text-2xl" />,
      title: "Phone",
      value: "+1 (888) 581-3028",
      link: "tel:+18885813028"
    },
    {
      icon: <FaEnvelope className="text-2xl" />,
      title: "Email",
      value: "privacy@jetsetterss.com",
      link: "mailto:privacy@jetsetterss.com"
    },
    {
      icon: <FaMapMarkerAlt className="text-2xl" />,
      title: "Headquarters",
      value: "513 W Bonaventure Ave, Tracy, CA 95391, USA",
      link: null
    }
  ];

  const offices = [
    {
      city: "Tracy",
      country: "USA",
      address: "513 W Bonaventure Ave, Tracy, CA 95391"
    }
  ];

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-white pt-[71px]">
        {/* Hero Section - Clean and Minimal */}
        <section className="bg-gradient-to-br from-gray-50 to-white py-20 md:py-32">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto text-center">
              <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-gray-900 mb-6 leading-tight">
                Talk to the <span className="text-[#055B75]">Jetsetterss</span> team
              </h1>
              <p className="text-xl md:text-2xl text-gray-600 leading-relaxed">
                Have a question about our services? Looking for a specific travel solution?
                We'd love to hear from you.
              </p>
            </div>
          </div>
        </section>

        {/* Main Content - Two Column Layout */}
        <section className="py-20">
          <div className="container mx-auto px-4">
            <div className="max-w-7xl mx-auto">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
                {/* Left Column - Contact Info */}
                <div className="space-y-12">
                  <div>
                    <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-8">
                      Ready to transform your travel experience?
                    </h2>
                    <p className="text-lg text-gray-600 leading-relaxed mb-8">
                      Talk to our team now to understand how Jetsetterss can help you explore
                      the world with confidence and ease.
                    </p>
                  </div>

                  {/* Contact Methods */}
                  <div className="space-y-6">
                    {contactInfo.map((item, index) => (
                      <div key={index} className="flex items-start gap-4">
                        <div className="w-12 h-12 bg-[#E0F7FA] rounded-lg flex items-center justify-center text-[#055B75] flex-shrink-0">
                          {item.icon}
                        </div>
                        <div>
                          <div className="text-sm text-gray-500 mb-1">{item.title}</div>
                          {item.link ? (
                            <a
                              href={item.link}
                              className="text-lg font-semibold text-gray-900 hover:text-[#055B75] transition-colors"
                            >
                              {item.value}
                            </a>
                          ) : (
                            <div className="text-lg font-semibold text-gray-900">{item.value}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Office Locations */}
                  <div>
                    <h3 className="text-2xl font-bold text-gray-900 mb-6">Our Offices</h3>
                    <div className="space-y-6">
                      {offices.map((office, index) => (
                        <div key={index} className="border-l-4 border-[#055B75] pl-4">
                          <div className="font-bold text-gray-900 mb-1">
                            {office.city}, {office.country}
                          </div>
                          <div className="text-gray-600 text-sm">{office.address}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Social Media */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Follow Us</h3>
                    <div className="flex gap-3">
                      <a
                        href="#"
                        className="w-10 h-10 bg-gray-100 hover:bg-[#055B75] text-gray-600 hover:text-white rounded-lg flex items-center justify-center transition-all duration-300"
                      >
                        <FaLinkedin className="text-xl" />
                      </a>
                      <a
                        href="#"
                        className="w-10 h-10 bg-gray-100 hover:bg-[#055B75] text-gray-600 hover:text-white rounded-lg flex items-center justify-center transition-all duration-300"
                      >
                        <FaTwitter className="text-xl" />
                      </a>
                      <a
                        href="#"
                        className="w-10 h-10 bg-gray-100 hover:bg-[#055B75] text-gray-600 hover:text-white rounded-lg flex items-center justify-center transition-all duration-300"
                      >
                        <FaInstagram className="text-xl" />
                      </a>
                      <a
                        href="#"
                        className="w-10 h-10 bg-gray-100 hover:bg-[#055B75] text-gray-600 hover:text-white rounded-lg flex items-center justify-center transition-all duration-300"
                      >
                        <FaFacebook className="text-xl" />
                      </a>
                    </div>
                  </div>
                </div>

                {/* Right Column - Contact Form */}
                <div className="bg-gradient-to-br from-gray-50 to-white rounded-3xl p-8 md:p-12 border border-gray-200">
                  {submitted ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-6">
                        <FaCheckCircle className="text-3xl text-green-600" />
                      </div>
                      <h3 className="text-2xl font-bold text-gray-900 mb-3">Message Sent!</h3>
                      <p className="text-gray-600">
                        Thank you for reaching out. We'll get back to you shortly.
                      </p>
                    </div>
                  ) : (
                    <form onSubmit={handleSubmit} className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            First Name *
                          </label>
                          <input
                            type="text"
                            name="firstName"
                            value={formData.firstName}
                            onChange={handleChange}
                            required
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#055B75] focus:border-transparent transition-all"
                            placeholder="John"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Last Name *
                          </label>
                          <input
                            type="text"
                            name="lastName"
                            value={formData.lastName}
                            onChange={handleChange}
                            required
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#055B75] focus:border-transparent transition-all"
                            placeholder="Doe"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Email Address *
                        </label>
                        <input
                          type="email"
                          name="email"
                          value={formData.email}
                          onChange={handleChange}
                          required
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#055B75] focus:border-transparent transition-all"
                          placeholder="john.doe@example.com"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Phone Number
                        </label>
                        <input
                          type="tel"
                          name="phone"
                          value={formData.phone}
                          onChange={handleChange}
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#055B75] focus:border-transparent transition-all"
                          placeholder="+1 (555) 123-4567"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Company
                        </label>
                        <input
                          type="text"
                          name="company"
                          value={formData.company}
                          onChange={handleChange}
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#055B75] focus:border-transparent transition-all"
                          placeholder="Your Company"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Message *
                        </label>
                        <textarea
                          name="message"
                          value={formData.message}
                          onChange={handleChange}
                          required
                          rows="5"
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#055B75] focus:border-transparent transition-all resize-none"
                          placeholder="Tell us about your travel needs..."
                        />
                      </div>

                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          name="agreeToPrivacy"
                          checked={formData.agreeToPrivacy}
                          onChange={handleChange}
                          required
                          className="mt-1 w-4 h-4 text-[#055B75] border-gray-300 rounded focus:ring-[#055B75]"
                        />
                        <label className="text-sm text-gray-600">
                          By submitting this form, I acknowledge that I have read, understood and
                          accordingly agree to the{' '}
                          <Link to="/privacy-policy" className="text-[#055B75] hover:underline font-medium">
                            Privacy Policy
                          </Link>
                        </label>
                      </div>

                      <button
                        type="submit"
                        className="w-full bg-[#055B75] text-white px-8 py-4 rounded-lg font-semibold text-lg hover:bg-[#034457] transition-all duration-300 shadow-lg hover:shadow-xl"
                      >
                        Send Message
                      </button>
                    </form>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="py-20 bg-gradient-to-br from-gray-50 to-white">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              <div className="text-center mb-12">
                <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
                  Frequently Asked Questions
                </h2>
                <p className="text-lg text-gray-600">
                  Quick answers to common questions
                </p>
              </div>

              <div className="space-y-6">
                {[
                  {
                    q: "What are your customer support hours?",
                    a: "Our customer support team is available 24/7 to assist you with any travel-related queries or emergencies."
                  },
                  {
                    q: "How can I modify or cancel my booking?",
                    a: "You can modify or cancel your booking by calling our support team at +1 (877) 538-7380 or emailing support@jetsetterss.com."
                  },
                  {
                    q: "Do you offer group booking discounts?",
                    a: "Yes! We offer special rates for group bookings of 10 or more travelers. Contact our team for a custom quote."
                  },
                  {
                    q: "What payment methods do you accept?",
                    a: "We accept all major credit cards, debit cards, PayPal, and bank transfers for your convenience."
                  }
                ].map((faq, index) => (
                  <div key={index} className="bg-white rounded-xl p-6 border border-gray-200 hover:border-[#055B75] transition-all duration-300">
                    <h3 className="text-lg font-bold text-gray-900 mb-2">{faq.q}</h3>
                    <p className="text-gray-600">{faq.a}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 bg-[#055B75]">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto text-center text-white">
              <h2 className="text-3xl md:text-4xl font-bold mb-6">
                Ready to Start Your Journey?
              </h2>
              <p className="text-xl mb-10 opacity-90">
                Join millions of travelers who trust Jetsetterss for their adventures
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
                <Link
                  to="/flights"
                  className="inline-flex items-center justify-center gap-2 bg-white text-[#055B75] px-8 py-4 rounded-lg font-semibold hover:bg-gray-100 transition-all duration-300"
                >
                  <FaPlane /> Book Your Flight
                </Link>
                <Link
                  to="/about-us"
                  className="inline-flex items-center justify-center gap-2 border-2 border-white text-white px-8 py-4 rounded-lg font-semibold hover:bg-white hover:text-[#055B75] transition-all duration-300"
                >
                  About Us <FaArrowRight />
                </Link>
              </div>

              {/* Social Media */}
              <div className="border-t border-white/20 pt-8">
                <p className="text-sm mb-4 opacity-80">Follow Us</p>
                <div className="flex gap-4 justify-center">
                  <a href="#" className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-all duration-300">
                    <FaLinkedin className="text-xl" />
                  </a>
                  <a href="#" className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-all duration-300">
                    <FaTwitter className="text-xl" />
                  </a>
                  <a href="#" className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-all duration-300">
                    <FaInstagram className="text-xl" />
                  </a>
                  <a href="#" className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-all duration-300">
                    <FaFacebook className="text-xl" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
      <Footer />
    </>
  );
};

export default ContactUs;
