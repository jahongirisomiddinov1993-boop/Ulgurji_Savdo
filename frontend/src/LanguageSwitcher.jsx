import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { LANGUAGES } from './i18n';

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const current = LANGUAGES.find(l => l.code === i18n.language) || LANGUAGES[0];

  useEffect(() => {
    const onClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const tanlash = (code) => {
    i18n.changeLanguage(code);
    setOpen(false);
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 10px', borderRadius: 6,
          background: '#f1f5f9', border: '1px solid #cbd5e1',
          cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600,
        }}
        title="Til / Язык"
      >
        <span>{current.flag}</span>
        <span className="lang-label">{current.label}</span>
        <span style={{ fontSize: '0.7rem' }}>▼</span>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '110%', right: 0, minWidth: 160,
          background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8,
          boxShadow: '0 6px 16px rgba(0,0,0,0.1)', zIndex: 1000, overflow: 'hidden',
        }}>
          {LANGUAGES.map(l => (
            <div
              key={l.code}
              onClick={() => tanlash(l.code)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 12px', cursor: 'pointer',
                background: l.code === i18n.language ? '#eff6ff' : '#fff',
                fontWeight: l.code === i18n.language ? 700 : 500,
                color: l.code === i18n.language ? '#1d4ed8' : '#1e293b',
                borderBottom: '1px solid #f1f5f9',
              }}
              onMouseEnter={e => { if (l.code !== i18n.language) e.currentTarget.style.background = '#f8fafc'; }}
              onMouseLeave={e => { if (l.code !== i18n.language) e.currentTarget.style.background = '#fff'; }}
            >
              <span style={{ fontSize: '1.1rem' }}>{l.flag}</span>
              <span>{l.label}</span>
              {l.code === i18n.language && <span style={{ marginLeft: 'auto' }}>✓</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
