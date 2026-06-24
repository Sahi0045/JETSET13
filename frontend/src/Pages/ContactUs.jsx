import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FaPhone, FaEnvelope, FaMapMarkerAlt,
  FaLinkedin, FaTwitter, FaInstagram, FaFacebook,
  FaCheckCircle, FaPlane, FaArrowRight
} from 'react-icons/fa';
import Navbar from './Common/Navbar';
import Footer from './Common/Footer';

const ContactUs = () => {
  const [formData, setFormData] = useState({
    firstName: '', lastName: '', email: '', phone: '', company: '', message: '', agreeToPrivacy: false
  });
  const [submitted, setSubmitted] = useState(false);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log('Contact Form Data:', formData);
    setSubmitted(true);
  };

  const resetForm = () => {
    setSubmitted(false);
    setFormData({ firstName: '', lastName: '', email: '', phone: '', company: '', message: '', agreeToPrivacy: false });
  };

  const contactInfo = [
    { icon: <FaPhone />, label: 'Phone Support', value: '+1 (888) 581-3028', note: 'Mon – Fri, 9am – 6pm EST', link: 'tel:+18885813028' },
    { icon: <FaEnvelope />, label: 'Email Inquiries', value: 'privacy@jetsetterss.com', note: 'Average response: 4 hours', link: 'mailto:privacy@jetsetterss.com' },
    { icon: <FaMapMarkerAlt />, label: 'Headquarters', value: '513 W Bonaventure Ave', note: 'Tracy, CA 95391, USA', link: null },
  ];

  const faqs = [
    { q: 'What are your customer support hours?', a: 'Our customer support team is available 24/7 to assist you with any travel-related queries or emergencies.' },
    { q: 'How can I modify or cancel my booking?', a: 'Modify or cancel via the My Trips dashboard, or call us at +1 (888) 581-3028 / email support@jetsetterss.com.' },
    { q: 'Do you offer group booking discounts?', a: 'Yes — special rates for groups of 10 or more, with a dedicated coordinator. Contact us for a custom quote.' },
    { q: 'What payment methods do you accept?', a: 'All major credit/debit cards, PayPal, and bank transfers for your convenience.' },
  ];

  const inputClass = 'w-full bg-[#F0FAFC] border border-gray-200 rounded-lg px-4 py-3 text-gray-900 placeholder-gray-400 focus:bg-white focus:ring-2 focus:ring-[#0890BC] focus:border-transparent outline-none transition-all';

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-[#F1FBFD] pt-[71px]">
        {/* Hero */}
        <section className="relative overflow-hidden bg-gradient-to-br from-[#034457] via-[#055B75] to-[#0890BC] py-24 md:py-32 text-center px-4">
          <div className="absolute inset-0 opacity-10 pointer-events-none"
            style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, #fff 1px, transparent 0)', backgroundSize: '26px 26px' }} />
          <div className="relative z-10 max-w-3xl mx-auto">
            <h1 className="text-4xl md:text-6xl font-bold text-white mb-4 leading-tight tracking-tight">
              Talk to the Jetsetters team
            </h1>
            <p className="text-lg md:text-xl text-white/85 max-w-2xl mx-auto leading-relaxed">
              We're here to help you plan your next extraordinary journey — personalized support and curation, every step of the way.
            </p>
          </div>
        </section>

        {/* Main content — floats up over the hero */}
        <main className="max-w-6xl mx-auto px-4 -mt-14 relative z-20 pb-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left: contact methods */}
            <div className="lg:col-span-5 space-y-4">
              {contactInfo.map((item, i) => (
                <div key={i} className="bg-white rounded-2xl p-6 flex items-start gap-4 border border-gray-100 shadow-[0_15px_30px_-5px_rgba(5,91,117,0.12)] hover:-translate-y-1 transition-transform duration-300">
                  <div className="w-12 h-12 rounded-full bg-[#055B75]/10 text-[#055B75] flex items-center justify-center flex-shrink-0 text-lg">
                    {item.icon}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-1">{item.label}</p>
                    {item.link ? (
                      <a href={item.link} className="text-lg font-bold text-[#055B75] hover:text-[#0890BC] transition-colors break-words">{item.value}</a>
                    ) : (
                      <h3 className="text-lg font-bold text-[#055B75]">{item.value}</h3>
                    )}
                    <p className="text-sm text-gray-500 mt-0.5">{item.note}</p>
                  </div>
                </div>
              ))}

              {/* Connect with us */}
              <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-[#055B75] mb-4">Connect With Us</p>
                <div className="flex gap-3">
                  {[FaLinkedin, FaTwitter, FaInstagram, FaFacebook].map((Icon, i) => (
                    <a key={i} href="#" className="w-10 h-10 rounded-full bg-[#F0FAFC] text-[#055B75] flex items-center justify-center shadow-sm hover:bg-[#055B75] hover:text-white transition-all duration-300">
                      <Icon className="text-lg" />
                    </a>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: form */}
            <div className="lg:col-span-7">
              <div className="relative bg-white rounded-2xl p-7 md:p-10 border border-gray-100 shadow-[0_30px_60px_-15px_rgba(5,91,117,0.18)] overflow-hidden">
                {submitted && (
                  <div className="absolute inset-0 bg-white z-20 flex flex-col items-center justify-center text-center p-8">
                    <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-5">
                      <FaCheckCircle className="text-4xl" />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Message Sent Successfully!</h2>
                    <p className="text-gray-600 max-w-sm">Thank you for reaching out. One of our travel specialists will contact you within 4 hours.</p>
                    <button onClick={resetForm} className="mt-7 text-[#055B75] font-semibold hover:underline">Send another message</button>
                  </div>
                )}

                <div className="mb-7">
                  <h2 className="text-2xl md:text-3xl font-bold text-[#055B75] mb-2">Send us a message</h2>
                  <p className="text-gray-600">Fill out the form and our concierge team will get back to you with a tailored response.</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">First Name *</label>
                      <input type="text" name="firstName" value={formData.firstName} onChange={handleChange} required placeholder="Alex" className={inputClass} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Last Name *</label>
                      <input type="text" name="lastName" value={formData.lastName} onChange={handleChange} required placeholder="Morgan" className={inputClass} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Email Address *</label>
                      <input type="email" name="email" value={formData.email} onChange={handleChange} required placeholder="alex@example.com" className={inputClass} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number</label>
                      <input type="tel" name="phone" value={formData.phone} onChange={handleChange} placeholder="+1 (555) 000-0000" className={inputClass} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Company (Optional)</label>
                    <input type="text" name="company" value={formData.company} onChange={handleChange} placeholder="Your Company" className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Message *</label>
                    <textarea name="message" value={formData.message} onChange={handleChange} required rows="4" placeholder="Tell us about your travel plans or inquiry..." className={`${inputClass} resize-none`} />
                  </div>
                  <div className="flex items-start gap-3">
                    <input type="checkbox" name="agreeToPrivacy" checked={formData.agreeToPrivacy} onChange={handleChange} required className="mt-1 w-4 h-4 text-[#055B75] border-gray-300 rounded focus:ring-[#0890BC]" />
                    <label className="text-sm text-gray-600">
                      I consent to Jetsetters processing my data to respond to my inquiry as described in the{' '}
                      <Link to="/privacy-policy" className="text-[#055B75] hover:underline font-medium">Privacy Policy</Link>.
                    </label>
                  </div>
                  <button type="submit" className="w-full bg-[#055B75] text-white py-4 rounded-lg font-semibold text-lg hover:bg-[#034457] transition-all duration-300 shadow-lg hover:shadow-xl active:scale-[0.99]">
                    Send Message
                  </button>
                </form>
              </div>
            </div>
          </div>
        </main>

        {/* FAQ */}
        <section className="bg-[#EBF5F7] py-20">
          <div className="max-w-5xl mx-auto px-4">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-[#055B75]">Frequently Asked Questions</h2>
              <div className="h-1 w-20 bg-[#055B75] mx-auto mt-3 rounded-full" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {faqs.map((faq, i) => (
                <div key={i} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                  <h4 className="text-lg font-bold text-[#055B75] mb-2">{faq.q}</h4>
                  <p className="text-gray-600">{faq.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA band */}
        <section className="relative overflow-hidden bg-[#055B75] text-white py-16">
          <div className="absolute top-0 right-0 w-64 h-64 bg-[#65B3CF]/20 rounded-full blur-3xl -mr-24 -mt-24" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-[#0890BC]/20 rounded-full blur-3xl -ml-24 -mb-24" />
          <div className="max-w-6xl mx-auto px-4 relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="text-center md:text-left">
              <h2 className="text-3xl md:text-4xl font-bold mb-2">Ready to Start Your Journey?</h2>
              <p className="text-lg text-white/85">Book your next flight or request a custom quote from our planners.</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
              <Link to="/flights" className="inline-flex items-center justify-center gap-2 bg-white text-[#055B75] px-8 py-4 rounded-lg font-semibold hover:bg-gray-100 transition-all active:scale-95">
                <FaPlane /> Book Your Flight
              </Link>
              <Link to="/request" className="inline-flex items-center justify-center gap-2 border-2 border-white/60 text-white px-8 py-4 rounded-lg font-semibold hover:bg-white/10 transition-all active:scale-95">
                Request a Quote <FaArrowRight />
              </Link>
            </div>
          </div>
        </section>
      </div>
      <Footer />
    </>
  );
};

export default ContactUs;
