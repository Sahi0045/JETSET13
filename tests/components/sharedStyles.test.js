import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every page's stylesheets load on every other page: the admin login's and the
 * cruise hero's are on the flight search too. Two of their rules met on the
 * flight calendar. The cruise hero's `.fade-in` kept anything of that class at
 * opacity 0 until an animation faded it in, and the calendar and the fare
 * breakup carry the class; the admin login's `*` switched off every animation
 * on laptops with Windows animations turned off. There the page scrolled to
 * the calendar and showed nothing (reproduced on jetsetterss.com, 27 Oct).
 */

const stylesheets = (dir) => readdirSync(dir).flatMap((name) => {
  const file = path.join(dir, name);
  if (statSync(file).isDirectory()) return stylesheets(file);
  return name.endsWith('.css') ? [file] : [];
});

const rules = (css) => [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map(([, selectors, body]) => ({ selectors: selectors.split(',').map((s) => s.trim()), body }));

const offending = (test) => stylesheets(path.resolve(process.cwd(), 'frontend/src'))
  .flatMap((file) => rules(readFileSync(file, 'utf8'))
    .filter(test)
    .map(({ selectors }) => `${path.relative(process.cwd(), file)}: ${selectors.join(', ')}`));

describe('stylesheets shared by every page', () => {
  it('stop no animation outside their own page', () => {
    expect(offending(({ selectors, body }) => /animation\s*:\s*none/.test(body)
      && selectors.some((s) => /^\*(::?(before|after))?$/.test(s)))).toEqual([]);
  });

  it('hide nothing of class fade-in until an animation shows it', () => {
    expect(offending(({ selectors, body }) => /(^|;|\s)opacity\s*:\s*0\s*(;|$)/.test(body)
      && selectors.includes('.fade-in'))).toEqual([]);
  });
});
