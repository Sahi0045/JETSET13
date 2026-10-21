import React, { useEffect, useState } from 'react';
import HeroSection from './HeroSection';
import DestinationSection from './DestinationSection';
import CruiseLineSection from './CruiseLineSection';
import Navbar from '../Navbar';
import Footer from '../Footer';
import withPageElements from '../PageWrapper';
import CruiseFeatureBanner from './CruiseFeatureBanner';
import CruiseFAQ from './CruiseFAQ';
import { Sparkles } from 'lucide-react';

// CSS for page and section styling
const styles = {
  homePageWrapper: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100vh',
    width: '100%',
    overflowX: 'hidden',
  },
  main: {
    flex: '1 0 auto',
  },
  section: {
    marginTop: '1.5rem',
    marginBottom: '1.5rem',
    scrollMarginTop: '80px', // For smooth scrolling with fixed header
  },
  firstSection: {
    marginTop: '0',
  },
  lastSection: {
    marginBottom: '0',
  }
};

const TrustIndicators = () => {
  const logos = [
    { src: '/images/logos/amadeus.svg', alt: 'Amadeus' },
    { src: '/images/logos/arc-pay-gateway.png', alt: 'ARC Pay Gateway' },
    { src: '/images/logos/royal_caribbean.png', webp: '/images/logos/royal_caribbean.webp', alt: 'Royal Caribbean' },
    { src: '/images/logos/carnival.png', webp: '/images/logos/carnival.webp', alt: 'Carnival' },
    { src: '/images/logos/norwegian.png', webp: '/images/logos/norwegian.webp', alt: 'Norwegian Cruise Line' },
    { src: '/images/logos/disney_cruise.png', webp: '/images/logos/disney_cruise.webp', alt: 'Disney Cruise Line' }
  ];

  return (
    <div className="py-8 md:py-12 bg-gradient-to-b from-[#eef7fb] to-white">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-center gap-3 md:gap-5 mb-7 md:mb-9">
          <span className="flex-1 max-w-[48px] sm:max-w-[80px] md:max-w-[140px] h-px bg-gradient-to-r from-transparent to-[#055B75]/40"></span>
          <p className="text-[11px] sm:text-sm md:text-base font-extrabold text-[#055B75] uppercase tracking-[0.12em] md:tracking-[0.2em] text-center leading-snug">
            Trusted Payment &amp; Cruise Line Partners
          </p>
          <span className="flex-1 max-w-[48px] sm:max-w-[80px] md:max-w-[140px] h-px bg-gradient-to-l from-transparent to-[#055B75]/40"></span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
          {logos.map((logo, index) => (
            <div
              key={index}
              className="flex items-center justify-center h-20 md:h-24 rounded-xl bg-white border border-slate-100 shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 p-2.5"
            >
              <picture>
                {logo.webp && <source srcSet={logo.webp} type="image/webp" />}
                <img
                  loading="lazy"
                  decoding="async"
                  src={logo.src}
                  alt={logo.alt}
                  className="h-auto w-auto max-h-14 md:max-h-16 max-w-[88%] object-contain"
                />
              </picture>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const HomePage = () => {
  const [isMobileView, setIsMobileView] = useState(window.innerWidth < 768);
  useEffect(() => {
    // Scroll to top when component mounts
    window.scrollTo(0, 0);

    // Add smooth scrolling for better UX
    document.documentElement.style.scrollBehavior = 'smooth';

    // Handle screen resize for mobile detection
    const handleResize = () => {
      setIsMobileView(window.innerWidth < 768);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      document.documentElement.style.scrollBehavior = 'auto';
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <>
      <Navbar />
      <div className="home-page-wrapper" style={styles.homePageWrapper}>


        {/* Special Offer Banner - positioned with absolute for better placement */}
        <div className="relative">
          <div className={`w-full text-center bg-gradient-to-r from-[#055B75] to-[#034457] py-2 backdrop-blur-sm z-20 border-y border-white/10 ${isMobileView ? 'px-3' : ''}`}>
            <div className="container mx-auto px-4 py-1 flex justify-center items-center">
              <Sparkles className="h-4 w-4 text-yellow-300 mr-2 flex-shrink-0" />
              <p className={`text-white ${isMobileView ? 'text-[10px]' : 'text-sm'} font-medium tracking-wide text-center leading-tight`}>
                <span className="font-bold">Self-Service Portal Coming Soon!</span> For bookings, call <span className="text-yellow-300 font-bold">(877) 538-7380</span> or email <a href="mailto:support@jetsetterss.com" className="underline text-yellow-300 font-bold">support@jetsetterss.com</a>.
              </p>
            </div>
          </div>
        </div>

        {/* Main content */}
        <main style={styles.main} className="bg-[#F4F7F8]">
          {/* Hero Section - immediately below navbar */}
          <section id="hero" style={styles.firstSection}>
            <HeroSection />
          </section>

          {/* MMT-style "Cruise" feature banner */}
          <section id="cruise-banner" className="pt-8 md:pt-10">
            <CruiseFeatureBanner />
          </section>

          {/* Most-booked Cruise Destinations */}
          <section id="destinations">
            <DestinationSection />
          </section>

          {/* Our Featured Cruise Lines */}
          <section id="cruise-lines">
            <CruiseLineSection />
          </section>

          {/* Cruise FAQs */}
          <section id="cruise-faq">
            <CruiseFAQ />
          </section>

          {/* Payment and cruise line logos */}
          <section className="bg-white">
            <TrustIndicators />
          </section>



          {/* Newsletter signup is provided once, in the global Footer (Subscribe & Save),
              to avoid a duplicate email form stacking on top of it on mobile. */}
        </main>

        {/* <PopularPorts /> */}

        {/* <NewsletterSection /> */}




        {/* Mobile scroll to top button - only visible on small screens */}
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-6 right-6 bg-[#055B75] text-white p-3 rounded-full shadow-lg z-50 hover:bg-[#034457] transition-colors md:hidden"
          aria-label="Scroll to top"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
      <Footer />
    </>
  );
};

export default withPageElements(HomePage);
