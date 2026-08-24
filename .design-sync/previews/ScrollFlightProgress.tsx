import React from 'react';
import { ScrollFlightProgress } from 'jetset13';

/**
 * A decorative scroll indicator: a dashed flight route pinned to the left edge
 * of the viewport, with a plane that flies the path as the page scrolls.
 *
 * It is `position: fixed` and hidden below the `lg` breakpoint, so this cell
 * gives it a tall, wide stage. Progress reads from window scroll, so a static
 * capture always shows the plane at the start of the route.
 */
export const AtPageTop = () => (
  <div style={{ position: 'relative', height: 560, minWidth: 1100 }}>
    <ScrollFlightProgress />
  </div>
);
