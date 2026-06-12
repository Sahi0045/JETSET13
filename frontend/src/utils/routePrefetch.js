// Route prefetch registry. Calling a thunk warms the chunk so it's already
// loaded by the time the user clicks. Dynamic imports are de-duplicated by
// Vite/the browser, so repeating an import() that was already requested is
// free.

const importers = {
  // Top-level booking flows
  '/flights': () => import('../Pages/Common/flights/flightlanding'),
  '/flights/search': () => import('../Pages/Common/flights/flightsearchpage'),
  '/flights/booking-confirmation': () => import('../Pages/Common/flights/FlightBookingConfirmation'),
  '/flights/payment': () => import('../Pages/Common/flights/FlightPayment'),
  '/flights/create-orders': () => import('../Pages/Common/flights/FlightCreateOrders'),
  '/flights/booking-success': () => import('../Pages/Common/flights/FlightBookingSuccess'),
  '/flights/manage-booking': () => import('../Pages/Common/flights/ManageBooking'),

  '/hotels': () => import('../Pages/Common/hotels/HotelsLanding'),
  '/hotels/search': () => import('../Pages/Common/hotels/SearchHotels'),
  '/hotels/details': () => import('../Pages/Common/hotels/HotelDetailsPage'),
  '/hotels/booking': () => import('../Pages/Common/hotels/HotelBookingSummary'),

  '/cruise': () => import('../Pages/Common/cruise/Homepage'),
  '/cruises': () => import('../Pages/Common/cruise/cruise-cards'),
  '/itinerary': () => import('../Pages/Common/cruise/Itinerary'),
  '/cruise/booking': () => import('../Pages/Common/cruise/CruiseBookingSummary'),
  '/cruise/booking-success': () => import('../Pages/Common/cruise/CruiseBookingSuccess'),

  '/packages': () => import('../Pages/Common/packages/planding'),
  '/packages/itinerary': () => import('../Pages/Common/packages/itp'),
  '/packages/booking': () => import('../Pages/Common/packages/PackageBookingSummary'),

  '/rentals': () => import('../Pages/Common/rentals/LandingPage.jsx'),

  '/visa': () => import('../Pages/Common/visa/VisaLanding'),
  '/visa/apply': () => import('../Pages/Common/visa/VisaApplication'),
  '/visa/services': () => import('../Pages/Common/visa/DocumentServices'),
  '/visa/track': () => import('../Pages/Common/visa/VisaApplicationTracker'),
  '/visa/consultation': () => import('../Pages/Common/visa/ConsultationBooking'),

  // Auth
  '/login': () => import('../Pages/Common/login/SupabaseLogin'),
  '/signup': () => import('../Pages/Common/login/SupabaseSignup'),
  '/forgot-password': () => import('../Pages/Common/login/ForgotPassword'),
  '/reset-password': () => import('../Pages/Common/login/ResetPassword'),

  // Profile / account
  '/profile': () => import('../Pages/Common/login/profiledashboard'),
  '/complete-profile': () => import('../Pages/Common/login/CompleteProfile'),
  '/my-trips': () => import('../Pages/Common/login/mytrips'),

  // Static / content
  '/contact': () => import('../Pages/ContactUs'),
  '/membership': () => import('../Pages/Common/Membership'),
  '/help': () => import('../Pages/Common/HelpCenter'),
  '/support': () => import('../Pages/Support'),
  '/faqs': () => import('../Pages/FAQs'),
  '/company': () => import('../Pages/Company'),
  '/resources': () => import('../Pages/Resources'),
  '/destinations': () => import('../Pages/Destinations'),
  '/travel-blog': () => import('../Pages/TravelBlog'),
  '/careers': () => import('../Pages/Careers'),
  '/privacy': () => import('../Pages/Privacy'),
  '/privacy-policy': () => import('../Pages/PrivacyPolicy'),
  '/terms': () => import('../Pages/Terms'),
  '/terms-conditions': () => import('../Pages/TermsConditions'),
  '/cookies': () => import('../Pages/Cookies'),

  // Request / quote
  '/request': () => import('../Pages/Request/RequestPage'),
};

const prefetched = new Set();
const sortedPaths = Object.keys(importers).sort((a, b) => b.length - a.length);

const pickImporter = (path) => {
  if (!path) return null;
  if (importers[path]) return importers[path];
  for (const p of sortedPaths) {
    if (path === p || path.startsWith(p + '/')) return importers[p];
  }
  return null;
};

export const prefetchRoute = (path) => {
  if (!path || prefetched.has(path)) return;
  const importer = pickImporter(path);
  if (!importer) return;
  prefetched.add(path);
  // Swallow errors — prefetch is best-effort.
  importer().catch(() => {
    prefetched.delete(path);
  });
};
