import React from 'react';
import { Container, Row, Col, Card } from 'react-bootstrap';
import { Helmet } from 'react-helmet-async';
import Navbar from './Common/Navbar';
import Footer from './Common/Footer';
import withPageElements from './Common/PageWrapper';

const Terms = () => {
  return (
    <>
      <Helmet>
        <title>Terms of Service - Jetsetterss</title>
        <meta name="description" content="Jetsetterss terms and conditions of service for cruise bookings and travel services." />
      </Helmet>

      <Navbar forceScrolled={true} />

      <Container className="py-5">
        <Row className="justify-content-center mb-4">
          <Col md={10}>
            <Card className="shadow-sm">
              <Card.Body className="p-5">
                <h1 className="text-center mb-4">Terms of Service</h1>
                <div className="terms-content">
                  <section className="mb-4">
                    <h2>Introduction</h2>
                    <p>Last Updated: {new Date().toLocaleDateString()}</p>
                    <p>
                      Welcome to Jetsetterss. These Terms of Service ("Terms") govern your use of our website,
                      mobile applications, and services (collectively, the "Services"). By accessing or using our
                      Services, you agree to be bound by these Terms.
                    </p>
                    <p>
                      Please read these Terms carefully before using our Services. If you do not agree to these
                      Terms, you may not access or use our Services.
                    </p>
                  </section>

                  <section className="mb-4">
                    <h2>Use of Services</h2>
                    <p>
                      <strong>Eligibility:</strong> You must be at least 18 years old to use our Services. By using our
                      Services, you represent and warrant that you are at least 18 years old and have the legal
                      capacity to enter into these Terms.
                    </p>
                    <p>
                      <strong>Account Creation:</strong> To use certain features of our Services, you may need to create
                      an account. You are responsible for maintaining the confidentiality of your account
                      credentials and for all activities that occur under your account.
                    </p>
                    <p>
                      <strong>Prohibited Activities:</strong> You agree not to:
                    </p>
                    <ul>
                      <li>Violate any applicable laws or regulations</li>
                      <li>Infringe the rights of others</li>
                      <li>Use our Services for any illegal or unauthorized purpose</li>
                      <li>Attempt to gain unauthorized access to any portion of our Services</li>
                      <li>Interfere with or disrupt our Services</li>
                      <li>Engage in any fraudulent activity</li>
                    </ul>
                  </section>

                  <section className="mb-4">
                    <h2>Booking and Reservations</h2>
                    <p>
                      <strong>Booking Confirmation:</strong> Your booking is not confirmed until you receive a confirmation
                      from us. We reserve the right to cancel any booking at our discretion.
                    </p>
                    <p>
                      <strong>Pricing and Fees:</strong> All prices are subject to change until the booking is confirmed.
                      Prices do not include government taxes, fees, or surcharges unless expressly stated.
                    </p>
                    <p>
                      <strong>Payment:</strong> Payment is required at the time of booking unless otherwise specified.
                      We accept various payment methods, including credit cards and electronic payments.
                    </p>
                    <p>
                      <strong>Cancellations and Refunds:</strong> Cancellation and refund policies vary depending on the
                      cruise line, travel provider, and specific booking terms. Please review the cancellation
                      policy before completing your booking.
                    </p>
                  </section>

                  <section className="mb-4">
                    <h2>Travel Documents and Requirements</h2>
                    <p>
                      <strong>Travel Documents:</strong> You are responsible for obtaining and maintaining all necessary
                      travel documents, including passports, visas, and health certificates.
                    </p>
                    <p>
                      <strong>Travel Insurance:</strong> We strongly recommend that you purchase travel insurance to
                      protect your trip investment and provide coverage for unexpected events.
                    </p>
                    <p>
                      <strong>Health and Medical Requirements:</strong> You are responsible for ensuring that you meet
                      all health and medical requirements for your travel, including vaccinations and medical clearances.
                    </p>
                  </section>

                  <section className="mb-4">
                    <h2>Limitation of Liability</h2>
                    <p>
                      <strong>Disclaimer of Warranties:</strong> Our Services are provided "as is" and "as available"
                      without any warranties of any kind, either express or implied.
                    </p>
                    <p>
                      <strong>Limitation of Liability:</strong> To the maximum extent permitted by law, Jetsetterss
                      and its affiliates shall not be liable for any indirect, incidental, special, consequential,
                      or punitive damages arising from or related to your use of our Services.
                    </p>
                    <p>
                      <strong>Third-Party Services:</strong> We are not responsible for the acts, errors, omissions,
                      representations, warranties, breaches, or negligence of any third-party suppliers or for any
                      personal injuries, death, property damage, or other damages resulting therefrom.
                    </p>
                  </section>

                  <section className="mb-4">
                    <h2>Intellectual Property</h2>
                    <p>
                      All content, features, and functionality of our Services, including text, graphics, logos,
                      images, and software, are owned by Jetsetterss, its licensors, or other providers and are
                      protected by copyright, trademark, and other intellectual property laws.
                    </p>
                  </section>

                  <section className="mb-4">
                    <h2>Governing Law and Dispute Resolution</h2>
                    <p>
                      These Terms shall be governed by and construed in accordance with the laws of the State of
                      California, without regard to its conflict of law provisions.
                    </p>
                    <p>
                      Any dispute arising out of or relating to these Terms or our Services shall be resolved
                      through binding arbitration in accordance with the rules of the American Arbitration Association.
                    </p>
                  </section>

                  <section className="mb-4">
                    <h2>Modifications to Terms</h2>
                    <p>
                      We reserve the right to modify these Terms at any time. If we make changes, we will provide
                      notice by posting the updated Terms on our website and updating the "Last Updated" date.
                      Your continued use of our Services after the changes have been posted constitutes your
                      acceptance of the modified Terms.
                    </p>
                  </section>

                  <section className="mb-4">
                    <h2>Contact Us</h2>
                    <p>
                      If you have any questions about these Terms, please contact us at:
                    </p>
                    <p>
                      <strong>Email:</strong> legal@jet-setters.us<br />
                      <strong>Phone:</strong> (+1) 888-581-3028<br />
                      <strong>Address:</strong> 513 W Bonaventure Ave Tracy, CA 95391
                    </p>
                  </section>
                </div>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>

      <Footer />
    </>
  );
};

export default withPageElements(Terms); 