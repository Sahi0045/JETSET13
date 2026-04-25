import React, { useState } from 'react';
import { FaPhone, FaEnvelope, FaMapMarkerAlt, FaFacebookF, FaTwitter, FaInstagram, FaLinkedinIn, FaUser, FaCommentAlt } from 'react-icons/fa';

const ContactSection = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  });
  const [activeField, setActiveField] = useState(null);
  const [formSubmitted, setFormSubmitted] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log('Form submitted:', formData);
    setFormSubmitted(true);
    
    // Reset form after submission
    setTimeout(() => {
      setFormSubmitted(false);
      setFormData({
        name: '',
        email: '',
        subject: '',
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

  return (
    <div className="contact-section py-16 bg-gray-50">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-800 mb-4">Get In Touch</h2>
          <p className="text-gray-600 max-w-xl mx-auto">
            Have questions about a cruise? Our team is here to help you plan your perfect voyage.
          </p>
          <div className="w-24 h-1 bg-blue-600 mx-auto mt-6"></div>
        </div>

        <div className="max-w-6xl mx-auto bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="flex flex-col md:flex-row">
            {/* Contact Info */}
            <div className="md:w-1/3 bg-blue-600 text-white p-8 md:p-10">
              <h3 className="text-2xl font-bold mb-6">Contact Information</h3>
              <p className="mb-8 opacity-90">
                Fill out the form and our team will get back to you within 24 hours.
              </p>
              
              <div className="space-y-6">
                <div className="flex items-start">
                  <div className="mt-1">
                    <FaPhone className="mr-4" />
                  </div>
                  <div>
                    <p className="opacity-80 text-sm mb-1">Call Us</p>
                    <p className="font-medium">+1 (800) 123-4567</p>
                  </div>
                </div>
                
                <div className="flex items-start">
                  <div className="mt-1">
                    <FaEnvelope className="mr-4" />
                  </div>
                  <div>
                    <p className="opacity-80 text-sm mb-1">Email Us</p>
                    <p className="font-medium">contact@jetsetcruises.com</p>
                  </div>
                </div>
                
                <div className="flex items-start">
                  <div className="mt-1">
                    <FaMapMarkerAlt className="mr-4" />
                  </div>
                  <div>
                    <p className="opacity-80 text-sm mb-1">Visit Us</p>
                    <p className="font-medium">123 Cruise Way, Marina District<br />San Francisco, CA 94123</p>
                  </div>
                </div>
              </div>
              
              <div className="mt-12">
                <h4 className="text-lg font-semibold mb-4">Connect With Us</h4>
                <div className="flex space-x-4">
                  <a href="#" className="w-10 h-10 rounded-full bg-blue-700 flex items-center justify-center hover:bg-blue-800 transition-colors">
                    <FaFacebookF />
                  </a>
                  <a href="#" className="w-10 h-10 rounded-full bg-blue-700 flex items-center justify-center hover:bg-blue-800 transition-colors">
                    <FaTwitter />
                  </a>
                  <a href="#" className="w-10 h-10 rounded-full bg-blue-700 flex items-center justify-center hover:bg-blue-800 transition-colors">
                    <FaInstagram />
                  </a>
                  <a href="#" className="w-10 h-10 rounded-full bg-blue-700 flex items-center justify-center hover:bg-blue-800 transition-colors">
                    <FaLinkedinIn />
                  </a>
                </div>
              </div>
              
              <div className="absolute bottom-0 left-0 w-full h-64 overflow-hidden hidden md:block">
                <div className="absolute bottom-0 left-0 w-full h-64 bg-blue-500 opacity-20 skew-x-12 transform translate-x-1/4 -translate-y-12 rounded-tl-3xl"></div>
                <div className="absolute bottom-0 left-0 w-full h-32 bg-blue-400 opacity-20 -skew-x-12 transform -translate-x-1/4 rounded-tr-3xl"></div>
              </div>
            </div>
            
            {/* Contact Form */}
            <div className="md:w-2/3 p-8 md:p-10">
              {formSubmitted ? (
                <div className="h-full flex flex-col items-center justify-center text-center">
                  <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-6">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h3 className="text-2xl font-bold text-gray-800 mb-2">Thank You!</h3>
                  <p className="text-gray-600 mb-6">
                    Your message has been received. One of our cruise specialists will contact you shortly.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                  <h3 className="text-2xl font-bold text-gray-800 mb-6">Send us a message</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className={`transition-all duration-200 ${activeField === 'name' ? 'transform -translate-y-1' : ''}`}>
                      <label className="block text-gray-700 text-sm font-semibold mb-2" htmlFor="name">
                        Your Name
                      </label>
                      <div className={`relative rounded-lg transition-all duration-300 ${activeField === 'name' ? 'ring-2 ring-blue-500' : 'ring-1 ring-gray-200'}`}>
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                          <FaUser className={`transition-colors ${activeField === 'name' ? 'text-blue-500' : 'text-gray-400'}`} />
                        </div>
                        <input
                          type="text"
                          id="name"
                          name="name"
                          value={formData.name}
                          onChange={handleChange}
                          onFocus={() => handleFocus('name')}
                          onBlur={handleBlur}
                          required
                          className="w-full bg-gray-50 pl-12 pr-4 py-3 border-none rounded-lg focus:outline-none"
                          placeholder="John Doe"
                        />
                      </div>
                    </div>
                    
                    <div className={`transition-all duration-200 ${activeField === 'email' ? 'transform -translate-y-1' : ''}`}>
                      <label className="block text-gray-700 text-sm font-semibold mb-2" htmlFor="email">
                        Email Address
                      </label>
                      <div className={`relative rounded-lg transition-all duration-300 ${activeField === 'email' ? 'ring-2 ring-blue-500' : 'ring-1 ring-gray-200'}`}>
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                          <FaEnvelope className={`transition-colors ${activeField === 'email' ? 'text-blue-500' : 'text-gray-400'}`} />
                        </div>
                        <input
                          type="email"
                          id="email"
                          name="email"
                          value={formData.email}
                          onChange={handleChange}
                          onFocus={() => handleFocus('email')}
                          onBlur={handleBlur}
                          required
                          className="w-full bg-gray-50 pl-12 pr-4 py-3 border-none rounded-lg focus:outline-none"
                          placeholder="john@example.com"
                        />
                      </div>
                    </div>
                  </div>
                  
                  <div className={`transition-all duration-200 ${activeField === 'subject' ? 'transform -translate-y-1' : ''}`}>
                    <label className="block text-gray-700 text-sm font-semibold mb-2" htmlFor="subject">
                      Subject
                    </label>
                    <input
                      type="text"
                      id="subject"
                      name="subject"
                      value={formData.subject}
                      onChange={handleChange}
                      onFocus={() => handleFocus('subject')}
                      onBlur={handleBlur}
                      required
                      className={`w-full bg-gray-50 px-4 py-3 rounded-lg focus:outline-none transition-all duration-300 ${activeField === 'subject' ? 'ring-2 ring-blue-500' : 'ring-1 ring-gray-200'}`}
                      placeholder="How can we help you?"
                    />
                  </div>
                  
                  <div className={`transition-all duration-200 ${activeField === 'message' ? 'transform -translate-y-1' : ''}`}>
                    <label className="block text-gray-700 text-sm font-semibold mb-2" htmlFor="message">
                      Message
                    </label>
                    <div className={`relative rounded-lg transition-all duration-300 ${activeField === 'message' ? 'ring-2 ring-blue-500' : 'ring-1 ring-gray-200'}`}>
                      <div className="absolute top-3 left-0 pl-4 flex items-start pointer-events-none">
                        <FaCommentAlt className={`transition-colors ${activeField === 'message' ? 'text-blue-500' : 'text-gray-400'}`} />
                      </div>
                      <textarea
                        id="message"
                        name="message"
                        value={formData.message}
                        onChange={handleChange}
                        onFocus={() => handleFocus('message')}
                        onBlur={handleBlur}
                        required
                        rows="4"
                        className="w-full bg-gray-50 pl-12 pr-4 py-3 border-none rounded-lg focus:outline-none resize-none"
                        placeholder="Please describe your inquiry in detail..."
                      ></textarea>
                    </div>
                  </div>
                  
                  <div className="pt-4">
                    <button
                      type="submit"
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-colors duration-300 shadow-md hover:shadow-lg"
                    >
                      Send Message
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>

        {/* Map */}
        <div className="mt-16 max-w-6xl mx-auto rounded-xl overflow-hidden shadow-lg h-80 bg-gray-200">
          <iframe
            src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3152.9560797551402!2d-122.43196008555845!3d37.80649977975385!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x808580e1a8acd215%3A0x5da9181e010e4893!2sMarina%20District%2C%20San%20Francisco%2C%20CA!5e0!3m2!1sen!2sus!4v1647459231899!5m2!1sen!2sus"
            width="100%"
            height="100%"
            style={{ border: 0 }}
            allowFullScreen=""
            loading="lazy"
            title="JetSet Cruises Location"
          ></iframe>
        </div>
      </div>
    </div>
  );
};

export default ContactSection; 