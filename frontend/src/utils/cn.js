/**
 * Utility function to combine class names
 * Similar to clsx but lightweight
 */
export function cn(...classes) {
  return classes
    .filter(Boolean)
    .join(' ')
    .trim();
}

export default cn; 