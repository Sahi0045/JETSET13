import React, { Suspense, lazy, useEffect, useState } from 'react';
import ContactPopup from './ContactPopup';

const AIChatbot = lazy(() => import('./AIChatbot'));

/**
 * Defers AIChatbot mount until the user shows intent (scroll / pointer / key / touch),
 * or until the browser is idle. Keeps the chatbot JS + CSS off the critical render path
 * without losing functionality for users who actually engage with the page.
 */
const useDeferredChatbotMount = () => {
  const [shouldMount, setShouldMount] = useState(false);

  useEffect(() => {
    if (shouldMount) return;

    let cancelled = false;
    const mount = () => {
      if (!cancelled) setShouldMount(true);
    };

    const events = ['pointerdown', 'keydown', 'touchstart', 'scroll'];
    events.forEach((evt) => window.addEventListener(evt, mount, { once: true, passive: true }));

    // Idle fallback so the widget still appears even without interaction.
    const idle = window.requestIdleCallback
      ? window.requestIdleCallback(mount, { timeout: 4000 })
      : window.setTimeout(mount, 3000);

    return () => {
      cancelled = true;
      events.forEach((evt) => window.removeEventListener(evt, mount));
      if (window.cancelIdleCallback && typeof idle === 'number') {
        window.cancelIdleCallback(idle);
      } else {
        clearTimeout(idle);
      }
    };
  }, [shouldMount]);

  return shouldMount;
};

const DeferredAIChatbot = () => {
  const shouldMount = useDeferredChatbotMount();
  if (!shouldMount) return null;
  return (
    <Suspense fallback={null}>
      <AIChatbot />
    </Suspense>
  );
};

/**
 * PageWrapper is a higher-order component that wraps all pages with common elements
 * like the ContactPopup and AIChatbot
 */
const withPageElements = (WrappedComponent) => {
  return (props) => (
    <>
      <WrappedComponent {...props} />
      <ContactPopup />
      <DeferredAIChatbot />
    </>
  );
};

export default withPageElements;
