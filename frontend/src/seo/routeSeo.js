import { DESTINATION_IMAGES } from '../data/destinationImages.js';

const SITE_NAME = 'Jetsetters';
export const SITE_URL = 'https://www.jetsetterss.com';
export const DEFAULT_OG_IMAGE = `${SITE_URL}/images/logos/jetsetters_3d_logo_final.png`;

export const MAX_TITLE_LENGTH = 60;
export const MAX_DESCRIPTION_LENGTH = 155;

const breadcrumb = (...items) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
    ...items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 2,
      name: it.name,
      ...(it.url ? { item: `${SITE_URL}${it.url}` } : {}),
    })),
  ],
});

export const DEFAULT_ROUTE_SEO = {
  title: 'Luxury Travel, Simply Planned | Jetsetters',
  description: 'Plan flights, hotels, cruises, vacation packages, and visa services with Jetsetters. Expert travel support for every journey.',
  shouldIndex: false,
};

export const SITE_WIDE_SCHEMA = [
  {
    '@context': 'https://schema.org',
    '@type': ['TravelAgency', 'Organization'],
    '@id': `${SITE_URL}/#organization`,
    name: 'Jetsetters',
    url: SITE_URL,
    logo: {
      '@type': 'ImageObject',
      url: DEFAULT_OG_IMAGE,
    },
    description: 'Jetsetters is a luxury travel platform offering flights, hotels, cruises, vacation packages, and visa services with personalized expert support.',
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer service',
      telephone: '+1-877-538-7380',
      url: `${SITE_URL}/contact`,
      areaServed: 'Worldwide',
      availableLanguage: 'English',
    },
    sameAs: [
      'https://www.facebook.com/jetsetterss',
      'https://www.instagram.com/jetsetterss',
    ],
  },
  {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#website`,
    url: SITE_URL,
    name: 'Jetsetters',
    publisher: { '@id': `${SITE_URL}/#organization` },
  },
];

// These pages are intentionally written as individual pieces of search copy instead
// of deriving text from the URL. It keeps each page's search snippet accurate and
// within the length limits used by the site audit.
export const ROUTE_SEO = {
  '/': {
    title: 'Luxury Flights, Hotels & Cruises | Jetsetters',
    description: 'Plan luxury flights, hotels, cruises, and vacation packages with personalized expert support from the Jetsetters travel team.',
    // Mirrors flightlanding.jsx, the component the home route renders. The hero
    // and both sections below it are static copy in that file, but they only
    // exist once a ~350 kB route chunk has downloaded and React has rendered —
    // so a crawler that gives up early used to index the loading state instead
    // of the page. This is the same copy, in the initial HTML payload.
    content: {
      heading: 'Find Your Perfect Flight Today',
      intro: 'Handpicked fares, real human concierges, and a best-price promise — book with confidence and travel with peace of mind.',
      sections: [
        {
          heading: 'Explore popular destinations',
          body: 'A carefully selected collection loved by travellers worldwide — perfect places for your next adventure.',
        },
        {
          heading: "Our lowest fares to the world's most-loved places",
          body: 'Take advantage of our special deals and promotions to get the best value for your travel budget — the most affordable flights, without compromising on quality, with a price match guarantee, no hidden fees, and 24/7 customer support.',
        },
      ],
    },
  },
  '/cruise': {
    title: 'Luxury Cruise Vacations | Jetsetters',
    description: 'Discover unforgettable cruise vacations with trusted cruise lines, curated itineraries, and expert planning support from Jetsetters.',
    schema: [
      breadcrumb({ name: 'Cruises' }),
      {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: 'Cruise Vacations',
        description: 'Unforgettable cruise vacations with trusted cruise lines, curated itineraries, and expert planning support.',
        brand: { '@type': 'Brand', name: 'Jetsetters' },
        url: `${SITE_URL}/cruise`,
        image: `${SITE_URL}/images/logos/jetsetters_3d_logo_final.png`,
        offers: {
          '@type': 'AggregateOffer',
          priceCurrency: 'USD',
          lowPrice: '299',
          highPrice: '4999',
          offerCount: '30',
          url: `${SITE_URL}/cruise`,
        },
        aggregateRating: { '@type': 'AggregateRating', ratingValue: 4.8, reviewCount: 1850 },
      },
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
    schema: [breadcrumb({ name: 'Cruises', url: '/cruise' }, { name: 'Browse Deals' })],
    // Mirrors cruise-cards.jsx, whose own <h1> is "Find Your Perfect Cruise".
    // Sailings load from the API, so without this the crawled document showed
    // nothing but a loading state.
    content: {
      heading: 'Find Your Perfect Cruise',
      intro: 'Compare cruise itineraries, departure dates and destinations to find the right sailing and the best value for your vacation.',
      sections: [
        {
          heading: 'Filter by departure port',
          body: 'Narrow the list to sailings leaving from the ports you can reach easily, then compare itineraries side by side across cruise lines and trip lengths.',
        },
        {
          heading: 'Compare before you commit',
          body: 'Each sailing lists its route, duration and departure date so you can weigh cabin options and value before moving to booking.',
        },
      ],
    },
  },
  '/itinerary': {
    title: 'Cruise Itinerary Details | Jetsetters',
    description: 'Review full cruise itinerary details including ports of call, onboard experiences, excursion options, and booking information.',
    shouldIndex: false,
  },
  '/flights': {
    title: 'Find Flight Deals | Jetsetters',
    description: 'Search flights worldwide, compare airfare prices and cabin classes, and book your next domestic or international trip with confidence.',
    schema: [breadcrumb({ name: 'Flights' })],
  },
  '/flight': {
    title: 'Search Flights | Jetsetters',
    description: 'Search real-time flight schedules and airfare options for any route. Compare prices and book your next journey through Jetsetters.',
    shouldIndex: false,
  },
  '/flights/search': {
    title: 'Flight Search Results | Jetsetters',
    description: 'Compare flight schedules, fares, stopovers, and cabin options for your selected route and travel dates — all in one place.',
    shouldIndex: false,
    schema: [breadcrumb({ name: 'Flights', url: '/flights' }, { name: 'Search Results' })],
  },
  '/packages': {
    title: 'Vacation Packages & Getaways | Jetsetters',
    description: 'Explore handpicked vacation packages that combine flights, hotels, and activities into one seamless, expertly planned travel experience.',
    schema: [
      breadcrumb({ name: 'Vacation Packages' }),
      {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: 'Vacation Packages',
        description: 'Handpicked vacation packages combining flights, hotels, and curated activities into one expertly planned travel experience.',
        brand: { '@type': 'Brand', name: 'Jetsetters' },
        url: `${SITE_URL}/packages`,
        image: `${SITE_URL}/images/logos/jetsetters_3d_logo_final.png`,
        offers: {
          '@type': 'AggregateOffer',
          priceCurrency: 'USD',
          lowPrice: '399',
          highPrice: '2999',
          offerCount: '50',
          url: `${SITE_URL}/packages`,
        },
        aggregateRating: { '@type': 'AggregateRating', ratingValue: 4.8, reviewCount: 1240 },
      },
    ],
  },
  '/packages/itinerary': {
    title: 'Vacation Package Itinerary | Jetsetters',
    description: 'Review your full vacation package itinerary including daily activities, accommodation details, transportation, and what is included.',
    shouldIndex: false,
  },
  '/hotels': {
    title: 'Hotels & Stays Worldwide | Jetsetters',
    description: 'Find handpicked hotels worldwide, compare accommodation styles and amenities, and reserve the perfect stay for your next trip.',
    schema: [breadcrumb({ name: 'Hotels' })],
    // Mirrors what HotelsLanding renders once React mounts. Search Console had
    // this route as "Crawled - currently not indexed"; the prerendered document
    // previously carried no page-specific copy at all.
    content: {
      heading: 'Hotels & Stays Worldwide',
      intro: 'Discover our handpicked collection of the world\'s most stunning luxury hotels and resorts, from city landmarks to beachfront retreats.',
      sections: [
        {
          heading: 'Search by your dates',
          body: 'Enter your destination with check-in and check-out dates to see available stays, compare room types and amenities, and hold the rate that suits your trip.',
        },
        {
          heading: 'Why book hotels with Jetsetters',
          body: 'Every property is reviewed by our travel team before it reaches the collection. You get direct human support alongside the booking, so changes and special requests are handled by people rather than a form.',
        },
      ],
    },
  },
  '/hotels/search': {
    title: 'Hotel Search Results | Jetsetters',
    description: 'Compare hotels, room types, star ratings, amenities, and prices for your chosen destination and travel dates — all in one view.',
    shouldIndex: false,
    schema: [breadcrumb({ name: 'Hotels', url: '/hotels' }, { name: 'Search Results' })],
  },
  '/hotels/details': {
    title: 'Hotel Details & Rooms | Jetsetters',
    description: 'Explore full hotel details including room options, photo galleries, guest ratings, available amenities, and current pricing before booking.',
    shouldIndex: false,
  },
  '/visa': {
    title: 'Visa Services & Travel Documents | Jetsetters',
    description: 'Get expert support with travel visas for any destination. We guide you through document requirements, applications, and consultations.',
    schema: [
      breadcrumb({ name: 'Visa Services' }),
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: 'What documents do I need to apply for a travel visa?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Requirements vary by destination, but most visa applications require a valid passport with at least 6 months validity, completed application form, passport-size photos, proof of accommodation, travel itinerary, financial statements, and a cover letter. Jetsetters guides you through the exact requirements for your destination.',
            },
          },
          {
            '@type': 'Question',
            name: 'How long does visa processing take?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Processing times depend on the destination country and visa type. Standard processing typically takes 5–15 business days, while expedited options may be available for 2–5 business days at additional cost. We recommend applying at least 4–6 weeks before your planned travel date.',
            },
          },
          {
            '@type': 'Question',
            name: 'Can I book a visa consultation with Jetsetters?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Yes, you can schedule a one-on-one video consultation with a Jetsetters visa specialist. Our experts provide personalized guidance on document requirements, application procedures, and common pitfalls to avoid for your specific destination and travel purpose.',
            },
          },
          {
            '@type': 'Question',
            name: 'What is the Jetsetters visa refund policy?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Our visa service fees cover application preparation and review. If your visa is denied, refund eligibility depends on the service tier selected. Consular and government fees are non-refundable in all cases. Review our full refund policy page for complete details before submitting your application.',
            },
          },
          {
            '@type': 'Question',
            name: 'Do you offer document translation and attestation services?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Yes, Jetsetters offers certified document translation, notarization, and attestation services for visa applications. This includes translating birth certificates, financial documents, employment letters, and other supporting paperwork into the required language for your destination country.',
            },
          },
        ],
      },
    ],
  },
  '/visa/documents': {
    title: 'Travel Document Services | Jetsetters',
    description: 'Get professional support with passports, travel documents, certified translations, and visa-ready paperwork for international travel.',
    schema: [breadcrumb({ name: 'Visa Services', url: '/visa' }, { name: 'Document Services' })],
  },
  '/visa/apply': {
    title: 'Apply for a Travel Visa | Jetsetters',
    description: 'Start your travel visa application online with step-by-step guidance and personalized support from Jetsetters document specialists.',
    schema: [breadcrumb({ name: 'Visa Services', url: '/visa' }, { name: 'Apply' })],
  },
  '/visa/booking': {
    title: 'Book a Visa Consultation | Jetsetters',
    description: 'Schedule a one-on-one consultation with a Jetsetters visa specialist for personalized guidance on your travel document requirements.',
    schema: [breadcrumb({ name: 'Visa Services', url: '/visa' }, { name: 'Book Consultation' })],
  },
  '/visa/refund-policy': {
    title: 'Visa Refund Policy | Jetsetters',
    description: 'Read the full Jetsetters visa service refund policy so you understand your options before submitting your application or payment.',
    schema: [breadcrumb({ name: 'Visa Services', url: '/visa' }, { name: 'Refund Policy' })],
  },
  '/visa/terms': {
    title: 'Visa Service Terms | Jetsetters',
    description: 'Review the complete terms and conditions that govern Jetsetters visa preparation, travel document, and consultation services.',
    schema: [breadcrumb({ name: 'Visa Services', url: '/visa' }, { name: 'Terms' })],
  },
  '/visa/privacy': {
    title: 'Visa Privacy Policy | Jetsetters',
    description: 'Learn exactly how Jetsetters collects, uses, and protects personal information submitted through visa and travel document services.',
    schema: [breadcrumb({ name: 'Visa Services', url: '/visa' }, { name: 'Privacy Policy' })],
  },
  '/resources': {
    title: 'Travel Resources & Guides | Jetsetters',
    description: 'Explore practical travel guides, destination overviews, planning checklists, and tips to help you prepare for a smoother journey.',
    schema: [breadcrumb({ name: 'Resources' })],
  },
  '/destinations': {
    title: 'Travel Destinations Worldwide | Jetsetters',
    description: 'Browse inspiring travel destinations across the globe, with trip ideas, seasonal highlights, and handpicked experiences for every traveler.',
    schema: [
      breadcrumb({ name: 'Destinations' }),
      {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: 'Popular Travel Destinations',
        description: 'Curated travel destinations across North America, India, and France.',
        numberOfItems: 13,
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            item: {
              '@type': 'TouristDestination',
              name: 'New York City, USA',
              description: 'The city that never sleeps, offering iconic landmarks and vibrant culture.',
              image: 'https://images.unsplash.com/photo-1534447677768-be436bb09401',
              touristType: ['City Break', 'Cultural Tourism'],
              includesAttraction: [
                { '@type': 'TouristAttraction', name: 'Broadway' },
                { '@type': 'TouristAttraction', name: 'Statue of Liberty' },
                { '@type': 'TouristAttraction', name: 'Central Park' },
              ],
              aggregateRating: { '@type': 'AggregateRating', ratingValue: 4.9, reviewCount: 2543 },
              offers: { '@type': 'Offer', priceCurrency: 'USD', price: '999', url: `${SITE_URL}/packages/itinerary?destination=New+York+City%2C+USA` },
            },
          },
          {
            '@type': 'ListItem',
            position: 2,
            item: {
              '@type': 'TouristDestination',
              name: 'Los Angeles, USA',
              description: 'Hollywood glamour, beaches, and endless entertainment.',
              image: DESTINATION_IMAGES.losAngeles,
              touristType: ['City Break', 'Entertainment'],
              includesAttraction: [
                { '@type': 'TouristAttraction', name: 'Hollywood' },
                { '@type': 'TouristAttraction', name: 'Santa Monica' },
                { '@type': 'TouristAttraction', name: 'Beverly Hills' },
              ],
              aggregateRating: { '@type': 'AggregateRating', ratingValue: 4.7, reviewCount: 1820 },
              offers: { '@type': 'Offer', priceCurrency: 'USD', price: '1099', url: `${SITE_URL}/packages/itinerary?destination=Los+Angeles%2C+USA` },
            },
          },
          {
            '@type': 'ListItem',
            position: 3,
            item: {
              '@type': 'TouristDestination',
              name: 'Miami, USA',
              description: 'Tropical beaches, nightlife, and Latin culture.',
              image: DESTINATION_IMAGES.miami,
              touristType: ['Beach Getaway', 'Nightlife'],
              includesAttraction: [
                { '@type': 'TouristAttraction', name: 'South Beach' },
                { '@type': 'TouristAttraction', name: 'Nightlife District' },
              ],
              aggregateRating: { '@type': 'AggregateRating', ratingValue: 4.8, reviewCount: 1432 },
              offers: { '@type': 'Offer', priceCurrency: 'USD', price: '899', url: `${SITE_URL}/packages/itinerary?destination=Miami%2C+USA` },
            },
          },
          {
            '@type': 'ListItem',
            position: 4,
            item: {
              '@type': 'TouristDestination',
              name: 'Toronto, Canada',
              description: 'Cosmopolitan city with iconic skyline and cultural diversity.',
              image: 'https://images.unsplash.com/photo-1507992781348-310259076fe0',
              touristType: ['City Break', 'Cultural Tourism'],
              includesAttraction: [
                { '@type': 'TouristAttraction', name: 'CN Tower' },
                { '@type': 'TouristAttraction', name: 'Niagara Falls' },
              ],
              aggregateRating: { '@type': 'AggregateRating', ratingValue: 4.7, reviewCount: 1103 },
              offers: { '@type': 'Offer', priceCurrency: 'USD', price: '1049', url: `${SITE_URL}/packages/itinerary?destination=Toronto%2C+Canada` },
            },
          },
          {
            '@type': 'ListItem',
            position: 5,
            item: {
              '@type': 'TouristDestination',
              name: 'Vancouver, Canada',
              description: 'Mountains, ocean, and outdoor adventures.',
              image: 'https://images.unsplash.com/photo-1506045412240-22980140a405',
              touristType: ['Adventure', 'Nature'],
              includesAttraction: [
                { '@type': 'TouristAttraction', name: 'Stanley Park' },
                { '@type': 'TouristAttraction', name: 'Whistler' },
              ],
              aggregateRating: { '@type': 'AggregateRating', ratingValue: 4.8, reviewCount: 980 },
              offers: { '@type': 'Offer', priceCurrency: 'USD', price: '1199', url: `${SITE_URL}/packages/itinerary?destination=Vancouver%2C+Canada` },
            },
          },
          {
            '@type': 'ListItem',
            position: 6,
            item: {
              '@type': 'TouristDestination',
              name: 'Mumbai, India',
              description: 'The financial capital of India with vibrant nightlife.',
              image: 'https://images.unsplash.com/photo-1595658658481-d53d3f999875',
              touristType: ['City Break', 'Cultural Tourism'],
              includesAttraction: [
                { '@type': 'TouristAttraction', name: 'Marine Drive' },
                { '@type': 'TouristAttraction', name: 'Gateway of India' },
              ],
              aggregateRating: { '@type': 'AggregateRating', ratingValue: 4.6, reviewCount: 1650 },
              offers: { '@type': 'Offer', priceCurrency: 'USD', price: '499', url: `${SITE_URL}/packages/itinerary?destination=Mumbai%2C+India` },
            },
          },
          {
            '@type': 'ListItem',
            position: 7,
            item: {
              '@type': 'TouristDestination',
              name: 'Delhi, India',
              description: 'Historic capital rich in culture and heritage.',
              image: 'https://images.unsplash.com/photo-1587474260584-136574528ed5',
              touristType: ['Cultural Tourism', 'Historical'],
              includesAttraction: [
                { '@type': 'TouristAttraction', name: 'Red Fort' },
                { '@type': 'TouristAttraction', name: 'Qutub Minar' },
              ],
              aggregateRating: { '@type': 'AggregateRating', ratingValue: 4.5, reviewCount: 1490 },
              offers: { '@type': 'Offer', priceCurrency: 'USD', price: '449', url: `${SITE_URL}/packages/itinerary?destination=Delhi%2C+India` },
            },
          },
          {
            '@type': 'ListItem',
            position: 8,
            item: {
              '@type': 'TouristDestination',
              name: 'Goa, India',
              description: "India's most popular beach destination.",
              image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e',
              touristType: ['Beach Getaway', 'Water Sports'],
              includesAttraction: [
                { '@type': 'TouristAttraction', name: 'Beaches' },
                { '@type': 'TouristAttraction', name: 'Water Sports' },
              ],
              aggregateRating: { '@type': 'AggregateRating', ratingValue: 4.8, reviewCount: 2310 },
              offers: { '@type': 'Offer', priceCurrency: 'USD', price: '399', url: `${SITE_URL}/packages/itinerary?destination=Goa%2C+India` },
            },
          },
          {
            '@type': 'ListItem',
            position: 9,
            item: {
              '@type': 'TouristDestination',
              name: 'Jaipur, India',
              description: 'The Pink City with royal palaces and forts.',
              image: 'https://images.unsplash.com/photo-1548013146-72479768bada',
              touristType: ['Cultural Tourism', 'Historical'],
              includesAttraction: [
                { '@type': 'TouristAttraction', name: 'Amber Fort' },
                { '@type': 'TouristAttraction', name: 'Hawa Mahal' },
                { '@type': 'TouristAttraction', name: 'City Palace' },
              ],
              aggregateRating: { '@type': 'AggregateRating', ratingValue: 4.7, reviewCount: 1215 },
              offers: { '@type': 'Offer', priceCurrency: 'USD', price: '499', url: `${SITE_URL}/packages/itinerary?destination=Jaipur%2C+India` },
            },
          },
          {
            '@type': 'ListItem',
            position: 10,
            item: {
              '@type': 'TouristDestination',
              name: 'Paris, France',
              description: 'The City of Light with art, romance, and cuisine.',
              image: DESTINATION_IMAGES.paris,
              touristType: ['City Break', 'Romantic'],
              includesAttraction: [
                { '@type': 'TouristAttraction', name: 'Eiffel Tower' },
                { '@type': 'TouristAttraction', name: 'Louvre Museum' },
                { '@type': 'TouristAttraction', name: 'Seine Cruise' },
              ],
              aggregateRating: { '@type': 'AggregateRating', ratingValue: 4.9, reviewCount: 2156 },
              offers: { '@type': 'Offer', priceCurrency: 'USD', price: '1299', url: `${SITE_URL}/packages/itinerary?destination=Paris%2C+France` },
            },
          },
          {
            '@type': 'ListItem',
            position: 11,
            item: {
              '@type': 'TouristDestination',
              name: 'Nice, France',
              description: 'French Riviera beauty with Mediterranean charm.',
              image: DESTINATION_IMAGES.nice,
              touristType: ['Beach Getaway', 'Luxury'],
              includesAttraction: [
                { '@type': 'TouristAttraction', name: 'Promenade des Anglais' },
                { '@type': 'TouristAttraction', name: 'Old Town' },
              ],
              aggregateRating: { '@type': 'AggregateRating', ratingValue: 4.8, reviewCount: 890 },
              offers: { '@type': 'Offer', priceCurrency: 'USD', price: '1199', url: `${SITE_URL}/packages/itinerary?destination=Nice%2C+France` },
            },
          },
          {
            '@type': 'ListItem',
            position: 12,
            item: {
              '@type': 'TouristDestination',
              name: 'Marseille, France',
              description: 'Historic port city with stunning coastline.',
              image: 'https://images.unsplash.com/photo-1720610892502-f15aeef291f5',
              touristType: ['Cultural Tourism', 'Coastal'],
              includesAttraction: [
                { '@type': 'TouristAttraction', name: 'Old Port' },
                { '@type': 'TouristAttraction', name: 'Calanques' },
              ],
              aggregateRating: { '@type': 'AggregateRating', ratingValue: 4.6, reviewCount: 670 },
              offers: { '@type': 'Offer', priceCurrency: 'USD', price: '1049', url: `${SITE_URL}/packages/itinerary?destination=Marseille%2C+France` },
            },
          },
          {
            '@type': 'ListItem',
            position: 13,
            item: {
              '@type': 'TouristDestination',
              name: 'Lyon, France',
              description: 'Gastronomic capital of France.',
              image: 'https://images.unsplash.com/photo-1599134842279-fe807d23316e',
              touristType: ['Cultural Tourism', 'Gastronomy'],
              includesAttraction: [
                { '@type': 'TouristAttraction', name: 'Old Town' },
                { '@type': 'TouristAttraction', name: 'Gastronomy Scene' },
              ],
              aggregateRating: { '@type': 'AggregateRating', ratingValue: 4.7, reviewCount: 540 },
              offers: { '@type': 'Offer', priceCurrency: 'USD', price: '1099', url: `${SITE_URL}/packages/itinerary?destination=Lyon%2C+France` },
            },
          },
        ],
      },
    ],
  },
  '/travel-blog': {
    title: 'Travel Blog & Expert Tips | Jetsetters',
    description: 'Read destination spotlights, travel planning tips, packing guides, and insider inspiration from the Jetsetters team of travel experts.',
    schema: [breadcrumb({ name: 'Travel Blog' })],
  },
  '/support': {
    title: 'Travel Support & Help | Jetsetters',
    description: 'Find answers to your booking questions, get help managing your trip, and access support resources for all Jetsetters travel services.',
    schema: [
      breadcrumb({ name: 'Support' }),
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: 'How do I change or cancel my booking?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'You can modify or cancel your booking through your account dashboard or by contacting our support team. Changes and cancellations are subject to the specific terms of your booking, and some may have associated fees depending on the fare type and timing.',
            },
          },
          {
            '@type': 'Question',
            name: 'What documents do I need for international travel?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'For international travel you typically need a valid passport with at least 6 months validity beyond your return date, a visa if required by your destination, and any health-related documents such as vaccination certificates. Always check the specific entry requirements for your destination country before traveling.',
            },
          },
          {
            '@type': 'Question',
            name: 'How do I check my flight status?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'You can check your flight status in real time using the flight tracker on our website or by reviewing your booking confirmation email for the latest updates. Our support team is also available 24/7 for urgent flight status inquiries.',
            },
          },
          {
            '@type': 'Question',
            name: "What's included in my cruise package?",
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Most cruise packages include your cabin accommodation, meals in the main dining areas, basic entertainment, and access to most onboard facilities. Specialty restaurants, premium beverages, shore excursions, and spa services are usually charged separately. Check your booking details for the specific inclusions.',
            },
          },
          {
            '@type': 'Question',
            name: 'How do I reset my password?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: "Use the 'Forgot Password' link on the login page to receive a password reset email. Follow the instructions in the email to set a new password. If you don't receive the email, check your spam folder or contact our support team for assistance.",
            },
          },
          {
            '@type': 'Question',
            name: 'What payment methods do you accept?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'We accept all major credit cards (Visa, MasterCard, American Express, Discover), debit cards, and digital wallets. All payments are processed securely with no hidden charges. Prices are displayed transparently during the booking process.',
            },
          },
        ],
      },
    ],
  },
  '/faqs': {
    title: 'Travel Booking FAQs | Jetsetters',
    description: 'Find answers to common questions about flights, hotels, cruises, vacation packages, visa services, payments, and travel bookings.',
    schema: [
      breadcrumb({ name: 'FAQs' }),
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
    schema: [breadcrumb({ name: 'Company' })],
  },
  '/contact': {
    title: 'Contact Jetsetters Travel',
    description: 'Reach the Jetsetters travel team for booking help, trip planning questions, quote requests, and expert personalized support.',
    schema: [breadcrumb({ name: 'Contact' })],
  },
  '/careers': {
    title: 'Careers at Jetsetters',
    description: 'Explore open positions and join the Jetsetters team building better, smarter travel experiences for customers around the world.',
    schema: [breadcrumb({ name: 'Careers' })],
  },
  '/privacy-policy': {
    title: 'Privacy Policy & Data Rights | Jetsetters',
    description: 'Learn how Jetsetters handles your personal data, your privacy rights, and how information you share is used across our travel services.',
    schema: [breadcrumb({ name: 'Privacy Policy' })],
  },
  '/cookies': {
    title: 'Cookie Policy | Jetsetters',
    description: 'Learn how Jetsetters uses cookies and similar tracking technologies to improve your browsing experience and personalize travel content.',
    schema: [breadcrumb({ name: 'Cookie Policy' })],
  },
  '/terms-conditions': {
    title: 'Travel Terms & Conditions | Jetsetters',
    description: 'Review Jetsetters complete booking terms covering payments, cancellations, travel service changes, refunds, and your responsibilities.',
    schema: [breadcrumb({ name: 'Terms & Conditions' })],
  },
  '/request': {
    title: 'Request a Travel Quote | Jetsetters',
    description: 'Tell us your travel plans and request a tailored quote for flights, hotels, cruises, vacation packages, or a full custom itinerary.',
    schema: [breadcrumb({ name: 'Request a Quote' })],
  },
  '/membership': {
    title: 'Jetsetters Membership Benefits',
    description: 'Explore Jetsetters membership plans and unlock exclusive travel perks, priority support, and member-only deals on every booking.',
    schema: [breadcrumb({ name: 'Membership' })],
  },
  '/help': {
    title: 'Help Center | Jetsetters',
    description: 'Browse Jetsetters help articles, video walkthroughs, booking guides, and support resources to get the most out of your travel experience.',
    schema: [breadcrumb({ name: 'Help Center' })],
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

export const INDEXABLE_ROUTE_SEO = Object.freeze(
  Object.entries(ROUTE_SEO)
    .filter(([, seo]) => seo.shouldIndex !== false)
    .map(([pathname, seo]) => Object.freeze({ pathname, seo })),
);

export const truncateSeoText = (value, maxLength) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;

  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
};

export const withSiteName = (title) => {
  if (!title) return SITE_NAME;
  return title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`;
};
