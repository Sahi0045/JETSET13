import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './Navbar.css';
import CurrencySelector from '../../Components/CurrencySelector';
import { useFirebaseAuth } from '../../contexts/FirebaseAuthContext';

const Navbar = ({ forceScrolled }) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(forceScrolled || false);
  
  // Use Firebase authentication
  const { user, isAuthenticated, signOut, loading } = useFirebaseAuth();

  useEffect(() => {
    
    // Add scroll event listener only if not force scrolled
    if (!forceScrolled) {
      const handleScroll = () => {
        // When scrolled below hero section (using 100px as threshold)
        const scrolled = window.scrollY > 100;
        if (scrolled !== isScrolled) {
          setIsScrolled(scrolled);
        }
      };
      
      window.addEventListener('scroll', handleScroll);
      
      // Call once to set initial state
      handleScroll();
      
      return () => {
        window.removeEventListener('scroll', handleScroll);
      };
    }
  }, [isScrolled, forceScrolled]);
  
  // Update isScrolled if forceScrolled prop changes
  useEffect(() => {
    if (forceScrolled) {
      setIsScrolled(true);
    }
  }, [forceScrolled]);

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const handleLogin = () => {
    window.location.href = '/firebase-login';
  };

  const handleProfile = () => {
    window.location.href = '/firebase-profile';
    setIsDropdownOpen(false);
  };

  const handleLogout = async () => {
    try {
      await signOut();
      setIsDropdownOpen(false);
      window.location.href = '/';
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <nav className={`navbar ${isScrolled || forceScrolled ? 'scrolled' : 'transparent'}`}>
      <div className="navbar-left">
        <Link to="/" className="logo-link">
          <div className="logo">
            <img src="images/jetset.jpeg" alt="JET SETTERS" />
          </div>
        </Link>
      </div>

      {/* Desktop navigation */}
      <div className="navbar-center">
        <Link to="/" className="nav-link">
          Cruise
        </Link>
        <Link to="/flights" className="nav-link">
          Flight
        </Link>
        <Link to="/packages" className="nav-link">
          Packages
        </Link>
        <Link to="/rental" className="nav-link">
          Hotels
        </Link>
        <Link to="/my-trips" className="nav-link">
          My Trips
        </Link>
      </div>

      <div className="navbar-right">
        {/* Currency Selector */}
        <div className="currency-selector-container mr-4">
          <CurrencySelector />
        </div>

        {loading ? (
          <div className="profile-container">
            <div className="profile-button loading">
              <div className="loading-spinner"></div>
            </div>
          </div>
        ) : isAuthenticated ? (
          <div className="profile-container">
            <button 
              className="profile-button" 
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            >
              {user?.photoURL ? (
                <img 
                  src={user.photoURL} 
                  alt="Profile" 
                  className="profile-avatar"
                />
              ) : (
                <div className="profile-icon">
                  <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke="currentColor" 
                    strokeWidth="2" 
                    strokeLinecap="round" 
                    strokeLinejoin="round"
                  >
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                  </svg>
                </div>
              )}
              <span className="profile-name">
                {user?.displayName || user?.email?.split('@')[0] || 'User'}
              </span>
            </button>
            {isDropdownOpen && (
              <div className="profile-dropdown">
                <div className="profile-info">
                  <p className="profile-info-name">{user?.displayName || 'User'}</p>
                  <p className="profile-info-email">{user?.email}</p>
                </div>
                <div className="profile-divider"></div>
                <button onClick={handleProfile}>
                  <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke="currentColor" 
                    strokeWidth="2" 
                    strokeLinecap="round" 
                    strokeLinejoin="round"
                  >
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                  </svg>
                  Profile
                </button>
                <button onClick={handleLogout}>
                  <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke="currentColor" 
                    strokeWidth="2" 
                    strokeLinecap="round" 
                    strokeLinejoin="round"
                  >
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                    <polyline points="16 17 21 12 16 7"></polyline>
                    <line x1="21" y1="12" x2="9" y2="12"></line>
                  </svg>
                  Logout
                </button>
              </div>
            )}
          </div>
        ) : (
          <button className="login-button" onClick={handleLogin}>
            Login/Signup
          </button>
        )}

        {/* Mobile menu button */}
        <button className="mobile-menu-button" onClick={toggleMobileMenu}>
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round"
            className={isMobileMenuOpen ? "hidden" : ""}
          >
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round"
            className={isMobileMenuOpen ? "" : "hidden"}
          >
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      <div className={`mobile-menu ${isMobileMenuOpen ? 'open' : ''}`}>
        <div className="mobile-menu-links">
          <Link to="/" className="mobile-nav-link" onClick={() => setIsMobileMenuOpen(false)}>
            Cruise
          </Link>
          <Link to="/flights" className="mobile-nav-link" onClick={() => setIsMobileMenuOpen(false)}>
            Flight
          </Link>
          <Link to="/packages" className="mobile-nav-link" onClick={() => setIsMobileMenuOpen(false)}>
            Packages
          </Link>
          <Link to="/rental" className="mobile-nav-link" onClick={() => setIsMobileMenuOpen(false)}>
            Rental
          </Link>
          <Link to="/my-trips" className="mobile-nav-link" onClick={() => setIsMobileMenuOpen(false)}>
            My Trips
          </Link>
          
          {/* Add Currency Selector to mobile menu */}
          <div className="mobile-currency-selector py-2 border-t border-gray-200 mt-2">
            <div className="px-4 py-2 text-sm text-gray-500">Select Currency</div>
            <div className="px-4">
              <CurrencySelector />
            </div>
          </div>
          
          {!isAuthenticated && (
            <button className="mobile-login-button" onClick={handleLogin}>
              Login
            </button>
          )}
          
          {isAuthenticated && (
            <>
              <button onClick={handleProfile} className="mobile-profile-button">
                Profile
              </button>
              <button onClick={handleLogout} className="mobile-logout-button">
                Logout
              </button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar; 