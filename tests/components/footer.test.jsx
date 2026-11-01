import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../frontend/src/lib/supabase', () => ({ default: { from: vi.fn() } }));

const { default: Footer } = await import('../../frontend/src/Pages/Common/Footer.jsx');

/**
 * The footer, at the end of every page. On jetsetterss.com (27 Oct) its links
 * seemed dead on laptops: the help buttons in the bottom-right corner sat on
 * Facebook and Instagram at every width up to 1600 px, and on Terms &
 * Conditions and Request a Quote on a narrow one; and a link to the page
 * already open ("Flight" on /flights) kept the reader in the footer, because
 * the page goes to the top only when its path changes.
 */

const realScrollTo = window.scrollTo;

const renderAt = (path) => render(
  <MemoryRouter initialEntries={[path]}>
    <Footer />
  </MemoryRouter>,
);

beforeEach(() => {
  window.scrollTo = vi.fn();
});

afterEach(() => {
  window.scrollTo = realScrollTo;
});

describe('the footer', () => {
  it('takes the reader to the top for a link to the page already open', () => {
    renderAt('/flights');
    fireEvent.click(screen.getByRole('link', { name: 'Flight' }));

    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it('leaves a link to another page to the route change', () => {
    renderAt('/flights');
    fireEvent.click(screen.getByRole('link', { name: 'Cruise' }));

    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it('keeps its links and icons out from under the help buttons', () => {
    renderAt('/');
    const clear = /(^|\s)sm:pr-\[max\(0px,calc\(142px_-_\(100vw_-_100%\)_\/_2\)\)\](\s|$)/;
    const bottomBar = screen.getByRole('link', { name: 'Instagram' }).closest('.border-t');

    expect(bottomBar.className).toMatch(/(^|\s)pr-14(\s|$)/);
    expect(bottomBar.className).toMatch(clear);
    expect(screen.getByRole('link', { name: 'Request a Quote' }).closest('.py-6').className).toMatch(clear);
    expect(screen.getByRole('button', { name: 'Subscribe' }).closest('.border-b').className).toMatch(clear);
  });
});
