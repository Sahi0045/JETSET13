/**
 * SEO Components Export
 * Central export file for all SEO-related components
 */

export { default as SEOHead } from './SEOHead';

export {
  HomePageSEO,
  FlightsPageSEO,
  HotelsPageSEO,
  CruisesPageSEO,
  PackagesPageSEO,
  VisaPageSEO,
  HelpCenterSEO,
  FlightSearchSEO,
  HotelSearchSEO,
  DashboardSEO,
  MyTripsSEO
} from './PageSEO';

export {
  getFlightSearchStructuredData,
  getHotelSearchStructuredData,
  getCruiseStructuredData,
  getFlightOfferStructuredData,
  getHotelOfferStructuredData,
  getBreadcrumbStructuredData,
  getFAQStructuredData,
  getArticleStructuredData,
  getReviewStructuredData
} from './structuredData';
