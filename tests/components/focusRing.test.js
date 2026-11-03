// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import twColors from 'tailwindcss/colors';
import { describe, expect, it } from 'vitest';
import config from '../../tailwind.config.js';

/**
 * The owner wants no generic blue anywhere a focus shows: the brand teal
 * marks the field or button in focus. Tailwind's forms plugin paints every
 * text field's focus ring and border, and every ticked checkbox and radio, in
 * its own blue-600, and Tailwind's bare `ring` is blue-500. Pages added their
 * own blues on top, in class names and in stylesheets that load on every page.
 */

const root = process.cwd();

const files = (dir, ext) => readdirSync(dir).flatMap((name) => {
  const file = path.join(dir, name);
  if (statSync(file).isDirectory()) return files(file, ext);
  return ext.test(name) ? [file] : [];
});

const hexToRgb = (hex) => {
  const h = hex.length === 4 ? [...hex.slice(1)].map((c) => c + c).join('') : hex.slice(1, 7);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};

const colorsIn = (value) => [
  ...[...value.matchAll(/#(?:[0-9a-f]{6}|[0-9a-f]{3})\b/gi)].map(([hex]) => hexToRgb(hex)),
  ...[...value.matchAll(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/gi)].map((m) => m.slice(1, 4).map(Number)),
];

const isBlue = ([r, g, b]) => {
  const [rr, gg, bb] = [r / 255, g / 255, b / 255];
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const d = max - min;
  if (!d) return false;
  const s = d / (1 - Math.abs(max + min - 1));
  const h = max === rr ? ((gg - bb) / d + 6) % 6 : max === gg ? (bb - rr) / d + 2 : (rr - gg) / d + 4;
  return h * 60 >= 197 && h * 60 <= 260 && s > 0.3;
};

const hasBlue = (value) => colorsIn(value).some(isBlue);

const namedColor = (name) => {
  const [family, shade] = name.split('-');
  const value = shade ? twColors[family]?.[shade] : twColors[family];
  return typeof value === 'string' ? value : '';
};

const tailwindRules = async (html) => {
  const { css } = await postcss([tailwindcss({ ...config, content: [{ raw: html }] })])
    .process('@tailwind base; @tailwind utilities;', { from: undefined });
  const rules = [];
  postcss.parse(css).walkRules((rule) => {
    const decls = [];
    rule.walkDecls((d) => decls.push(`${d.prop}: ${d.value}`));
    rules.push({ selector: rule.selector, decls });
  });
  return rules;
};

const blueDecls = (rules, pick) => rules
  .filter(({ selector }) => pick(selector))
  .flatMap(({ selector, decls }) => decls.filter(hasBlue).map((d) => `${selector} { ${d} }`));

describe('focus colours', () => {
  it('a text field in focus is outlined in the brand teal, not the forms plugin blue', async () => {
    const rules = await tailwindRules('<input type="text"><input type="email"><textarea></textarea><select></select>');
    const focus = rules.filter(({ selector }) => /type=['"]?text['"]?\]\):focus/.test(selector));
    expect(blueDecls(rules, (s) => /:focus/.test(s))).toEqual([]);
    expect(focus.flatMap(({ decls }) => decls)).toEqual(expect.arrayContaining([
      '--tw-ring-color: #055B75',
      'border-color: #055B75',
    ]));
  });

  it('a ticked checkbox or radio is filled in the brand teal', async () => {
    const rules = await tailwindRules('<input type="checkbox"><input type="radio">');
    expect(blueDecls(rules, (s) => /checkbox|radio/.test(s))).toEqual([]);
    expect(rules.find(({ selector }) => /^input:where\(\[type=['"]?checkbox['"]?\]\),/.test(selector))?.decls)
      .toContain('color: #055B75');
  });

  it('a ring with no colour of its own is the brand teal', async () => {
    const rules = await tailwindRules('<input class="focus:ring-2"><button class="ring">x</button>');
    expect(blueDecls(rules, () => true)).toEqual([]);
    expect(rules.flatMap(({ decls }) => decls)).toContain('--tw-ring-color: rgb(5 91 117 / 0.5)');
  });

  it('no class name gives a focused element a blue ring, border, outline or icon', () => {
    const variant = /(?:^|[\s"'`{])((?:[\w-]+:)*(?:group-|peer-)?focus(?:-visible|-within)?:[a-z-]+?-(\[#[0-9a-fA-F]{3,6}\]|[a-z]+-\d{2,3}|[a-z]+)(?:\/\d+)?)(?=[\s"'`}]|$)/g;
    const found = files(path.join(root, 'frontend/src'), /\.(jsx?|tsx?)$/).flatMap((file) => {
      const text = readFileSync(file, 'utf8');
      return [...text.matchAll(variant)]
        .filter(([, , color]) => hasBlue(color.startsWith('[') ? color.slice(1, -1) : namedColor(color)))
        .map(([, cls]) => `${path.relative(root, file)}: ${cls}`);
    });
    expect([...new Set(found)]).toEqual([]);
  });

  const sheets = () => [
    ...files(path.join(root, 'frontend/src'), /\.css$/),
    ...files(path.join(root, 'frontend/styles'), /\.css$/),
  ];

  it('no stylesheet gives a focused element a blue ring, border or outline', () => {
    const found = sheets().flatMap((file) => {
      const out = [];
      postcss.parse(readFileSync(file, 'utf8')).walkRules((rule) => {
        if (!/:focus/.test(rule.selector)) return;
        rule.walkDecls((d) => {
          if (hasBlue(d.value)) out.push(`${path.relative(root, file)}: ${rule.selector.replace(/\s+/g, ' ')} { ${d.prop}: ${d.value} }`);
        });
      });
      return out;
    });
    expect(found).toEqual([]);
  });

  it('a click on a button or link draws no box around it; only the keyboard does', () => {
    const found = sheets().flatMap((file) => {
      const out = [];
      postcss.parse(readFileSync(file, 'utf8')).walkRules((rule) => {
        const clicked = rule.selector.split(',').map((s) => s.trim())
          .filter((s) => /:focus(?![-\w])/.test(s) && !/input|textarea|select|form-input/.test(s));
        const draws = rule.nodes.some((d) => d.type === 'decl' && d.prop === 'outline' && !/^(none|0)/.test(d.value));
        if (clicked.length && draws) out.push(`${path.relative(root, file)}: ${clicked.join(', ')}`);
      });
      return out;
    });
    expect(found).toEqual([]);
  });
});
