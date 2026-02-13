import { describe, it, expect } from 'vitest';
import cn from '../../resources/js/utils/cn.js';

describe('cn (classnames utility)', () => {
  it('joins multiple class strings', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('filters out falsy values', () => {
    expect(cn('foo', null, undefined, false, '', 'bar')).toBe('foo bar');
  });

  it('returns empty string for no arguments', () => {
    expect(cn()).toBe('');
  });

  it('returns empty string for all falsy arguments', () => {
    expect(cn(null, undefined, false, '')).toBe('');
  });

  it('handles single class', () => {
    expect(cn('only-class')).toBe('only-class');
  });

  it('handles conditional classes', () => {
    const isActive = true;
    const isDisabled = false;
    expect(cn('btn', isActive && 'btn-active', isDisabled && 'btn-disabled')).toBe('btn btn-active');
  });

  it('trims result', () => {
    expect(cn(' spaced ', 'class')).toBe('spaced  class');
  });
});
