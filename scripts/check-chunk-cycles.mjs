#!/usr/bin/env node
/**
 * Fail the build when two JavaScript chunks import each other.
 *
 * vite.config.js groups modules into named chunks by path. Two chunks that
 * import each other form a cycle the browser evaluates in an order that leaves
 * one side's exports uninitialised: #119 made the navbar (common-shell) import
 * a helper that landed in booking-flights, which imports the page wrapper from
 * common-shell. Production then threw "Cannot access '_t' before
 * initialization" and the flights pages - the home page included - never
 * rendered. Unit tests and `vite build` both passed; only a loaded page showed
 * it. This reads the built chunks and refuses a cycle between any of them.
 *
 * Usage: node scripts/check-chunk-cycles.mjs [dist/assets]
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] || 'dist/assets';
const chunks = readdirSync(dir).filter((name) => name.endsWith('.js'));
const graph = new Map();
for (const name of chunks) {
  const source = readFileSync(join(dir, name), 'utf8');
  // Static imports only: a dynamic import() loads after its importer has run,
  // so it cannot leave a binding uninitialised.
  const deps = new Set();
  for (const match of source.matchAll(/(?:^|[;\n}])\s*import\s*(?:[\w$*{}\s,]+from\s*)?["']\.\/([^"']+\.js)["']/g)) {
    if (match[1] !== name) deps.add(match[1]);
  }
  for (const match of source.matchAll(/export\s*\{[^}]*\}\s*from\s*["']\.\/([^"']+\.js)["']/g)) {
    if (match[1] !== name) deps.add(match[1]);
  }
  graph.set(name, [...deps]);
}

const cycles = [];
const state = new Map();
const stack = [];
const visit = (node) => {
  state.set(node, 'active');
  stack.push(node);
  for (const next of graph.get(node) || []) {
    if (!graph.has(next)) continue;
    if (state.get(next) === 'active') cycles.push([...stack.slice(stack.indexOf(next)), next]);
    else if (!state.has(next)) visit(next);
  }
  stack.pop();
  state.set(node, 'done');
};
for (const name of graph.keys()) if (!state.has(name)) visit(name);

if (cycles.length) {
  console.error(`❌ ${cycles.length} import cycle(s) between built chunks:`);
  for (const cycle of cycles) console.error(`   ${cycle.join(' -> ')}`);
  console.error('   Move the shared module so both chunks import it from one place (vite.config.js manualChunks).');
  process.exit(1);
}
console.log(`✅ No import cycles between ${chunks.length} built chunks.`);
