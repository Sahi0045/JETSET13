import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { format } from 'date-fns';

const PHONE = '(max-width: 639px)';

export const monthsFrom = (first, count) => Array.from({ length: count }, (_, i) => new Date(first.getFullYear(), first.getMonth() + i, 1));

/** True on a phone-width screen, and kept true or false as the screen turns. */
export function usePhoneWidth() {
  const [isPhone, setIsPhone] = useState(() => typeof window !== 'undefined' && Boolean(window.matchMedia?.(PHONE).matches));
  useEffect(() => {
    const query = typeof window !== 'undefined' ? window.matchMedia?.(PHONE) : null;
    if (!query) return undefined;
    const update = () => setIsPhone(query.matches);
    if (query.addEventListener) query.addEventListener('change', update);
    else query.addListener?.(update);
    return () => {
      if (query.removeEventListener) query.removeEventListener('change', update);
      else query.removeListener?.(update);
    };
  }, []);
  return isPhone;
}

/**
 * The months of a calendar in one row, a month to a screen, that a phone
 * swipes through sideways. The browser's own scroll snapping moves the row, so
 * a month follows the finger and settles in place.
 *
 * `index` is the month on screen. A swipe reports the month it settles on
 * through `onIndexChange`; a new `index` from outside, such as an arrow,
 * glides the row there.
 */
export default function SwipeMonths({ months, index, onIndexChange, renderMonth }) {
  const track = useRef(null);
  const shown = useRef(index);
  const settling = useRef(null);

  useLayoutEffect(() => {
    const el = track.current;
    if (el) el.scrollLeft = index * el.clientWidth;
  }, []);

  useEffect(() => () => clearTimeout(settling.current), []);

  useEffect(() => {
    const el = track.current;
    if (!el || shown.current === index) return;
    shown.current = index;
    const left = index * el.clientWidth;
    const still = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
    if (el.scrollTo) el.scrollTo({ left, behavior: still ? 'auto' : 'smooth' });
    else el.scrollLeft = left;
  }, [index]);

  // Read once the row stops: mid-glide to the next month the row is still
  // nearer the month it left, and reporting that would send it back.
  const onScroll = () => {
    clearTimeout(settling.current);
    settling.current = setTimeout(() => {
      const el = track.current;
      if (!el?.clientWidth) return;
      const at = Math.round(el.scrollLeft / el.clientWidth);
      if (at === shown.current || at < 0 || at >= months.length) return;
      shown.current = at;
      onIndexChange(at);
    }, 80);
  };

  return (
    <>
      <div
        ref={track}
        onScroll={onScroll}
        data-testid="swipe-months"
        className="flex overflow-x-auto snap-x snap-mandatory overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {/* Each month is `relative`: a day's hidden screen-reader label is
            placed against the nearest positioned box, and placed against the
            box around this row, the months off screen widened it 12 times
            over with a scroll bar. */}
        {months.map((month) => (
          <div
            key={format(month, 'yyyy-MM')}
            role="group"
            aria-label={format(month, 'MMMM yyyy')}
            className="relative w-full shrink-0 snap-center snap-always"
          >
            {renderMonth(month)}
          </div>
        ))}
      </div>
      <div aria-hidden="true" className="flex justify-center gap-1.5 pt-1 pb-2">
        {months.map((month, i) => (
          <span
            key={format(month, 'yyyy-MM')}
            className={`h-1.5 rounded-full transition-all duration-300 ${i === index ? 'w-4 bg-[#055B75]' : 'w-1.5 bg-gray-300'}`}
          />
        ))}
      </div>
    </>
  );
}
