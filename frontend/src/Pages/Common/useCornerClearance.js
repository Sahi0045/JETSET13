import { useEffect, useState } from 'react';

const OWN = '.floating-help, .ai-chatbot-container, .contact-popup-overlay';

/**
 * What covers the bottom-right corner of the screen, where the help buttons
 * sit. A bar along the bottom (the booking page's Proceed to Payment, the
 * cruise price bar) lifts them above it; anything taller than half the screen
 * (the phone menu, the filters drawer, the fare options sheet) hides them.
 * Pages used to set a body class for this and the booking page never did, so
 * on a phone the chat button sat on Proceed to Payment.
 */
export function cornerClearance(doc = document, win = window) {
  if (typeof doc.elementsFromPoint !== 'function') return { covered: false, lift: 0 };
  const height = win.innerHeight;
  let lift = 0;
  for (const element of doc.elementsFromPoint(win.innerWidth - 24, height - 4)) {
    if (element.closest(OWN) || win.getComputedStyle(element).position !== 'fixed') continue;
    const rect = element.getBoundingClientRect();
    if (rect.height > height / 2) return { covered: true, lift: 0 };
    lift = Math.max(lift, height - rect.top);
  }
  return { covered: false, lift: Math.round(lift) };
}

export default function useCornerClearance() {
  const [clearance, setClearance] = useState({ covered: false, lift: 0 });

  useEffect(() => {
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = cornerClearance();
        setClearance((current) => (current.covered === next.covered && current.lift === next.lift ? current : next));
      });
    };
    measure();
    const observer = new MutationObserver(measure);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'open'] });
    window.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    // A menu or sheet that slides in changes no attribute while it moves, so it
    // is read again once its transition or animation ends.
    document.addEventListener('transitionend', measure, true);
    document.addEventListener('animationend', measure, true);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
      document.removeEventListener('transitionend', measure, true);
      document.removeEventListener('animationend', measure, true);
    };
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty('--floating-lift', `${clearance.lift}px`);
  }, [clearance.lift]);

  useEffect(() => () => document.documentElement.style.removeProperty('--floating-lift'), []);

  return clearance;
}
