import React from 'react';
import { Helmet } from 'react-helmet-async';

/**
 * SEOHead Component
 * Dynamic SEO meta tags for each page
 * 
 * @param {Object} props
 * @param {string} props.title - Page title
 * @param {string} props.description - Page description
 * @param {string} props.keywords - Page keywords (comma-separated)
 * @param {string} props.canonical - Canonical URL
 * @param {string} props.ogImage - Open Graph image URL
 * @param {string} props.ogType - Open Graph type (default: 'website')
 * @param {Object} props.structuredData - JSON-LD structured data
 */
const SEOHead = ({
  title = 'JetSetters - Book Flights, Hotels, Cruises & Travel Packages',
  description = 'Discover the world with JetSetters! Book cheap flights, luxury hotels, cruise vacations, and complete travel packages. Compare prices, get instant confirmations, and enjoy 24/7 customer support.',
  keywords = 'book flights, cheap flights, hotel booking, cruise vacations, travel packages, flight deals, hotel deals',
  canonical,
  ogImage = 'https://www.jetsetterss.com/images/jetset.jpeg',
  ogType = 'website',
  structuredData,
  noindex = false,
  nofollow = false
}) => {
  const siteUrl = 'https://www.jetsetterss.com';
  const fullCanonical = canonical ? `${siteUrl}${canonical}` : siteUrl;
  
  // Construct robots meta content
  const robotsContent = [
    noindex ? 'noindex' : 'index',
    nofollow ? 'nofollow' : 'follow',
    'max-image-preview:large',
    'max-snippet:-1',
    'max-video-preview:-1'
  ].join(', ');

  return (
    <Helmet>
      {/* Primary Meta Tags */}
      <title>{title}</title>
      <meta name="title" content={title} />
      <meta name="description" content={description} />
      {keywords && <meta name="keywords" content={keywords} />}
      <meta name="robots" content={robotsContent} />
      
      {/* Canonical URL */}
      <link rel="canonical" href={fullCanonical} />
      
      {/* Open Graph / Facebook */}
      <meta property="og:type" content={ogType} />
      <meta property="og:url" content={fullCanonical} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:site_name" content="JetSetters" />
      
      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:url" content={fullCanonical} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />
      
      {/* Structured Data */}
      {structuredData && (
        <script type="application/ld+json">
          {JSON.stringify(structuredData)}
        </script>
      )}
    </Helmet>
  );
};

export default SEOHead;
