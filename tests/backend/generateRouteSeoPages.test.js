import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { INDEXABLE_ROUTE_SEO, SITE_URL } from '../../frontend/src/seo/routeSeo.js';
import {
  ROUTE_SEO_BODY_MARKER,
  ROUTE_SEO_MARKER,
  generateRouteSeoPages,
  generateSitemaps,
  injectRouteSeoBody,
  injectRouteSeoHead,
  renderRouteSeoBody,
  renderRouteSeoHead,
  renderSitemap,
} from '../../scripts/generate-route-seo-pages.js';

const temporaryDirectories = [];
const template = `<!doctype html><html><head>${ROUTE_SEO_MARKER}</head><body><div id="app">${ROUTE_SEO_BODY_MARKER}</div></body></html>`;
const crawlNavigationPaths = [
  '/',
  '/flights',
  '/hotels',
  '/cruise',
  '/packages',
  '/visa',
  '/destinations',
  '/resources',
  '/travel-blog',
  '/help',
  '/support',
  '/contact',
  '/faqs',
];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => import('node:fs/promises').then(({ rm }) => rm(directory, { recursive: true, force: true }))));
});

const createDistDirectory = async () => {
  const directory = await mkdtemp(join(tmpdir(), 'jetsetters-route-seo-'));
  temporaryDirectories.push(directory);
  await writeFile(join(directory, 'index.html'), template, 'utf8');
  return directory;
};

describe('route SEO page generator', () => {
  it('generates every exact indexable route with one managed route head and crawl navigation', async () => {
    const distDirectory = await createDistDirectory();
    const { generatedPaths, spaShellPath } = await generateRouteSeoPages({ distDirectory });

    expect(generatedPaths).toHaveLength(INDEXABLE_ROUTE_SEO.length);
    expect(INDEXABLE_ROUTE_SEO).toHaveLength(27);

    const cruisePage = await readFile(join(distDirectory, 'cruise', 'index.html'), 'utf8');
    expect(cruisePage).toContain('<title data-rh="true">Luxury Cruise Vacations | Jetsetters</title>');
    expect(cruisePage).toContain(`rel="canonical" href="${SITE_URL}/cruise"`);
    expect(cruisePage).toContain('name="robots" content="index, follow"');
    expect(cruisePage.match(/property="og:title"/g)).toHaveLength(1);
    expect(cruisePage.match(/type="application\/ld\+json"/g)).toHaveLength(1);
    expect(cruisePage).toContain('data-route-seo-navigation="true"');
    expect(cruisePage).toContain('href="/hotels"');
    expect(cruisePage).not.toContain('href="/cruise"');

    const destinationsPage = await readFile(join(distDirectory, 'destinations', 'index.html'), 'utf8');
    expect(destinationsPage).toContain('href="/help"');
    expect(destinationsPage).toContain('href="/contact"');
    expect(destinationsPage).not.toContain('href="/destinations"');

    const helpPage = await readFile(join(distDirectory, 'help', 'index.html'), 'utf8');
    expect(helpPage).toContain('href="/hotels"');
    expect(helpPage).toContain('href="/support"');
    expect(helpPage).not.toContain('href="/help"');

    for (const { pathname } of INDEXABLE_ROUTE_SEO) {
      const outputPath = pathname === '/'
        ? join(distDirectory, 'index.html')
        : join(distDirectory, pathname.slice(1), 'index.html');
      const page = await readFile(outputPath, 'utf8');
      const expectedPaths = crawlNavigationPaths.filter((href) => href !== pathname);

      expect(page.match(/<a href="\//g)).toHaveLength(expectedPaths.length);
      expect(page).not.toContain(ROUTE_SEO_BODY_MARKER);
      expectedPaths.forEach((href) => expect(page).toContain(`href="${href}"`));
    }

    const spaShell = await readFile(spaShellPath, 'utf8');
    expect(spaShell).toContain('name="robots" content="noindex, follow"');
    expect(spaShell).toContain('<title data-rh="true">Luxury Travel, Simply Planned | Jetsetters</title>');
    expect(spaShell).not.toContain('data-route-seo-navigation="true"');
  });

  it('fails when the template does not contain exactly one injection marker', () => {
    expect(() => injectRouteSeoHead('<html></html>', 'head')).toThrow('Expected exactly one');
    expect(() => injectRouteSeoHead(`${ROUTE_SEO_MARKER}${ROUTE_SEO_MARKER}`, 'head')).toThrow('Expected exactly one');
    expect(() => injectRouteSeoBody('<html></html>', 'body')).toThrow('Expected exactly one');
    expect(() => injectRouteSeoBody(`${ROUTE_SEO_BODY_MARKER}${ROUTE_SEO_BODY_MARKER}`, 'body')).toThrow('Expected exactly one');
  });

  it('escapes route metadata and JSON-LD safely', () => {
    const head = renderRouteSeoHead('/test', {
      title: 'A <title> & "quote"',
      description: 'A <description> & "quote"',
      schema: [{ '@context': 'https://schema.org', name: '</script><script>alert(1)</script>' }],
    });

    expect(head).toContain('A &lt;title&gt; &amp; &quot;quote&quot;');
    expect(head).toContain('\\u003c/script\\u003e');
    expect(head).not.toContain('</script><script>alert(1)</script>');
  });

  it('renders escaped crawl-navigation links and omits the current route', () => {
    const body = renderRouteSeoBody('/help');

    expect(body).toContain('aria-label="Explore Jetsetters"');
    expect(body).toContain('href="/hotels"');
    expect(body).not.toContain('href="/help"');
  });

  it('renders route content with a single h1 when the route declares any', () => {
    const seo = {
      content: {
        heading: 'Hotels & Stays',
        intro: 'Intro copy.',
        sections: [{ heading: 'Search "fast"', body: 'Section copy.' }],
      },
    };
    const body = renderRouteSeoBody('/hotels', seo);

    expect(body.match(/<h1>/g)).toHaveLength(1);
    expect(body).toContain('<h1>Hotels &amp; Stays</h1>');
    expect(body).toContain('<p>Intro copy.</p>');
    expect(body).toContain('<h2>Search &quot;fast&quot;</h2>');
    // The crawl navigation must still follow the content.
    expect(body.indexOf('data-route-seo-content')).toBeLessThan(body.indexOf('data-route-seo-navigation'));
  });

  it('omits the content block entirely for routes that declare none', () => {
    const body = renderRouteSeoBody('/hotels', { title: 'x' });

    expect(body).not.toContain('data-route-seo-content');
    expect(body).not.toContain('<h1>');
    expect(body).toContain('data-route-seo-navigation');
  });

  // Regression guard for the Search Console finding: /hotels and /cruises were
  // "Crawled - currently not indexed" while every prerendered body was the same
  // ~150-character nav. Content-bearing routes must stay distinguishable.
  it('gives content-bearing routes materially different bodies', () => {
    const bodyFor = (pathname) => {
      const { seo } = INDEXABLE_ROUTE_SEO.find((route) => route.pathname === pathname);
      return renderRouteSeoBody(pathname, seo);
    };
    const hotels = bodyFor('/hotels');
    const cruises = bodyFor('/cruises');

    for (const body of [hotels, cruises]) {
      expect(body).toContain('data-route-seo-content');
      expect(body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().length).toBeGreaterThan(400);
    }
    expect(hotels).not.toBe(cruises);
  });

  // The sitemaps used to be hand-written files in public/. They drifted, and
  // Search Console reported "No referring sitemaps detected" for every page.
  // These guards keep generation tied to INDEXABLE_ROUTE_SEO.
  describe('sitemaps', () => {
    const readSitemaps = async () => {
      const directory = await createDistDirectory();
      await generateSitemaps({ distDirectory: directory });
      const entries = {};
      for (const file of ['sitemap.xml', 'sitemap-flights.xml', 'sitemap-hotels.xml', 'sitemap-cruises.xml']) {
        const xml = await readFile(join(directory, file), 'utf8');
        entries[file] = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, loc]) => loc);
      }
      return entries;
    };

    it('lists every indexable route in sitemap.xml', async () => {
      const { 'sitemap.xml': locs } = await readSitemaps();
      const expected = INDEXABLE_ROUTE_SEO.map(({ pathname }) => `${SITE_URL}${pathname}`);

      expect(new Set(locs)).toEqual(new Set(expected));
      expect(locs).toHaveLength(expected.length);
    });

    it('covers every indexable route across the sitemap set', async () => {
      const entries = await readSitemaps();
      const covered = new Set(Object.values(entries).flat());
      const expected = INDEXABLE_ROUTE_SEO.map(({ pathname }) => `${SITE_URL}${pathname}`);

      for (const url of expected) {
        expect(covered.has(url), `${url} is in no sitemap`).toBe(true);
      }
      // Nothing may be advertised that is not an indexable route.
      for (const url of covered) {
        expect(expected, `${url} is in a sitemap but is not indexable`).toContain(url);
      }
    });

    it('puts the money pages in their vertical sitemaps', async () => {
      const entries = await readSitemaps();

      expect(entries['sitemap-hotels.xml']).toContain(`${SITE_URL}/hotels`);
      expect(entries['sitemap-flights.xml']).toContain(`${SITE_URL}/flights`);
      expect(entries['sitemap-cruises.xml']).toContain(`${SITE_URL}/cruises`);
      expect(entries['sitemap-cruises.xml']).toContain(`${SITE_URL}/cruise`);
    });

    it('emits valid XML with escaped locs and no faked metadata', () => {
      const xml = renderSitemap(['/hotels']);

      expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
      expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
      expect(xml).toContain(`<loc>${SITE_URL}/hotels</loc>`);
      // Google ignores these two and distrusts an always-current lastmod.
      expect(xml).not.toContain('<changefreq>');
      expect(xml).not.toContain('<priority>');
      expect(xml).not.toContain('<lastmod>');
    });

    it('keeps robots.txt declaring exactly the generated sitemaps', async () => {
      const robots = await readFile('public/robots.txt', 'utf8');
      const declared = [...robots.matchAll(/^Sitemap:\s*(\S+)\s*$/gim)].map(([, url]) => url);
      const generated = ['sitemap.xml', 'sitemap-flights.xml', 'sitemap-hotels.xml', 'sitemap-cruises.xml']
        .map((file) => `${SITE_URL}/${file}`);

      expect(new Set(declared)).toEqual(new Set(generated));
    });
  });

  it('keeps Vercel public-document rewrites aligned with indexable routes', async () => {
    const config = JSON.parse(await readFile('vercel.json', 'utf8'));

    // Located by what each rule does, not by where it sits. This used to
    // destructure by index, so adding an unrelated rewrite - routing
    // /api/flights to the Frankfurt host, say - broke a test about SEO
    // documents, which tells you nothing about what actually went wrong.
    const topLevelDocuments = config.rewrites.find((r) => r.destination === '/$1/index.html');
    const visaDocuments = config.rewrites.find((r) => r.destination === '/visa/$1/index.html');
    const spaFallbacks = config.rewrites.filter((r) => r.destination === '/spa-shell.html');

    expect(topLevelDocuments, 'no top-level document rewrite in vercel.json').toBeDefined();
    expect(visaDocuments, 'no visa document rewrite in vercel.json').toBeDefined();

    const topLevelPaths = topLevelDocuments.source.match(/\((.*)\)/)[1]
      .split('|')
      .map((pathname) => `/${pathname}`);
    const visaPaths = visaDocuments.source.match(/\((.*)\)/)[1]
      .split('|')
      .map((pathname) => `/visa/${pathname}`);
    const expectedPaths = INDEXABLE_ROUTE_SEO
      .map(({ pathname }) => pathname)
      .filter((pathname) => pathname !== '/');

    expect(new Set([...topLevelPaths, ...visaPaths])).toEqual(new Set(expectedPaths));
    expect(spaFallbacks).toHaveLength(4);
  });
});
