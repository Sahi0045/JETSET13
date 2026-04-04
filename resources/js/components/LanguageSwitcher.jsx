import React, { useState, useEffect, useCallback } from 'react';
import { LANGUAGES, setLanguage, getLanguage, onLanguageChange } from '../../utils/i18n';

/**
 * LanguageSwitcher — drop into any navbar.
 * Shows a flag + language dropdown.
 */
export default function LanguageSwitcher({ variant = 'dropdown' }) {
  const [current, setCurrent]   = useState(getLanguage());
  const [isOpen,  setIsOpen]    = useState(false);
  const currentLang = LANGUAGES.find(l => l.code === current) || LANGUAGES[0];

  useEffect(() => {
    const unsub = onLanguageChange(code => setCurrent(code));
    return unsub;
  }, []);

  const handleSelect = useCallback((code) => {
    setLanguage(code);
    setIsOpen(false);
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const close = () => setIsOpen(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [isOpen]);

  return (
    <div
      className="lang-switcher"
      style={{ position: 'relative', display: 'inline-block' }}
      onClick={e => e.stopPropagation()}
    >
      {/* Trigger button */}
      <button
        id="lang-switcher-btn"
        onClick={() => setIsOpen(o => !o)}
        aria-label="Change language"
        aria-expanded={isOpen}
        style={{
          display:        'flex',
          alignItems:     'center',
          gap:            '6px',
          padding:        '6px 12px',
          background:     'rgba(255,255,255,0.1)',
          border:         '1px solid rgba(255,255,255,0.2)',
          borderRadius:   '8px',
          color:          'inherit',
          cursor:         'pointer',
          fontSize:       '0.85rem',
          fontWeight:     500,
          backdropFilter: 'blur(8px)',
          transition:     'background 0.2s',
        }}
      >
        <span style={{ fontSize: '1.1rem' }}>{currentLang.flag}</span>
        <span>{currentLang.code.toUpperCase()}</span>
        <span style={{
          fontSize:   '0.6rem',
          transform:  isOpen ? 'rotate(180deg)' : 'rotate(0)',
          transition: 'transform 0.2s',
          opacity:    0.7,
        }}>▼</span>
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div
          role="listbox"
          aria-label="Select language"
          style={{
            position:     'absolute',
            top:          'calc(100% + 8px)',
            right:        0,
            minWidth:     '160px',
            background:   '#1e293b',
            border:       '1px solid rgba(255,255,255,0.12)',
            borderRadius: '12px',
            overflow:     'hidden',
            boxShadow:    '0 16px 48px rgba(0,0,0,0.4)',
            zIndex:       9999,
            animation:    'fadeSlideIn 0.15s ease',
          }}
        >
          {LANGUAGES.map(lang => (
            <button
              key={lang.code}
              role="option"
              aria-selected={lang.code === current}
              onClick={() => handleSelect(lang.code)}
              style={{
                width:       '100%',
                display:     'flex',
                alignItems:  'center',
                gap:         '10px',
                padding:     '10px 16px',
                background:  lang.code === current ? 'rgba(99,102,241,0.2)' : 'transparent',
                border:      'none',
                color:       lang.code === current ? '#818cf8' : '#e2e8f0',
                cursor:      'pointer',
                fontSize:    '0.875rem',
                fontWeight:  lang.code === current ? 600 : 400,
                transition:  'background 0.15s',
                textAlign:   'left',
              }}
              onMouseEnter={e => { if (lang.code !== current) e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
              onMouseLeave={e => { if (lang.code !== current) e.currentTarget.style.background = 'transparent'; }}
            >
              <span style={{ fontSize: '1.2rem' }}>{lang.flag}</span>
              <span>{lang.label}</span>
              {lang.rtl && (
                <span style={{ marginLeft: 'auto', fontSize: '0.7rem', opacity: 0.5 }}>RTL</span>
              )}
              {lang.code === current && (
                <span style={{ marginLeft: 'auto', color: '#818cf8' }}>✓</span>
              )}
            </button>
          ))}
        </div>
      )}

      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
