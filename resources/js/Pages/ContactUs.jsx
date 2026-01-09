import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FaPhone,
  FaEnvelope,
  FaWhatsapp,
  FaPaperPlane
} from 'react-icons/fa';
import Navbar from './Common/Navbar';
import Footer from './Common/Footer';

const ContactUs = () => {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    message: ''
  });

  const [subject, setSubject] = useState('general');

  const contactMethods = [
    {
      title: 'Call Support',
      description: 'Immediate assistance for all travel needs',
      icon: <FaPhone className="text-4xl text-blue-600" />,
      value: '+1 (877) 538-7380'
    },
    {
      title: 'Email Support',
      description: 'For detailed or non-urgent queries',
      icon: <FaEnvelope className="text-4xl text-green-600" />,
      value: 'support@jetsetterss.com'
    },
    {
      title: 'WhatsApp Support',
      description: 'Quick help via WhatsApp',
      icon: <FaWhatsapp className="text-4xl text-green-500" />,
      value: '+1 (877) 538-7380',
      whatsapp: true
    }
  ];

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log('Contact Form Data:', { ...formData, subject });
  };

  return (
    <>
      <Navbar forceScrolled />

      <main className="min-h-screen bg-gray-50">
        {/* HERO */}
        <section className="bg-gradient-to-r from-blue-600 to-purple-700 text-white py-20">
          <div className="container mx-auto px-4 text-center">
            <h1 className="text-5xl font-bold mb-6">Contact Us</h1>
            <p className="text-xl max-w-3xl mx-auto">
              Self-Service Portal will be available very soon.
              Meanwhile please call <strong>+1 (877) 538-7380</strong> or email
              <strong> support@jetsetterss.com</strong> for all your travel needs.
              <br />
              <span className="font-semibold">— Team Jetsetters</span>
            </p>
          </div>
        </section>

        {/* CONTACT METHODS */}
        <section className="container mx-auto px-4 py-16">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20">
            {contactMethods.map((item, idx) => (
              <div
                key={idx}
                className="bg-white rounded-xl shadow-lg p-8 text-center hover:shadow-xl transition"
              >
                <div className="mb-6">{item.icon}</div>
                <h3 className="text-xl font-bold mb-3">{item.title}</h3>
                <p className="text-gray-600 mb-4">{item.description}</p>

                {item.whatsapp ? (
                  <a
                    href="https://wa.me/18775387380"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block bg-green-500 text-white py-3 rounded-lg font-semibold hover:bg-green-600"
                  >
                    WhatsApp Now
                  </a>
                ) : (
                  <p className="text-blue-600 font-semibold">{item.value}</p>
                )}
              </div>
            ))}
          </div>

          {/* CONTACT FORM */}
          <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-lg p-8">
            <h2 className="text-3xl font-bold text-center mb-6">
              Send Us a Message
            </h2>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <input
                  name="firstName"
                  placeholder="First Name *"
                  required
                  onChange={handleChange}
                  className="border p-3 rounded-lg w-full"
                />
                <input
                  name="lastName"
                  placeholder="Last Name *"
                  required
                  onChange={handleChange}
                  className="border p-3 rounded-lg w-full"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <input
                  type="email"
                  name="email"
                  placeholder="Email Address *"
                  required
                  onChange={handleChange}
                  className="border p-3 rounded-lg w-full"
                />
                <input
                  name="phone"
                  placeholder="Phone Number"
                  onChange={handleChange}
                  className="border p-3 rounded-lg w-full"
                />
              </div>

              <select
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="border p-3 rounded-lg w-full"
              >
                <option value="general">General Inquiry</option>
                <option value="booking">Booking Support</option>
                <option value="billing">Billing</option>
                <option value="partnership">Partnership</option>
                <option value="other">Other</option>
              </select>

              <textarea
                name="message"
                rows="5"
                placeholder="Your message *"
                required
                onChange={handleChange}
                className="border p-3 rounded-lg w-full resize-none"
              />

              <button
                type="submit"
                className="bg-blue-600 text-white px-8 py-4 rounded-lg flex items-center gap-2 mx-auto hover:bg-blue-700"
              >
                <FaPaperPlane />
                Send Message
              </button>
            </form>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
};

export default ContactUs;
