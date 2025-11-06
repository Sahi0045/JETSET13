import React from 'react';
import { Link } from 'react-router-dom';
import Navbar from './Common/Navbar';
import Footer from './Common/Footer';

const TermsConditions = () => {
  const lastUpdated = "November 6, 2025";

  return (
    <>
      <Navbar forceScrolled={true} />
      <div className="min-h-screen bg-gray-50">
        {/* Hero Section */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-700 text-white py-20">
          <div className="container mx-auto px-4 text-center">
            <h1 className="text-5xl font-bold mb-6">Terms & Conditions</h1>
            <p className="text-xl max-w-3xl mx-auto">
              Welcome to JET SETTERS, a full-service travel agency providing access to flights, cruises, hotels, car rentals, vacation packages, and related services ("Services"). By accessing or using our website, mobile applications, or any of our travel booking platforms (collectively, "the Platform"), you agree to be bound by these Terms and Conditions ("Terms"). Please read these Terms carefully before using our Services. If you do not agree, you may not access or use our Services.
            </p>
            <div className="mt-6 text-blue-100">
              Last updated: {lastUpdated}
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 py-16">
          {/* Terms and Conditions */}
          <section className="mb-20">
            <div className="max-w-4xl mx-auto">
              <div className="bg-white rounded-xl shadow-lg p-8">
                <div className="prose prose-lg mx-auto text-gray-600">
                  <h2>1. Use of Services</h2>
                  <h3>1.1 Eligibility</h3>
                  <p>You must be at least 18 years old to use our Services. By using our Services, you represent and warrant that you meet this age requirement and have the authority to enter into these Terms.</p>
                  <h3>1.2 Account Registration</h3>
                  <p>Certain features require you to create an account. You agree to:</p>
                  <ul>
                    <li>Provide accurate, current, and complete information.</li>
                    <li>Maintain the confidentiality of your credentials.</li>
                    <li>Immediately notify us of unauthorized use of your account.</li>
                  </ul>
                  <p>JET SETTERS is not responsible for losses arising from unauthorized access due to your negligence.</p>
                  <h3>1.3 Acceptable Use</h3>
                  <p>You agree not to:</p>
                  <ul>
                    <li>Use the Services for any unlawful or unauthorized purpose.</li>
                    <li>Violate any applicable law, regulation, or third-party right.</li>
                    <li>Engage in fraudulent or misleading activity.</li>
                    <li>Attempt to access data or systems without authorization.</li>
                    <li>Interfere with the proper functioning of our Platform.</li>
                  </ul>
                  <h2>2. Booking and Reservations</h2>
                  <h3>2.1 Booking Confirmation</h3>
                  <p>All bookings made through JET SETTERS are subject to availability and confirmation by the respective travel provider (airline, cruise line, hotel, etc.).</p>
                  <p>Your booking is confirmed only after you receive a confirmation email or invoice from JET SETTERS.</p>
                  <h3>2.2 Pricing and Fees</h3>
                  <p>Prices displayed are based on information provided by suppliers and are subject to change without notice.</p>
                  <p>Prices do not include government taxes, service fees, or surcharges unless explicitly stated.</p>
                  <p>We reserve the right to correct any pricing errors, and in such cases, you will be notified and may cancel without penalty.</p>
                  <h3>2.3 Payments</h3>
                  <p>Payment is required at the time of booking unless otherwise stated.</p>
                  <p>We accept major credit cards, debit cards, and digital payment gateways.</p>
                  <p>By submitting payment information, you authorize JET SETTERS to charge the total booking amount.</p>
                  <p>Failure to make full payment may result in cancellation of your reservation.</p>
                  <h3>2.4 Cancellations, Changes, and Refunds</h3>
                  <p>Cancellation policies vary by supplier. You are responsible for reviewing and understanding these policies before booking.</p>
                  <p>Refunds (if applicable) are subject to the travel provider's terms and processing timelines.</p>
                  <p>Service fees or booking charges by JET SETTERS are generally non-refundable.</p>
                  <p>In case of force majeure (natural disasters, pandemics, strikes, etc.), refund eligibility is determined by the supplier's policy.</p>
                  <h2>3. Travel Documents and Requirements</h2>
                  <h3>3.1 Travel Documents</h3>
                  <p>You are solely responsible for ensuring you possess all required travel documents (e.g., valid passport, visa, permits, vaccination certificates).</p>
                  <p>JET SETTERS is not liable for any denial of entry or travel restrictions due to insufficient documentation.</p>
                  <h3>3.2 Health and Safety</h3>
                  <p>You are responsible for meeting all health and vaccination requirements for travel.</p>
                  <p>JET SETTERS is not liable for illness, injury, or medical issues encountered during travel.</p>
                  <h3>3.3 Travel Insurance</h3>
                  <p>We strongly recommend purchasing comprehensive travel insurance covering cancellations, medical expenses, lost luggage, and emergencies.</p>
                  <h2>4. Supplier Terms and Responsibilities</h2>
                  <p>JET SETTERS acts solely as an intermediary between you and travel suppliers (airlines, hotels, cruise lines, car rental companies, etc.).</p>
                  <p>Each supplier's terms and conditions govern your booking, including:</p>
                  <ul>
                    <li>Check-in/check-out times</li>
                    <li>Baggage allowances</li>
                    <li>Penalties for no-shows or late arrivals</li>
                  </ul>
                  <p>JET SETTERS is not responsible for supplier actions, delays, cancellations, or service quality.</p>
                  <h2>5. Intellectual Property</h2>
                  <p>All materials, content, and software provided on the Platform—including logos, images, text, and design—are owned by or licensed to JET SETTERS.</p>
                  <p>You may not reproduce, modify, or distribute any content without our express written permission.</p>
                  <h2>6. Limitation of Liability</h2>
                  <h3>6.1 Disclaimer</h3>
                  <p>Our Services are provided "as is" and "as available" without warranties of any kind, express or implied.</p>
                  <p>JET SETTERS makes no guarantee of accuracy, availability, or reliability of information or services provided.</p>
                  <h3>6.2 Limitation</h3>
                  <p>To the fullest extent permitted by law, JET SETTERS, its affiliates, employees, or agents are not liable for:</p>
                  <ul>
                    <li>Indirect, incidental, or consequential damages.</li>
                    <li>Loss of profits, data, or goodwill.</li>
                    <li>Delays, cancellations, or damages caused by third-party providers.</li>
                  </ul>
                  <h3>6.3 Force Majeure</h3>
                  <p>JET SETTERS shall not be liable for non-performance caused by events beyond its reasonable control, including natural disasters, acts of terrorism, war, government actions, pandemics, or network failures.</p>
                  <h2>7. Privacy and Data Protection</h2>
                  <p>Your privacy is important to us.</p>
                  <p>By using our Services, you agree to our Privacy Policy, which governs the collection, use, and sharing of your personal information.</p>
                  <p>We comply with applicable data protection laws, including GDPR and CCPA where applicable.</p>
                  <h2>8. Governing Law and Dispute Resolution</h2>
                  <p>These Terms are governed by the laws of the State of California, USA, without regard to conflict-of-law principles.</p>
                  <h3>8.1 Dispute Resolution</h3>
                  <p>Any disputes arising from these Terms shall be resolved by binding arbitration conducted under the rules of the American Arbitration Association (AAA).</p>
                  <p>The arbitration will take place in Tracy, California.</p>
                  <p>Each party bears its own legal costs unless otherwise determined by the arbitrator.</p>
                  <h2>9. Modifications to Terms</h2>
                  <p>JET SETTERS reserves the right to modify these Terms at any time.</p>
                  <p>Changes will be posted on our website with the "Last Updated" date revised accordingly.</p>
                  <p>Your continued use of the Services constitutes your acceptance of the new Terms.</p>
                  <h2>10. Contact Information</h2>
                  <p>If you have questions or concerns about these Terms, please contact us:</p>
                  <p>JET SETTERS, Inc.</p>
                  <p>📍 513 W Bonaventure Ave, Tracy, CA 95391</p>
                  <p>📧 Email: legal@jet-setters.us</p>
                  <p>📞 Phone: (+1) 888-581-3028</p>
                  <p>🌐 Website: www.jet-setters.us</p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
      <Footer />
    </>
  );
};

export default TermsConditions; 