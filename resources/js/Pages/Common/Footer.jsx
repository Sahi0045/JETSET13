import React from 'react';
import { Link } from 'react-router-dom';
import './Footer.css';

// Note: Make sure to include Font Awesome in your main HTML file:
// <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">

const Footer = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-column">
            <Link to="/" className="footer-logo-link">
              <div className="footer-logo">
                <img src="/images/logos/WhatsApp_Image_2026-01-22_at_12.05.24_AM-removebg-preview.png" alt="JET SETTERS" className="logo-icon" />
              </div>
            </Link>
            <p className="column-description">
              Extraordinary travel experiences for travelers that demand excellence, customization, and unforgettable memories.
            </p>
          </div>
          <div className="footer-column">
            <h3 className="column-title-sm">Travel</h3>
            <nav aria-label="Travel Navigation">
              <ul className="nav-list">
                <li>
                  <Link to="/cruises" className="footer-nav-link">
                    Cruise
                  </Link>
                </li>
                <li>
                  <Link to="/flights" className="footer-nav-link">
                    Flight
                  </Link>
                </li>
                <li>
                  <Link to="/packages" className="footer-nav-link">
                    Packages
                  </Link>
                </li>
                <li>
                  <Link to="/rental" className="footer-nav-link">
                    Hotels
                  </Link>
                </li>
              </ul>
            </nav>
          </div>
          <div className="footer-column">
            <h3 className="column-title-sm">Resources</h3>
            <nav aria-label="Resources Navigation">
              <ul className="nav-list">
                <li>
                  <Link to="/destinations" className="footer-nav-link">
                    Destinations
                  </Link>
                </li>
                <li>
                  <Link to="/blog" className="footer-nav-link">
                    Travel Blog
                  </Link>
                </li>
                <li>
                  <Link to="/support" className="footer-nav-link">
                    Support
                  </Link>
                </li>
                <li>
                  <Link to="/faq" className="footer-nav-link">
                    FAQs
                  </Link>
                </li>
              </ul>
            </nav>
          </div>
          <div className="footer-column">
            <h3 className="column-title-sm">Company</h3>
            <nav aria-label="Company Navigation">
              <ul className="nav-list">
                <li>
                  <Link to="/about" className="footer-nav-link">
                    About Us
                  </Link>
                </li>
                <li>
                  <Link to="/careers" className="footer-nav-link">
                    Careers
                  </Link>
                </li>
                <li>
                  <Link to="/contact" className="footer-nav-link">
                    Contact Us
                  </Link>
                </li>
                <li>
                  <Link to="/privacy" className="footer-nav-link">
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link to="/terms" className="footer-nav-link">
                    Terms & Conditions
                  </Link>
                </li>
              </ul>
            </nav>
          </div>
        </div>
        <div className="footer-bottom">
          <p className="copyright">© {currentYear} JET SETTERS. All rights reserved.</p>
          <div className="social-links">
            <a
              href="https://www.facebook.com/people/Jetsetters/61557536332731/?ref=pl_edit_xav_ig_profile_page_web"
              target="_blank"
              rel="noopener noreferrer"
              className="social-link"
              aria-label="Facebook"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="social-icon"
              >
                <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path>
              </svg>
            </a>
            <a
              href="https://www.instagram.com/jetsetters_global/"
              target="_blank"
              rel="noopener noreferrer"
              className="social-link"
              aria-label="Instagram"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="social-icon"
              >
                <rect width="20" height="20" x="2" y="2" rx="5" ry="5"></rect>
                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
                <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
              </svg>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer; 