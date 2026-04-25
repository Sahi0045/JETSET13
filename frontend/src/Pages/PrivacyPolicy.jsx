import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FaShieldAlt, FaEnvelope, FaPhone, FaMapMarkerAlt, FaChevronRight } from 'react-icons/fa';
import Navbar from './Common/Navbar';
import Footer from './Common/Footer';

const PrivacyPolicy = () => {
  const [activeSection, setActiveSection] = useState('');

  const sections = [
    { id: 'introduction', title: 'Introduction' },
    { id: 'data-collection', title: 'The Data We Collect About You' },
    { id: 'how-collect', title: 'How We Collect Your Data' },
    { id: 'how-use', title: 'How We Use Your Personal Data' },
    { id: 'legal-basis', title: 'Legal Basis for Processing' },
    { id: 'data-sharing', title: 'Data Sharing and Disclosure' },
    { id: 'international', title: 'International Data Transfers' },
    { id: 'cookies', title: 'Cookies and Tracking Technologies' },
    { id: 'security', title: 'Data Security' },
    { id: 'retention', title: 'Data Retention' },
    { id: 'rights', title: 'Your Legal Rights' },
    { id: 'gdpr-ccpa', title: 'GDPR & CCPA/CPRA Compliance' },
    { id: 'visa-disclaimer', title: 'Visa & Passport Services Disclaimer' },
    { id: 'travel-disclaimer', title: 'International Travel Disclaimer' },
    { id: 'children', title: "Children's Privacy" },
    { id: 'changes', title: 'Changes to This Policy' },
    { id: 'contact', title: 'Contact Us' }
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
            <div className="max-w-4xl mx-auto">
              <div className="flex items-center gap-3 mb-4">
                <FaShieldAlt className="text-3xl text-[#055B75]" />
                <h1 className="text-4xl md:text-5xl font-bold text-gray-900">Privacy Policy</h1>
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
                      On This Page
                    </h3>
                    <nav className="space-y-1">
                      {sections.map((section) => (
                        <button
                          key={section.id}
                          onClick={() => scrollToSection(section.id)}
                          className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all duration-200 flex items-center justify-between group ${activeSection === section.id
                              ? 'bg-[#E0F7FA] text-[#055B75] font-semibold'
                              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                            }`}
                        >
                          <span>{section.title}</span>
                          <FaChevronRight className={`text-xs transition-transform ${activeSection === section.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'
                            }`} />
                        </button>
                      ))}
                    </nav>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="lg:col-span-3">
                <div className="prose prose-lg max-w-none">
                  {/* Introduction */}
                  <section id="introduction" className="mb-12 scroll-mt-24">
                    <h2 className="text-3xl font-bold text-gray-900 mb-4">Introduction</h2>
                    <p className="text-gray-600 leading-relaxed mb-4">
                      JETSETTERS ("we," "us," or "our") values your privacy and is committed to protecting your personal data.
                      This Privacy Policy explains how we collect, use, disclose, store, and safeguard your information when you
                      visit our website or use our travel-related services.
                    </p>
                    <p className="text-gray-600 leading-relaxed mb-4">
                      Our services include, but are not limited to, flight ticketing, cruise bookings, hotel reservations, train
                      travel, travel packages, visa and passport documentation assistance, and customer travel guidance. This policy
                      also explains your privacy rights and how applicable data protection laws protect you.
                    </p>
                    <p className="text-gray-600 leading-relaxed">
                      By using our website or services, you agree to the collection and use of information in accordance with this
                      Privacy Policy.
                    </p>
                  </section>

                  {/* Data Collection */}
                  <section id="data-collection" className="mb-12 scroll-mt-24">
                    <h2 className="text-3xl font-bold text-gray-900 mb-6">The Data We Collect About You</h2>
                    <p className="text-gray-600 leading-relaxed mb-6">
                      Personal data refers to any information that can identify an individual. Depending on the services you use,
                      JETSETTERS may collect, use, store, and transfer the following categories of personal data:
                    </p>

                    <div className="space-y-6">
                      <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                        <h3 className="text-xl font-bold text-gray-900 mb-3">Identity Data</h3>
                        <p className="text-gray-600 leading-relaxed">
                          First name, last name, title, gender, date of birth, nationality, passport details, visa details, and
                          other government-issued identification required for travel or documentation purposes.
                        </p>
                      </div>

                      <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                        <h3 className="text-xl font-bold text-gray-900 mb-3">Contact Data</h3>
                        <p className="text-gray-600 leading-relaxed">
                          Billing address, mailing address, email address, telephone numbers, and emergency contact details when necessary.
                        </p>
                      </div>

                      <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                        <h3 className="text-xl font-bold text-gray-900 mb-3">Financial Data</h3>
                        <p className="text-gray-600 leading-relaxed">
                          Bank account details, payment card details, billing information, and transaction authentication data.
                          Payment processing is handled through secure third-party payment gateways, and we do not store full card numbers.
                        </p>
                      </div>

                      <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                        <h3 className="text-xl font-bold text-gray-900 mb-3">Transaction Data</h3>
                        <p className="text-gray-600 leading-relaxed">
                          Details of payments, bookings, itineraries, invoices, refunds, cancellations, and travel services purchased
                          through JETSETTERS.
                        </p>
                      </div>

                      <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                        <h3 className="text-xl font-bold text-gray-900 mb-3">Technical Data</h3>
                        <p className="text-gray-600 leading-relaxed">
                          Internet protocol (IP) address, browser type and version, device type, operating system, time zone setting,
                          location data, and other technology used to access our website.
                        </p>
                      </div>

                      <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                        <h3 className="text-xl font-bold text-gray-900 mb-3">Profile Data</h3>
                        <p className="text-gray-600 leading-relaxed">
                          Account login details, booking history, preferences, interests, feedback, reviews, survey responses, and
                          communications with customer support.
                        </p>
                      </div>

                      <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                        <h3 className="text-xl font-bold text-gray-900 mb-3">Usage Data</h3>
                        <p className="text-gray-600 leading-relaxed">
                          Information about how you use our website, including pages viewed, time spent, links clicked, and search behavior.
                        </p>
                      </div>

                      <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                        <h3 className="text-xl font-bold text-gray-900 mb-3">Marketing and Communications Data</h3>
                        <p className="text-gray-600 leading-relaxed">
                          Preferences for receiving marketing communications, newsletters, promotional offers, and communication methods.
                        </p>
                      </div>
                    </div>
                  </section>

                  {/* How We Collect */}
                  <section id="how-collect" className="mb-12 scroll-mt-24">
                    <h2 className="text-3xl font-bold text-gray-900 mb-4">How We Collect Your Data</h2>
                    <p className="text-gray-600 leading-relaxed mb-4">We collect data through:</p>
                    <ul className="space-y-2 text-gray-600">
                      <li className="flex items-start gap-3">
                        <span className="text-[#055B75] mt-1">•</span>
                        <span>Direct interactions (bookings, inquiries, forms, calls, emails)</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-[#055B75] mt-1">•</span>
                        <span>Automated technologies (cookies, analytics, server logs)</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-[#055B75] mt-1">•</span>
                        <span>Third parties (airlines, hotels, cruise operators, train operators, visa authorities, tour providers, and payment processors)</span>
                      </li>
                    </ul>
                  </section>

                  {/* How We Use */}
                  <section id="how-use" className="mb-12 scroll-mt-24">
                    <h2 className="text-3xl font-bold text-gray-900 mb-4">How We Use Your Personal Data</h2>
                    <p className="text-gray-600 leading-relaxed mb-4">
                      JETSETTERS uses your personal data only when legally permitted, including for the following purposes:
                    </p>
                    <ul className="space-y-2 text-gray-600">
                      <li className="flex items-start gap-3">
                        <span className="text-[#055B75] mt-1">•</span>
                        <span>Registering and managing customer accounts</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-[#055B75] mt-1">•</span>
                        <span>Processing travel bookings and documentation services</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-[#055B75] mt-1">•</span>
                        <span>Managing payments, refunds, fees, and charges</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-[#055B75] mt-1">•</span>
                        <span>Communicating booking confirmations, itinerary updates, and service notices</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-[#055B75] mt-1">•</span>
                        <span>Providing visa, passport, and travel assistance</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-[#055B75] mt-1">•</span>
                        <span>Improving our website, services, and customer experience</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-[#055B75] mt-1">•</span>
                        <span>Sending marketing communications where consent has been provided</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-[#055B75] mt-1">•</span>
                        <span>Meeting legal, regulatory, immigration, aviation, and border-control requirements</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-[#055B75] mt-1">•</span>
                        <span>Preventing fraud and ensuring website security</span>
                      </li>
                    </ul>
                  </section>

                  {/* Legal Basis */}
                  <section id="legal-basis" className="mb-12 scroll-mt-24">
                    <h2 className="text-3xl font-bold text-gray-900 mb-4">Legal Basis for Processing</h2>
                    <p className="text-gray-600 leading-relaxed mb-4">We process personal data based on:</p>
                    <ul className="space-y-2 text-gray-600">
                      <li className="flex items-start gap-3">
                        <span className="text-[#055B75] mt-1">•</span>
                        <span>Performance of a contract</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-[#055B75] mt-1">•</span>
                        <span>Compliance with legal obligations</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-[#055B75] mt-1">•</span>
                        <span>Legitimate business interests</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-[#055B75] mt-1">•</span>
                        <span>Your consent, which may be withdrawn at any time</span>
                      </li>
                    </ul>
                  </section>

                  {/* Data Sharing */}
                  <section id="data-sharing" className="mb-12 scroll-mt-24">
                    <h2 className="text-3xl font-bold text-gray-900 mb-4">Data Sharing and Disclosure</h2>
                    <p className="text-gray-600 leading-relaxed mb-4">We may share your personal data with:</p>
                    <ul className="space-y-2 text-gray-600">
                      <li className="flex items-start gap-3">
                        <span className="text-[#055B75] mt-1">•</span>
                        <span>Airlines, cruise lines, hotels, train operators, and tour providers</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-[#055B75] mt-1">•</span>
                        <span>Visa agencies, embassies, consulates, and government authorities</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-[#055B75] mt-1">•</span>
                        <span>Payment processors and financial institutions</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-[#055B75] mt-1">•</span>
                        <span>IT, hosting, analytics, and customer support service providers</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-[#055B75] mt-1">•</span>
                        <span>Legal or regulatory authorities where required by law</span>
                      </li>
                    </ul>
                    <p className="text-gray-600 leading-relaxed mt-4">
                      All third parties are required to safeguard your data and use it only for authorized purposes.
                    </p>
                  </section>

                  {/* International Transfers */}
                  <section id="international" className="mb-12 scroll-mt-24">
                    <h2 className="text-3xl font-bold text-gray-900 mb-4">International Data Transfers</h2>
                    <p className="text-gray-600 leading-relaxed">
                      As a global travel service provider, your information may be transferred and processed outside your country
                      of residence. JETSETTERS ensures appropriate safeguards are in place to protect your data in accordance with
                      applicable laws.
                    </p>
                  </section>

                  {/* Cookies */}
                  <section id="cookies" className="mb-12 scroll-mt-24">
                    <h2 className="text-3xl font-bold text-gray-900 mb-4">Cookies and Tracking Technologies</h2>
                    <p className="text-gray-600 leading-relaxed mb-4">JETSETTERS uses cookies and similar technologies to:</p>
                    <ul className="space-y-2 text-gray-600">
                      <li className="flex items-start gap-3">
                        <span className="text-[#055B75] mt-1">•</span>
                        <span>Improve website performance and functionality</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-[#055B75] mt-1">•</span>
                        <span>Remember user preferences</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-[#055B75] mt-1">•</span>
                        <span>Analyze website traffic</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-[#055B75] mt-1">•</span>
                        <span>Deliver relevant content and advertisements</span>
                      </li>
                    </ul>
                    <p className="text-gray-600 leading-relaxed mt-4">
                      You may control cookies through your browser settings. For more information, please refer to our Cookie Policy.
                    </p>
                  </section>

                  {/* Security */}
                  <section id="security" className="mb-12 scroll-mt-24">
                    <h2 className="text-3xl font-bold text-gray-900 mb-4">Data Security</h2>
                    <p className="text-gray-600 leading-relaxed mb-4">
                      We implement appropriate technical and organizational security measures to protect personal data against
                      unauthorized access, loss, misuse, alteration, or disclosure. Access is limited to authorized personnel with
                      a business need to know.
                    </p>
                    <p className="text-gray-600 leading-relaxed">
                      While we strive to protect your data, no internet transmission is completely secure.
                    </p>
                  </section>

                  {/* Retention */}
                  <section id="retention" className="mb-12 scroll-mt-24">
                    <h2 className="text-3xl font-bold text-gray-900 mb-4">Data Retention</h2>
                    <p className="text-gray-600 leading-relaxed mb-4">
                      We retain personal data only for as long as necessary to:
                    </p>
                    <ul className="space-y-2 text-gray-600">
                      <li className="flex items-start gap-3">
                        <span className="text-[#055B75] mt-1">•</span>
                        <span>Fulfill service and contractual obligations</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-[#055B75] mt-1">•</span>
                        <span>Meet legal, tax, immigration, and regulatory requirements</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-[#055B75] mt-1">•</span>
                        <span>Resolve disputes and enforce agreements</span>
                      </li>
                    </ul>
                  </section>

                  {/* Rights */}
                  <section id="rights" className="mb-12 scroll-mt-24">
                    <h2 className="text-3xl font-bold text-gray-900 mb-4">Your Legal Rights</h2>
                    <p className="text-gray-600 leading-relaxed mb-4">
                      Depending on applicable laws, you have the right to:
                    </p>
                    <ul className="space-y-2 text-gray-600">
                      <li className="flex items-start gap-3">
                        <span className="text-[#055B75] mt-1">•</span>
                        <span>Request access to your personal data</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-[#055B75] mt-1">•</span>
                        <span>Request correction of inaccurate data</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-[#055B75] mt-1">•</span>
                        <span>Request deletion of your data</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-[#055B75] mt-1">•</span>
                        <span>Object to or restrict processing</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-[#055B75] mt-1">•</span>
                        <span>Request data portability</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-[#055B75] mt-1">•</span>
                        <span>Withdraw consent at any time</span>
                      </li>
                    </ul>
                    <p className="text-gray-600 leading-relaxed mt-4">
                      No fee is required to exercise these rights unless requests are excessive or unfounded.
                    </p>
                  </section>

                  {/* GDPR & CCPA */}
                  <section id="gdpr-ccpa" className="mb-12 scroll-mt-24">
                    <h2 className="text-3xl font-bold text-gray-900 mb-6">GDPR & CCPA/CPRA Compliance</h2>

                    <div className="bg-blue-50 border-l-4 border-[#055B75] p-6 mb-6 rounded-r-xl">
                      <h3 className="text-xl font-bold text-gray-900 mb-3">Your Privacy Rights</h3>
                      <p className="text-gray-600 leading-relaxed">
                        JETSETTERS complies with applicable privacy laws, including the General Data Protection Regulation (GDPR)
                        for users in the European Economic Area and the California Consumer Privacy Act (CCPA) / California Privacy
                        Rights Act (CPRA) for California residents.
                      </p>
                    </div>

                    <div className="mb-6">
                      <h3 className="text-2xl font-bold text-gray-900 mb-4">GDPR Rights (EEA Residents)</h3>
                      <p className="text-gray-600 leading-relaxed mb-4">
                        If you are located in the European Economic Area, you have the right to:
                      </p>
                      <ul className="space-y-2 text-gray-600">
                        <li className="flex items-start gap-3">
                          <span className="text-[#055B75] mt-1">•</span>
                          <span>Access your personal data</span>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="text-[#055B75] mt-1">•</span>
                          <span>Rectify inaccurate or incomplete data</span>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="text-[#055B75] mt-1">•</span>
                          <span>Request erasure ("right to be forgotten")</span>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="text-[#055B75] mt-1">•</span>
                          <span>Restrict or object to processing</span>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="text-[#055B75] mt-1">•</span>
                          <span>Request data portability</span>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="text-[#055B75] mt-1">•</span>
                          <span>Withdraw consent at any time</span>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="text-[#055B75] mt-1">•</span>
                          <span>Lodge a complaint with a data protection authority</span>
                        </li>
                      </ul>
                    </div>

                    <div className="mb-6">
                      <h3 className="text-2xl font-bold text-gray-900 mb-4">CCPA / CPRA Rights (California Residents)</h3>
                      <p className="text-gray-600 leading-relaxed mb-4">California residents have the right to:</p>
                      <ul className="space-y-2 text-gray-600">
                        <li className="flex items-start gap-3">
                          <span className="text-[#055B75] mt-1">•</span>
                          <span>Know what personal information we collect, use, and disclose</span>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="text-[#055B75] mt-1">•</span>
                          <span>Request access to personal information collected</span>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="text-[#055B75] mt-1">•</span>
                          <span>Request deletion of personal information (subject to legal exceptions)</span>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="text-[#055B75] mt-1">•</span>
                          <span>Correct inaccurate personal information</span>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="text-[#055B75] mt-1">•</span>
                          <span>Opt out of the sale or sharing of personal information</span>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="text-[#055B75] mt-1">•</span>
                          <span>Limit the use of sensitive personal information</span>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="text-[#055B75] mt-1">•</span>
                          <span>Not be discriminated against for exercising privacy rights</span>
                        </li>
                      </ul>
                      <div className="bg-green-50 border border-green-200 rounded-xl p-4 mt-4">
                        <p className="text-gray-700 font-semibold">
                          JETSETTERS does not sell personal information as defined under CCPA/CPRA.
                        </p>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-2xl font-bold text-gray-900 mb-4">Sensitive Personal Information</h3>
                      <p className="text-gray-600 leading-relaxed">
                        For travel services, we may collect sensitive personal information such as passport details, visa records,
                        nationality, and travel history. This information is used strictly to fulfill travel bookings, immigration
                        requirements, and documentation services.
                      </p>
                    </div>
                  </section>

                  {/* Visa Disclaimer */}
                  <section id="visa-disclaimer" className="mb-12 scroll-mt-24">
                    <h2 className="text-3xl font-bold text-gray-900 mb-4">Visa & Passport Services – Liability Disclaimer</h2>
                    <div className="bg-amber-50 border-l-4 border-amber-500 p-6 rounded-r-xl mb-4">
                      <p className="text-gray-700 leading-relaxed mb-4">
                        JETSETTERS provides visa and passport documentation assistance <strong>only as a facilitation service</strong>.
                        We do <strong>not</strong> guarantee:
                      </p>
                      <ul className="space-y-2 text-gray-700">
                        <li className="flex items-start gap-3">
                          <span className="text-amber-600 mt-1">•</span>
                          <span>Visa approval or issuance</span>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="text-amber-600 mt-1">•</span>
                          <span>Processing timelines</span>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="text-amber-600 mt-1">•</span>
                          <span>Acceptance by embassies, consulates, or immigration authorities</span>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="text-amber-600 mt-1">•</span>
                          <span>Entry, transit, or stay permissions</span>
                        </li>
                      </ul>
                    </div>
                    <p className="text-gray-600 leading-relaxed mb-4">
                      Final decisions are made solely by government authorities, airlines, border agencies, and foreign embassies.
                    </p>
                    <p className="text-gray-600 leading-relaxed mb-4">Clients are responsible for:</p>
                    <ul className="space-y-2 text-gray-600 mb-4">
                      <li className="flex items-start gap-3">
                        <span className="text-[#055B75] mt-1">•</span>
                        <span>Providing accurate and complete information</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-[#055B75] mt-1">•</span>
                        <span>Ensuring documents are valid and up to date</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-[#055B75] mt-1">•</span>
                        <span>Verifying entry, transit, and health requirements prior to travel</span>
                      </li>
                    </ul>
                    <p className="text-gray-600 leading-relaxed">JETSETTERS shall not be liable for:</p>
                    <ul className="space-y-2 text-gray-600">
                      <li className="flex items-start gap-3">
                        <span className="text-[#055B75] mt-1">•</span>
                        <span>Visa refusals, delays, or cancellations</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-[#055B75] mt-1">•</span>
                        <span>Denied boarding or entry</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-[#055B75] mt-1">•</span>
                        <span>Losses arising from government decisions, airline policies, or immigration enforcement</span>
                      </li>
                    </ul>
                  </section>

                  {/* Travel Disclaimer */}
                  <section id="travel-disclaimer" className="mb-12 scroll-mt-24">
                    <h2 className="text-3xl font-bold text-gray-900 mb-4">International Travel & Third-Party Service Disclaimer</h2>
                    <p className="text-gray-600 leading-relaxed mb-4">
                      JETSETTERS acts as an <strong>intermediary</strong> between customers and third-party service providers
                      including airlines, hotels, cruise lines, tour operators, and transport companies.
                    </p>
                    <p className="text-gray-600 leading-relaxed mb-4">We are not responsible for:</p>
                    <ul className="space-y-2 text-gray-600">
                      <li className="flex items-start gap-3">
                        <span className="text-[#055B75] mt-1">•</span>
                        <span>Acts, omissions, or defaults of third-party providers</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-[#055B75] mt-1">•</span>
                        <span>Schedule changes, cancellations, strikes, weather disruptions, or force majeure events</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-[#055B75] mt-1">•</span>
                        <span>Service quality or availability beyond our control</span>
                      </li>
                    </ul>
                  </section>

                  {/* Children */}
                  <section id="children" className="mb-12 scroll-mt-24">
                    <h2 className="text-3xl font-bold text-gray-900 mb-4">Children's Privacy</h2>
                    <p className="text-gray-600 leading-relaxed">
                      JETSETTERS does not knowingly collect personal data from individuals under the age of 18 without parental
                      or legal guardian consent.
                    </p>
                  </section>

                  {/* Changes */}
                  <section id="changes" className="mb-12 scroll-mt-24">
                    <h2 className="text-3xl font-bold text-gray-900 mb-4">Changes to This Policy</h2>
                    <p className="text-gray-600 leading-relaxed">
                      We may update this Privacy Policy periodically. Updates will be posted with a revised "Last Updated" date.
                      Continued use of our services indicates acceptance of any changes.
                    </p>
                  </section>

                  {/* Contact */}
                  <section id="contact" className="mb-12 scroll-mt-24">
                    <h2 className="text-3xl font-bold text-gray-900 mb-6">Contact Us</h2>
                    <p className="text-gray-600 leading-relaxed mb-6">
                      For questions, concerns, or requests regarding this Privacy Policy or your personal data, contact:
                    </p>
                    <div className="bg-gradient-to-br from-[#E0F7FA] to-white rounded-2xl p-8 border border-[#055B75]/20">
                      <h3 className="text-2xl font-bold text-gray-900 mb-6">JETSETTERS</h3>
                      <div className="space-y-4">
                        <div className="flex items-start gap-4">
                          <FaEnvelope className="text-[#055B75] text-xl mt-1" />
                          <div>
                            <div className="text-sm text-gray-600 mb-1">Email</div>
                            <a href="mailto:privacy@jetsetterss.com" className="text-lg font-semibold text-[#055B75] hover:underline">
                              privacy@jetsetterss.com
                            </a>
                          </div>
                        </div>
                        <div className="flex items-start gap-4">
                          <FaPhone className="text-[#055B75] text-xl mt-1" />
                          <div>
                            <div className="text-sm text-gray-600 mb-1">Phone</div>
                            <a href="tel:+18885813028" className="text-lg font-semibold text-gray-900 hover:text-[#055B75]">
                              (+1) 888-581-3028
                            </a>
                          </div>
                        </div>
                        <div className="flex items-start gap-4">
                          <FaMapMarkerAlt className="text-[#055B75] text-xl mt-1" />
                          <div>
                            <div className="text-sm text-gray-600 mb-1">Address</div>
                            <div className="text-lg font-semibold text-gray-900">
                              513 W Bonaventure Ave, Tracy, CA 95391
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

export default PrivacyPolicy;