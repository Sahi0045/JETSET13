import React, { useState } from 'react';

const ContactBanner = () => {
  const bannerUrl = import.meta.env.VITE_CONTACT_BANNER_URL || '/images/jetsetters-banner.jpg';
  const email = 'bookings@jetsetterss.com';
  const phone = '+1-408-899-9705';
  const [isMinimized, setIsMinimized] = useState(false);

  if (isMinimized) {
    return (
      <div
        style={{
          position: 'fixed',
          right: 16,
          bottom: 16,
          zIndex: 9999,
          width: 60,
          height: 60,
          borderRadius: '50%',
          background: '#0b689c',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
          cursor: 'pointer',
          border: '3px solid #fff'
        }}
        onClick={() => setIsMinimized(false)}
        aria-label="Expand Jetsetters banner"
        title="Click to expand contact banner"
      >
        <div style={{ color: '#fff', fontSize: 24, fontWeight: 'bold' }}>J</div>
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        zIndex: 9999,
        maxWidth: 340,
        width: 'calc(100vw - 32px)',
        boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
        borderRadius: 12,
        overflow: 'hidden',
        background: '#0b689c'
      }}
      aria-label="Contact Jetsetters banner"
    >
      {/* Minimize button */}
      <button
        onClick={() => setIsMinimized(true)}
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          background: 'rgba(255,255,255,0.2)',
          border: 'none',
          borderRadius: '50%',
          width: 24,
          height: 24,
          color: '#fff',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          zIndex: 10
        }}
        aria-label="Minimize banner"
        title="Minimize"
      >
        ×
      </button>

      <a href={`mailto:${email}`} title={`Email ${email}`} style={{ display: 'block' }}>
        <img
          src={bannerUrl}
          alt="Jetsetters — Plan your stress-free global travel. Contact bookings@jetsetterss.com or call +1-408-899-9705"
          style={{ width: '100%', height: 'auto', maxHeight: 260, objectFit: 'contain', display: 'block', background: '#0b689c' }}
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
        />
      </a>
    </div>
  );
};

export default ContactBanner;


