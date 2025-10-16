import React, { useEffect, useRef, useState } from 'react';

const FullPageBanner = () => {
  const imageUrl = import.meta.env.VITE_CONTACT_BANNER_URL || '/images/jetsetters-banner.jpg';
  const email = 'bookings@jetsetterss.com';
  const phone = '+1-408-899-9705';
  const durationMs = Number(import.meta.env.VITE_FULL_BANNER_MS || 4000); // faster default 4s

  const [visible, setVisible] = useState(true);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!visible) return;
    timerRef.current = setTimeout(() => {
      setVisible(false);
    }, durationMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [durationMs, visible]);

  const handleSkip = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    // Unmount on next frame to avoid layout thrash
    requestAnimationFrame(() => setVisible(false));
  };

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 900,
        backgroundColor: '#0b689c',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
      aria-label="Jetsetters full page banner"
    >
      <img
        src={imageUrl}
        alt="Jetsetters — Plan your stress‑free Global Travel. Email bookings@jetsetterss.com or call +1-408-899-9705"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          objectPosition: 'center'
        }}
        loading="lazy"
        decoding="async"
        onError={(e) => {
          // If image fails, keep the solid background and show text fallback
          e.currentTarget.style.display = 'none';
        }}
      />

      <div
        style={{
          position: 'relative',
          textAlign: 'center',
          color: '#ffffff',
          padding: 16,
          maxWidth: 900
        }}
      >
        <button
          onClick={handleSkip}
          style={{
            marginTop: 24,
            background: '#ffffff',
            color: '#0b689c',
            border: 'none',
            borderRadius: 8,
            padding: '10px 16px',
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 6px 20px rgba(0,0,0,0.2)'
          }}
          aria-label="Skip banner"
        >
          Skip
        </button>
      </div>
    </div>
  );
};

export default FullPageBanner;


