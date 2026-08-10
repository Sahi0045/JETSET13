const SITE_NAME = 'Jetsetters';

export const MAX_TITLE_LENGTH = 60;
export const MAX_DESCRIPTION_LENGTH = 155;

export const DEFAULT_ROUTE_SEO = {
  title: 'Luxury Travel, Simply Planned | Jetsetters',
  description: 'Plan flights, hotels, cruises, vacation packages, and visa services with Jetsetters.',
  shouldIndex: false,
};

// These pages are intentionally written as individual pieces of search copy instead
// of deriving text from the URL. It keeps each page's search snippet accurate and
// within the length limits used by the site audit.
export const ROUTE_SEO = {
  '/': {
    title: 'Luxury Flights, Hotels & Cruises | Jetsetters',
    description: 'Plan luxury flights, hotels, cruises, and vacation packages with expert support from Jetsetters.',
  },
  '/cruise': {
    title: 'Luxury Cruise Vacations | Jetsetters',
    description: 'Discover memorable cruise vacations, trusted cruise lines, and expert help planning your voyage.',
  },
  '/cruises': {
    title: 'Browse Cruise Deals | Jetsetters',
    description: 'Compare cruise itineraries, destinations, and sailings to find the right vacation at the right price.',
  },
  '/itinerary': {
    title: 'Cruise Itinerary Details | Jetsetters',
    description: 'Review cruise itinerary details, onboard experiences, destinations, and booking information.',
  },
  '/flights': {
    title: 'Find Flight Deals | Jetsetters',
    description: 'Search flights worldwide, compare airfare options, and book your next trip with confidence.',
  },
  '/flight': {
    title: 'Search Flights | Jetsetters',
    description: 'Search flight schedules and airfare options for your next journey with Jetsetters.',
  },
  '/flights/search': {
    title: 'Flight Search Results | Jetsetters',
    description: 'Compare flight schedules, fares, and travel options for your selected route and dates.',
  },
  '/packages': {
    title: 'Vacation Packages & Getaways | Jetsetters',
    description: 'Explore handpicked vacation packages and create an unforgettable trip with expert travel support.',
  },
  '/packages/itinerary': {
    title: 'Vacation Package Itinerary | Jetsetters',
    description: 'Review your vacation package itinerary, daily activities, accommodations, and inclusions.',
  },
  '/hotels': {
    title: 'Hotels & Stays Worldwide | Jetsetters',
    description: 'Find handpicked hotels worldwide, compare stays, and reserve accommodation for your next trip.',
  },
  '/hotels/search': {
    title: 'Hotel Search Results | Jetsetters',
    description: 'Compare hotels, room options, amenities, and prices for your selected destination and dates.',
  },
  '/hotels/details': {
    title: 'Hotel Details & Rooms | Jetsetters',
    description: 'Explore hotel rooms, amenities, guest ratings, and pricing before you reserve your stay.',
  },
  '/visa': {
    title: 'Visa Services & Travel Documents | Jetsetters',
    description: 'Get expert support with travel visas, document requirements, applications, and consultations.',
  },
  '/visa/documents': {
    title: 'Travel Document Services | Jetsetters',
    description: 'Get support with passports, travel documents, translations, and visa-ready paperwork.',
  },
  '/visa/apply': {
    title: 'Apply for a Travel Visa | Jetsetters',
    description: 'Start your visa application online with step-by-step guidance from Jetsetters travel experts.',
  },
  '/visa/booking': {
    title: 'Book a Visa Consultation | Jetsetters',
    description: 'Schedule a consultation with a visa specialist for personalized travel document guidance.',
  },
  '/visa/refund-policy': {
    title: 'Visa Refund Policy | Jetsetters',
    description: 'Read the Jetsetters visa service refund policy before submitting your application or payment.',
  },
  '/visa/terms': {
    title: 'Visa Service Terms | Jetsetters',
    description: 'Review the terms and conditions for Jetsetters visa and travel document services.',
  },
  '/visa/privacy': {
    title: 'Visa Privacy Policy | Jetsetters',
    description: 'Learn how Jetsetters protects personal information collected through visa service requests.',
  },
  '/resources': {
    title: 'Travel Resources & Guides | Jetsetters',
    description: 'Explore practical travel guides, planning tools, and tips for a smoother journey.',
  },
  '/destinations': {
    title: 'Travel Destinations Worldwide | Jetsetters',
    description: 'Browse inspiring destinations, trip ideas, and handpicked experiences for your next getaway.',
  },
  '/travel-blog': {
    title: 'Travel Blog & Expert Tips | Jetsetters',
    description: 'Read destination guides, travel tips, and inspiration from the Jetsetters travel team.',
  },
  '/support': {
    title: 'Travel Support & Help | Jetsetters',
    description: 'Find answers, booking help, and support resources for your Jetsetters travel plans.',
  },
  '/faqs': {
    title: 'Travel Booking FAQs | Jetsetters',
    description: 'Find answers about flights, hotels, cruises, payments, visas, and travel bookings.',
  },
  '/company': {
    title: 'About Jetsetters Travel',
    description: 'Learn about Jetsetters, our travel expertise, customer-first values, and global mission.',
  },
  '/contact': {
    title: 'Contact Jetsetters Travel',
    description: 'Contact the Jetsetters travel team for booking help, travel questions, and expert support.',
  },
  '/careers': {
    title: 'Careers at Jetsetters',
    description: 'Explore career opportunities and join the team building better travel experiences worldwide.',
  },
  '/privacy': {
    title: 'Privacy Policy | Jetsetters',
    description: 'Read the Jetsetters privacy policy and learn how we collect, use, and protect your data.',
  },
  '/privacy-policy': {
    title: 'Privacy Policy & Data Rights | Jetsetters',
    description: 'Learn how Jetsetters handles personal data, privacy rights, and travel-service information.',
  },
  '/cookies': {
    title: 'Cookie Policy | Jetsetters',
    description: 'Learn how Jetsetters uses cookies and similar technologies to improve your website experience.',
  },
  '/terms': {
    title: 'Terms of Service | Jetsetters',
    description: 'Read the terms of service governing use of Jetsetters travel planning and booking services.',
  },
  '/terms-conditions': {
    title: 'Travel Terms & Conditions | Jetsetters',
    description: 'Review Jetsetters terms for bookings, payments, travel services, changes, and refunds.',
  },
  '/request': {
    title: 'Request a Travel Quote | Jetsetters',
    description: 'Tell us about your trip and request a tailored flight, hotel, cruise, or vacation quote.',
  },
  '/membership': {
    title: 'Jetsetters Membership Benefits',
    description: 'Explore Jetsetters membership benefits, travel perks, support, and exclusive offers.',
  },
  '/pricing': {
    title: 'Jetsetters Membership Pricing',
    description: 'Compare Jetsetters membership options, benefits, and travel-focused pricing plans.',
  },
  '/help': {
    title: 'Help Center | Jetsetters',
    description: 'Browse Jetsetters help articles, travel videos, booking guides, and useful resources.',
  },
  '/booking-confirmation': {
    title: 'Booking Confirmation | Jetsetters',
    description: 'View your Jetsetters booking confirmation and next steps for your upcoming trip.',
    shouldIndex: false,
  },
  '/cruise-booking-success': {
    title: 'Cruise Booking Confirmed | Jetsetters',
    description: 'Your Jetsetters cruise booking is confirmed. Review your trip details and next steps.',
    shouldIndex: false,
  },
  '/flight-booking-success': {
    title: 'Flight Booking Confirmed | Jetsetters',
    description: 'Your Jetsetters flight booking is confirmed. Review your itinerary and travel details.',
    shouldIndex: false,
  },
  '/hotel-booking-success': {
    title: 'Hotel Booking Confirmed | Jetsetters',
    description: 'Your Jetsetters hotel booking is confirmed. Review your stay details and next steps.',
    shouldIndex: false,
  },
  '/dashboard': {
    title: 'Travel Dashboard | Jetsetters',
    description: 'Manage your Jetsetters travel plans, bookings, and itinerary details.',
    shouldIndex: false,
  },
  '/login': {
    title: 'Sign In | Jetsetters',
    description: 'Sign in to manage your Jetsetters travel plans and bookings.',
    shouldIndex: false,
  },
  '/signup': {
    title: 'Create an Account | Jetsetters',
    description: 'Create a Jetsetters account to manage travel plans and bookings.',
    shouldIndex: false,
  },
  '/forgot-password': {
    title: 'Reset Your Password | Jetsetters',
    description: 'Reset your Jetsetters account password securely.',
    shouldIndex: false,
  },
  '/reset-password': {
    title: 'Set a New Password | Jetsetters',
    description: 'Set a new password for your Jetsetters account securely.',
    shouldIndex: false,
  },
  '/payment/callback': {
    title: 'Payment Verification | Jetsetters',
    description: 'Jetsetters is verifying your payment status.',
    shouldIndex: false,
  },
  '/payment/success': {
    title: 'Payment Successful | Jetsetters',
    description: 'Your Jetsetters payment was completed successfully.',
    shouldIndex: false,
  },
  '/payment/failed': {
    title: 'Payment Status | Jetsetters',
    description: 'Review your Jetsetters payment status and available next steps.',
    shouldIndex: false,
  },
  '/visa/success': {
    title: 'Visa Application Submitted | Jetsetters',
    description: 'Your Jetsetters visa application has been submitted for review.',
    shouldIndex: false,
  },
  '/visa/track': {
    title: 'Track Visa Application | Jetsetters',
    description: 'Check the status of your Jetsetters visa application securely.',
    shouldIndex: false,
  },
  '/visa/status': {
    title: 'Visa Application Status | Jetsetters',
    description: 'Review your current visa application status and next steps.',
    shouldIndex: false,
  },
};

export const ROUTE_SEO_PATTERNS = [
  {
    path: '/flights/booking/:bookingId',
    title: 'Review Your Flight Booking | Jetsetters',
    description: 'Review your selected flight and complete your Jetsetters booking securely.',
    shouldIndex: false,
  },
  {
    path: '/manage-booking/:bookingId',
    title: 'Manage Your Booking | Jetsetters',
    description: 'Review and manage your Jetsetters travel booking securely.',
    shouldIndex: false,
  },
  {
    path: '/pay/:token',
    title: 'Secure Payment | Jetsetters',
    description: 'Complete your Jetsetters payment securely using your personal payment link.',
    shouldIndex: false,
  },
  {
    path: '/inquiry/:id',
    title: 'Travel Inquiry | Jetsetters',
    description: 'Review your Jetsetters travel inquiry and available trip details.',
    shouldIndex: false,
  },
  {
    path: '/visa/consultation/:id',
    title: 'Visa Consultation | Jetsetters',
    description: 'Join your secure Jetsetters visa consultation session.',
    shouldIndex: false,
  },
  {
    path: '/admin/*',
    title: 'Admin Portal | Jetsetters',
    description: 'Jetsetters administration portal.',
    shouldIndex: false,
  },
  {
    path: '/agent/*',
    title: 'Travel Agent Portal | Jetsetters',
    description: 'Jetsetters travel agent portal.',
    shouldIndex: false,
  },
  {
    path: '/visa/admin/*',
    title: 'Visa Admin Portal | Jetsetters',
    description: 'Jetsetters visa administration portal.',
    shouldIndex: false,
  },
  {
    path: '/visa/agent/*',
    title: 'Visa Agent Portal | Jetsetters',
    description: 'Jetsetters visa agent portal.',
    shouldIndex: false,
  },
];

export const truncateSeoText = (value, maxLength) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;

  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
};

export const withSiteName = (title) => {
  if (!title) return SITE_NAME;
  return title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`;
};
