## Building with the Jetsetters design system

A travel-booking design system: Coastal palette (Deep Teal / Sky Blue / Olive Taupe) on a warm
editorial canvas, set in **Lato** with Inter as the only fallback.

### Setup

There is **no theme provider and no root wrapper** — components are styled entirely by the
stylesheet, so importing `styles.css` is the whole setup. Load it once; it pulls in the tokens,
the Google-hosted Lato/Inter faces, and all component CSS.

Two components call react-router hooks and **throw outside a `<Router>`**: `Breadcrumbs`
(reads the current route — it renders the entire trail from `useLocation()` and takes no props)
and `ServiceTabs` (navigates on tap). Anything using them needs a router in scope; `MemoryRouter`
is re-exported from this bundle for that purpose. Every other component works standalone.

### Styling idiom

Tailwind utility classes, plus this system's own semantic component classes. **Prefer the
semantic class where one exists** — it carries the brand treatment — and use utilities for layout
and one-off adjustment.

| Family | Classes |
|---|---|
| Buttons | `btn` + `btn-primary` `btn-secondary` `btn-outline` `btn-ghost`, sizes `btn-sm` `btn-lg` |
| Surfaces | `card`, `card-hover`, `card-interactive`, `glass-card`, `glass-card-dark` |
| Forms | `form-input`, `form-label`, `form-error`, `focus-ring` |
| Type | `heading-xl` `heading-lg` `heading-md` `heading-sm`, `text-lead`, `gradient-text` |
| Layout | `section` `section-sm` `section-lg`, `container-custom` |
| Status | `badge` + `badge-success` `badge-warning` `badge-error` `badge-info` |
| Loading | `loading-skeleton`, `loading-shimmer`, `loading-spinner` |
| Motion | `hover-lift`, `hover-glow`, `animate-fade-in-up-delay-1…4` |
| Backdrops | `glass`, `glass-dark`, `gradient-primary`, `gradient-secondary`, `text-gradient` |

**Colour utilities.** Scaled families `primary` `secondary` `neutral` `accent` `success` `warning`
`error` at `50`–`900` (`bg-primary-500`, `text-neutral-700`, `border-primary-600`, `ring-error-500`).
`primary-500` is the Deep Teal brand colour and `primary-400` the brighter Sky Blue action colour.
Named brand colours are unscaled: `ink` (heading ink), `ivory` and `sand` (canvas),
`brand-teal`, `brand-sky` — e.g. `bg-ivory`, `text-ink`.

**Elevation is tinted teal, never neutral black**: `shadow-soft` `shadow-medium` `shadow-large`,
and `shadow-glow` / `shadow-glow-lg` for the Sky Blue glow. Extra radii: `rounded-4xl`, `rounded-5xl`.
Type: `font-sans` / `font-display` / `font-serif` — all three resolve to Lato by design;
`font-serif` is *not* a serif.

### Two gotchas worth knowing

- `Card` variant `glass` is `bg-white/10`. It is built for dark or photographic backdrops and
  needs **light text passed in** — the default dark title and description are unreadable on it.
- `Price` with `showCode` renders the currency code in hardcoded white, so the code is only
  visible on a dark surface.

### Where the truth lives

Read `_ds/<folder>/styles.css` and its imports before styling — it is the real vocabulary.
Per-component API is in `components/<group>/<Name>/<Name>.d.ts` (the `<Name>Props` interface)
and usage in the matching `<Name>.prompt.md`.

### An idiomatic composition

```jsx
import { Card, Button, Price } from '<pkg>';

<section className="section bg-ivory">
  <div className="container-custom grid gap-6 md:grid-cols-3">
    <Card variant="elevated" hover>
      <Card.Header>
        <Card.Title>Caribbean Explorer</Card.Title>
        <Card.Description>7 nights · departs Miami</Card.Description>
      </Card.Header>
      <Card.Content>
        <span className="badge badge-success">Balcony available</span>
      </Card.Content>
      <Card.Footer>
        <Price amount={1299} className="text-xl font-bold text-ink" />
        <Button size="sm">View itinerary</Button>
      </Card.Footer>
    </Card>
  </div>
</section>
```

`Card` also exports its parts as named exports (`CardHeader`, `CardTitle`, `CardDescription`,
`CardContent`, `CardFooter`) if you prefer them over the dotted form.
