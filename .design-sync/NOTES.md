# design-sync notes — JETSET13 → claude.ai/design

Project: `Jetsetters Design System` — https://claude.ai/design/p/c379cf5b-b98f-431b-aaff-3e07acc4f4ff

## This repo is an app, not a component library

There is no library build: `package.json` is `private`, has no `exports`/`main`, and the root
`dist/` is the built SPA, not a component bundle. So the sync is driven by an explicit barrel,
`.design-sync/build/ds-entry.js`, which re-exports the components we chose to publish. **The
barrel is the component list** — add or remove a component there and in `cfg.componentSrcMap`.

Run the converter with `--entry ./.design-sync/build/ds-entry.js`. Without it the converter looks
for `node_modules/jetset13/package.json` and dies (`ENOENT`); `--entry` makes it walk up to the
repo root instead.

## Build commands

```sh
bash .design-sync/build/build-css.sh          # cfg.buildCmd — must run before the converter
node .ds-sync/package-build.mjs   --config .design-sync/config.json --node-modules ./node_modules \
  --entry ./.design-sync/build/ds-entry.js --out ./ds-bundle
node .ds-sync/package-validate.mjs ./ds-bundle
```

- `@types/react` is not a repo dependency (this is a JS project). It was copied into
  `node_modules/@types/react` from `.ds-sync/node_modules` so the converter stops printing
  `[DTS_REACT]`. **A fresh `npm ci` wipes it** — re-copy it, or accept the warning.
- Playwright + Chromium live in `.ds-sync/node_modules` (installed by this sync, ~200MB).

## Why the prop contracts are hand-written

The components are plain `.jsx` with no type annotations, so ts-morph parses **0 `.d.ts` files**
and every `<Name>Props` came out as `{ [key: string]: unknown }` — useless to the design agent.
All 11 contracts are therefore hand-written in `cfg.dtsPropsFor`, read off the destructured
props in each source file. **If a component's props change upstream, `dtsPropsFor` will not
notice — update it by hand.** This is the single most likely thing to silently rot.

## CSS and tokens

`cfg.tokensGlob` only works alongside `cfg.tokensPkg`, and resolves inside
`node_modules/<tokensPkg>` — a standalone tokens file can never be picked up that way. So
`build-css.sh` concatenates `tokens.css` (custom properties + the Google Fonts `@import`) ahead of
the compiled Tailwind output into one `app.compiled.css`, which is `cfg.cssEntry`. That single
file is what reaches rendered designs through the `styles.css` import closure.

**The safelist in `.design-sync/build/tailwind.ds.config.js` matters.** Tailwind purges to what the
11 components use, which stripped most of the `@layer components` vocabulary (`heading-*`,
`badge-*`, `hover-lift`, …) and most of the palette. The design agent writes *new* screens, so
the safelist pins the whole vocabulary. If you add classes to `frontend/styles/app.css`'s
`@layer components`, add them to `COMPONENT_CLASSES` too or they will not ship.

Fonts resolve as `[FONT_REMOTE]` (Google Fonts `@import`), matching how `index.html` loads them.
That is expected, not a warning to chase.

## Components deliberately excluded

- **PrefetchLink** — imports `utils/routePrefetch`, which dynamic-imports every page in the app.
  Bundling it pulled the whole application (and page CSS with unresolvable image URLs) into the
  design system and failed the esbuild step. Excluded via `componentSrcMap: {"PrefetchLink": null}`.
- **SignupForm** — imports `react-bootstrap`, which is not installed; different styling system.
- **CouponInput** — needs Supabase auth context and a network POST.
- **ProtectedRoute**, **ErrorBoundary** — behavioural, no visual surface.
- **components/Breadcrumb.jsx** — near-duplicate of `Components/Breadcrumbs.jsx`; shipping both
  would confuse the design agent. Note the repo has both `components/` and `Components/`
  directories, which only coexist on a case-sensitive filesystem.

## Known render warns

- **ContactBanner ships the floor card, on purpose.** Its entire visual is artwork the host app
  serves from `/images/jetsetters-banner.webp`; the `<img>` hides itself via `onError` when that
  404s, collapsing the component to zero height. An authored preview was written and then removed
  — a blank card is worse than an honest "preview not yet authored". Making the path resolve
  locally would have looked fine in the render check and broken in the product.
- **FullPageBanner** renders overlay chrome and its Skip button over a flat brand-blue field, for
  the same missing-artwork reason. Graded good with that noted.
- Both banners are `position: fixed`; their previews set `transform` on the stage so the component
  becomes contained in the card. That changes nothing about the component.

## Component bugs found while previewing (not fixed — app-side)

- **`Price` `showCode`** renders the currency code as
  `<span className="ml-1 text-xs text-white opacity-70">`, so the code is invisible on any light
  background. The `.d.ts` documents the constraint and the preview shows it on teal.
- **`Card` `variant="glass"`** is `bg-white/10` and needs light text passed in; the default
  `Card.Title`/`Card.Description` ink colours are unreadable on it. The variant is currently
  unused anywhere in the app.
- `cn()` in `frontend/src/utils/cn.js` only concatenates — it does not resolve Tailwind conflicts.
  Passing `className="text-white"` does **not** reliably beat a built-in `text-gray-900`;
  stylesheet order decides. Previews use inline `style` where a colour must win.

## Router

`Breadcrumbs` and `ServiceTabs` call react-router hooks. `cfg.provider` was **removed**: a global
`MemoryRouter` made `Breadcrumbs`' own per-route cells throw
*"You cannot render a `<Router>` inside another `<Router>`"*. Router context is now supplied
inside the two previews that need it, from the `MemoryRouter` re-exported by the barrel.

## Re-sync risks

- `cfg.dtsPropsFor` is hand-maintained and drifts silently when component props change. Diff the
  11 source files against the contracts before trusting a re-sync.
- The tailwind safelist is a hand-copied list of `@layer components` class names; new classes
  upstream will not ship until added.
- `node_modules/@types/react` is not a declared dependency and disappears on a clean install.
- Both banner components depend on a host-app image asset; if that asset ever gets inlined or
  moved into the DS, both previews are worth revisiting.
- The Google Fonts `@import` is fetched at render time — previews render in fallback fonts if the
  build machine is offline.
- Grades in `.design-sync/.cache/review/` are gitignored. Cross-machine carry-forward comes from
  the uploaded `_ds_sync.json`, so a re-sync from a fresh clone re-verifies only what changed.
