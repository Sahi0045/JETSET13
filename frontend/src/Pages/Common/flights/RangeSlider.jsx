import React from 'react';

const THUMB = 'absolute inset-0 w-full h-full appearance-none bg-transparent pointer-events-none '
  + '[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 '
  + '[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#055B75] [&::-webkit-slider-thumb]:border-[3px] [&::-webkit-slider-thumb]:border-white '
  + '[&::-webkit-slider-thumb]:shadow-[0_1px_4px_rgba(3,68,87,0.45)] [&::-webkit-slider-thumb]:cursor-pointer '
  + '[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5 '
  + '[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-[#055B75] [&::-moz-range-thumb]:border-[3px] [&::-moz-range-thumb]:border-white '
  + '[&::-moz-range-thumb]:shadow-[0_1px_4px_rgba(3,68,87,0.45)] [&::-moz-range-thumb]:cursor-pointer '
  + 'outline-none focus:outline-none focus-visible:[&::-webkit-slider-thumb]:ring-2 focus-visible:[&::-webkit-slider-thumb]:ring-[#65B3CF]';

const percent = (value, min, max) => (max > min ? ((value - min) / (max - min)) * 100 : 0);

function Track({ from, to }) {
  return (
    <>
      <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-1 rounded-full bg-gray-200" />
      <div
        className="absolute top-1/2 -translate-y-1/2 h-1 rounded-full bg-[#055B75]"
        style={{ left: `${from}%`, right: `${100 - to}%` }}
      />
    </>
  );
}

/** Two thumbs on one track: a [low, high] range. */
export function DualRange({ min, max, step = 1, value, onChange, labels = ['Minimum', 'Maximum'], snap = (v) => v }) {
  const [low, high] = value;
  const setLow = (raw) => onChange([Math.min(snap(Number(raw)), high), high]);
  const setHigh = (raw) => onChange([low, Math.max(snap(Number(raw)), low)]);
  return (
    <div className="relative h-6 mx-2.5">
      <Track from={percent(low, min, max)} to={percent(high, min, max)} />
      <input
        type="range" min={min} max={max} step={step} value={low} aria-label={labels[0]}
        onChange={(e) => setLow(e.target.value)}
        className={THUMB}
        style={{ zIndex: low > max - (max - min) / 10 ? 4 : 3 }}
      />
      <input
        type="range" min={min} max={max} step={step} value={high} aria-label={labels[1]}
        onChange={(e) => setHigh(e.target.value)}
        className={THUMB}
        style={{ zIndex: 3 }}
      />
    </div>
  );
}

/** One thumb: an upper limit. */
export function SingleRange({ min, max, step = 1, value, onChange, label }) {
  return (
    <div className="relative h-6 mx-2.5">
      <Track from={0} to={percent(value, min, max)} />
      <input
        type="range" min={min} max={max} step={step} value={value} aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        className={THUMB}
      />
    </div>
  );
}
