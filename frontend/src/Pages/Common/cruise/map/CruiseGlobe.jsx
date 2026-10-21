import React, { useEffect, useRef, useState } from 'react';

const STILL = '/images/cruise/globe-still.webp';
const TWO_PI = Math.PI * 2;

// cobe's angles for the view that faces a place.
const anglesFor = ({ lat, lon }) => [Math.PI - ((lon * Math.PI) / 180 - Math.PI / 2), (lat * Math.PI) / 180];

const ease = (from, to, rate) => {
  const delta = ((((to - from) % TWO_PI) + TWO_PI + Math.PI) % TWO_PI) - Math.PI;
  return from + delta * rate;
};

/**
 * Whether to spin a WebGL globe at all: not without WebGL, and not for
 * people who have asked for less motion or less data.
 */
const canAnimate = () => {
  if (typeof window === 'undefined' || typeof window.WebGLRenderingContext === 'undefined') return false;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
  if (navigator.connection?.saveData) return false;
  try {
    return Boolean(document.createElement('canvas').getContext('webgl'));
  } catch {
    return false;
  }
};

const countText = (count) => `${count} sailing${count === 1 ? '' : 's'}`;

export default function CruiseGlobe({ regions, selectedKey, onSelect }) {
  const [animate, setAnimate] = useState(false);
  const [ready, setReady] = useState(false);
  const canvasRef = useRef(null);
  const view = useRef({ target: [0, 0.3], markers: [] });

  useEffect(() => { setAnimate(canAnimate()); }, []);

  useEffect(() => {
    const selected = regions.find((r) => r.key === selectedKey);
    if (selected) view.current.target = anglesFor(selected);
    view.current.markers = regions.map((r) => ({ location: [r.lat, r.lon], size: r.key === selectedKey ? 0.1 : 0.05, color: r.key === selectedKey ? [0.95, 0.77, 0.56] : [1, 1, 1] }));
  }, [regions, selectedKey]);

  useEffect(() => {
    if (!animate || !canvasRef.current) return undefined;
    const canvas = canvasRef.current;
    let globe = null;
    let frame = 0;
    let visible = true;
    let cancelled = false;
    let [phi, theta] = view.current.target;
    let drag = null;

    const observer = typeof IntersectionObserver === 'function'
      ? new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; })
      : null;
    observer?.observe(canvas);

    const onDown = (e) => { drag = { x: e.clientX, phi }; canvas.setPointerCapture?.(e.pointerId); };
    const onMove = (e) => { if (drag) phi = drag.phi + (e.clientX - drag.x) / 120; };
    const onUp = () => {
      if (drag) view.current.target = [phi, view.current.target[1]];
      drag = null;
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);

    import('cobe').then(({ default: createGlobe }) => {
      if (cancelled) return;
      const size = canvas.offsetWidth || 330;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      globe = createGlobe(canvas, {
        devicePixelRatio: dpr,
        width: size * dpr,
        height: size * dpr,
        phi,
        theta,
        dark: 1,
        diffuse: 1.2,
        mapSamples: 16000,
        mapBrightness: 8,
        mapBaseBrightness: 0.05,
        baseColor: [0.1, 0.5, 0.62],
        markerColor: [0.95, 0.77, 0.56],
        glowColor: [0.4, 0.7, 0.81],
        markers: view.current.markers,
      });
      setReady(true);
      const tick = () => {
        if (visible && !drag) {
          view.current.target[0] += 0.0015;
          phi = ease(phi, view.current.target[0], 0.05);
          theta += (view.current.target[1] - theta) * 0.05;
        }
        if (visible) globe.update({ phi, theta, markers: view.current.markers });
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }).catch(() => setAnimate(false));

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      globe?.destroy();
    };
  }, [animate]);

  return (
    <div className="cruise-globe">
      <div className="relative mx-auto aspect-square w-full max-w-[340px]">
        <div className="absolute -inset-10 rounded-full bg-[radial-gradient(circle,rgba(101,179,207,0.35),transparent_65%)]" aria-hidden="true" />
        {(!animate || !ready) && <img src={STILL} alt="" className="relative h-full w-full" />}
        {animate && (
          <canvas
            ref={canvasRef}
            aria-hidden="true"
            className={`absolute inset-0 h-full w-full cursor-grab transition-opacity duration-700 ${ready ? 'opacity-100' : 'opacity-0'}`}
          />
        )}
      </div>
      <div className="mt-5 flex flex-wrap justify-center gap-2" role="group" aria-label="Cruise regions">
        {regions.map((region) => (
          <button
            key={region.key}
            type="button"
            aria-pressed={region.key === selectedKey}
            aria-label={`${region.name} · ${countText(region.count)}`}
            onClick={() => onSelect(region.key)}
            className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${region.key === selectedKey ? 'border-[#F3C58F] bg-[#F3C58F] text-[#021C25]' : 'border-[rgba(191,227,238,0.4)] bg-[rgba(2,28,37,0.35)] text-[#E3F4F9] hover:border-white'}`}
            style={{ fontFamily: "'IBM Plex Mono', monospace" }}
          >
            {region.name} · {region.count}
          </button>
        ))}
      </div>
    </div>
  );
}
