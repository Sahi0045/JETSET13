import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { INDEXABLE_ROUTE_SEO, SITE_URL } from '../../frontend/src/seo/routeSeo.js';
import {
  ROUTE_SEO_MARKER,
  generateRouteSeoPages,
  injectRouteSeoHead,
  renderRouteSeoHead,
} from '../../scripts/generate-route-seo-pages.js';

const temporaryDirectories = [];
const template = `<!doctype html><html><head>${ROUTE_SEO_MARKER}</head><body><div id="app"></div></body></html>`;

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
  it('generates every exact indexable route with one managed route head', async () => {
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

    const spaShell = await readFile(spaShellPath, 'utf8');
    expect(spaShell).toContain('name="robots" content="noindex, follow"');
    expect(spaShell).toContain('<title data-rh="true">Luxury Travel, Simply Planned | Jetsetters</title>');
  });

  it('fails when the template does not contain exactly one injection marker', () => {
    expect(() => injectRouteSeoHead('<html></html>', 'head')).toThrow('Expected exactly one');
    expect(() => injectRouteSeoHead(`${ROUTE_SEO_MARKER}${ROUTE_SEO_MARKER}`, 'head')).toThrow('Expected exactly one');
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

  it('keeps Vercel public-document rewrites aligned with indexable routes', async () => {
    const config = JSON.parse(await readFile('vercel.json', 'utf8'));
    const [, topLevelDocuments, visaDocuments, ...spaFallbacks] = config.rewrites;
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
    expect(spaFallbacks.every(({ destination }) => destination === '/spa-shell.html')).toBe(true);
  });
});
