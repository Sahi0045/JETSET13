import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Hotel, Mail, Palmtree, Phone, Plane, Ship } from 'lucide-react';
import Navbar from './Navbar';
import Footer from './Footer';

const PHONE = { href: 'tel:+18775387380', text: '(877) 538-7380' };
const EMAIL = 'support@jetsetterss.com';

export const COMING_SOON_COPY = {
  cruise: { icon: Ship, title: 'Cruises', noun: 'cruise' },
  hotels: { icon: Hotel, title: 'Hotels', noun: 'hotel' },
  packages: { icon: Palmtree, title: 'Holiday packages', noun: 'holiday package' },
};

const STARS = [
  [8, 18, 0], [16, 62, 1.2], [24, 30, 2.1], [33, 78, 0.6], [41, 12, 1.8], [52, 70, 2.6],
  [61, 24, 0.9], [69, 58, 1.5], [77, 16, 2.3], [85, 66, 0.3], [92, 34, 1.1], [12, 44, 2.8],
  [47, 40, 3.2], [73, 42, 0.4], [28, 52, 2.9], [88, 48, 1.7],
];

const WAVE = 'M0 40 Q 90 10 180 40 T 360 40 T 540 40 T 720 40 T 900 40 T 1080 40 T 1260 40 T 1440 40 V 80 H 0 Z';

// Class and keyframe names are prefixed: every page's CSS ships on every page,
// so an unprefixed name here would restyle other pages.
const STYLES = `
.cs-scene { position: relative; overflow: hidden; isolation: isolate; }
.cs-blob { position: absolute; border-radius: 9999px; filter: blur(60px); opacity: .45; z-index: -1; }
.cs-blob-a { width: 340px; height: 340px; background: #0890BC; top: -80px; left: -60px; animation: cs-drift 16s ease-in-out infinite alternate; }
.cs-blob-b { width: 300px; height: 300px; background: #65B3CF; bottom: 40px; right: -80px; opacity: .3; animation: cs-drift 20s ease-in-out infinite alternate-reverse; }
.cs-star { position: absolute; width: 4px; height: 4px; border-radius: 9999px; background: #F1FBFD; opacity: .2; z-index: -1; animation: cs-twinkle 3.6s ease-in-out infinite; }
.cs-icon-wrap { position: relative; width: 96px; height: 96px; margin: 0 auto 28px; animation: cs-float 4.5s ease-in-out infinite; }
.cs-ring { position: absolute; inset: 0; border-radius: 28px; border: 2px solid rgba(101,179,207,.6); animation: cs-ping 2.8s cubic-bezier(0,0,.2,1) infinite; }
.cs-ring-late { animation-delay: 1.4s; }
.cs-icon { position: relative; display: flex; align-items: center; justify-content: center; width: 96px; height: 96px; border-radius: 28px;
  background: linear-gradient(145deg, rgba(255,255,255,.18), rgba(255,255,255,.04)); border: 1px solid rgba(255,255,255,.25);
  box-shadow: 0 0 40px rgba(8,144,188,.55), inset 0 1px 0 rgba(255,255,255,.25); backdrop-filter: blur(6px); }
.cs-chip { position: relative; overflow: hidden; display: inline-flex; align-items: center; gap: 8px; }
.cs-chip::after { content: ''; position: absolute; inset: 0; transform: translateX(-120%);
  background: linear-gradient(100deg, transparent 20%, rgba(255,255,255,.55) 50%, transparent 80%); animation: cs-shine 3.2s ease-in-out infinite; }
.cs-dot { width: 5px; height: 5px; border-radius: 9999px; background: #fff; animation: cs-bounce 1.2s ease-in-out infinite; }
.cs-dot:nth-child(2) { animation-delay: .15s; }
.cs-dot:nth-child(3) { animation-delay: .3s; }
.cs-title { background: linear-gradient(90deg, #ffffff, #9FD6E8, #ffffff); background-size: 200% auto; -webkit-background-clip: text; background-clip: text;
  color: transparent; animation: cs-sheen 6s linear infinite; }
.cs-rise { opacity: 0; animation: cs-rise .8s cubic-bezier(.2,.7,.2,1) forwards; }
.cs-btn { transition: transform .2s ease, box-shadow .2s ease, background-color .2s ease; }
.cs-btn:hover { transform: translateY(-2px); box-shadow: 0 10px 24px -10px rgba(0,0,0,.45); }
.cs-plane { display: inline-block; animation: cs-glide 2.4s ease-in-out infinite; }
.cs-waves { position: absolute; left: 0; right: 0; bottom: -1px; height: 80px; z-index: -1; pointer-events: none; }
.cs-wave { position: absolute; bottom: 0; left: 0; width: 200%; height: 80px; }
.cs-wave-back { fill: rgba(101,179,207,.18); animation: cs-roll 14s linear infinite; }
.cs-wave-front { fill: rgba(241,251,253,.12); animation: cs-roll 9s linear infinite reverse; }
@keyframes cs-drift { from { transform: translate(0,0) scale(1); } to { transform: translate(60px,40px) scale(1.15); } }
@keyframes cs-twinkle { 0%,100% { opacity: .15; transform: scale(.8); } 50% { opacity: .9; transform: scale(1.3); } }
@keyframes cs-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-12px); } }
@keyframes cs-ping { 0% { transform: scale(1); opacity: .7; } 100% { transform: scale(1.6); opacity: 0; } }
@keyframes cs-shine { 0%,55% { transform: translateX(-120%); } 100% { transform: translateX(120%); } }
@keyframes cs-bounce { 0%,80%,100% { transform: translateY(0); opacity: .5; } 40% { transform: translateY(-4px); opacity: 1; } }
@keyframes cs-sheen { to { background-position: 200% center; } }
@keyframes cs-rise { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
@keyframes cs-glide { 0%,100% { transform: translateX(0) rotate(0); } 50% { transform: translateX(5px) rotate(-8deg); } }
@keyframes cs-roll { from { transform: translateX(0); } to { transform: translateX(-50%); } }
@media (prefers-reduced-motion: reduce) {
  .cs-scene *, .cs-scene *::after { animation: none !important; transition: none !important; }
  .cs-rise { opacity: 1; }
}
`;

const rise = (seconds) => ({ animationDelay: `${seconds}s` });

const ComingSoon = ({ section }) => {
  const copy = COMING_SOON_COPY[section] ?? COMING_SOON_COPY.packages;
  const Icon = copy.icon;
  const mail = `mailto:${EMAIL}?subject=${encodeURIComponent(`${copy.title} enquiry`)}`;

  useEffect(() => { window.scrollTo(0, 0); }, [section]);

  return (
    <>
      <style>{STYLES}</style>
      <Navbar />
      <main className="cs-scene bg-gradient-to-b from-[#034457] to-[#055B75] min-h-[72vh] flex items-center justify-center px-4 pt-16 pb-28 md:pt-24 md:pb-36">
        <span className="cs-blob cs-blob-a" aria-hidden="true" />
        <span className="cs-blob cs-blob-b" aria-hidden="true" />
        {STARS.map(([left, top, delay]) => (
          <span key={`${left}-${top}`} className="cs-star" style={{ left: `${left}%`, top: `${top}%`, animationDelay: `${delay}s` }} aria-hidden="true" />
        ))}

        <div className="w-full max-w-xl text-center">
          <div className="cs-icon-wrap" aria-hidden="true">
            <span className="cs-ring" />
            <span className="cs-ring cs-ring-late" />
            <span className="cs-icon"><Icon className="h-10 w-10 text-[#9FD6E8]" strokeWidth={1.75} /></span>
          </div>

          <p className="cs-rise cs-chip mb-4 rounded-full bg-[#0890BC] px-4 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-white shadow-[0_0_24px_rgba(8,144,188,.6)]" style={rise(0.1)}>
            Coming soon
            <span className="inline-flex items-center gap-1" aria-hidden="true">
              <span className="cs-dot" /><span className="cs-dot" /><span className="cs-dot" />
            </span>
          </p>
          <h1 className="cs-rise cs-title text-4xl md:text-6xl font-extrabold tracking-tight" style={rise(0.25)}>{copy.title}</h1>
          <p className="cs-rise mt-5 text-base md:text-lg text-[#F1FBFD]/90 leading-relaxed" style={rise(0.4)}>
            Online {copy.noun} booking is coming soon. Until then, our team can plan and book one for you.
          </p>
          <div className="cs-rise mt-9 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3" style={rise(0.55)}>
            <a href={PHONE.href} className="cs-btn inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 font-bold text-[#034457] shadow-sm hover:bg-[#F1FBFD]">
              <Phone className="h-4 w-4" aria-hidden="true" />
              Call {PHONE.text}
            </a>
            <a href={mail} className="cs-btn inline-flex items-center justify-center gap-2 rounded-xl border border-white/40 px-5 py-3 font-bold text-white hover:bg-white/10">
              <Mail className="h-4 w-4" aria-hidden="true" />
              {EMAIL}
            </a>
          </div>
          <div className="cs-rise mt-9" style={rise(0.7)}>
            <Link to="/flights" className="inline-flex items-center gap-2 text-sm font-semibold text-[#9FD6E8] underline-offset-4 hover:underline">
              <span className="cs-plane"><Plane className="h-4 w-4" aria-hidden="true" /></span>
              Flights are open for booking now
            </Link>
          </div>
        </div>

        <div className="cs-waves" aria-hidden="true">
          <svg className="cs-wave cs-wave-back" viewBox="0 0 1440 80" preserveAspectRatio="none"><path d={WAVE} /></svg>
          <svg className="cs-wave cs-wave-front" viewBox="0 0 1440 80" preserveAspectRatio="none"><path d={WAVE} transform="translate(0 10)" /></svg>
        </div>
      </main>
      <Footer />
    </>
  );
};

export default ComingSoon;
