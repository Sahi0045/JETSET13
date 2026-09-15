import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * styled-jsx is not installed, so `<style jsx>` renders a plain global <style>
 * with an unknown `jsx` attribute, and React warns about it on every render of
 * the payment return page and others. The styles were global all along.
 */
const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? walk(path) : [path];
});

describe('component styles', () => {
  it('use plain <style>, not the styled-jsx attribute nothing supports', () => {
    // From the working directory: under jsdom, import.meta.url is not a file URL.
    const root = join(process.cwd(), 'frontend/src');
    const offenders = walk(root)
      .filter((path) => /\.(jsx?|tsx?)$/.test(path))
      .filter((path) => /<style jsx/.test(readFileSync(path, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
