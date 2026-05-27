import React from 'react';
import { Link } from 'react-router-dom';
import { prefetchRoute } from '../utils/routePrefetch';

const resolvePath = (to) => {
  if (!to) return null;
  if (typeof to === 'string') return to;
  return to.pathname || null;
};

const PrefetchLink = React.forwardRef(({ to, onMouseEnter, onFocus, ...rest }, ref) => {
  const path = resolvePath(to);

  const handleMouseEnter = (e) => {
    prefetchRoute(path);
    onMouseEnter?.(e);
  };

  const handleFocus = (e) => {
    prefetchRoute(path);
    onFocus?.(e);
  };

  return (
    <Link
      ref={ref}
      to={to}
      onMouseEnter={handleMouseEnter}
      onFocus={handleFocus}
      {...rest}
    />
  );
});

PrefetchLink.displayName = 'PrefetchLink';

export default PrefetchLink;
