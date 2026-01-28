import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FaGavel, FaEnvelope, FaPhone, FaMapMarkerAlt, FaChevronRight, FaInfoCircle, FaExclamationTriangle } from 'react-icons/fa';
import Navbar from './Common/Navbar';
import Footer from './Common/Footer';

const TermsConditions = () => {
  const [activeSection, setActiveSection] = useState('');

  const sections = [
    { id: 'overview', title: '1. Company Overview' },
    { id: 'acceptance', title: '2. Acceptance of Terms' },
    { id: 'role', title: '3. Role of JETSETTERS' },
    { id: 'bookings', title: '4. Bookings & Payments' },
    { id: 'airlines', title: '5. Airline Tickets' },
    { id: 'hotels', title: '6. Hotels & Cruises' },
    { id: 'visa', title: '7. Visa & Passport Assistance' },
    { id: 'responsibilities', title: '8. Customer Responsibilities' },
    { id: 'changes', title: '9. Changes & Refunds' },
    { id: 'risks', title: '10. Travel Risks' },
    { id: 'liability', title: '11. Limitation of Liability' },
    { id: 'privacy', title: '12. Privacy & Data' },
    { id: 'property', title: '13. Intellectual Property' },
    { id: 'governing-law', title: '14. Governing Law' },
    { id: 'modifications', title: '15. Changes to Terms' },
    { id: 'contact', title: '16. Contact Information' }
  ];

  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY + 150;

      for (let i = sections.length - 1; i >= 0; i--) {
        const section = document.getElementById(sections[i].id);
        if (section && section.offsetTop <= scrollPosition) {
          setActiveSection(sections[i].id);
          break;
        }
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToSection = (id) => {
    const element = document.getElementById(id);
    if (element) {
      const offset = 100;
      const elementPosition = element.offsetTop - offset;
      window.scrollTo({ top: elementPosition, behavior: 'smooth' });
    }
  };

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-white pt-[71px]">
        {/* Header */}
        <div className="bg-gradient-to-br from-gray-50 to-white border-b border-gray-200">
          <div className="container mx-auto px-4 py-12">
            <div className="max-w-4xl mx-auto text-center">
              <div className="flex items-center justify-center gap-3 mb-4">
                <FaGavel className="text-3xl text-[#055B75]" />
                <h1 className="text-4xl md:text-5xl font-bold text-gray-900">Terms & Conditions</h1>
              </div>
              <p className="text-lg text-gray-600">Last Updated: January 26, 2026</p>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="container mx-auto px-4 py-12">
          <div className="max-w-7xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-12">
              {/* Sidebar Navigation */}
              <div className="lg:col-span-1">
                <div className="lg:sticky lg:top-24">
                  <div className="bg-white rounded-xl border border-gray-200 p-6">
                    <h3 className="text-sm font-semibold text-gray-900 mb-4 uppercase tracking-wider">
                      Contents
                    </h3>
                    <nav className="space-y-1">
                      {sections.map((section) => (
                        <button
                          key={section.id}
                          onClick={() => scrollToSection(section.id)}
                          className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-all duration-200 flex items-center justify-between group ${activeSection === section.id
                              ? 'bg-[#E0F7FA] text-[#055B75] font-semibold'
                              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                            }`}
                        >
                          <span>{section.title}</span>
                          <FaChevronRight className={`text-[10px] transition-transform ${activeSection === section.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'
                            }`} />
                        </button>
                      ))}
                    </nav>
                  </div>
                </div>
              </div>

              {/* Content Area */}
              <div className="lg:col-span-3">
                <div className="prose prose-lg max-w-none">
                  {/* Overview */}
                  <section id="overview" className="mb-12 scroll-mt-24">
                    <h2 className="text-3xl font-bold text-gray-900 mb-4">1. Company Overview</h2>
                    <p className="text-gray-600 leading-relaxed">
                      JETSETTERS (“we,” “us,” or “our”) is a travel services provider offering flight tickets, hotel bookings,
                      cruise reservations, train travel, tour packages, visa and passport documentation assistance, and travel guidance.
                      We act as an <strong>intermediary/agent</strong> between customers and third-party travel suppliers.
                    </p>
                  </section>

                  {/* Acceptance */}
                  <section id="acceptance" className="mb-12 scroll-mt-24">
                    <h2 className="text-3xl font-bold text-gray-900 mb-4">2. Acceptance of Terms</h2>
                    <p className="text-gray-600 leading-relaxed">
                      By accessing our website, making a booking, or using our services, you agree to be legally bound by these
                      Terms & Conditions, our Privacy Policy, and any applicable supplier terms. If you do not agree, you must not use our services.
                    </p>
                  </section>

                  {/* Role */}
                  <section id="role" className="mb-12 scroll-mt-24">
                    <h2 className="text-3xl font-bold text-gray-900 mb-6">3. Role of JETSETTERS</h2>
                    <div className="bg-blue-50 border-l-4 border-[#055B75] p-6 rounded-r-xl">
                      <h4 className="text-[#055B75] font-bold flex items-center gap-2 mb-3">
                        <FaInfoCircle /> Important Airline & OTA Compliance Clause
                      </h4>
                      <p className="text-gray-700 leading-relaxed mb-4">
                        JETSETTERS acts solely as a <strong>booking agent and facilitator</strong>. Travel services are provided
                        by independent third parties including airlines, hotels, cruise operators, tour providers, train operators,
                        and visa authorities.
                      </p>
                      <p className="text-gray-700 leading-relaxed font-semibold">
                        JETSETTERS is not the operator, owner, or controller of these services and is not responsible for their acts,
                        omissions, or failures.
                      </p>
                      <p className="text-sm text-gray-500 mt-4">
                        This structure aligns with IATA, airline, and OTA compliance standards.
                      </p>
                    </div>
                  </section>

                  {/* Bookings */}
                  <section id="bookings" className="mb-12 scroll-mt-24">
                    <h2 className="text-3xl font-bold text-gray-900 mb-4">4. Bookings & Payments</h2>
                    <ul className="space-y-4 text-gray-600">
                      <li className="flex items-start gap-3">
                        <span className="text-[#055B75] mt-1">•</span>
                        <span>All bookings are subject to availability and confirmation by the service provider.</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-[#055B75] mt-1">•</span>
                        <span>Prices may change due to taxes, fees, currency fluctuations, or supplier policies.</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-[#055B75] mt-1">•</span>
                        <span>Full or partial payment may be required at the time of booking.</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-[#055B75] mt-1">•</span>
                        <span>Payments are processed via secure third-party gateways.</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-[#055B75] mt-1">•</span>
                        <span>By making payment, you authorize JETSETTERS to charge the provided payment method.</span>
                      </li>
                    </ul>
                  </section>

                  {/* Airlines */}
                  <section id="airlines" className="mb-12 scroll-mt-24">
                    <h2 className="text-3xl font-bold text-gray-900 mb-4">5. Airline Tickets – Special Conditions</h2>
                    <p className="text-gray-600 leading-relaxed mb-4">
                      Airline tickets are governed by the airline’s fare rules and conditions.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                      <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                        <h4 className="font-bold text-gray-900 mb-2">Rules</h4>
                        <p className="text-sm text-gray-600">Tickets may be non-refundable, non-changeable, or partially refundable.</p>
                      </div>
                      <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                        <h4 className="font-bold text-gray-900 mb-2">Changes</h4>
                        <p className="text-sm text-gray-600">Name and date changes are subject to airline approval and fees.</p>
                      </div>
                    </div>
                    <div className="bg-red-50 border border-red-100 p-6 rounded-xl">
                      <h4 className="text-red-800 font-bold mb-3">JETSETTERS is not responsible for:</h4>
                      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-red-700 text-sm">
                        <li>• Schedule changes</li>
                        <li>• Flight delays or cancellations</li>
                        <li>• Overbooking or denied boarding</li>
                        <li>• Missed connections</li>
                      </ul>
                    </div>
                  </section>

                  {/* Hotels */}
                  <section id="hotels" className="mb-12 scroll-mt-24">
                    <h2 className="text-3xl font-bold text-gray-900 mb-4">6. Hotels, Cruises & Ground Services</h2>
                    <ul className="space-y-4 text-gray-600">
                      <li className="flex items-start gap-3">
                        <span className="text-[#055B75] mt-1">•</span>
                        <span>Hotel check-in/check-out times, amenities, and cancellation policies vary by supplier.</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-[#055B75] mt-1">•</span>
                        <span>Cruise itineraries, ports, and schedules may change without notice.</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-[#055B75] mt-1">•</span>
                        <span>JETSETTERS is not liable for service quality, accommodation standards, or supplier defaults.</span>
                      </li>
                    </ul>
                  </section>

                  {/* Visa */}
                  <section id="visa" className="mb-12 scroll-mt-24">
                    <h2 className="text-3xl font-bold text-gray-900 mb-4">7. Visa & Passport Documentation Assistance</h2>
                    <div className="bg-amber-50 border-l-4 border-amber-500 p-6 rounded-r-xl mb-6">
                      <h4 className="text-amber-800 font-bold flex items-center gap-2 mb-3">
                        <FaExclamationTriangle /> Critical Clause
                      </h4>
                      <p className="text-gray-700 leading-relaxed">
                        JETSETTERS provides visa and passport documentation assistance <strong>only as a facilitation service</strong>.
                        We do <strong>not</strong> guarantee visa approval, issuance, processing timelines, or entry permissions.
                      </p>
                      <p className="text-gray-700 font-bold mt-3">
                        Final decisions are made solely by government authorities.
                      </p>
                    </div>
                    <div className="space-y-4">
                      <h4 className="text-xl font-bold text-gray-900">Customer Responsibilities:</h4>
                      <ul className="space-y-2 text-gray-600">
                        <li>• Providing accurate and complete information</li>
                        <li>• Ensuring passport validity and compliance with destination rules</li>
                        <li>• Verifying entry, transit, vaccination, and documentation requirements</li>
                      </ul>
                    </div>
                  </section>

                  {/* Responsibilities */}
                  <section id="responsibilities" className="mb-12 scroll-mt-24">
                    <h2 className="text-3xl font-bold text-gray-900 mb-4">8. Customer Responsibilities</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="border border-gray-200 p-6 rounded-2xl">
                        <h4 className="font-bold mb-3">Information</h4>
                        <p className="text-gray-600">Provide accurate personal and travel information and review confirmations immediately.</p>
                      </div>
                      <div className="border border-gray-200 p-6 rounded-2xl">
                        <h4 className="font-bold mb-3">Compliance</h4>
                        <p className="text-gray-600">Comply with immigration, customs, health, and airline requirements at all times.</p>
                      </div>
                    </div>
                  </section>

                  {/* Changes */}
                  <section id="changes" className="mb-12 scroll-mt-24">
                    <h2 className="text-3xl font-bold text-gray-900 mb-4">9. Changes, Cancellations & Refunds</h2>
                    <ul className="space-y-4 text-gray-600">
                      <li className="flex items-start gap-3">
                        <span className="text-[#055B75] mt-1">•</span>
                        <span>Refund eligibility depends on supplier rules.</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-[#055B75] mt-1">•</span>
                        <span>Service fees charged by JETSETTERS are generally non-refundable.</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-[#055B75] mt-1">•</span>
                        <span>Refund processing times depend on third-party providers.</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-[#055B75] mt-1">•</span>
                        <span>No refunds for no-shows or unused services unless permitted by supplier policy.</span>
                      </li>
                    </ul>
                  </section>

                  {/* Risks */}
                  <section id="risks" className="mb-12 scroll-mt-24">
                    <h2 className="text-3xl font-bold text-gray-900 mb-4">10. Travel Risks & Force Majeure</h2>
                    <p className="text-gray-600 leading-relaxed mb-4">
                      JETSETTERS is not liable for disruptions caused by weather, pandemics, strikes, war, or supplier operational issues.
                    </p>
                    <div className="bg-gray-900 text-white p-6 rounded-2xl">
                      <p className="font-semibold italic">
                        "Travel involves inherent risks, which the customer voluntarily assumes."
                      </p>
                    </div>
                  </section>

                  {/* Liability */}
                  <section id="liability" className="mb-12 scroll-mt-24">
                    <h2 className="text-3xl font-bold text-gray-900 mb-4">11. Limitation of Liability</h2>
                    <p className="text-gray-600 mb-4">To the maximum extent permitted by law:</p>
                    <ul className="space-y-4 text-gray-600">
                      <li className="flex items-start gap-3">
                        <span className="text-red-600 mt-1">•</span>
                        <span>JETSETTERS shall not be liable for indirect, incidental, or consequential damages.</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-red-600 mt-1">•</span>
                        <span>Our total liability shall not exceed the amount paid directly to JETSETTERS for the affected service.</span>
                      </li>
                    </ul>
                  </section>

                  {/* Privacy */}
                  <section id="privacy" className="mb-12 scroll-mt-24">
                    <h2 className="text-3xl font-bold text-gray-900 mb-4">12. Privacy & Data Protection</h2>
                    <p className="text-gray-600 leading-relaxed">
                      Use of our services is subject to our <Link to="/privacy-policy" className="text-[#055B75] hover:underline font-bold">Privacy Policy</Link>,
                      which complies with GDPR, CCPA, and CPRA. We do not sell personal data and use it only to provide travel services.
                    </p>
                  </section>

                  {/* Property */}
                  <section id="property" className="mb-12 scroll-mt-24">
                    <h2 className="text-3xl font-bold text-gray-900 mb-4">13. Intellectual Property</h2>
                    <p className="text-gray-600 leading-relaxed">
                      All website content, logos, text, and branding are the property of JETSETTERS and may not be copied or used
                      without written permission.
                    </p>
                  </section>

                  {/* Governing Law */}
                  <section id="governing-law" className="mb-12 scroll-mt-24">
                    <h2 className="text-3xl font-bold text-gray-900 mb-4">14. Governing Law & Jurisdiction</h2>
                    <p className="text-gray-600 leading-relaxed">
                      These Terms & Conditions are governed by the laws of the <strong>State of California, USA</strong>.
                      Any disputes shall be subject to the exclusive jurisdiction of California courts.
                    </p>
                  </section>

                  {/* Modifications */}
                  <section id="modifications" className="mb-12 scroll-mt-24">
                    <h2 className="text-3xl font-bold text-gray-900 mb-4">15. Changes to Terms</h2>
                    <p className="text-gray-600 leading-relaxed">
                      JETSETTERS reserves the right to modify these Terms & Conditions at any time. Continued use of services
                      constitutes acceptance of updated terms.
                    </p>
                  </section>

                  {/* Contact */}
                  <section id="contact" className="mb-12 scroll-mt-24">
                    <h2 className="text-3xl font-bold text-gray-900 mb-6">16. Contact Information</h2>
                    <div className="bg-gradient-to-br from-[#E0F7FA] to-white rounded-3xl p-8 md:p-12 border border-[#055B75]/20">
                      <h3 className="text-2xl font-bold text-gray-900 mb-8">JETSETTERS Support</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-6">
                          <div className="flex items-start gap-4">
                            <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm">
                              <FaEnvelope className="text-[#055B75]" />
                            </div>
                            <div>
                              <div className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">Email</div>
                              <a href="mailto:privacy@jetsetterss.com" className="text-lg font-semibold text-[#055B75] hover:underline">
                                privacy@jetsetterss.com
                              </a>
                            </div>
                          </div>
                          <div className="flex items-start gap-4">
                            <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm">
                              <FaPhone className="text-[#055B75]" />
                            </div>
                            <div>
                              <div className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">Phone</div>
                              <a href="tel:+18885813028" className="text-lg font-semibold text-gray-900 hover:text-[#055B75]">
                                (+1) 888-581-3028
                              </a>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-start gap-4">
                          <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm">
                            <FaMapMarkerAlt className="text-[#055B75]" />
                          </div>
                          <div>
                            <div className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">Headquarters</div>
                            <div className="text-lg font-semibold text-gray-900">
                              513 W Bonaventure Ave,<br />
                              Tracy, CA 95391, USA
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
};

export default TermsConditions;