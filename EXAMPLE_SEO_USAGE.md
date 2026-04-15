# SEO Usage Examples for JetSetters

## Quick Start Guide

### 1. Wrap Your App with HelmetProvider

In your `main.jsx` or `app.jsx`:

```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import App from './App';

ReactDOM.createRoot(document.getElementById('app')).render(
  <React.StrictMode>
    <HelmetProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </HelmetProvider>
  </React.StrictMode>
);
```

---

## 2. Using Pre-configured Page SEO Components

### Homepage
```jsx
import React from 'react';
import { HomePageSEO } from './components/SEO';

const HomePage = () => {
  return (
    <>
      <HomePageSEO />
      <div>
        {/* Your homepage content */}
      </div>
    </>
  );
};

export default HomePage;
```

### Flights Page
```jsx
import React from 'react';
import { FlightsPageSEO } from './components/SEO';

const FlightsPage = () => {
  return (
    <>
      <FlightsPageSEO />
      <div>
        {/* Your flights page content */}
      </div>
    </>
  );
};

export default FlightsPage;
```

### Hotels Page
```jsx
import React from 'react';
import { HotelsPageSEO } from './components/SEO';

const HotelsPage = () => {
  return (
    <>
      <HotelsPageSEO />
      <div>
        {/* Your hotels page content */}
      </div>
    </>
  );
};

export default HotelsPage;
```

---

## 3. Dynamic SEO for Search Results

### Flight Search Results
```jsx
import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { FlightSearchSEO } from './components/SEO';

const FlightSearchResults = () => {
  const [searchParams] = useSearchParams();
  const origin = searchParams.get('from');
  const destination = searchParams.get('to');
  const date = searchParams.get('date');

  return (
    <>
      <FlightSearchSEO 
        origin={origin}
        destination={destination}
        date={date}
      />
      <div>
        {/* Search results */}
      </div>
    </>
  );
};

export default FlightSearchResults;
```

### Hotel Search Results
```jsx
import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { HotelSearchSEO } from './components/SEO';

const HotelSearchResults = () => {
  const [searchParams] = useSearchParams();
  const location = searchParams.get('location');
  const checkIn = searchParams.get('checkIn');
  const checkOut = searchParams.get('checkOut');

  return (
    <>
      <HotelSearchSEO 
        location={location}
        checkIn={checkIn}
        checkOut={checkOut}
      />
      <div>
        {/* Search results */}
      </div>
    </>
  );
};

export default HotelSearchResults;
```

---

## 4. Custom SEO for Specific Pages

### Custom Page with Full SEO
```jsx
import React from 'react';
import { SEOHead, getBreadcrumbStructuredData } from './components/SEO';

const CustomPage = () => {
  const breadcrumbs = [
    { name: 'Home', path: '/' },
    { name: 'Services', path: '/services' },
    { name: 'Custom Service', path: '/services/custom' }
  ];

  return (
    <>
      <SEOHead
        title="Custom Service - Best Travel Deals | JetSetters"
        description="Discover our custom travel service offering personalized vacation planning, exclusive deals, and 24/7 support."
        keywords="custom travel, personalized vacation, travel planning, exclusive deals"
        canonical="/services/custom"
        ogImage="https://www.jetsetterss.com/images/custom-service.jpg"
        structuredData={getBreadcrumbStructuredData(breadcrumbs)}
      />
      <div>
        {/* Your custom page content */}
      </div>
    </>
  );
};

export default CustomPage;
```

---

## 5. Adding Structured Data for Offers

### Flight Offer with Structured Data
```jsx
import React from 'react';
import { SEOHead, getFlightOfferStructuredData } from './components/SEO';

const FlightOfferPage = ({ flight }) => {
  const structuredData = getFlightOfferStructuredData(flight);

  return (
    <>
      <SEOHead
        title={`${flight.airline} - ${flight.departure.airport} to ${flight.arrival.airport} | JetSetters`}
        description={`Book ${flight.airline} flight from ${flight.departure.airport} to ${flight.arrival.airport}. Departure: ${flight.departure.time}, Arrival: ${flight.arrival.time}. Price: ${flight.price.currency} ${flight.price.amount}`}
        keywords={`${flight.airline}, ${flight.departure.airport} to ${flight.arrival.airport}, flight booking, cheap flights`}
        canonical={`/flights/offer/${flight.id}`}
        structuredData={structuredData}
      />
      <div>
        {/* Flight offer details */}
        <h1>{flight.airline} Flight</h1>
        <p>From {flight.departure.airport} to {flight.arrival.airport}</p>
        <p>Price: {flight.price.currency} {flight.price.amount}</p>
      </div>
    </>
  );
};

export default FlightOfferPage;
```

### Hotel Offer with Structured Data
```jsx
import React from 'react';
import { SEOHead, getHotelOfferStructuredData } from './components/SEO';

const HotelOfferPage = ({ hotel }) => {
  const structuredData = getHotelOfferStructuredData(hotel);

  return (
    <>
      <SEOHead
        title={`${hotel.name} - ${hotel.city}, ${hotel.country} | JetSetters`}
        description={`Book ${hotel.name} in ${hotel.city}. ${hotel.description}. Rating: ${hotel.rating}/5. Starting from ${hotel.priceRange}`}
        keywords={`${hotel.name}, hotels in ${hotel.city}, ${hotel.city} accommodation, ${hotel.country} hotels`}
        canonical={`/hotels/${hotel.id}`}
        ogImage={hotel.images[0]}
        structuredData={structuredData}
      />
      <div>
        {/* Hotel details */}
        <h1>{hotel.name}</h1>
        <p>{hotel.description}</p>
        <p>Rating: {hotel.rating}/5</p>
      </div>
    </>
  );
};

export default HotelOfferPage;
```

---

## 6. FAQ Page with Structured Data

```jsx
import React from 'react';
import { SEOHead, getFAQStructuredData } from './components/SEO';

const FAQPage = () => {
  const faqs = [
    {
      question: 'How do I book a flight?',
      answer: 'You can book a flight by searching for your destination, selecting your preferred flight, and completing the booking process with payment.'
    },
    {
      question: 'What is your cancellation policy?',
      answer: 'Cancellation policies vary by airline and fare type. Most bookings can be cancelled within 24 hours for a full refund.'
    },
    {
      question: 'Do you offer travel insurance?',
      answer: 'Yes, we offer comprehensive travel insurance options during the booking process to protect your trip.'
    }
  ];

  return (
    <>
      <SEOHead
        title="Frequently Asked Questions - Travel Help | JetSetters"
        description="Find answers to common questions about booking flights, hotels, cancellations, refunds, and more. Get help with your travel plans."
        keywords="travel FAQ, booking help, flight questions, hotel questions, cancellation policy"
        canonical="/faq"
        structuredData={getFAQStructuredData(faqs)}
      />
      <div>
        <h1>Frequently Asked Questions</h1>
        {faqs.map((faq, index) => (
          <div key={index}>
            <h2>{faq.question}</h2>
            <p>{faq.answer}</p>
          </div>
        ))}
      </div>
    </>
  );
};

export default FAQPage;
```

---

## 7. Using SEO Utility Functions

### Generate SEO-friendly URL Slug
```jsx
import { generateSlug } from './utils/seoUtils';

const hotelName = "Luxury Beach Resort & Spa";
const slug = generateSlug(hotelName);
// Result: "luxury-beach-resort-spa"

const url = `/hotels/${slug}`;
```

### Truncate Meta Description
```jsx
import { truncateDescription } from './utils/seoUtils';

const longDescription = "This is a very long description that needs to be truncated to fit within the meta description character limit of 160 characters for optimal SEO performance.";
const shortDescription = truncateDescription(longDescription, 160);
// Result: "This is a very long description that needs to be truncated to fit within the meta description character limit of 160 characters for optimal SEO..."
```

### Generate Social Sharing URLs
```jsx
import { generateSocialShareURLs } from './utils/seoUtils';

const shareURLs = generateSocialShareURLs(
  'https://www.jetsetterss.com/flights/deal',
  'Amazing Flight Deal to Paris!'
);

// Use in your component
<div>
  <a href={shareURLs.facebook} target="_blank">Share on Facebook</a>
  <a href={shareURLs.twitter} target="_blank">Share on Twitter</a>
  <a href={shareURLs.linkedin} target="_blank">Share on LinkedIn</a>
  <a href={shareURLs.whatsapp} target="_blank">Share on WhatsApp</a>
</div>
```

### Generate Breadcrumbs
```jsx
import { generateBreadcrumbs } from './utils/seoUtils';
import { useLocation } from 'react-router-dom';

const MyComponent = () => {
  const location = useLocation();
  const breadcrumbs = generateBreadcrumbs(location.pathname);
  
  return (
    <nav>
      {breadcrumbs.map((crumb, index) => (
        <span key={index}>
          <a href={crumb.path}>{crumb.name}</a>
          {index < breadcrumbs.length - 1 && ' > '}
        </span>
      ))}
    </nav>
  );
};
```

---

## 8. Private Pages (No Index)

### Dashboard Page
```jsx
import React from 'react';
import { DashboardSEO } from './components/SEO';

const Dashboard = () => {
  return (
    <>
      <DashboardSEO />
      <div>
        {/* Dashboard content - won't be indexed by search engines */}
      </div>
    </>
  );
};

export default Dashboard;
```

### My Trips Page
```jsx
import React from 'react';
import { MyTripsSEO } from './components/SEO';

const MyTrips = () => {
  return (
    <>
      <MyTripsSEO />
      <div>
        {/* My trips content - won't be indexed by search engines */}
      </div>
    </>
  );
};

export default MyTrips;
```

---

## 9. Performance Optimization

### Preload Critical Images
```jsx
import { useEffect } from 'react';
import { preloadImages } from './utils/seoUtils';

const HomePage = () => {
  useEffect(() => {
    // Preload hero images for faster loading
    preloadImages([
      '/images/hero-flight.jpg',
      '/images/hero-hotel.jpg',
      '/images/hero-cruise.jpg'
    ]);
  }, []);

  return (
    <div>
      {/* Homepage content */}
    </div>
  );
};
```

---

## 10. Analytics Tracking

### Track Page Views
```jsx
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { trackPageView } from './utils/seoUtils';

const App = () => {
  const location = useLocation();

  useEffect(() => {
    // Track page view on route change
    trackPageView(location.pathname, document.title);
  }, [location]);

  return (
    <div>
      {/* App content */}
    </div>
  );
};
```

---

## Best Practices

1. **Always include SEO component** at the top of your page component
2. **Use descriptive titles** that include relevant keywords
3. **Keep descriptions under 160 characters** for optimal display
4. **Use canonical URLs** to avoid duplicate content issues
5. **Add structured data** for rich snippets in search results
6. **Set noindex for private pages** (dashboard, profile, etc.)
7. **Use breadcrumbs** for better navigation and SEO
8. **Optimize images** with proper alt text and compression
9. **Monitor performance** with Google Search Console
10. **Update sitemaps** regularly as you add new pages

---

## Testing Your SEO

### Tools to Use
1. **Google Rich Results Test**: https://search.google.com/test/rich-results
2. **Facebook Sharing Debugger**: https://developers.facebook.com/tools/debug/
3. **Twitter Card Validator**: https://cards-dev.twitter.com/validator
4. **Google PageSpeed Insights**: https://pagespeed.web.dev/
5. **Lighthouse (Chrome DevTools)**: Built into Chrome

### What to Check
- ✅ Meta tags are present and correct
- ✅ Structured data validates without errors
- ✅ Open Graph tags display correctly
- ✅ Twitter Cards render properly
- ✅ Canonical URLs are correct
- ✅ Page loads quickly (< 3 seconds)
- ✅ Mobile-friendly design
- ✅ No broken links

---

**Happy Optimizing! 🚀**
