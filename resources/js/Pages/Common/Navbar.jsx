import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import './Navbar.css';
import CurrencySelector from '../../Components/CurrencySelector';
import { useSupabaseAuth } from '../../contexts/SupabaseAuthContext';

const Navbar = ({ forceScrolled }) => {
  const location = useLocation();
  const { user: authUser, isAuthenticated: supabaseAuth, signOut } = useSupabaseAuth();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(forceScrolled || false);
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  // Helper to check if link is active
  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  // Check authentication from Supabase context and localStorage
  useEffect(() => {
    const authStatus = localStorage.getItem('isAuthenticated') === 'true';
    const userData = localStorage.getItem('user');

    // Use Supabase auth state if available, otherwise fall back to localStorage
    setIsAuthenticated(supabaseAuth || authStatus);

    if (authUser) {
      // Use Supabase user data
      setUser({
        id: authUser.id,
        email: authUser.email,
        firstName: authUser.user_metadata?.first_name || authUser.user_metadata?.full_name?.split(' ')[0] || '',
        lastName: authUser.user_metadata?.last_name || authUser.user_metadata?.full_name?.split(' ')[1] || '',
        photoURL: authUser.user_metadata?.avatar_url || authUser.user_metadata?.picture,
      });
    } else if (userData) {
      try {
        setUser(JSON.parse(userData));
      } catch (error) {
        console.error('Error parsing user data:', error);
      }
    }
    setLoading(false);
  }, [authUser, supabaseAuth]);

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
    window.location.href = '/login';
  };

  const handleProfile = () => {
    window.location.href = '/profiledashboard';
    setIsDropdownOpen(false);
  };

  const handleLogout = async () => {
    try {
      setIsDropdownOpen(false);

      // Sign out from Supabase
      const { error } = await signOut();

      if (error) {
        console.error('Supabase logout error:', error);
      }

      // Clear all localStorage
      localStorage.removeItem('isAuthenticated');
      localStorage.removeItem('user');
      localStorage.removeItem('token');
      localStorage.removeItem('adminToken');
      localStorage.removeItem('supabase_token');
      localStorage.removeItem('userData');

      // Update local state
      setIsAuthenticated(false);
      setUser(null);

      // Redirect to home page
      window.location.href = '/';
    } catch (error) {
      console.error('Logout error:', error);
      // Still clear localStorage and redirect even if there's an error
      localStorage.clear();
      window.location.href = '/';
    }
  };

  return (
    <nav className={`navbar ${isScrolled || forceScrolled ? 'scrolled' : ''}`}>
      <div className="navbar-left">
        <Link to="/" className="logo-link">
          <div className="logo">
            <img
              src="/images/logos/WhatsApp_Image_2026-01-22_at_12.05.24_AM-removebg-preview.png"
              alt="JET SETTERS"
              className="h-16 w-auto object-contain"
            />
          </div>
        </Link>
      </div>

      {/* Desktop navigation */}
      {/* Desktop navigation moved to right */}

      <div className="navbar-right">
        <div className="desktop-nav-links flex items-center gap-8 mr-8 hidden lg:flex">
          <Link to="/cruise" className={`nav-link ${isActive('/cruise') ? 'active' : ''}`}>
            Cruise
          </Link>
          <Link to="/flights" className={`nav-link ${isActive('/flights') ? 'active' : ''}`}>
            Flight
          </Link>
          <Link to="/packages" className={`nav-link ${isActive('/packages') ? 'active' : ''}`}>
            Packages
          </Link>
          <Link to="/hotels" className={`nav-link ${isActive('/hotels') ? 'active' : ''}`}>
            Hotels
          </Link>
          <Link to="/my-trips" className={`nav-link ${isActive('/my-trips') ? 'active' : ''}`}>
            My Trips
          </Link>
          <Link to="/request" className={`nav-link ${isActive('/request') ? 'active' : ''}`}>
            Request
          </Link>
        </div>

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
              <span className="profile-name">
                {user?.firstName || user?.email?.split('@')[0] || 'User'}
              </span>
            </button>
            {isDropdownOpen && (
              <div className="profile-dropdown">
                <div className="profile-info">
                  <p className="profile-info-name">{user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : user?.firstName || 'User'}</p>
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
          <Link to="/cruise" className="mobile-nav-link" onClick={() => setIsMobileMenuOpen(false)}>
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
          <Link to="/request" className="mobile-nav-link" onClick={() => setIsMobileMenuOpen(false)}>
            Request
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