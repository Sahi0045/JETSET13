/**
 * Structured Data (JSON-LD) Templates for SEO
 * These help search engines understand your content better
 */

export const getFlightSearchStructuredData = (origin, destination, date) => ({
  "@context": "https://schema.org",
  "@type": "FlightReservation",
  "reservationFor": {
    "@type": "Flight",
    "departureAirport": {
      "@type": "Airport",
      "iataCode": origin
    },
    "arrivalAirport": {
      "@type": "Airport",
      "iataCode": destination
    },
    "departureTime": date
  },
  "provider": {
    "@type": "TravelAgency",
    "name": "JetSetters"
  }
});

export const getHotelSearchStructuredData = (location, checkIn, checkOut) => ({
  "@context": "https://schema.org",
  "@type": "LodgingReservation",
  "reservationFor": {
    "@type": "Hotel",
    "address": {
      "@type": "PostalAddress",
      "addressLocality": location
    }
  },
  "checkinTime": checkIn,
  "checkoutTime": checkOut,
  "provider": {
    "@type": "TravelAgency",
    "name": "JetSetters"
  }
});

export const getCruiseStructuredData = (cruiseName, destination, departureDate) => ({
  "@context": "https://schema.org",
  "@type": "TouristTrip",
  "name": cruiseName,
  "description": `Cruise vacation to ${destination}`,
  "touristType": "Cruise Passenger",
  "startDate": departureDate,
  "provider": {
    "@type": "TravelAgency",
    "name": "JetSetters"
  }
});

export const getFlightOfferStructuredData = (flight) => ({
  "@context": "https://schema.org",
  "@type": "Offer",
  "itemOffered": {
    "@type": "Flight",
    "provider": {
      "@type": "Airline",
      "name": flight.airline,
      "iataCode": flight.airlineCode
    },
    "departureAirport": {
      "@type": "Airport",
      "iataCode": flight.departure.airport
    },
    "arrivalAirport": {
      "@type": "Airport",
      "iataCode": flight.arrival.airport
    },
    "departureTime": `${flight.departure.date}T${flight.departure.time}`,
    "arrivalTime": `${flight.arrival.date}T${flight.arrival.time}`
  },
  "price": flight.price.amount,
  "priceCurrency": flight.price.currency,
  "availability": "https://schema.org/InStock",
  "seller": {
    "@type": "TravelAgency",
    "name": "JetSetters"
  }
});

export const getHotelOfferStructuredData = (hotel) => ({
  "@context": "https://schema.org",
  "@type": "Hotel",
  "name": hotel.name,
  "description": hotel.description,
  "address": {
    "@type": "PostalAddress",
    "addressLocality": hotel.city,
    "addressCountry": hotel.country
  },
  "starRating": {
    "@type": "Rating",
    "ratingValue": hotel.rating
  },
  "priceRange": hotel.priceRange,
  "image": hotel.images,
  "aggregateRating": hotel.reviews ? {
    "@type": "AggregateRating",
    "ratingValue": hotel.reviews.average,
    "reviewCount": hotel.reviews.count
  } : undefined
});

export const getBreadcrumbStructuredData = (items) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": items.map((item, index) => ({
    "@type": "ListItem",
    "position": index + 1,
    "name": item.name,
    "item": `https://www.jetsetterss.com${item.path}`
  }))
});

export const getFAQStructuredData = (faqs) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": faqs.map(faq => ({
    "@type": "Question",
    "name": faq.question,
    "acceptedAnswer": {
      "@type": "Answer",
      "text": faq.answer
    }
  }))
});

export const getArticleStructuredData = (article) => ({
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": article.title,
  "description": article.description,
  "image": article.image,
  "datePublished": article.publishedDate,
  "dateModified": article.modifiedDate,
  "author": {
    "@type": "Organization",
    "name": "JetSetters"
  },
  "publisher": {
    "@type": "Organization",
    "name": "JetSetters",
    "logo": {
      "@type": "ImageObject",
      "url": "https://www.jetsetterss.com/images/jetset.jpeg"
    }
  }
});

export const getReviewStructuredData = (review) => ({
  "@context": "https://schema.org",
  "@type": "Review",
  "itemReviewed": {
    "@type": review.itemType || "Product",
    "name": review.itemName
  },
  "reviewRating": {
    "@type": "Rating",
    "ratingValue": review.rating,
    "bestRating": "5"
  },
  "author": {
    "@type": "Person",
    "name": review.authorName
  },
  "reviewBody": review.text,
  "datePublished": review.date
});
