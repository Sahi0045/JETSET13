#!/usr/bin/env node
// One-shot: add loading="lazy" decoding="async" to <img> tags that lack them.
// Skips: Navbar.jsx (logo is above-the-fold), files that already have both attrs on every img.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../');
const SRC = path.join(ROOT, 'frontend/src');

const SKIP_FILES = new Set([
  path.join(SRC, 'Pages/Common/Navbar.jsx'),       // logo always above-the-fold
  path.join(SRC, 'frontend-App.jsx'),              // dead code
  path.join(SRC, 'Components/SignupForm.jsx'),     // dead code
  path.join(SRC, 'Pages/GoogleAuthTest.jsx'),      // dead code
]);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && /\.jsx$/.test(entry.name)) out.push(full);
  }
  return out;
}

// Match an <img ... /> or <img ... > tag (self-closing or not), possibly multi-line.
const IMG_RE = /<img\b([^>]*?)(\/?>)/gs;

let totalEdits = 0;
let filesEdited = 0;

for (const file of walk(SRC)) {
  if (SKIP_FILES.has(file)) continue;
  const src = fs.readFileSync(file, 'utf8');
  let edits = 0;
  const out = src.replace(IMG_RE, (full, attrs, end) => {
    const hasLoading = /\bloading\s*=/.test(attrs);
    const hasDecoding = /\bdecoding\s*=/.test(attrs);
    if (hasLoading && hasDecoding) return full;
    let inject = '';
    if (!hasLoading) inject += ' loading="lazy"';
    if (!hasDecoding) inject += ' decoding="async"';
    edits++;
    // Insert before the closing > / />
    // Strip trailing whitespace on attrs so we don't double-space.
    const trimmed = attrs.replace(/\s+$/, '');
    return `<img${trimmed}${inject} ${end}`.replace(/\s+\/>/, ' />').replace(/\s+>/, '>');
  });
  if (edits > 0) {
    fs.writeFileSync(file, out);
    filesEdited++;
    totalEdits += edits;
    console.log(`  ${edits} edits in ${path.relative(ROOT, file)}`);
  }
}

console.log(`\nDone: ${totalEdits} img tag(s) updated across ${filesEdited} file(s).`);
