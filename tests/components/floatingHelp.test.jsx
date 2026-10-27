import React from 'react';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../frontend/src/contexts/SupabaseAuthContext', () => ({
  useSupabaseAuth: () => ({ user: null, session: null, isAuthenticated: false }),
}));
vi.mock('../../frontend/src/lib/supabase', () => ({ default: { from: vi.fn() } }));

const { default: withPageElements } = await import('../../frontend/src/Pages/Common/PageWrapper.jsx');

/**
 * The WhatsApp, Contact Us and chat buttons in the corner of every page. On a
 * phone (measured on jetsetterss.com at 390 x 844) the three of them sat on
 * top of Proceed to Payment on the booking page, on the third BOOK button of
 * the fare options sheet, on "Flight Details" and on the open menu, in a blue
 * that is not ours; and the home page drew them twice, because it shows the
 * flights page inside itself and both pages added them.
 */

const realInnerHeight = window.innerHeight;
const realElementsFromPoint = document.elementsFromPoint;

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

const Page = withPageElements(() => <p>page</p>);

const fixedBox = ({ top, height }) => {
  const box = document.createElement('div');
  box.style.position = 'fixed';
  box.getBoundingClientRect = () => ({ top, height, bottom: top + height, left: 0, right: 390, width: 390, x: 0, y: top });
  document.body.appendChild(box);
  return box;
};

const inTheCorner = async (...elements) => {
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 });
  document.elementsFromPoint = vi.fn(() => elements);
  await act(async () => {
    window.dispatchEvent(new Event('scroll'));
    await nextFrame();
  });
};

afterEach(() => {
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: realInnerHeight });
  document.elementsFromPoint = realElementsFromPoint;
  document.documentElement.style.removeProperty('--floating-lift');
  document.body.innerHTML = '';
});

describe('the help buttons', () => {
  it('appear once on a page shown inside another page', () => {
    const Flights = withPageElements(() => <p>flights</p>);
    const Home = withPageElements(() => <Flights />);
    render(<Home />);

    expect(screen.getAllByRole('button', { name: 'Contact us' })).toHaveLength(1);
    expect(screen.getAllByRole('link', { name: 'Chat on WhatsApp' })).toHaveLength(1);
  });

  it('fold into one Help button on a phone, which opens WhatsApp, Contact us and Chat', () => {
    render(<Page />);
    const help = screen.queryByRole('button', { name: /help/i });
    expect(help).not.toBeNull();
    expect(help.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(help);
    expect(help.getAttribute('aria-expanded')).toBe('true');
    expect(help.closest('.floating-help').className).toMatch(/\bis-expanded\b/);

    fireEvent.click(screen.getByRole('button', { name: 'Contact us' }));
    expect(screen.getByRole('heading', { name: 'Contact Us' })).toBeTruthy();
    expect(help.getAttribute('aria-expanded')).toBe('false');
  });

  it('close that menu on a tap anywhere else', () => {
    render(<Page />);
    const help = screen.getByRole('button', { name: /help/i });
    fireEvent.click(help);
    fireEvent.pointerDown(document.body);
    expect(help.getAttribute('aria-expanded')).toBe('false');
  });

  it('give the chat button a name', () => {
    render(<Page />);
    expect(screen.queryByRole('button', { name: /chat with our assistant/i })).not.toBeNull();
  });

  // The booking page's Proceed to Payment bar is 84 px tall on a phone.
  it('move up above a bar along the bottom of the screen', async () => {
    render(<Page />);
    await inTheCorner(fixedBox({ top: 760, height: 84 }));
    expect(document.documentElement.style.getPropertyValue('--floating-lift')).toBe('84px');
  });

  it('hide under a menu, drawer or sheet that covers the corner', async () => {
    render(<Page />);
    await inTheCorner(fixedBox({ top: 0, height: 844 }));
    const contact = screen.getByRole('button', { name: 'Contact us' });
    expect(contact.closest('[data-covered="true"]')).not.toBeNull();
  });

  it('come back and drop down again once the bar or sheet is gone', async () => {
    render(<Page />);
    await inTheCorner(fixedBox({ top: 0, height: 844 }));
    await inTheCorner();
    const contact = screen.getByRole('button', { name: 'Contact us' });
    expect(contact.closest('[data-covered="true"]')).toBeNull();
    expect(document.documentElement.style.getPropertyValue('--floating-lift')).toBe('0px');
  });

  // The phone menu slides in with a CSS transition, which changes no attribute:
  // read when its class flipped, it was still off screen, and the buttons
  // stayed on top of it (seen on jetsetterss.com, 27 Oct).
  it('look again when a menu or sheet finishes sliding in', async () => {
    render(<Page />);
    const menu = fixedBox({ top: 64, height: 780 });
    await inTheCorner();
    document.elementsFromPoint = vi.fn(() => [menu]);
    await act(async () => {
      menu.dispatchEvent(new Event('transitionend', { bubbles: true }));
      await nextFrame();
    });
    const contact = screen.getByRole('button', { name: 'Contact us' });
    expect(contact.closest('[data-covered="true"]')).not.toBeNull();
  });

  it('do not count their own buttons, chat window or contact form', async () => {
    render(<Page />);
    const own = screen.getByRole('button', { name: 'Contact us' });
    own.style.position = 'fixed';
    own.getBoundingClientRect = () => ({ top: 0, height: 844, bottom: 844 });
    await inTheCorner(own);
    expect(own.closest('[data-covered="true"]')).toBeNull();
  });

  // The box around the three buttons, and the gaps between them, took the
  // clicks meant for what lay under them: the footer's Facebook and Instagram,
  // Terms & Conditions on a narrow laptop, Select flight and Fare breakup.
  it('take clicks only on the buttons themselves', () => {
    const css = readFileSync(path.join(process.cwd(), 'frontend/src/Pages/Common/FloatingHelp.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const pointer = (selector) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter(([, selectors]) => selectors.split(',').map((s) => s.trim()).includes(selector))
      .map(([, , body]) => body.match(/pointer-events\s*:\s*([a-z]+)/)?.[1])
      .find(Boolean);

    expect(pointer('.floating-help')).toBe('none');
    expect(pointer('.floating-help__action')).toBe('auto');
    expect(pointer('.floating-help__launcher')).toBe('auto');
  });

  it('use the brand teal, not a generic blue', () => {
    const dir = path.join(process.cwd(), 'frontend/src/Pages/Common');
    const offPalette = readdirSync(dir)
      .filter((file) => file.endsWith('.css'))
      .filter((file) => /#036cca|#0d99ff|#0254a3|#007acc/i.test(readFileSync(path.join(dir, file), 'utf8')));
    expect(offPalette).toEqual([]);
  });
});
