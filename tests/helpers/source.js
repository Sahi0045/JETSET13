import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Read a source file as CODE, without the prose about it.
 *
 * Tests that assert on source text cannot otherwise tell a line of code from a
 * comment describing the line it replaced - and a fix is very often documented
 * by quoting the exact string it removed. So `expect(src).not.toMatch(/old/)`
 * matches the explanation of the removal and fails, twice in one day:
 *
 *   - `to: ""` in flightlanding.jsx, quoted in the comment explaining why it
 *     is gone
 *   - `multiple: true` in visa.controller.js, same
 *
 * Block comments and whole-line comments go. A `//` inside a URL survives,
 * because that line does not start with one.
 *
 * This is a weaker kind of test than executing the code, and where a behaviour
 * can be run it should be run instead. But 25 files in this suite read source,
 * and they should at least read the part that runs.
 */
export const codeOf = (source) => String(source)
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((line) => !/^\s*(\/\/|\*)/.test(line))
  .join('\n');

/** A repo file, comments stripped. Paths are relative to the repo root. */
export const readCode = (file) => codeOf(readFileSync(path.resolve(process.cwd(), file), 'utf8'));

/** A repo file exactly as written, comments and all. */
export const readRaw = (file) => readFileSync(path.resolve(process.cwd(), file), 'utf8');
