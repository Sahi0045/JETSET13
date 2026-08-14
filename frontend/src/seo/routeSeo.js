const SITE_NAME = 'Jetsetters';

export const MAX_TITLE_LENGTH = 60;
export const MAX_DESCRIPTION_LENGTH = 155;

export const DEFAULT_ROUTE_SEO = {
  title: 'Luxury Travel, Simply Planned | Jetsetters',
  description: 'Plan flights, hotels, cruises, vacation packages, and visa services with Jetsetters. Expert travel support for every journey.',
  shouldIndex: false,
};

// These pages are intentionally written as individual pieces of search copy instead
// of deriving text from the URL. It keeps each page's search snippet accurate and
// within the length limits used by the site audit.
export const ROUTE_SEO = {
  '/': {
    title: 'Luxury Flights, Hotels & Cruises | Jetsetters',
    description: 'Plan luxury flights, hotels, cruises, and vacation packages with personalized expert support from the Jetsetters travel team.',
  },
  '/cruise': {
    title: 'Luxury Cruise Vacations | Jetsetters',
    description: 'Discover unforgettable cruise vacations with trusted cruise lines, curated itineraries, and expert planning support from Jetsetters.',
    schema: [
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: 'What documents are required to board the cruise?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Guests must present a valid passport or government-issued photo ID, their cruise ticket, and any visas required for the ports on their itinerary. We recommend carrying both physical and digital copies.',
            },
          },
          {
            '@type': 'Question',
            name: 'What time do I need to check-in and board the cruise?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'For offline check-in, arrive 3–4 hours before departure. Boarding typically closes 1–2 hours before sailing. Refer to your cruise ticket for the exact timings for your ship and port.',
            },
          },
          {
            '@type': 'Question',
            name: 'How much luggage is allowed on the cruise?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Most cruise lines have a generous luggage allowance, but weight and size limits vary by line. Check your booking confirmation for the specific policy, and label every bag with your name and cabin number.',
            },
          },
          {
            '@type': 'Question',
            name: 'Can I cancel or reschedule my cruise booking?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Cancellation and rescheduling policies depend on the cruise line and fare type. Many bookings offer flexible cancellation up to a cut-off date. Contact our cruise experts for help with changes to your reservation.',
            },
          },
          {
            '@type': 'Question',
            name: 'Are meals and activities included in the price?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Most cruises include main dining, entertainment, and a range of onboard activities. Specialty restaurants, premium beverages, shore excursions, and spa services are usually charged separately.',
            },
          },
        ],
      },
    ],
  },
  '/cruises': {
    title: 'Browse Cruise Deals | Jetsetters',
    description: 'Compare cruise itineraries, departure dates, and destinations to find the right sailing and the best value for your vacation.',
  },
  '/itinerary': {
    title: 'Cruise Itinerary Details | Jetsetters',
    description: 'Review full cruise itinerary details including ports of call, onboard experiences, excursion options, and booking information.',
    shouldIndex: false,
  },
  '/flights': {
    title: 'Find Flight Deals | Jetsetters',
    description: 'Search flights worldwide, compare airfare prices and cabin classes, and book your next domestic or international trip with confidence.',
  },
  '/flight': {
    title: 'Search Flights | Jetsetters',
    description: 'Search real-time flight schedules and airfare options for any route. Compare prices and book your next journey through Jetsetters.',
    shouldIndex: false,
  },
  '/flights/search': {
    title: 'Flight Search Results | Jetsetters',
    description: 'Compare flight schedules, fares, stopovers, and cabin options for your selected route and travel dates — all in one place.',
  },
  '/packages': {
    title: 'Vacation Packages & Getaways | Jetsetters',
    description: 'Explore handpicked vacation packages that combine flights, hotels, and activities into one seamless, expertly planned travel experience.',
  },
  '/packages/itinerary': {
    title: 'Vacation Package Itinerary | Jetsetters',
    description: 'Review your full vacation package itinerary including daily activities, accommodation details, transportation, and what is included.',
    shouldIndex: false,
  },
  '/hotels': {
    title: 'Hotels & Stays Worldwide | Jetsetters',
    description: 'Find handpicked hotels worldwide, compare accommodation styles and amenities, and reserve the perfect stay for your next trip.',
  },
  '/hotels/search': {
    title: 'Hotel Search Results | Jetsetters',
    description: 'Compare hotels, room types, star ratings, amenities, and prices for your chosen destination and travel dates — all in one view.',
  },
  '/hotels/details': {
    title: 'Hotel Details & Rooms | Jetsetters',
    description: 'Explore full hotel details including room options, photo galleries, guest ratings, available amenities, and current pricing before booking.',
    shouldIndex: false,
  },
  '/visa': {
    title: 'Visa Services & Travel Documents | Jetsetters',
    description: 'Get expert support with travel visas for any destination. We guide you through document requirements, applications, and consultations.',
  },
  '/visa/documents': {
    title: 'Travel Document Services | Jetsetters',
    description: 'Get professional support with passports, travel documents, certified translations, and visa-ready paperwork for international travel.',
  },
  '/visa/apply': {
    title: 'Apply for a Travel Visa | Jetsetters',
    description: 'Start your travel visa application online with step-by-step guidance and personalized support from Jetsetters document specialists.',
  },
  '/visa/booking': {
    title: 'Book a Visa Consultation | Jetsetters',
    description: 'Schedule a one-on-one consultation with a Jetsetters visa specialist for personalized guidance on your travel document requirements.',
  },
  '/visa/refund-policy': {
    title: 'Visa Refund Policy | Jetsetters',
    description: 'Read the full Jetsetters visa service refund policy so you understand your options before submitting your application or payment.',
  },
  '/visa/terms': {
    title: 'Visa Service Terms | Jetsetters',
    description: 'Review the complete terms and conditions that govern Jetsetters visa preparation, travel document, and consultation services.',
  },
  '/visa/privacy': {
    title: 'Visa Privacy Policy | Jetsetters',
    description: 'Learn exactly how Jetsetters collects, uses, and protects personal information submitted through visa and travel document services.',
  },
  '/resources': {
    title: 'Travel Resources & Guides | Jetsetters',
    description: 'Explore practical travel guides, destination overviews, planning checklists, and tips to help you prepare for a smoother journey.',
  },
  '/destinations': {
    title: 'Travel Destinations Worldwide | Jetsetters',
    description: 'Browse inspiring travel destinations across the globe, with trip ideas, seasonal highlights, and handpicked experiences for every traveler.',
  },
  '/travel-blog': {
    title: 'Travel Blog & Expert Tips | Jetsetters',
    description: 'Read destination spotlights, travel planning tips, packing guides, and insider inspiration from the Jetsetters team of travel experts.',
  },
  '/support': {
    title: 'Travel Support & Help | Jetsetters',
    description: 'Find answers to your booking questions, get help managing your trip, and access support resources for all Jetsetters travel services.',
  },
  '/faqs': {
    title: 'Travel Booking FAQs | Jetsetters',
    description: 'Find answers to common questions about flights, hotels, cruises, vacation packages, visa services, payments, and travel bookings.',
    schema: [
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: 'What is Jetsetters and how does it work?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Jetsetters is a comprehensive travel platform that helps you plan, book, and manage your travel experiences. We offer flights, hotels, cruises, and vacation packages. Simply search for your desired destination, compare options, and book directly through our secure platform. Our team of travel experts is also available to provide personalized assistance and recommendations.',
            },
          },
          {
            '@type': 'Question',
            name: 'How far in advance should I book my travel?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'For flights, it\'s generally recommended to book 2–8 weeks in advance for domestic travel and 3–6 months for international trips. Hotels can be booked closer to your travel date, but booking 1–3 months ahead often provides better rates. Cruises should be booked 6–12 months in advance for the best selection and prices. However, last-minute deals are sometimes available.',
            },
          },
          {
            '@type': 'Question',
            name: 'What should I do if I need to change or cancel my booking?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'You can modify or cancel most bookings through your account dashboard. For changes, check the specific terms of your booking as some may have change fees. Cancellations are subject to the cancellation policy of your booking. If you need assistance, our customer support team is available 24/7.',
            },
          },
          {
            '@type': 'Question',
            name: 'Do you offer travel insurance?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Yes, we offer comprehensive travel insurance options covering trip cancellation, medical emergencies, lost luggage, and more. We recommend purchasing insurance when you book your trip to ensure maximum coverage. Contact our team for detailed information about available plans.',
            },
          },
          {
            '@type': 'Question',
            name: 'What documents do I need for international flights?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'For international flights you typically need a valid passport (with at least 6 months validity beyond your return date), a visa if required by your destination, and any health-related documents such as vaccination certificates. Always check the specific entry requirements for your destination country.',
            },
          },
          {
            '@type': 'Question',
            name: 'What payment methods do you accept?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'We accept all major credit cards (Visa, MasterCard, American Express, Discover), debit cards, and digital wallets. All payments are processed securely. We believe in transparent pricing — all fees are clearly displayed during the booking process with no hidden charges.',
            },
          },
          {
            '@type': 'Question',
            name: 'Can I select my seat on flights?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Yes, seat selection is available for most flights. You can choose your seat during the booking process or later through your account dashboard. Some airlines offer free seat selection while others charge a fee for preferred or early seat selection.',
            },
          },
          {
            '@type': 'Question',
            name: 'What\'s included in my cruise package?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Cruise packages typically include your cabin, most meals in the main dining areas, basic entertainment, and access to most onboard facilities. Some cruise lines include alcoholic beverages, specialty dining, and gratuities. Additional services like spa treatments and premium dining usually cost extra.',
            },
          },
          {
            '@type': 'Question',
            name: 'How do I get a copy of my booking confirmation?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Your booking confirmation is automatically sent to your email when you complete a booking. You can also access it anytime through your account dashboard. If you need a copy, simply log into your account or contact our support team.',
            },
          },
        ],
      },
    ],
  },
  '/company': {
    title: 'About Jetsetters Travel',
    description: 'Learn about Jetsetters — our story, travel expertise, customer-first values, team, and our mission to make every journey exceptional.',
  },
  '/contact': {
    title: 'Contact Jetsetters Travel',
    description: 'Reach the Jetsetters travel team for booking help, trip planning questions, quote requests, and expert personalized support.',
  },
  '/careers': {
    title: 'Careers at Jetsetters',
    description: 'Explore open positions and join the Jetsetters team building better, smarter travel experiences for customers around the world.',
  },
  '/privacy-policy': {
    title: 'Privacy Policy & Data Rights | Jetsetters',
    description: 'Learn how Jetsetters handles your personal data, your privacy rights, and how information you share is used across our travel services.',
  },
  '/cookies': {
    title: 'Cookie Policy | Jetsetters',
    description: 'Learn how Jetsetters uses cookies and similar tracking technologies to improve your browsing experience and personalize travel content.',
  },
  '/terms-conditions': {
    title: 'Travel Terms & Conditions | Jetsetters',
    description: 'Review Jetsetters complete booking terms covering payments, cancellations, travel service changes, refunds, and your responsibilities.',
  },
  '/request': {
    title: 'Request a Travel Quote | Jetsetters',
    description: 'Tell us your travel plans and request a tailored quote for flights, hotels, cruises, vacation packages, or a full custom itinerary.',
  },
  '/membership': {
    title: 'Jetsetters Membership Benefits',
    description: 'Explore Jetsetters membership plans and unlock exclusive travel perks, priority support, and member-only deals on every booking.',
  },
  '/help': {
    title: 'Help Center | Jetsetters',
    description: 'Browse Jetsetters help articles, video walkthroughs, booking guides, and support resources to get the most out of your travel experience.',
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
