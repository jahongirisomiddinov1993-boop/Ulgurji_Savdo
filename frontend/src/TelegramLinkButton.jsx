import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

export default function TelegramLinkButton() {
  const { authFetch } = useAuth();
  const [status, setStatus] = useState({ linked: false, bot_available: false });
  const [open, setOpen]     = useState(false);
  const [link, setLink]     = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr]       = useState('');

  const yuklash = useCallback(async () => {
    try {
      const r = await authFetch(`${API_URL}/api/auth/telegram/status`);
      if (r.ok) setStatus(await r.json());
    } catch {}
  }, [authFetch]);

  useEffect(() => { yuklash(); }, [yuklash]);

  const havolaYaratish = async () => {
    setErr(''); setLoading(true);
    try {
      const r = await authFetch(`${API_URL}/api/auth/telegram/link-init`, { method: 'POST' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setLink(d.link);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  };

  const ulashniOchirish = async () => {
    if (!window.confirm("Telegram bog'lanishini o'chirasizmi? Parolni unutsangiz tiklab bo'lmaydi.")) return;
    try {
      await authFetch(`${API_URL}/api/auth/telegram/unlink`, { method: 'POST' });
      yuklash();
      setOpen(false);
    } catch (e) { alert(e.message); }
  };

  const ochish = () => { setOpen(true); setLink(''); setErr(''); };

  if (!status.bot_available) return null; // bot sozlanmagan bo'lsa tugma ko'rinmaydi

  return (
    <>
      <span className="topbar-telegram">
      <button
        onClick={ochish}
        title={status.linked ? "Telegram bog'langan" : "Telegram bog'lash"}
        style={{
          background: status.linked ? '#16a34a' : '#0ea5e9',
          color: '#fff', border: 'none', borderRadius: 8,
          padding: '6px 12px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 4
        }}
      >
        {status.linked ? '✓ Telegram' : '🔗 Telegram'}
      </button>
      </span>

      {open && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'
        }} onClick={e => e.target === e.currentTarget && setOpen(false)}>
          <div style={{ background: '#fff', borderRadius: 12, padding: '2rem', maxWidth: 480, width: '100%' }}>
            <h3 style={{ margin: 0, marginBottom: '1rem', color: '#0f172a' }}>
              {status.linked ? '✓ Telegram bog\'langan' : '🔗 Telegram bog\'lash'}
            </h3>

            {err && <div className="error-message" style={{ marginBottom: '1rem' }}><span>⚠️</span><span>{err}</span></div>}

            {status.linked ? (
              <>
                <p style={{ color: '#64748b' }}>
                  Akauntingiz Telegramga muvaffaqiyatli bog'langan. Parolni unutsangiz, kod shu Telegramga keladi.
                </p>
                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                  <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setOpen(false)}>Yopish</button>
                  <button className="btn" style={{ flex: 1, background: '#dc2626', color: '#fff' }} onClick={ulashniOchirish}>
                    🗑️ Bog'lanishni o'chirish
                  </button>
                </div>
              </>
            ) : !link ? (
              <>
                <p style={{ color: '#64748b', marginBottom: '1rem' }}>
                  Parolni unutsangiz, kodi Telegramga keladigan qilish uchun avval botni akauntingizga bog'lang.
                </p>
                <div style={{ background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: 8, padding: '0.75rem', marginBottom: '1rem', fontSize: '0.9rem', color: '#1e40af' }}>
                  💡 <strong>Bog'lash uchun:</strong><br/>
                  1. "Havola yaratish" tugmasini bosing<br/>
                  2. Havola Telegramda ochiladi<br/>
                  3. Botda "Start" ni bosing<br/>
                  4. ✅ Tayyor
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setOpen(false)}>Bekor</button>
                  <button className="btn btn-primary" style={{ flex: 1 }} onClick={havolaYaratish} disabled={loading}>
                    {loading ? '⏳' : '🔗 Havola yaratish'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p style={{ color: '#64748b', marginBottom: '1rem' }}>
                  Quyidagi havolani Telegramda oching va botda <strong>"Start"</strong> tugmasini bosing.
                </p>
                <a href={link} target="_blank" rel="noopener noreferrer"
                  style={{
                    display: 'block', textAlign: 'center', background: '#0ea5e9', color: '#fff',
                    padding: '14px', borderRadius: 8, textDecoration: 'none', fontWeight: 'bold',
                    fontSize: '1.05rem', marginBottom: '1rem'
                  }}>
                  📲 Telegramda ochish
                </a>
                <div style={{ background: '#f1f5f9', padding: '0.5rem', borderRadius: 6, fontSize: '0.75rem', wordBreak: 'break-all', color: '#475569', marginBottom: '1rem' }}>
                  {link}
                </div>
                <p style={{ fontSize: '0.85rem', color: '#92400e' }}>
                  ⏰ Havola 15 daqiqada amal qiladi.
                </p>
                <button className="btn btn-outline" style={{ width: '100%' }} onClick={() => { setOpen(false); setTimeout(yuklash, 1000); }}>
                  Bog'landim, tekshirish
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
