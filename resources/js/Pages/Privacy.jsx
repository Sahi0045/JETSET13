import React from 'react';
import { Container, Row, Col, Card } from 'react-bootstrap';
import { Helmet } from 'react-helmet-async';
import Navbar from './Common/Navbar';
import Footer from './Common/Footer';
import withPageElements from './Common/PageWrapper';

const Privacy = () => {
  return (
    <>
      <Helmet>
        <title>Privacy Policy - Jetsetterss</title>
        <meta name="description" content="Jetsetterss privacy policy, data protection practices, and your rights." />
      </Helmet>

      <Container className="py-5">
        <Row className="justify-content-center mb-4">
          <Col md={10}>
            <Card className="shadow-sm">
              <Card.Body className="p-5">
                <h1 className="text-center mb-4">Privacy Policy</h1>
                <div className="privacy-content">
                  <section className="mb-4">
                    <h2>Introduction</h2>
                    <p>Last Updated: {new Date().toLocaleDateString()}</p>
                    <p>
                      At Jetsetterss, we value your privacy and are committed to protecting your personal data.
                      This Privacy Policy will inform you about how we look after your personal data when you
                      visit our website and tell you about your privacy rights and how the law protects you.
                    </p>
                  </section>

                  <section className="mb-4">
                    <h2>The Data We Collect About You</h2>
                    <p>
                      Personal data means any information about an individual from which that person can be identified.
                      We may collect, use, store and transfer different kinds of personal data about you which we have grouped as follows:
                    </p>
                    <ul>
                      <li><strong>Identity Data</strong>: includes first name, last name, username or similar identifier, title, date of birth.</li>
                      <li><strong>Contact Data</strong>: includes billing address, delivery address, email address, and telephone numbers.</li>
                      <li><strong>Financial Data</strong>: includes bank account and payment card details.</li>
                      <li><strong>Transaction Data</strong>: includes details about payments to and from you and other details of products and services you have purchased from us.</li>
                      <li><strong>Technical Data</strong>: includes internet protocol (IP) address, browser type and version, time zone setting and location, browser plug-in types and versions, operating system and platform, and other technology on the devices you use to access this website.</li>
                      <li><strong>Profile Data</strong>: includes your username and password, purchases or orders made by you, your interests, preferences, feedback, and survey responses.</li>
                      <li><strong>Usage Data</strong>: includes information about how you use our website, products, and services.</li>
                      <li><strong>Marketing and Communications Data</strong>: includes your preferences in receiving marketing from us and our third parties and your communication preferences.</li>
                    </ul>
                  </section>

                  <section className="mb-4">
                    <h2>How We Use Your Personal Data</h2>
                    <p>We will only use your personal data when the law allows us to. Most commonly, we will use your personal data in the following circumstances:</p>
                    <ul>
                      <li>To register you as a new customer.</li>
                      <li>To process and deliver your order including managing payments, fees, and charges.</li>
                      <li>To manage our relationship with you including notifying you about changes to our terms or privacy policy.</li>
                      <li>To administer and protect our business and this website.</li>
                      <li>To deliver relevant website content and advertisements to you.</li>
                      <li>To use data analytics to improve our website, products/services, marketing, customer relationships, and experiences.</li>
                    </ul>
                  </section>

                  <section className="mb-4">
                    <h2>Cookies</h2>
                    <p>
                      Our website uses cookies to distinguish you from other users of our website. This helps us to provide
                      you with a good experience when you browse our website and also allows us to improve our site.
                      For detailed information on the cookies we use and the purposes for which we use them, see our Cookie Policy.
                    </p>
                  </section>

                  <section className="mb-4">
                    <h2>Data Security</h2>
                    <p>
                      We have put in place appropriate security measures to prevent your personal data from being
                      accidentally lost, used, or accessed in an unauthorized way, altered, or disclosed. In addition,
                      we limit access to your personal data to those employees, agents, contractors, and other third
                      parties who have a business need to know.
                    </p>
                  </section>

                  <section className="mb-4">
                    <h2>Your Legal Rights</h2>
                    <p>Under certain circumstances, you have rights under data protection laws in relation to your personal data, including the right to:</p>
                    <ul>
                      <li>Request access to your personal data.</li>
                      <li>Request correction of your personal data.</li>
                      <li>Request erasure of your personal data.</li>
                      <li>Object to processing of your personal data.</li>
                      <li>Request restriction of processing your personal data.</li>
                      <li>Request transfer of your personal data.</li>
                      <li>Right to withdraw consent.</li>
                    </ul>
                    <p>
                      You will not have to pay a fee to access your personal data (or to exercise any of the other rights).
                      However, we may charge a reasonable fee if your request is clearly unfounded, repetitive, or excessive.
                    </p>
                  </section>

                  <section className="mb-4">
                    <h2>Contact Us</h2>
                    <p>
                      If you have any questions about this Privacy Policy, including any requests to exercise your
                      legal rights, please contact us at:
                    </p>
                    <p>
                      <strong>Email:</strong> privacy@jet-setters.us<br />
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
    </>
  );
};

export default withPageElements(Privacy); 