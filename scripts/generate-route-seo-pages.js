#!/usr/bin/env node

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_OG_IMAGE,
  DEFAULT_ROUTE_SEO,
  INDEXABLE_ROUTE_SEO,
  MAX_DESCRIPTION_LENGTH,
  MAX_TITLE_LENGTH,
  SITE_URL,
  SITE_WIDE_SCHEMA,
  truncateSeoText,
} from '../frontend/src/seo/routeSeo.js';

export const ROUTE_SEO_MARKER = '<!-- route-seo-head -->';
export const ROUTE_SEO_BODY_MARKER = '<!-- route-seo-body -->';
const DEFAULT_DIST_DIRECTORY = resolve('dist');

const CRAWL_NAVIGATION = Object.freeze([
  { pathname: '/', label: 'Home' },
  { pathname: '/flights', label: 'Flights' },
  { pathname: '/hotels', label: 'Hotels' },
  { pathname: '/cruise', label: 'Cruises' },
  { pathname: '/packages', label: 'Vacation Packages' },
  { pathname: '/visa', label: 'Visa Services' },
  { pathname: '/destinations', label: 'Destinations' },
  { pathname: '/resources', label: 'Travel Resources' },
  { pathname: '/travel-blog', label: 'Travel Blog' },
  { pathname: '/help', label: 'Help Center' },
  { pathname: '/support', label: 'Support' },
  { pathname: '/contact', label: 'Contact' },
  { pathname: '/faqs', label: 'FAQs' },
]);

const escapeHtmlAttribute = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/"/g, '&quot;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

const serializeJsonLd = (schema) => JSON.stringify(schema)
  .replace(/</g, '\\u003c')
  .replace(/>/g, '\\u003e')
  .replace(/&/g, '\\u0026')
  .replaceAll(' ', '\\u2028')
  .replaceAll(' ', '\\u2029');

const getCanonicalUrl = (pathname) => `${SITE_URL}${pathname}`;

const getRouteOutputPath = (distDirectory, pathname) => {
  if (pathname === '/') return resolve(distDirectory, 'index.html');
  return resolve(distDirectory, pathname.slice(1), 'index.html');
};

const validateIndexableRoutes = () => {
  const outputPaths = new Set();

  for (const { pathname, seo } of INDEXABLE_ROUTE_SEO) {
    if (!pathname.startsWith('/') || pathname.includes(':') || pathname.includes('*')) {
      throw new Error(`Invalid indexable route pathname: ${pathname}`);
    }

    if (seo.shouldIndex === false) {
      throw new Error(`Noindex route included in prerender manifest: ${pathname}`);
    }

    if (outputPaths.has(pathname)) {
      throw new Error(`Duplicate prerender output pathname: ${pathname}`);
    }

    outputPaths.add(pathname);
  }

  if (INDEXABLE_ROUTE_SEO.length === 0) {
    throw new Error('No indexable route metadata was found.');
  }
};

export const renderRouteSeoHead = (pathname, seo, { shouldIndex = true } = {}) => {
  const title = truncateSeoText(seo.title, MAX_TITLE_LENGTH);
  const description = truncateSeoText(seo.description, MAX_DESCRIPTION_LENGTH);
  const canonicalUrl = getCanonicalUrl(pathname);
  const image = seo.ogImage || DEFAULT_OG_IMAGE;
  const robots = shouldIndex ? 'index, follow' : 'noindex, follow';
  const schemas = seo.schema
    ? [...SITE_WIDE_SCHEMA, ...seo.schema]
    : SITE_WIDE_SCHEMA;

  return `  <title data-rh="true">${escapeHtmlAttribute(title)}</title>
  <meta data-rh="true" name="description" content="${escapeHtmlAttribute(description)}">
  <meta data-rh="true" name="robots" content="${robots}">
  <link data-rh="true" rel="canonical" href="${escapeHtmlAttribute(canonicalUrl)}">
  <link data-rh="true" rel="alternate" hrefLang="en" href="${escapeHtmlAttribute(canonicalUrl)}">
  <link data-rh="true" rel="alternate" hrefLang="x-default" href="${escapeHtmlAttribute(canonicalUrl)}">
  <meta data-rh="true" property="og:url" content="${escapeHtmlAttribute(canonicalUrl)}">
  <meta data-rh="true" property="og:title" content="${escapeHtmlAttribute(title)}">
  <meta data-rh="true" property="og:description" content="${escapeHtmlAttribute(description)}">
  <meta data-rh="true" property="og:type" content="website">
  <meta data-rh="true" property="og:image" content="${escapeHtmlAttribute(image)}">
  <meta data-rh="true" property="og:site_name" content="Jetsetters">
  <meta data-rh="true" property="og:locale" content="en_US">
  <meta data-rh="true" name="twitter:card" content="summary_large_image">
  <meta data-rh="true" name="twitter:title" content="${escapeHtmlAttribute(title)}">
  <meta data-rh="true" name="twitter:description" content="${escapeHtmlAttribute(description)}">
  <meta data-rh="true" name="twitter:image" content="${escapeHtmlAttribute(image)}">
  <script data-rh="true" type="application/ld+json">${serializeJsonLd(schemas)}</script>`;
};

export const injectRouteSeoHead = (template, head) => {
  const markerCount = template.split(ROUTE_SEO_MARKER).length - 1;
  if (markerCount !== 1) {
    throw new Error(`Expected exactly one ${ROUTE_SEO_MARKER} marker, found ${markerCount}.`);
  }

  return template.replace(ROUTE_SEO_MARKER, head);
};

/**
 * Render the route's own copy, when the route declares any.
 *
 * This lives inside `<div id="app">`, so React replaces it the moment it
 * mounts — visitors never see it, and it is not a second copy of the page.
 * It exists for crawlers that do not execute JavaScript, which previously got
 * an identical ~150-character nav-only body on every route and treated the
 * result as near-duplicate contentless HTML.
 *
 * Keep this copy faithful to what the route actually renders. Prerendered text
 * that promises something the mounted page does not show is cloaking.
 */
const renderRouteSeoContent = (seo) => {
  const content = seo?.content;
  if (!content) return '';

  const sections = (content.sections || [])
    .map(({ heading, body }) => (
      `    <section>
      <h2>${escapeHtmlAttribute(heading)}</h2>
      <p>${escapeHtmlAttribute(body)}</p>
    </section>`
    ))
    .join('\n');

  return `  <main data-route-seo-content="true">
    <h1>${escapeHtmlAttribute(content.heading)}</h1>
    <p>${escapeHtmlAttribute(content.intro)}</p>
${sections}
  </main>
`;
};

export const renderRouteSeoBody = (pathname, seo) => {
  const links = CRAWL_NAVIGATION.filter((link) => link.pathname !== pathname)
    .map(({ pathname: href, label }) => (
      `      <li><a href="${escapeHtmlAttribute(href)}">${escapeHtmlAttribute(label)}</a></li>`
    ))
    .join('\n');

  return `${renderRouteSeoContent(seo)}  <nav data-route-seo-navigation="true" aria-label="Explore Jetsetters">
    <p>Explore Jetsetters</p>
    <ul>
${links}
    </ul>
  </nav>`;
};

export const injectRouteSeoBody = (template, body) => {
  const markerCount = template.split(ROUTE_SEO_BODY_MARKER).length - 1;
  if (markerCount !== 1) {
    throw new Error(`Expected exactly one ${ROUTE_SEO_BODY_MARKER} marker, found ${markerCount}.`);
  }

  return template.replace(ROUTE_SEO_BODY_MARKER, body);
};

export const generateRouteSeoPages = async ({ distDirectory = DEFAULT_DIST_DIRECTORY } = {}) => {
  validateIndexableRoutes();

  const templatePath = resolve(distDirectory, 'index.html');
  const template = await readFile(templatePath, 'utf8');
  const generatedPaths = [];

  for (const { pathname, seo } of INDEXABLE_ROUTE_SEO) {
    const outputPath = getRouteOutputPath(distDirectory, pathname);
    if (pathname !== '/') {
      await rm(dirname(outputPath), { recursive: true, force: true });
    }
    await mkdir(dirname(outputPath), { recursive: true });
    const document = injectRouteSeoHead(
      injectRouteSeoBody(template, renderRouteSeoBody(pathname, seo)),
      renderRouteSeoHead(pathname, seo),
    );
    await writeFile(outputPath, document, 'utf8');
    generatedPaths.push(outputPath);
  }

  const spaShellPath = resolve(distDirectory, 'spa-shell.html');
  await writeFile(
    spaShellPath,
    injectRouteSeoHead(template, renderRouteSeoHead('/', DEFAULT_ROUTE_SEO, { shouldIndex: false })),
    'utf8',
  );

  console.log(`Generated route SEO heads for ${generatedPaths.length} indexable routes.`);
  return { generatedPaths, spaShellPath };
};

const isMainModule = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  generateRouteSeoPages().catch((error) => {
    console.error('Failed to generate route SEO pages:', error);
    process.exitCode = 1;
  });
}
