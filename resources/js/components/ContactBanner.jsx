import React from 'react';

const ContactBanner = () => {
  const bannerUrl = import.meta.env.VITE_CONTACT_BANNER_URL || '/images/jetsetters-banner.jpg';
  const email = 'bookings@jetsetterss.com';
  const phone = '+1-408-899-9705';

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
      <div style={{ padding: 12, color: '#fff' }}>
        <div style={{ fontWeight: 700, lineHeight: 1.2 }}>Plan your stress‑free Global Travel</div>
        <div style={{ opacity: 0.9, fontSize: 13, marginTop: 4 }}>
          Airline Tickets • Hotels • Cruise Packages
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 10, alignItems: 'center' }}>
          <a href={`mailto:${email}`} style={{ color: '#fff', textDecoration: 'underline', fontWeight: 600 }}>{email}</a>
          <span style={{ opacity: 0.7 }}>|</span>
          <a href={`tel:${phone}`} style={{ color: '#fff', textDecoration: 'underline', fontWeight: 600 }}>{phone}</a>
        </div>
      </div>
    </div>
  );
};

export default ContactBanner;


