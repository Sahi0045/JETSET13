import React from 'react';
import { Link } from 'react-router-dom';
import { FaShieldAlt, FaGlobeAmericas, FaTags, FaArrowLeft } from 'react-icons/fa';
import './loginV2.css';

const LOGO_WEBP = '/images/logos/WhatsApp_Image_2026-01-22_at_12.05.24_AM-removebg-preview.webp';
const LOGO_PNG = '/images/logos/WhatsApp_Image_2026-01-22_at_12.05.24_AM-removebg-preview.png';

/**
 * The brand-teal frame that sign-in, sign-up and the password pages share: the
 * teal brand panel beside the form on a laptop, a teal band above it on a
 * phone. Each page puts its own heading, form and links inside.
 */
export default function AuthShell({ children }) {
    return (
        <div className="jsl-page">
            <div className="jsl-card">
                {/* ---------- Brand / Hero panel ---------- */}
                <aside className="jsl-hero">
                    <div className="jsl-hero-overlay" />
                    <div className="jsl-hero-content">
                        <Link to="/" className="jsl-hero-brand" aria-label="Jetsetters home">
                            <picture>
                                <source srcSet={LOGO_WEBP} type="image/webp" />
                                <img src={LOGO_PNG} alt="Jetsetters" className="jsl-hero-logo" />
                            </picture>
                        </Link>

                        <h1 className="jsl-hero-title">
                            Your next journey<br />begins here.
                        </h1>
                        <p className="jsl-hero-subtitle">
                            Flights, hotels, cruises and curated holidays — all in one place,
                            tailored to the way you travel.
                        </p>

                        <ul className="jsl-hero-features">
                            <li>
                                <span className="jsl-feature-icon"><FaGlobeAmericas /></span>
                                <span>Explore worldwide destinations with confidence</span>
                            </li>
                            <li>
                                <span className="jsl-feature-icon"><FaTags /></span>
                                <span>Member-only fares and seasonal deals</span>
                            </li>
                            <li>
                                <span className="jsl-feature-icon"><FaShieldAlt /></span>
                                <span>Secure, SSL-encrypted bookings</span>
                            </li>
                        </ul>
                    </div>
                </aside>

                {/* ---------- Form panel ---------- */}
                <main className="jsl-form-panel">
                    <div className="jsl-form-inner">
                        <Link to="/" className="jsl-back">
                            <FaArrowLeft size={12} /> Back to home
                        </Link>

                        {/* Teal brand header for mobile (full hero hidden on small screens) */}
                        <div className="jsl-mobile-hero">
                            <Link to="/" className="jsl-mobile-brand" aria-label="Jetsetters home">
                                <picture>
                                    <source srcSet={LOGO_WEBP} type="image/webp" />
                                    <img src={LOGO_PNG} alt="Jetsetters" />
                                </picture>
                            </Link>
                            <p className="jsl-mobile-tagline">Your next journey begins here.</p>
                        </div>

                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
}
