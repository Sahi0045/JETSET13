import React from 'react';
import { Helmet } from 'react-helmet-async';
import { matchPath, useLocation } from 'react-router-dom';
import { getCanonicalURL } from '../utils/seoUtils';
import {
  DEFAULT_ROUTE_SEO,
  MAX_DESCRIPTION_LENGTH,
  MAX_TITLE_LENGTH,
  ROUTE_SEO,
  ROUTE_SEO_PATTERNS,
  truncateSeoText,
} from './routeSeo';

const SITE_URL = 'https://www.jetsetterss.com';
const DEFAULT_OG_IMAGE = `${SITE_URL}/images/logos/jetsetters_3d_logo_final.png`;

const SITE_WIDE_SCHEMA = [
  {
    '@context': 'https://schema.org',
    '@type': ['TravelAgency', 'Organization'],
    '@id': `${SITE_URL}/#organization`,
    name: 'Jetsetters',
    url: SITE_URL,
    logo: {
      '@type': 'ImageObject',
      url: `${SITE_URL}/images/logos/jetsetters_3d_logo_final.png`,
    },
    description: 'Jetsetters is a luxury travel platform offering flights, hotels, cruises, vacation packages, and visa services with personalized expert support.',
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer service',
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

const getRouteSeo = (pathname) => {
  const exactMatch = ROUTE_SEO[pathname];
  if (exactMatch) return exactMatch;

  const patternMatch = ROUTE_SEO_PATTERNS.find(({ path }) => matchPath({ path, end: true }, pathname));
  return patternMatch || DEFAULT_ROUTE_SEO;
};

/**
 * Keeps the document head in sync with React Router navigation.
 *
 * Vite serves the same HTML shell for every route, so this component owns the
 * route-level title, description, canonical URL, and indexability settings.
 */
const RouteSeo = () => {
  const { pathname } = useLocation();
  const seo = getRouteSeo(pathname);
  const title = truncateSeoText(seo.title, MAX_TITLE_LENGTH);
  const description = truncateSeoText(seo.description, MAX_DESCRIPTION_LENGTH);
  const canonicalUrl = getCanonicalURL(pathname);
  const robots = seo.shouldIndex === false ? 'noindex, follow' : 'index, follow';

  const schemas = seo.schema
    ? [...SITE_WIDE_SCHEMA, ...seo.schema]
    : SITE_WIDE_SCHEMA;

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta name="robots" content={robots} />
      <link rel="canonical" href={canonicalUrl} />
      <link rel="alternate" hrefLang="en" href={canonicalUrl} />
      <link rel="alternate" hrefLang="x-default" href={canonicalUrl} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content="website" />
      <meta property="og:image" content={seo.ogImage || DEFAULT_OG_IMAGE} />
      <meta property="og:site_name" content="Jetsetters" />
      <meta property="og:locale" content="en_US" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={seo.ogImage || DEFAULT_OG_IMAGE} />
      <script type="application/ld+json">{JSON.stringify(schemas)}</script>
    </Helmet>
  );
};

/**
 * Use this in a page with data-driven search copy (for example a named hotel)
 * to override the route defaults once that page's data has loaded.
 */
export const SeoOverride = ({ title, description, shouldIndex = true, ogImage, schema }) => {
  const { pathname } = useLocation();
  const canonicalUrl = getCanonicalURL(pathname);
  const truncatedTitle = truncateSeoText(title, MAX_TITLE_LENGTH);
  const truncatedDesc = truncateSeoText(description, MAX_DESCRIPTION_LENGTH);
  const image = ogImage || DEFAULT_OG_IMAGE;

  return (
    <Helmet>
      <title>{truncatedTitle}</title>
      <meta name="description" content={truncatedDesc} />
      <meta name="robots" content={shouldIndex ? 'index, follow' : 'noindex, follow'} />
      <link rel="canonical" href={canonicalUrl} />
      <link rel="alternate" hrefLang="en" href={canonicalUrl} />
      <link rel="alternate" hrefLang="x-default" href={canonicalUrl} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:title" content={truncatedTitle} />
      <meta property="og:description" content={truncatedDesc} />
      <meta property="og:type" content="website" />
      <meta property="og:image" content={image} />
      <meta property="og:site_name" content="Jetsetters" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={truncatedTitle} />
      <meta name="twitter:description" content={truncatedDesc} />
      <meta name="twitter:image" content={image} />
      {schema && <script type="application/ld+json">{JSON.stringify(schema)}</script>}
    </Helmet>
  );
};

export default RouteSeo;
