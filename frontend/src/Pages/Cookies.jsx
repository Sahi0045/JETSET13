import React from 'react';
import { Container, Row, Col, Card, Table } from 'react-bootstrap';
import { Helmet } from 'react-helmet-async';
import Navbar from './Common/Navbar';
import Footer from './Common/Footer';
import withPageElements from './Common/PageWrapper';

const Cookies = () => {
  return (
    <>
      <Helmet>
        <title>Cookie Policy - Jetsetterss</title>
        <meta name="description" content="Learn about how Jetsetterss uses cookies and similar technologies on our website." />
      </Helmet>

      <Navbar forceScrolled={true} />

      <Container className="py-5">
        <Row className="justify-content-center mb-4">
          <Col md={10}>
            <Card className="shadow-sm">
              <Card.Body className="p-5">
                <h1 className="text-center mb-4">Cookie Policy</h1>
                <div className="cookies-content">
                  <section className="mb-4">
                    <h2>Introduction</h2>
                    <p>Last Updated: {new Date().toLocaleDateString()}</p>
                    <p>
                      This Cookie Policy explains how Jetsetterss ("we", "us", or "our") uses cookies and similar
                      technologies to recognize you when you visit our website at <a href="/">www.jet-setters.us</a> ("Website").
                      It explains what these technologies are and why we use them, as well as your rights to control our use of them.
                    </p>
                    <p>
                      In some cases, we may use cookies to collect personal information, or that becomes personal information
                      if we combine it with other information.
                    </p>
                  </section>

                  <section className="mb-4">
                    <h2>What are cookies?</h2>
                    <p>
                      Cookies are small data files that are placed on your computer or mobile device when you visit a website.
                      Cookies are widely used by website owners in order to make their websites work, or to work more efficiently,
                      as well as to provide reporting information.
                    </p>
                    <p>
                      Cookies set by the website owner (in this case, Jetsetterss) are called "first-party cookies." Cookies set
                      by parties other than the website owner are called "third-party cookies." Third-party cookies enable third-party
                      features or functionality to be provided on or through the website (e.g., advertising, interactive content, and analytics).
                      The parties that set these third-party cookies can recognize your computer both when it visits the website in question
                      and also when it visits certain other websites.
                    </p>
                  </section>

                  <section className="mb-4">
                    <h2>Why do we use cookies?</h2>
                    <p>
                      We use first- and third-party cookies for several reasons. Some cookies are required for technical reasons
                      in order for our Website to operate, and we refer to these as "essential" or "strictly necessary" cookies.
                      Other cookies also enable us to track and target the interests of our users to enhance the experience on our
                      Online Properties. Third parties serve cookies through our Website for advertising, analytics, and other purposes.
                      This is described in more detail below.
                    </p>
                  </section>

                  <section className="mb-4">
                    <h2>Types of cookies we use</h2>
                    <p>The specific types of first- and third-party cookies served through our Website and the purposes they perform are described below:</p>

                    <Table responsive bordered className="my-4">
                      <thead className="table-light">
                        <tr>
                          <th>Type of Cookie</th>
                          <th>Purpose</th>
                          <th>Duration</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td><strong>Essential Cookies</strong></td>
                          <td>
                            These cookies are strictly necessary to provide you with services available through our Website and to use
                            some of its features, such as access to secure areas. Without these cookies, services you have asked for,
                            like shopping carts or e-billing, cannot be provided.
                          </td>
                          <td>Session / Persistent</td>
                        </tr>
                        <tr>
                          <td><strong>Performance & Functionality Cookies</strong></td>
                          <td>
                            These cookies are used to enhance the performance and functionality of our Website but are non-essential to
                            their use. However, without these cookies, certain functionality may become unavailable.
                          </td>
                          <td>Session / Persistent</td>
                        </tr>
                        <tr>
                          <td><strong>Analytics & Customization Cookies</strong></td>
                          <td>
                            These cookies collect information that is used either in aggregate form to help us understand how our Website
                            is being used or how effective our marketing campaigns are, or to help us customize our Website for you.
                          </td>
                          <td>Session / Persistent</td>
                        </tr>
                        <tr>
                          <td><strong>Advertising & Targeting Cookies</strong></td>
                          <td>
                            These cookies are used to make advertising messages more relevant to you. They perform functions like preventing
                            the same ad from continuously reappearing, ensuring that ads are properly displayed for advertisers, and in some
                            cases selecting advertisements that are based on your interests.
                          </td>
                          <td>Session / Persistent</td>
                        </tr>
                        <tr>
                          <td><strong>Social Media Cookies</strong></td>
                          <td>
                            These cookies are used to enable you to share pages and content that you find interesting on our Website through
                            third-party social networking and other websites. These cookies may also be used for advertising purposes.
                          </td>
                          <td>Session / Persistent</td>
                        </tr>
                      </tbody>
                    </Table>
                  </section>

                  <section className="mb-4">
                    <h2>How can I control cookies?</h2>
                    <p>
                      You have the right to decide whether to accept or reject cookies. You can exercise your cookie rights by setting
                      your preferences in the Cookie Consent Tool we provide on our Website. The Cookie Consent Tool allows you to select
                      which categories of cookies you accept or reject. Essential cookies cannot be rejected as they are strictly necessary
                      to provide you with services.
                    </p>
                    <p>
                      You can also set or amend your web browser controls to accept or refuse cookies. If you choose to reject cookies,
                      you may still use our website though your access to some functionality and areas of our website may be restricted.
                      As the means by which you can refuse cookies through your web browser controls vary from browser-to-browser, you
                      should visit your browser's help menu for more information.
                    </p>
                  </section>

                  <section className="mb-4">
                    <h2>Do you serve targeted advertising?</h2>
                    <p>
                      Third parties may serve cookies on your computer or mobile device to serve advertising through our Website. These
                      companies may use information about your visits to this and other websites in order to provide relevant advertisements
                      about goods and services that you may be interested in. They may also employ technology that is used to measure the
                      effectiveness of advertisements. This can be accomplished by them using cookies or web beacons to collect information
                      about your visits to this and other sites in order to provide relevant advertisements about goods and services of
                      potential interest to you. The information collected through this process does not enable us or them to identify your
                      name, contact details, or other details that directly identify you unless you choose to provide these.
                    </p>
                  </section>

                  <section className="mb-4">
                    <h2>Changes to this Cookie Policy</h2>
                    <p>
                      We may update this Cookie Policy from time to time in order to reflect, for example, changes to the cookies we use
                      or for other operational, legal, or regulatory reasons. Please therefore re-visit this Cookie Policy regularly to
                      stay informed about our use of cookies and related technologies.
                    </p>
                    <p>
                      The date at the top of this Cookie Policy indicates when it was last updated.
                    </p>
                  </section>

                  <section className="mb-4">
                    <h2>Contact Us</h2>
                    <p>
                      If you have any questions about our use of cookies or other technologies, please contact us at:
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

      <Footer />
    </>
  );
};

export default withPageElements(Cookies); 