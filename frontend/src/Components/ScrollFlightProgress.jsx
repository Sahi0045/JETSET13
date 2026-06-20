import React, { useState, useEffect } from 'react';
import { Plane } from 'lucide-react';

/**
 * Travel-themed scroll progress indicator: a dashed zig-zag flight route pinned
 * to the left edge. As the page scrolls, a teal trail draws along the route and
 * a plane flies the path — banking through each turn via CSS motion-path
 * (`offset-path`). Decorative only; hidden on small screens.
 */

// Smooth serpentine route (cubic Béziers with vertical tangents at each turn).
// SVG is rendered 1:1 with px (width 64 / height 520 / same viewBox), so this
// exact `d` is reused for the plane's CSS offset-path.
const ROUTE =
  'M 32 6 C 32 77, 12 64, 12 135 C 12 206, 52 193, 52 264 C 52 335, 12 322, 12 393 C 12 464, 32 443, 32 514';

export default function ScrollFlightProgress() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const update = () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      const p = scrollable > 0 ? window.scrollY / scrollable : 0;
      setProgress(Math.min(1, Math.max(0, p)));
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  return (
    <div
      className="pointer-events-none fixed left-4 top-1/2 z-40 hidden -translate-y-1/2 lg:block"
      aria-hidden="true"
    >
      <div className="relative h-[520px] w-16">
        <svg width="64" height="520" viewBox="0 0 64 520" className="overflow-visible">
          {/* Dashed full route */}
          <path
            d={ROUTE}
            fill="none"
            stroke="rgba(5,91,117,0.22)"
            strokeWidth="2"
            strokeDasharray="2 7"
            strokeLinecap="round"
          />
          {/* Trail that draws with scroll */}
          <path
            d={ROUTE}
            fill="none"
            stroke="#055B75"
            strokeOpacity="0.85"
            strokeWidth="2.5"
            strokeLinecap="round"
            pathLength="1"
            strokeDasharray="1"
            style={{ strokeDashoffset: 1 - progress, transition: 'stroke-dashoffset 0.15s ease-out' }}
          />
          {/* Origin dot */}
          <circle cx="32" cy="6" r="3.5" fill="#055B75" />
          {/* Destination pin */}
          <circle cx="32" cy="514" r="3.5" fill="#ffffff" stroke="#055B75" strokeWidth="2" />
        </svg>

        {/* Plane flying the route via CSS motion path */}
        <div
          className="absolute left-0 top-0"
          style={{
            offsetPath: `path('${ROUTE}')`,
            offsetRotate: 'auto',
            offsetDistance: `${(progress * 100).toFixed(2)}%`,
            transition: 'offset-distance 0.15s ease-out',
          }}
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-[0_4px_14px_rgba(5,91,117,0.25)] ring-1 ring-brand-teal/15">
            <Plane className="h-4 w-4 rotate-45 text-brand-teal" />
          </span>
        </div>
      </div>
    </div>
  );
}
