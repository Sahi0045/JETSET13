import React from 'react';
import SEOHead from './SEOHead';
import { getBreadcrumbStructuredData } from './structuredData';

/**
 * Pre-configured SEO components for common pages
 */

export const HomePageSEO = () => (
  <SEOHead
    title="JetSetters - Book Flights, Hotels, Cruises & Travel Packages | Best Deals 2026"
    description="Discover the world with JetSetters! Book cheap flights, luxury hotels, cruise vacations, and complete travel packages. Compare prices, get instant confirmations, and enjoy 24/7 customer support. Your dream vacation starts here."
    keywords="book flights, cheap flights, hotel booking, cruise vacations, travel packages, flight deals, hotel deals, vacation planning, travel booking, airline tickets"
    canonical="/"
    structuredData={getBreadcrumbStructuredData([
      { name: 'Home', path: '/' }
    ])}
  />
);

export const FlightsPageSEO = () => (
  <SEOHead
    title="Book Cheap Flights - Compare Airline Tickets & Flight Deals | JetSetters"
    description="Find and book cheap flights to destinations worldwide. Compare prices from 500+ airlines, get instant confirmations, and enjoy flexible booking options. Best price guarantee on flight tickets."
    keywords="cheap flights, book flights, airline tickets, flight deals, international flights, domestic flights, flight booking, compare flight prices, discount flights"
    canonical="/flights"
    structuredData={getBreadcrumbStructuredData([
      { name: 'Home', path: '/' },
      { name: 'Flights', path: '/flights' }
    ])}
  />
);

export const HotelsPageSEO = () => (
  <SEOHead
    title="Hotel Booking - Find & Book Hotels Worldwide | Best Prices | JetSetters"
    description="Book hotels worldwide with JetSetters. Choose from luxury resorts to budget accommodations. Free cancellation on most bookings, instant confirmation, and best price guarantee."
    keywords="hotel booking, book hotels, cheap hotels, luxury hotels, hotel deals, accommodation, resort booking, hotel reservations, budget hotels"
    canonical="/hotels"
    structuredData={getBreadcrumbStructuredData([
      { name: 'Home', path: '/' },
      { name: 'Hotels', path: '/hotels' }
    ])}
  />
);

export const CruisesPageSEO = () => (
  <SEOHead
    title="Cruise Vacations - Book Cruise Ships & Ocean Cruises | JetSetters"
    description="Explore the world by sea! Book cruise vacations to exotic destinations. Choose from luxury cruise lines, all-inclusive packages, and special deals. Your perfect cruise awaits."
    keywords="cruise vacations, book cruise, cruise ships, ocean cruises, cruise deals, luxury cruises, cruise packages, cruise booking, cruise lines"
    canonical="/cruises"
    structuredData={getBreadcrumbStructuredData([
      { name: 'Home', path: '/' },
      { name: 'Cruises', path: '/cruises' }
    ])}
  />
);

export const PackagesPageSEO = () => (
  <SEOHead
    title="Travel Packages - All-Inclusive Vacation Packages | JetSetters"
    description="Discover amazing travel packages combining flights, hotels, and activities. All-inclusive vacation deals to top destinations worldwide. Save more when you book together."
    keywords="travel packages, vacation packages, all-inclusive packages, holiday packages, tour packages, travel deals, vacation deals"
    canonical="/packages"
    structuredData={getBreadcrumbStructuredData([
      { name: 'Home', path: '/' },
      { name: 'Packages', path: '/packages' }
    ])}
  />
);

export const VisaPageSEO = () => (
  <SEOHead
    title="Visa Services - Visa Application & Processing | JetSetters"
    description="Simplify your visa application process with JetSetters. Expert guidance, document verification, and fast processing for tourist, business, and student visas worldwide."
    keywords="visa services, visa application, visa processing, tourist visa, business visa, student visa, visa assistance, visa requirements"
    canonical="/visa"
    structuredData={getBreadcrumbStructuredData([
      { name: 'Home', path: '/' },
      { name: 'Visa Services', path: '/visa' }
    ])}
  />
);

export const HelpCenterSEO = () => (
  <SEOHead
    title="Help Center - Customer Support & FAQs | JetSetters"
    description="Get help with your bookings, cancellations, refunds, and more. Browse our FAQs or contact our 24/7 customer support team for assistance."
    keywords="help center, customer support, FAQs, booking help, travel support, contact support"
    canonical="/help"
    structuredData={getBreadcrumbStructuredData([
      { name: 'Home', path: '/' },
      { name: 'Help Center', path: '/help' }
    ])}
  />
);

export const FlightSearchSEO = ({ origin, destination, date }) => (
  <SEOHead
    title={`Flights from ${origin} to ${destination} - Compare & Book | JetSetters`}
    description={`Find cheap flights from ${origin} to ${destination} on ${date}. Compare prices from multiple airlines and book with confidence. Best deals guaranteed.`}
    keywords={`${origin} to ${destination} flights, ${origin} ${destination} airfare, cheap flights ${origin} ${destination}`}
    canonical={`/flights/search?from=${origin}&to=${destination}&date=${date}`}
    noindex={true} // Search results shouldn't be indexed
  />
);

export const HotelSearchSEO = ({ location, checkIn, checkOut }) => (
  <SEOHead
    title={`Hotels in ${location} - Book Hotels | JetSetters`}
    description={`Find and book hotels in ${location} from ${checkIn} to ${checkOut}. Compare prices, read reviews, and get instant confirmation.`}
    keywords={`hotels in ${location}, ${location} hotels, ${location} accommodation, book hotels ${location}`}
    canonical={`/hotels/search?location=${location}&checkIn=${checkIn}&checkOut=${checkOut}`}
    noindex={true} // Search results shouldn't be indexed
  />
);

export const DashboardSEO = () => (
  <SEOHead
    title="My Dashboard - Manage Your Bookings | JetSetters"
    description="View and manage your flight, hotel, and cruise bookings. Access your travel itinerary, booking confirmations, and account settings."
    canonical="/dashboard"
    noindex={true} // Private pages shouldn't be indexed
    nofollow={true}
  />
);

export const MyTripsSEO = () => (
  <SEOHead
    title="My Trips - View Your Travel Bookings | JetSetters"
    description="Access all your travel bookings in one place. View upcoming trips, past bookings, and manage your reservations."
    canonical="/my-trips"
    noindex={true}
    nofollow={true}
  />
);
