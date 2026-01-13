// CSS imports moved to main.jsx entry point

import React from 'react';
import ContactBanner from './components/ContactBanner';
import FullPageBanner from './components/FullPageBanner';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoadingSpinner from './Components/LoadingSpinner';

// Fallback components
// Fallback components
const LoadingComponent = () => <LoadingSpinner fullScreen={true} text="Preparing your journey..." />;

const DashboardFallback = () => <LoadingSpinner fullScreen={true} text="Loading Dashboard..." />;

const WelcomeFallback = () => <LoadingSpinner fullScreen={true} text="Welcome to JetSet..." />;

const ErrorFallback = () => <LoadingSpinner fullScreen={true} text="Loading Error Page..." />;

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
const LoginFallback = () => <LoadingSpinner fullScreen={true} text="Loading Login..." />;

// Login page import
const Login = React.lazy(() =>
  import('./Pages/Common/login/login')
    .catch(() => ({ default: LoginFallback }))
);

// Signup page fallback
const SignupFallback = () => <LoadingSpinner fullScreen={true} text="Loading Sign Up..." />;

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
    .catch(() => ({ default: () => <LoadingSpinner fullScreen={true} text="Loading Profile..." /> }))
);

// Import mytrips component
const MyTripsPage = React.lazy(() =>
  import('./Pages/Common/login/mytrips')
    .catch(() => ({ default: () => <LoadingSpinner fullScreen={true} text="Loading My Trips..." /> }))
);

// Import ManageBooking component
const ManageBooking = React.lazy(() =>
  import('./Pages/Common/flights/ManageBooking')
    .catch(() => ({ default: () => <LoadingSpinner fullScreen={true} text="Loading Manage Booking..." /> }))
);

// // Add Booking component import
// const Booking = React.lazy(() => 
//   import('./Pages/Common/rentals/Booking')
//     .catch(() => ({ default: () => <div>Loading Booking...</div> }))
// );

// Add BookingConfirmation component import
const BookingConfirmation = React.lazy(() =>
  import('./Pages/Common/BookingConfirmation')
    .catch(() => ({ default: () => <LoadingSpinner fullScreen={true} text="Loading Confirmation..." /> }))
);

// Import the actual components
const CruiseCards = React.lazy(() =>
  import('./Pages/Common/cruise/cruise-cards')
    .catch(() => ({ default: () => <LoadingSpinner fullScreen={true} text="Loading Cruises..." /> }))
);

const Itinerary = React.lazy(() =>
  import('./Pages/Common/cruise/Itinerary')
    .catch(() => ({ default: () => <LoadingSpinner fullScreen={true} text="Loading Itinerary..." /> }))
);

const CruiseBookingSummary = React.lazy(() =>
  import('./Pages/Common/cruise/CruiseBookingSummary')
    .catch(() => ({ default: () => <LoadingSpinner fullScreen={true} text="Loading Booking Summary..." /> }))
);

const Flights = React.lazy(() =>
  import('./Pages/Common/flights/flightsearchpage')
    .catch(() => ({ default: () => <LoadingSpinner fullScreen={true} text="Loading Flights..." /> }))
);

const FlightLanding = React.lazy(() =>
  import('./Pages/Common/flights/flightlanding')
    .catch(() => ({ default: () => <LoadingSpinner fullScreen={true} text="Loading Flight Landing..." /> }))
);

const FlightSearchPage = React.lazy(() =>
  import('./Pages/Common/flights/flightsearchpage')
    .catch(() => ({ default: () => <LoadingSpinner fullScreen={true} text="Searching Flights..." /> }))
);

const FlightBookingConfirmation = React.lazy(() =>
  import('./Pages/Common/flights/FlightBookingConfirmation')
    .catch(() => ({ default: () => <LoadingSpinner fullScreen={true} text="Confirming Booking..." /> }))
);

const FlightPayment = React.lazy(() =>
  import('./Pages/Common/flights/FlightPayment')
    .catch(() => ({ default: () => <LoadingSpinner fullScreen={true} text="Processing Payment..." /> }))
);

const FlightCreateOrders = React.lazy(() =>
  import('./Pages/Common/flights/FlightCreateOrders')
    .catch(() => ({ default: () => <LoadingSpinner fullScreen={true} text="Creating Orders..." /> }))
);

const FlightBookingSuccess = React.lazy(() =>
  import('./Pages/Common/flights/FlightBookingSuccess')
    .catch(() => ({ default: () => <LoadingSpinner fullScreen={true} text="Booking Successful..." /> }))
);

const Packages = React.lazy(() =>
  import('./Pages/Common/packages/planding')
    .catch(() => ({ default: () => <LoadingSpinner fullScreen={true} text="Loading Packages..." /> }))
);

const Rentals = React.lazy(() =>
  import('./Pages/Common/rentals/LandingPage.jsx')
    .catch(() => ({ default: () => <LoadingSpinner fullScreen={true} text="Loading Rentals..." /> }))
);

const HotelDetails = React.lazy(() =>
  import('./Pages/Common/rentals/HotelDetails.jsx')
    .catch(() => ({ default: () => <LoadingSpinner fullScreen={true} text="Loading Hotel Details..." /> }))
);

const HotelSearch = React.lazy(() =>
  import('./Pages/Common/rentals/HotelSearch.jsx')
    .catch(() => ({ default: () => <LoadingSpinner fullScreen={true} text="Searching Hotels..." /> }))
);

const HotelSearchResults = React.lazy(() =>
  import('./Pages/Common/rentals/HotelSearchResults.jsx')
    .catch(() => ({ default: () => <LoadingSpinner fullScreen={true} text="Loading Results..." /> }))
);

const Booking = React.lazy(() =>
  import('./Pages/Common/rentals/Booking')
    .catch(() => ({ default: () => <LoadingSpinner fullScreen={true} text="Loading Booking..." /> }))
);

const ItineraryPackage = React.lazy(() =>
  import('./Pages/Common/packages/itp')
    .catch(() => ({ default: () => <LoadingSpinner fullScreen={true} text="Loading Itinerary..." /> }))
);

const PackageBookingSummary = React.lazy(() =>
  import('./Pages/Common/packages/PackageBookingSummary')
    .catch(() => ({ default: () => <LoadingSpinner fullScreen={true} text="Loading Package Booking..." /> }))
);

const Privacy = React.lazy(() =>
  import('./Pages/Privacy')
    .catch(() => ({ default: () => <LoadingSpinner fullScreen={true} text="Loading Privacy Policy..." /> }))
);

const Terms = React.lazy(() =>
  import('./Pages/Terms')
    .catch(() => ({ default: () => <LoadingSpinner fullScreen={true} text="Loading Terms..." /> }))
);

const Cookies = React.lazy(() =>
  import('./Pages/Cookies')
    .catch(() => ({ default: () => <LoadingSpinner fullScreen={true} text="Loading Cookie Policy..." /> }))
);

const Careers = React.lazy(() =>
  import('./Pages/Careers')
    .catch(() => ({ default: () => <LoadingSpinner fullScreen={true} text="Loading Careers..." /> }))
);

// New Footer Pages
const Resources = React.lazy(() =>
  import('./Pages/Resources')
    .catch(() => ({ default: () => <LoadingSpinner fullScreen={true} text="Loading Resources..." /> }))
);

const Destinations = React.lazy(() =>
  import('./Pages/Destinations')
    .catch(() => ({ default: () => <LoadingSpinner fullScreen={true} text="Explore Destinations..." /> }))
);

const TravelBlog = React.lazy(() =>
  import('./Pages/TravelBlog')
    .catch(() => ({ default: () => <LoadingSpinner fullScreen={true} text="Loading Blog..." /> }))
);

const Support = React.lazy(() =>
  import('./Pages/Support')
    .catch(() => ({ default: () => <LoadingSpinner fullScreen={true} text="Loading Support..." /> }))
);

const FAQs = React.lazy(() =>
  import('./Pages/FAQs')
    .catch(() => ({ default: () => <LoadingSpinner fullScreen={true} text="Loading FAQs..." /> }))
);

const Company = React.lazy(() =>
  import('./Pages/Company')
    .catch(() => ({ default: () => <LoadingSpinner fullScreen={true} text="Loading Company Info..." /> }))
);

const AboutUs = React.lazy(() =>
  import('./Pages/AboutUs')
    .catch(() => ({ default: () => <LoadingSpinner fullScreen={true} text="Loading About Us..." /> }))
);

const ContactUs = React.lazy(() =>
  import('./Pages/ContactUs')
    .catch(() => ({ default: () => <LoadingSpinner fullScreen={true} text="Loading Contact info..." /> }))
);

const PrivacyPolicy = React.lazy(() =>
  import('./Pages/PrivacyPolicy')
    .catch(() => ({ default: () => <LoadingSpinner fullScreen={true} text="Loading Privacy Policy..." /> }))
);

const TermsConditions = React.lazy(() =>
  import('./Pages/TermsConditions')
    .catch(() => ({ default: () => <LoadingSpinner fullScreen={true} text="Loading Terms..." /> }))
);

// Add Request Page import
const RequestPage = React.lazy(() =>
  import('./Pages/Request/RequestPage')
    .catch(() => ({ default: () => <LoadingSpinner fullScreen={true} text="Loading Requests..." /> }))
);

// Add Inquiry Detail Page import
const InquiryDetail = React.lazy(() =>
  import('./Pages/Common/InquiryDetail')
    .catch(() => ({ default: () => <LoadingSpinner fullScreen={true} text="Loading Inquiry..." /> }))
);

// Add Quote Detail Page import
const QuoteDetail = React.lazy(() =>
  import('./Pages/Common/QuoteDetail')
    .catch(() => ({ default: () => <LoadingSpinner fullScreen={true} text="Loading Quote..." /> }))
);

// Payment Pages
const PaymentCallback = React.lazy(() =>
  import('./Pages/Common/PaymentCallback')
    .catch(() => ({ default: () => <LoadingSpinner fullScreen={true} text="Verifying Payment..." /> }))
);

const PaymentSuccess = React.lazy(() =>
  import('./Pages/Common/PaymentSuccess')
    .catch(() => ({ default: () => <LoadingSpinner fullScreen={true} text="Payment Successful..." /> }))
);

const PaymentFailed = React.lazy(() =>
  import('./Pages/Common/PaymentFailed')
    .catch(() => ({ default: () => <LoadingSpinner fullScreen={true} text="Payment Info..." /> }))
);

// Add Admin Panel import
const AdminPanel = React.lazy(() =>
  import('./Pages/Admin/AdminPanel')
    .catch(() => ({ default: () => <LoadingSpinner fullScreen={true} text="Loading Admin Panel..." /> }))
);

const AdminLogin = React.lazy(() =>
  import('./Pages/Admin/AdminLogin')
    .catch(() => ({ default: () => <LoadingSpinner fullScreen={true} text="Admin Login..." /> }))
);

const HotelBookingSuccess = React.lazy(() =>
  import('./Pages/Common/rentals/HotelBookingSuccess')
    .catch(() => ({ default: () => <LoadingSpinner fullScreen={true} text="Hotel Booked..." /> }))
);

// Supabase Auth Components
const SupabaseLogin = React.lazy(() =>
  import('./Pages/Common/login/SupabaseLogin')
    .catch(() => ({ default: () => <LoadingSpinner fullScreen={true} text="Welcome Back..." /> }))
);

const SupabaseSignup = React.lazy(() =>
  import('./Pages/Common/login/SupabaseSignup')
    .catch(() => ({ default: () => <LoadingSpinner fullScreen={true} text="Join Us..." /> }))
);

const SupabaseProfileDashboard = React.lazy(() =>
  import('./Pages/Common/login/SupabaseProfileDashboard')
    .catch(() => ({ default: () => <LoadingSpinner fullScreen={true} text="Loading Profile..." /> }))
);

const SupabaseAuthDebug = React.lazy(() =>
  import('./Pages/SupabaseAuthDebug')
    .catch(() => ({ default: () => <LoadingSpinner fullScreen={true} text="Debugging Auth..." /> }))
);

const SupabaseAuthStatus = React.lazy(() =>
  import('./Components/SupabaseAuthStatus')
    .catch(() => ({ default: () => <LoadingSpinner fullScreen={true} text="Checking Status..." /> }))
);

const AuthCallback = React.lazy(() =>
  import('./Pages/AuthCallback')
    .catch(() => ({ default: () => <LoadingSpinner fullScreen={true} text="Verifying..." /> }))
);

// Import ProtectedRoute
const ProtectedRoute = React.lazy(() =>
  import('./components/ProtectedRoute')
    .catch(() => ({ default: ({ children }) => children }))
);

const App = () => {
  return (
    <React.Suspense fallback={<LoadingComponent />}>
      <FullPageBanner />
      <Routes>
        <Route path="/" element={<Welcome />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/profiledashboard" element={<ProfileDashboard />} />

        {/* Supabase Auth Routes */}
        <Route path="/supabase-login" element={<SupabaseLogin />} />
        <Route path="/supabase-signup" element={<SupabaseSignup />} />
        <Route path="/supabase-profile" element={<SupabaseProfileDashboard />} />
        <Route path="/supabase-auth-debug" element={<SupabaseAuthDebug />} />
        <Route path="/supabase-auth-status" element={<SupabaseAuthStatus />} />
        <Route path="/auth/callback" element={<AuthCallback />} />

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
        <Route path="/hotel-booking-success" element={<HotelBookingSuccess />} />
        <Route path="/rental/booking" element={<Booking />} />

        {/* Package Routes */}
        <Route path="/packages/itinerary" element={<ItineraryPackage />} />
        <Route path="/packages/booking-summary" element={<PackageBookingSummary />} />

        {/* Footer Pages */}
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/cookies" element={<Cookies />} />
        <Route path="/careers" element={<Careers />} />

        {/* New Footer Pages */}
        <Route path="/resources" element={<Resources />} />
        <Route path="/destinations" element={<Destinations />} />
        <Route path="/travel-blog" element={<TravelBlog />} />
        <Route path="/support" element={<Support />} />
        <Route path="/faqs" element={<FAQs />} />
        <Route path="/company" element={<Company />} />
        <Route path="/about-us" element={<AboutUs />} />
        <Route path="/contact" element={<ContactUs />} />
        <Route path="/privacy-policy" element={<PrivacyPolicy />} />
        <Route path="/terms-conditions" element={<TermsConditions />} />
        <Route path="/request" element={<RequestPage />} />
        <Route path="/inquiry/:id" element={<InquiryDetail />} />
        <Route path="/quote-detail" element={<QuoteDetail />} />

        {/* Payment Routes */}
        <Route path="/payment/callback" element={<PaymentCallback />} />
        <Route path="/payment/success" element={<PaymentSuccess />} />
        <Route path="/payment/failed" element={<PaymentFailed />} />

        {/* Admin Routes */}
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin/*" element={
          <ProtectedRoute requireAuth={true} requireAdmin={true}>
            <AdminPanel />
          </ProtectedRoute>
        } />

        {/* Legacy redirects for backward compatibility */}
        <Route path="/about" element={<Navigate to="/about-us" />} />
        <Route path="/blog" element={<Navigate to="/travel-blog" />} />
        <Route path="/faq" element={<Navigate to="/faqs" />} />
        <Route path="/cruise-booking" element={<Navigate to="/cruises" />} />
        <Route path="/reviews" element={<Navigate to="/" />} />
        <Route path="/covid-updates" element={<Navigate to="/" />} />
        <Route path="/special-offers" element={<Navigate to="/" />} />
        <Route path="/destinations/:destination" element={<Navigate to="/cruises" />} />
        <Route path="/secure-booking" element={<Navigate to="/privacy-policy" />} />

        <Route path="/404" element={<Error />} />
        <Route path="*" element={<Navigate to="/404" />} />
      </Routes>
      <ContactBanner />
    </React.Suspense>
  );
};

// Export the App component as default
export default App;
