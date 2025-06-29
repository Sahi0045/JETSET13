// CSS imports moved to main.jsx entry point

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

// Fallback components
const LoadingComponent = () => <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>Loading...</div>;

const DashboardFallback = () => (
  <div style={{ padding: '50px', textAlign: 'center' }}>
    <h1>Dashboard</h1>
    <p>Your dashboard is loading...</p>
    <a href="/" style={{ display: 'inline-block', marginTop: '20px', padding: '10px 20px', background: '#0066B2', color: 'white', textDecoration: 'none', borderRadius: '4px' }}>
      Back to Home
    </a>
  </div>
);

const WelcomeFallback = () => (
  <div style={{ padding: '50px', textAlign: 'center' }}>
    <h1>Welcome to JetSet</h1>
    <p>Loading homepage content...</p>
  </div>
);

const ErrorFallback = () => (
  <div style={{ padding: '50px', textAlign: 'center' }}>
    <h1>404 - Page Not Found</h1>
    <p>The page you are looking for does not exist.</p>
    <a href="/" style={{ display: 'inline-block', marginTop: '20px', padding: '10px 20px', background: '#0066B2', color: 'white', textDecoration: 'none', borderRadius: '4px' }}>
      Back to Home
    </a>
  </div>
);

// // Dynamic imports with fallbacks
const Dashboard = React.lazy(() => 
  import('./Pages/Dashboard')
    .catch(() => ({ default: DashboardFallback }))
);

const Welcome = React.lazy(() => 
  import('./Pages/Welcome')
    .catch(() => ({ default: WelcomeFallback }))
);

const Error = React.lazy(() => 
  import('./Pages/Error')
    .catch(() => ({ default: ErrorFallback }))
);

// // Cruise fallback components
// const CruiseCardsFallback = () => (
//   <div style={{ padding: '50px', textAlign: 'center' }}>
//     <h1>Cruise Options</h1>
//     <p>Available cruise options will appear here.</p>
//     <a href="/" style={{ display: 'inline-block', marginTop: '20px', padding: '10px 20px', background: '#0066B2', color: 'white', textDecoration: 'none', borderRadius: '4px' }}>
//       Back to Home
//     </a>
//   </div>
// );

// const ItineraryFallback = () => (
//   <div style={{ padding: '50px', textAlign: 'center' }}>
//     <h1>Cruise Itinerary</h1>
//     <p>Detailed itinerary will appear here.</p>
//     <a href="/cruises" style={{ display: 'inline-block', marginTop: '20px', padding: '10px 20px', background: '#0066B2', color: 'white', textDecoration: 'none', borderRadius: '4px' }}>
//       Back to Cruises
//     </a>
//   </div>
// );

// // Import CruiseBookingSummary component
// const CruiseBookingSummary = React.lazy(() => 
//   import('./Pages/Common/cruise/CruiseBookingSummary')
//     .catch(() => ({ default: () => <div>Loading Booking Summary...</div> })));

// // Import cruise-related pages with error handling
// const CruiseCards = React.lazy(() => 
//   import('./Pages/Common/cruise/cruise-cards')
//     .catch(() => ({ default: CruiseCardsFallback }))
// );

// const Itinerary = React.lazy(() => 
//   import('./Pages/Common/cruise/Itinerary')
//     .catch(() => ({ default: ItineraryFallback }))
// );

// // Additional placeholder components for nav links
// const FlightsFallback = () => (
//   <div style={{ padding: '50px', textAlign: 'center' }}>
//     <h1>Flights</h1>
//     <p>Flight booking options will appear here.</p>
//     <a href="/" style={{ display: 'inline-block', marginTop: '20px', padding: '10px 20px', background: '#0066B2', color: 'white', textDecoration: 'none', borderRadius: '4px' }}>
//       Back to Home
//     </a>
//   </div>
// );

// const PackagesFallback = () => (
//   <div style={{ padding: '50px', textAlign: 'center' }}>
//     <h1>Vacation Packages</h1>
//     <p>Package options will appear here.</p>
//     <a href="/" style={{ display: 'inline-block', marginTop: '20px', padding: '10px 20px', background: '#0066B2', color: 'white', textDecoration: 'none', borderRadius: '4px' }}>
//       Back to Home
//     </a>
//   </div>
// );

// const RentalsFallback = () => (
//   <div style={{ padding: '50px', textAlign: 'center' }}>
//     <h1>Rentals</h1>
//     <p>Car and property rental options will appear here.</p>
//     <a href="/" style={{ display: 'inline-block', marginTop: '20px', padding: '10px 20px', background: '#0066B2', color: 'white', textDecoration: 'none', borderRadius: '4px' }}>
//       Back to Home
//     </a>
//   </div>
// );



// const HotelDetailsFallback = () => (
//   <div style={{ padding: '50px', textAlign: 'center' }}>
//     <h1>Hotel Details</h1>
//     <p>Hotel details will appear here.</p>
//     <a href="/rental" style={{ display: 'inline-block', marginTop: '20px', padding: '10px 20px', background: '#0066B2', color: 'white', textDecoration: 'none', borderRadius: '4px' }}>
//       Back to Rentals
//     </a>
//   </div>
// );

// const Flights = React.lazy(() => Promise.resolve({ default: FlightsFallback }));
// const Packages = React.lazy(() => 
//   import('./Pages/Common/packages/planding')
//     .catch(() => ({ default: PackagesFallback }))
// );
// const Rentals = React.lazy(() => 
//   import('./Pages/Common/rentals/LandingPage.jsx')
//     .catch(() => ({ default: RentalsFallback }))
// );

// const HotelDetails = React.lazy(() => 
//   import('./Pages/Common/rentals/HotelDetails.jsx')
//     .catch(() => ({ default: HotelDetailsFallback }))
// );

// const HotelSearch = React.lazy(() => 
//   import('./Pages/Common/rentals/HotelSearch.jsx')
//     .catch(() => ({ default: HotelDetailsFallback }))
// );

// const HotelSearchResults = React.lazy(() => 
//   import('./Pages/Common/rentals/HotelSearchResults.jsx')
//     .catch(() => ({ default: HotelDetailsFallback }))
// );

// // Import FlightLanding component
// const FlightLanding = React.lazy(() => 
//   import('./Pages/Common/flights/flightlanding')
//     .catch(() => ({ default: FlightsFallback }))
// );

// // Import FlightSearchPage component
// const FlightSearchPage = React.lazy(() => 
//   import('./Pages/Common/flights/flightsearchpage')
//     .catch(() => ({ default: FlightsFallback }))
// );

// // Add ItineraryPackage and PackageBookingSummary imports
// const ItineraryPackage = React.lazy(() => 
//   import('./Pages/Common/packages/itp')
//     .catch(() => ({ default: () => <div>Loading Itinerary...</div> })));

// const PackageBookingSummary = React.lazy(() => 
//   import('./Pages/Common/packages/PackageBookingSummary')
//     .catch(() => ({ default: () => <div>Loading Package Booking Summary...</div> }))
// );

// // New pages for footer links
// const PrivacyFallback = () => (
//   <div style={{ padding: '50px', textAlign: 'center' }}>
//     <h1>Privacy Policy</h1>
//     <p>Loading Privacy Policy...</p>
//     <a href="/" style={{ display: 'inline-block', marginTop: '20px', padding: '10px 20px', background: '#0066B2', color: 'white', textDecoration: 'none', borderRadius: '4px' }}>
//       Back to Home
//     </a>
//   </div>
// );

// const TermsFallback = () => (
//   <div style={{ padding: '50px', textAlign: 'center' }}>
//     <h1>Terms of Service</h1>
//     <p>Loading Terms of Service...</p>
//     <a href="/" style={{ display: 'inline-block', marginTop: '20px', padding: '10px 20px', background: '#0066B2', color: 'white', textDecoration: 'none', borderRadius: '4px' }}>
//       Back to Home
//     </a>
//   </div>
// );

// const CookiesFallback = () => (
//   <div style={{ padding: '50px', textAlign: 'center' }}>
//     <h1>Cookie Policy</h1>
//     <p>Loading Cookie Policy...</p>
//     <a href="/" style={{ display: 'inline-block', marginTop: '20px', padding: '10px 20px', background: '#0066B2', color: 'white', textDecoration: 'none', borderRadius: '4px' }}>
//       Back to Home
//     </a>
//   </div>
// );

// const CareersFallback = () => (
//   <div style={{ padding: '50px', textAlign: 'center' }}>
//     <h1>Careers</h1>
//     <p>Loading career opportunities...</p>
//     <a href="/" style={{ display: 'inline-block', marginTop: '20px', padding: '10px 20px', background: '#0066B2', color: 'white', textDecoration: 'none', borderRadius: '4px' }}>
//       Back to Home
//     </a>
//   </div>
// );

// // Import new pages with error handling
// const Privacy = React.lazy(() => 
//   import('./Pages/Privacy')
//     .catch(() => ({ default: PrivacyFallback }))
// );

// const Terms = React.lazy(() => 
//   import('./Pages/Terms')
//     .catch(() => ({ default: TermsFallback }))
// );

// const Cookies = React.lazy(() => 
//   import('./Pages/Cookies')
//     .catch(() => ({ default: CookiesFallback }))
// );

// const Careers = React.lazy(() => 
//   import('./Pages/Careers')
//     .catch(() => ({ default: CareersFallback }))
// );

// Import login page component
const LoginFallback = () => (
  <div style={{ padding: '50px', textAlign: 'center' }}>
    <h1>Login</h1>
    <p>Loading login page...</p>
    <a href="/" style={{ display: 'inline-block', marginTop: '20px', padding: '10px 20px', background: '#0066B2', color: 'white', textDecoration: 'none', borderRadius: '4px' }}>
      Back to Home
    </a>
  </div>
);

// Login page import
const Login = React.lazy(() => 
  import('./Pages/Common/login/login')
    .catch(() => ({ default: LoginFallback }))
);

// Signup page fallback
const SignupFallback = () => (
  <div style={{ padding: '50px', textAlign: 'center' }}>
    <h1>Sign Up</h1>
    <p>Loading signup page...</p>
    <a href="/" style={{ display: 'inline-block', marginTop: '20px', padding: '10px 20px', background: '#0066B2', color: 'white', textDecoration: 'none', borderRadius: '4px' }}>
      Back to Home
    </a>
  </div>
);

// Signup page import
const Signup = React.lazy(() => 
  import('./Pages/Common/login/signup')
    .catch(() => ({ default: SignupFallback }))
);

// // Import FlightBookingConfirmation component
// const FlightBookingConfirmation = React.lazy(() => 
//   import('./Pages/Common/flights/FlightBookingConfirmation')
//     .catch(() => ({ default: () => <div>Loading Booking Confirmation...</div> }))
// );

// // Add the imports for FlightPayment and FlightBookingSuccess components
// const FlightPayment = React.lazy(() => 
//   import('./Pages/Common/flights/FlightPayment')
//     .catch(() => ({ default: () => <div>Loading Payment Page...</div> }))
// );

// const FlightBookingSuccess = React.lazy(() => 
//   import('./Pages/Common/flights/FlightBookingSuccess')
//     .catch(() => ({ default: () => <div>Loading Booking Success Page...</div> }))
// );

// // Import FlightCreateOrders component for handling Amadeus API order creation
// const FlightCreateOrders = React.lazy(() => 
//   import('./Pages/Common/flights/FlightCreateOrders')
//     .catch(() => ({ default: () => <div>Processing Your Booking...</div> }))
// );

// Import profiledashboard component
const ProfileDashboard = React.lazy(() => 
  import('./Pages/Common/login/profiledashboard')
    .catch(() => ({ default: () => <div>Loading Profile Dashboard...</div> }))
);

// Import mytrips component
const MyTripsPage = React.lazy(() => 
  import('./Pages/Common/login/mytrips')
    .catch(() => ({ default: () => <div>Loading My Trips Page...</div> }))
);

// Import ManageBooking component
const ManageBooking = React.lazy(() => 
  import('./Pages/Common/flights/ManageBooking')
    .catch(() => ({ default: () => <div>Loading Manage Booking...</div> }))
);

// // Add Booking component import
// const Booking = React.lazy(() => 
//   import('./Pages/Common/rentals/Booking')
//     .catch(() => ({ default: () => <div>Loading Booking...</div> }))
// );

// Add BookingConfirmation component import
const BookingConfirmation = React.lazy(() => 
  import('./Pages/Common/BookingConfirmation')
    .catch(() => ({ default: () => <div>Loading Booking Confirmation...</div> }))
);

// Import the actual components
const CruiseCards = React.lazy(() => 
  import('./Pages/Common/cruise/cruise-cards')
    .catch(() => ({ default: () => <div>Loading Cruise Cards...</div> }))
);

const Itinerary = React.lazy(() => 
  import('./Pages/Common/cruise/Itinerary')
    .catch(() => ({ default: () => <div>Loading Itinerary...</div> }))
);

const CruiseBookingSummary = React.lazy(() => 
  import('./Pages/Common/cruise/CruiseBookingSummary')
    .catch(() => ({ default: () => <div>Loading Cruise Booking Summary...</div> }))
);

const Flights = React.lazy(() => 
  import('./Pages/Common/flights/flightsearchpage')
    .catch(() => ({ default: () => <div>Loading Flights...</div> }))
);

const FlightLanding = React.lazy(() => 
  import('./Pages/Common/flights/flightlanding')
    .catch(() => ({ default: () => <div>Loading Flight Landing...</div> }))
);

const FlightSearchPage = React.lazy(() => 
  import('./Pages/Common/flights/flightsearchpage')
    .catch(() => ({ default: () => <div>Loading Flight Search...</div> }))
);

const FlightBookingConfirmation = React.lazy(() => 
  import('./Pages/Common/flights/FlightBookingConfirmation')
    .catch(() => ({ default: () => <div>Loading Flight Booking Confirmation...</div> }))
);

const FlightPayment = React.lazy(() => 
  import('./Pages/Common/flights/FlightPayment')
    .catch(() => ({ default: () => <div>Loading Flight Payment...</div> }))
);

const FlightCreateOrders = React.lazy(() => 
  import('./Pages/Common/flights/FlightCreateOrders')
    .catch(() => ({ default: () => <div>Loading Flight Create Orders...</div> }))
);

const FlightBookingSuccess = React.lazy(() => 
  import('./Pages/Common/flights/FlightBookingSuccess')
    .catch(() => ({ default: () => <div>Loading Flight Booking Success...</div> }))
);

const Packages = React.lazy(() => 
  import('./Pages/Common/packages/planding')
    .catch(() => ({ default: () => <div>Loading Packages...</div> }))
);

const Rentals = React.lazy(() => 
  import('./Pages/Common/rentals/LandingPage.jsx')
    .catch(() => ({ default: () => <div>Loading Rentals...</div> }))
);

const HotelDetails = React.lazy(() => 
  import('./Pages/Common/rentals/HotelDetails.jsx')
    .catch(() => ({ default: () => <div>Loading Hotel Details...</div> }))
);

const HotelSearch = React.lazy(() => 
  import('./Pages/Common/rentals/HotelSearch.jsx')
    .catch(() => ({ default: () => <div>Loading Hotel Search...</div> }))
);

const HotelSearchResults = React.lazy(() => 
  import('./Pages/Common/rentals/HotelSearchResults.jsx')
    .catch(() => ({ default: () => <div>Loading Hotel Search Results...</div> }))
);

const Booking = React.lazy(() => 
  import('./Pages/Common/rentals/Booking')
    .catch(() => ({ default: () => <div>Loading Booking...</div> }))
);

const ItineraryPackage = React.lazy(() => 
  import('./Pages/Common/packages/itp')
    .catch(() => ({ default: () => <div>Loading Itinerary Package...</div> }))
);

const PackageBookingSummary = React.lazy(() => 
  import('./Pages/Common/packages/PackageBookingSummary')
    .catch(() => ({ default: () => <div>Loading Package Booking Summary...</div> }))
);

const Privacy = React.lazy(() => 
  import('./Pages/Privacy')
    .catch(() => ({ default: () => <div>Loading Privacy Policy...</div> }))
);

const Terms = React.lazy(() => 
  import('./Pages/Terms')
    .catch(() => ({ default: () => <div>Loading Terms of Service...</div> }))
);

const Cookies = React.lazy(() => 
  import('./Pages/Cookies')
    .catch(() => ({ default: () => <div>Loading Cookie Policy...</div> }))
);

const Careers = React.lazy(() => 
  import('./Pages/Careers')
    .catch(() => ({ default: () => <div>Loading Careers...</div> }))
);

const App = () => {
  return (
    <React.Suspense fallback={<LoadingComponent />}>
      <Routes>
        <Route path="/" element={<Welcome />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/profiledashboard" element={<ProfileDashboard />} />
        <Route path="/my-trips" element={<MyTripsPage />} />
        <Route path="/manage-booking/:bookingId" element={<ManageBooking />} />
        <Route path="/manage-booking" element={<ManageBooking />} />
        <Route path="/forgot-password" element={<Navigate to="/login" />} />
        <Route path="/booking-confirmation" element={<BookingConfirmation />} />
        <Route path="/cruises" element={<CruiseCards />} />
        <Route path="/itinerary" element={<Itinerary />} />
        <Route path="/cruise-booking-summary" element={<CruiseBookingSummary />} />
        <Route path="/flight" element={<Flights />} />
        <Route path="/flights" element={<FlightLanding />} />
        <Route path="/flights/search" element={<FlightSearchPage />} />
        <Route path="/flights/booking/:bookingId" element={<FlightBookingConfirmation />} />
        <Route path="/flights/booking-confirmation" element={<FlightBookingConfirmation />} />
        <Route path="/flight-payment" element={<FlightPayment />} />
        <Route path="/flight-create-orders" element={<FlightCreateOrders />} />
        <Route path="/flight-booking-success" element={<FlightBookingSuccess />} />
        <Route path="/packages" element={<Packages />} />
        <Route path="/rental" element={<Rentals />} />
        <Route path="/hotel-details" element={<HotelDetails />} />
        <Route path="/hotel-search" element={<HotelSearch />} />
        <Route path="/hotel-search-results" element={<HotelSearchResults />} />
        <Route path="/rental/booking" element={<Booking />} />
        
        {/* Package Routes */}
        <Route path="/packages/itinerary" element={<ItineraryPackage />} />
        <Route path="/packages/booking-summary" element={<PackageBookingSummary />} />
        
        {/* Footer Pages */}
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/cookies" element={<Cookies />} />
        <Route path="/careers" element={<Careers />} />
        <Route path="/about" element={<Navigate to="/" />} /> {/* Placeholder redirect */}
        <Route path="/contact" element={<Navigate to="/" />} /> {/* Placeholder redirect */}
        <Route path="/cruise-booking" element={<Navigate to="/cruises" />} /> {/* Redirect to cruises */}
        <Route path="/blog" element={<Navigate to="/" />} /> {/* Placeholder redirect */}
        <Route path="/reviews" element={<Navigate to="/" />} /> {/* Placeholder redirect */}
        <Route path="/covid-updates" element={<Navigate to="/" />} /> {/* Placeholder redirect */}
        <Route path="/special-offers" element={<Navigate to="/" />} /> {/* Placeholder redirect */}
        <Route path="/destinations/:destination" element={<Navigate to="/cruises" />} /> {/* Redirect to cruises */}
        <Route path="/secure-booking" element={<Navigate to="/privacy" />} /> {/* Redirect to privacy */}
        <Route path="/support" element={<Navigate to="/contact" />} /> {/* Redirect to contact */}
        
        <Route path="/404" element={<Error />} />
        <Route path="*" element={<Navigate to="/404" />} />
      </Routes>
    </React.Suspense>
  );
};

// Export the App component as default
export default App;
