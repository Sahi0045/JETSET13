import { formatDateToISO, getSafeDate } from '../../../utils/dateUtils';

/**
 * The arrow keys in a calendar's grid of days.
 *
 * The search form's calendar drew its days as divs only a mouse could press,
 * and neither calendar could be moved through from the keyboard. Their days are
 * buttons now - Enter and Space choose one - and the arrow keys move a day
 * either way, or a week up and down, as a date grid is expected to. A day that
 * is not on screen, or cannot be chosen, stops the move.
 *
 * Put it on each day button's onKeyDown. The button carries its date in
 * `data-date`, and the grid it belongs to is marked `data-calendar-grid`.
 */

const STEP = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };

export function moveDayFocus(event) {
  const step = STEP[event.key];
  if (!step) return;
  const day = event.currentTarget;
  const grid = day?.closest?.('[data-calendar-grid]');
  if (!day?.dataset?.date || !grid) return;
  event.preventDefault();

  const date = getSafeDate(day.dataset.date);
  date.setDate(date.getDate() + step);
  const target = grid.querySelector(`[data-date="${formatDateToISO(date)}"]`);
  if (target && !target.disabled) target.focus();
}
