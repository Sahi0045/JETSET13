#!/usr/bin/env node
/**
 * Pull the flight pages' photographs off the Unsplash CDN and serve them
 * ourselves.
 *
 * Hotlinking put three things outside our control: whether an image loads at
 * all, what format it arrives in, and what proof we hold that we were allowed
 * to use it. This downloads each photograph once as WebP, writes a credits
 * file recording where it came from and under what licence, and rewrites the
 * source files to point at the local copy.
 *
 *   node scripts/media/localise-unsplash.mjs            # download + rewrite
 *   node scripts/media/localise-unsplash.mjs --dry-run  # list what it would do
 *
 * Re-running is safe: a photograph already on disk is not downloaded again.
 */

import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'public/images/destinations');
const PUBLIC_PREFIX = '/images/destinations';
const CREDITS = path.join(OUT_DIR, 'credits.json');
const DRY = process.argv.includes('--dry-run');

// Only the flight surfaces. Other sections keep their own images until someone
// decides to move them too.
const SOURCES = [
  'frontend/src/Pages/Common/flights/popular-destination.jsx',
  'frontend/src/Pages/Common/flights/cheapest-flight.jsx',
  'frontend/src/Pages/Common/flights/flightlanding.jsx',
  'frontend/src/Pages/Common/flights/subscribe-section.jsx',
  'frontend/src/Pages/Common/flights/data.js',
];

// A destination card is never wider than about 700px, so 1200 covers it at
// twice the density. The three photographs that run the full width of the
// page get their own, larger size.
const WIDTH = 1200;
const QUALITY = 62;
const FULL_BLEED = new Set([
  'photo-1436491865332-7a61a109cc05', // hero, and the savings block
  'photo-1474302770737-173ee21bab63', // the festival band
]);
const widthFor = (id) => (FULL_BLEED.has(id) ? 2000 : WIDTH);

const URL_PATTERN = /https:\/\/images\.unsplash\.com\/(photo-[a-zA-Z0-9_-]+)\?[^"'`\s)]*/g;
// Photographs already rewritten to a local path: if the file is missing from
// disk - a fresh clone, a cleaned folder - fetch it again from the same source.
const LOCAL_PATTERN = /\/images\/destinations\/(photo-[a-zA-Z0-9_-]+)\.webp/g;

const cdnUrl = (id) =>
  `https://images.unsplash.com/${id}?q=${QUALITY}&w=${widthFor(id)}&auto=format&fm=webp&fit=crop`;

async function exists(file) {
  try { await stat(file); return true; } catch { return false; }
}

async function download(id) {
  const target = path.join(OUT_DIR, `${id}.webp`);
  if (await exists(target)) return { target, bytes: (await stat(target)).size, skipped: true };

  const res = await fetch(cdnUrl(id), { headers: { 'User-Agent': 'jetsetters-media/1.0' } });
  if (!res.ok) throw new Error(`${id}: HTTP ${res.status}`);
  const body = Buffer.from(await res.arrayBuffer());
  if (body.length < 5000) throw new Error(`${id}: ${body.length} bytes, not an image`);
  await writeFile(target, body);
  return { target, bytes: body.length, skipped: false };
}

/**
 * The licence does not require attribution, but a record of who took a
 * photograph is what answers a question about it two years from now.
 */
async function photographer(id) {
  try {
    const res = await fetch(`https://unsplash.com/photos/${id}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; jetsetters-media/1.0)' },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const byTitle = html.match(/<meta property="og:title" content="([^"]+)"/);
    if (byTitle) {
      const photoBy = byTitle[1].match(/(?:Photo|Image) by ([^|]+?)\s*(?:on Unsplash|\|)/i);
      if (photoBy) return photoBy[1].trim();
    }
    const byAuthor = html.match(/"name"\s*:\s*"([^"]+)"\s*,\s*"url"\s*:\s*"https:\/\/unsplash\.com\/@/);
    return byAuthor ? byAuthor[1] : null;
  } catch {
    return null;
  }
}

async function main() {
  const files = await Promise.all(
    SOURCES.map(async (rel) => ({ rel, text: await readFile(path.join(ROOT, rel), 'utf8') })),
  );

  const ids = new Set();
  for (const { text } of files) {
    for (const [, id] of text.matchAll(URL_PATTERN)) ids.add(id);
    for (const [, id] of text.matchAll(LOCAL_PATTERN)) ids.add(id);
  }
  console.log(`${ids.size} distinct photographs across ${files.length} files`);
  if (DRY) { [...ids].forEach((id) => console.log('  ', id)); return; }

  await mkdir(OUT_DIR, { recursive: true });

  let credits = {};
  if (await exists(CREDITS)) credits = JSON.parse(await readFile(CREDITS, 'utf8'));

  const failed = [];
  let fetched = 0;
  for (const id of ids) {
    try {
      const { bytes, skipped } = await download(id);
      if (!skipped) fetched += 1;
      if (!credits[id]) {
        credits[id] = {
          file: `${PUBLIC_PREFIX}/${id}.webp`,
          source: `https://unsplash.com/photos/${id.replace(/^photo-/, '')}`,
          cdn: cdnUrl(id),
          licence: 'Unsplash License — free for commercial use, no attribution required',
          licenceUrl: 'https://unsplash.com/license',
          retrieved: new Date().toISOString().slice(0, 10),
          photographer: await photographer(id),
          bytes,
          width: widthFor(id),
          format: 'webp',
        };
      }
      process.stdout.write(skipped ? '.' : '+');
    } catch (err) {
      failed.push(`${id}: ${err.message}`);
      process.stdout.write('x');
    }
  }
  process.stdout.write('\n');

  await writeFile(CREDITS, `${JSON.stringify(credits, null, 2)}\n`);

  // Rewrite the sources, but only for photographs we actually hold: a failed
  // download must keep its CDN url rather than point at a file that is not there.
  const held = new Set(Object.keys(credits).filter((id) => !failed.some((f) => f.startsWith(id))));
  for (const { rel, text } of files) {
    const next = text.replace(URL_PATTERN, (match, id) =>
      (held.has(id) ? `${PUBLIC_PREFIX}/${id}.webp` : match));
    if (next !== text) {
      await writeFile(path.join(ROOT, rel), next);
      console.log(`rewrote ${rel}`);
    }
  }

  console.log(`\n${fetched} downloaded, ${ids.size - fetched - failed.length} already held, ${failed.length} failed`);
  failed.forEach((f) => console.log('  !', f));
  console.log(`credits: ${path.relative(ROOT, CREDITS)}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
