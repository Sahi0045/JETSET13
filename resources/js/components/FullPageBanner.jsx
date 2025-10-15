import React, { useEffect, useState } from 'react';

const FullPageBanner = () => {
  const imageUrl = import.meta.env.VITE_CONTACT_BANNER_URL || '/images/jetsetters-banner.jpg';
  const email = 'bookings@jetsetterss.com';
  const phone = '+1-408-899-9705';
  const durationMs = Number(import.meta.env.VITE_FULL_BANNER_MS || 10000); // default 10s

  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // Prevent scroll while banner visible
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const timer = setTimeout(() => {
      setVisible(false);
      document.body.style.overflow = originalOverflow || '';
    }, durationMs);

    return () => {
      clearTimeout(timer);
      document.body.style.overflow = originalOverflow || '';
    };
  }, [durationMs]);

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
        <h1 style={{ fontSize: 48, lineHeight: 1.1, fontWeight: 800, textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>Jetsetters</h1>
        <p style={{ fontSize: 20, marginTop: 12, textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>
          Plan your stress‑free Global Travel — Airline Tickets, Hotels, Cruise Packages
        </p>
        <div style={{ marginTop: 16, display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
          <a href={`mailto:${email}`} style={{ color: '#fff', fontWeight: 700, textDecoration: 'underline' }}>{email}</a>
          <span style={{ opacity: 0.85 }}>•</span>
          <a href={`tel:${phone}`} style={{ color: '#fff', fontWeight: 700, textDecoration: 'underline' }}>{phone}</a>
        </div>

        <button
          onClick={() => setVisible(false)}
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


