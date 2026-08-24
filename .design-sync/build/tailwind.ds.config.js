// Tailwind config for the design-sync build.
//
// Extends the app's own config. Two differences, both about what survives
// purging — the design agent that consumes this design system writes NEW
// screens, so the shipped stylesheet has to carry the whole vocabulary, not
// just the subset the 11 exported components happen to use today.
//
//   1. content also covers the authored preview .tsx files.
//   2. safelist pins the design system's own class vocabulary: every
//      @layer components class declared in frontend/styles/app.css, plus the
//      Coastal palette, brand shadows, radii and font families as utilities.
import base from '../../tailwind.config.js';

// Every class declared in app.css's @layer blocks. Kept as an explicit list so
// a class that disappears upstream shows up as a diff here rather than
// silently vanishing from the shipped CSS.
const COMPONENT_CLASSES = [
    'badge', 'badge-error', 'badge-info', 'badge-success', 'badge-warning',
    'btn', 'btn-ghost', 'btn-lg', 'btn-outline', 'btn-primary', 'btn-secondary', 'btn-sm',
    'card', 'card-hover', 'card-interactive',
    'container-custom', 'custom-scrollbar', 'date-button',
    'focus-ring', 'form-error', 'form-input', 'form-label',
    'glass-card', 'glass-card-dark', 'gradient-text',
    'heading-lg', 'heading-md', 'heading-sm', 'heading-xl',
    'hide-scrollbar', 'hover-glow', 'hover-lift',
    'loading-shimmer', 'loading-skeleton', 'loading-spinner',
    'nav-link-enhanced', 'section', 'section-lg', 'section-sm', 'text-lead',
    'animate-fade-in-up-delay-1', 'animate-fade-in-up-delay-2',
    'animate-fade-in-up-delay-3', 'animate-fade-in-up-delay-4',
];

const SCALED = '(50|100|200|300|400|500|600|700|800|900|950)';

export default {
    ...base,
    content: [
        './frontend/src/**/*.{jsx,js}',
        './.design-sync/previews/**/*.{tsx,jsx}',
    ],
    safelist: [
        ...COMPONENT_CLASSES,
        // Coastal palette across the scaled families.
        { pattern: new RegExp(`^(bg|text|border|ring)-(primary|secondary|neutral|accent|success|warning|error)-${SCALED}$`) },
        // Named brand colours (unscaled).
        { pattern: /^(bg|text|border)-(ivory|sand|ink)$/ },
        { pattern: /^(bg|text|border)-brand-(teal|sky)$/ },
        // Brand elevation, radii and type.
        { pattern: /^shadow-(soft|medium|large|glow|glow-lg)$/ },
        { pattern: /^rounded-(4xl|5xl)$/ },
        { pattern: /^font-(sans|display|serif)$/ },
        // Brand utilities registered by the plugin in tailwind.config.js.
        'glass', 'glass-dark', 'gradient-primary', 'gradient-secondary', 'text-gradient',
    ],
};
