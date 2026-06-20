import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Facebook, Instagram, Mail, Check } from 'lucide-react';
import supabase from '../../lib/supabase';

const COLUMNS = [
  {
    title: 'Travel',
    links: [
      { label: 'Cruise', to: '/cruise' },
      { label: 'Flight', to: '/flights' },
      { label: 'Packages', to: '/packages' },
      { label: 'Hotels', to: '/hotels' },
      { label: 'Visa Services', to: '/visa' },
      { label: 'Document Services', to: '/visa/documents' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Destinations', to: '/destinations' },
      { label: 'Travel Blog', to: '/blog' },
      { label: 'Support', to: '/support' },
      { label: 'FAQs', to: '/faq' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'Careers', to: '/careers' },
      { label: 'Contact Us', to: '/contact' },
      { label: 'Privacy Policy', to: '/privacy-policy' },
      { label: 'Terms & Conditions', to: '/terms-conditions' },
    ],
  },
];

const Footer = () => {
  const currentYear = new Date().getFullYear();

  const [email, setEmail] = useState('');
  const [status, setStatus] = useState({ loading: false, success: false, error: '' });

  const handleSubscribe = async (e) => {
    e.preventDefault();
    if (!email) {
      setStatus({ loading: false, success: false, error: 'Please enter your email address.' });
      return;
    }
    if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email)) {
      setStatus({ loading: false, success: false, error: 'Please enter a valid email address.' });
      return;
    }

    setStatus({ loading: true, success: false, error: '' });
    try {
      const { error } = await supabase.from('subscriptions').insert([{ email, status: 'active' }]);
      if (error) {
        setStatus({
          loading: false,
          success: false,
          error: error.code === '23505' ? 'This email is already subscribed.' : 'Failed to subscribe. Please try again.',
        });
        return;
      }
      try {
        await fetch('/api/email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'subscription', email, source: 'footer' }),
        });
      } catch {
        /* non-blocking */
      }
      setStatus({ loading: false, success: true, error: '' });
      setEmail('');
    } catch {
      setStatus({ loading: false, success: false, error: 'An unexpected error occurred. Please try again.' });
    }
  };

  return (
    <footer className="relative z-30 bg-ink text-white/70">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Newsletter */}
        <div className="flex flex-col gap-5 border-b border-white/10 py-8 md:flex-row md:items-center md:justify-between">
          <div className="md:max-w-sm">
            <h3 className="font-serif text-2xl font-semibold text-white">Subscribe &amp; Save</h3>
            <p className="mt-1 text-sm text-white/55">
              Flash sales, seasonal offers, and member-only deals — straight to your inbox.
            </p>
          </div>

          <form onSubmit={handleSubscribe} className="w-full md:w-[440px]" noValidate>
            {status.success ? (
              <p className="inline-flex items-center gap-2 text-sm font-medium text-brand-sky">
                <Check className="h-4 w-4" /> You&apos;re subscribed — welcome aboard!
              </p>
            ) : (
              <>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="relative flex-1">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter your email"
                      disabled={status.loading}
                      aria-label="Email address"
                      className="w-full rounded-full border border-white/15 bg-white/5 py-3 pl-10 pr-4 text-sm text-white placeholder:text-white/40 outline-none transition-colors focus:border-brand-sky/60 focus:ring-0"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={status.loading}
                    className="rounded-full bg-gradient-to-r from-brand-teal to-[#0890BC] px-6 py-3 text-sm font-bold text-white shadow-md transition hover:shadow-lg disabled:opacity-60"
                  >
                    {status.loading ? 'Subscribing…' : 'Subscribe'}
                  </button>
                </div>
                {status.error ? (
                  <p className="mt-2 text-xs text-red-300">{status.error}</p>
                ) : (
                  <p className="mt-2 text-[11px] text-white/40">
                    By subscribing you agree to our{' '}
                    <Link to="/terms-conditions" className="underline hover:text-white/70">Terms</Link> &amp;{' '}
                    <Link to="/privacy-policy" className="underline hover:text-white/70">Privacy</Link>.
                  </p>
                )}
              </>
            )}
          </form>
        </div>

        {/* Links */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-8 pt-8 pb-6">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link to="/" className="inline-block" aria-label="Jetsetters home">
              <picture>
                <source srcSet="/images/logos/WhatsApp_Image_2026-01-22_at_12.05.24_AM-removebg-preview.webp" type="image/webp" />
                <img
                  src="/images/logos/WhatsApp_Image_2026-01-22_at_12.05.24_AM-removebg-preview.png"
                  alt="Jetsetters"
                  className="h-12 w-auto object-contain"
                  loading="lazy"
                  decoding="async"
                />
              </picture>
            </Link>
            <p className="mt-1 text-sm italic text-brand-sky/90" style={{ fontFamily: '"Brush Script MT", cursive' }}>
              Jet Set Go
            </p>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/55">
              Extraordinary travel experiences for travellers that demand excellence,
              customization, and unforgettable memories.
            </p>
          </div>

          {COLUMNS.map((col) => (
            <nav key={col.title} aria-label={`${col.title} navigation`}>
              <h3 className="mb-4 text-[11px] font-bold uppercase tracking-[0.2em] text-white">
                {col.title}
              </h3>
              <ul className="space-y-2">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link
                      to={l.to}
                      className="text-sm text-white/60 transition-colors hover:text-brand-sky"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="flex flex-col-reverse items-center justify-between gap-4 border-t border-white/10 py-4 sm:flex-row">
          <p className="text-xs text-white/45">© {currentYear} Jetsetters. All rights reserved.</p>
          <div className="flex items-center gap-3">
            <a
              href="https://www.facebook.com/people/Jetsetters/61557536332731/?ref=pl_edit_xav_ig_profile_page_web"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Facebook"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-white/70 transition-colors hover:border-white/40 hover:bg-white/5 hover:text-white"
            >
              <Facebook className="h-4 w-4" />
            </a>
            <a
              href="https://www.instagram.com/jetsetters_global/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Instagram"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-white/70 transition-colors hover:border-white/40 hover:bg-white/5 hover:text-white"
            >
              <Instagram className="h-4 w-4" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default React.memo(Footer);
