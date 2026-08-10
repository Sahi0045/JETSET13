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

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta name="robots" content={robots} />
      <link rel="canonical" href={canonicalUrl} />
    </Helmet>
  );
};

/**
 * Use this in a page with data-driven search copy (for example a named hotel)
 * to override the route defaults once that page's data has loaded.
 */
export const SeoOverride = ({ title, description, shouldIndex = false }) => {
  const { pathname } = useLocation();

  return (
    <Helmet>
      <title>{truncateSeoText(title, MAX_TITLE_LENGTH)}</title>
      <meta name="description" content={truncateSeoText(description, MAX_DESCRIPTION_LENGTH)} />
      <meta name="robots" content={shouldIndex ? 'index, follow' : 'noindex, follow'} />
      <link rel="canonical" href={getCanonicalURL(pathname)} />
    </Helmet>
  );
};

export default RouteSeo;
