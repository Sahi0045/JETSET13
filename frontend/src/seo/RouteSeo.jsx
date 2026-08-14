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
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_URL}/flights/search?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
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
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content="website" />
      <script type="application/ld+json">{JSON.stringify(schemas)}</script>
    </Helmet>
  );
};

/**
 * Use this in a page with data-driven search copy (for example a named hotel)
 * to override the route defaults once that page's data has loaded.
 */
export const SeoOverride = ({ title, description, shouldIndex = true }) => {
  const { pathname } = useLocation();
  const canonicalUrl = getCanonicalURL(pathname);

  return (
    <Helmet>
      <title>{truncateSeoText(title, MAX_TITLE_LENGTH)}</title>
      <meta name="description" content={truncateSeoText(description, MAX_DESCRIPTION_LENGTH)} />
      <meta name="robots" content={shouldIndex ? 'index, follow' : 'noindex, follow'} />
      <link rel="canonical" href={canonicalUrl} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:title" content={truncateSeoText(title, MAX_TITLE_LENGTH)} />
      <meta property="og:description" content={truncateSeoText(description, MAX_DESCRIPTION_LENGTH)} />
      <meta property="og:type" content="website" />
    </Helmet>
  );
};

export default RouteSeo;
