import React, { useState, useEffect, useCallback } from 'react';
import { PageIcon, IcoClients } from './icons';
import { useAuth } from './AuthContext';
import { useTranslation } from 'react-i18next';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const boshlangichForm = { full_name: '', phone: '', address: '' };

export default function Klientlar() {
  const { authFetch } = useAuth();
  const { t } = useTranslation();
  const [klientlar, setKlientlar] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [formOchiq, setFormOchiq] = useState(false);
  const [form, setForm] = useState(boshlangichForm);
  const [saqlash, setSaqlash] = useState(false);
  const [qidiruv, setQidiruv] = useState('');

  const [tuzatishKlient, setTuzatishKlient] = useState(null);
  const [tuzatishUZS, setTuzatishUZS]       = useState('');
  const [tuzatishUSD, setTuzatishUSD]       = useState('');
  const [tuzatishSaving, setTuzatishSaving] = useState(false);

  const yuklash = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(`${API_URL}/api/clients`);
      if (!res.ok) throw new Error(`Server xatosi: ${res.status}`);
      const data = await res.json();
      setKlientlar(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => { yuklash(); }, [yuklash]);

  const qoshish = async (e) => {
    e.preventDefault();
    setSaqlash(true);
    try {
      const payload = { ...form, client_type: 'customer' };
      const res = await authFetch(`${API_URL}/api/clients`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Server xatosi: ${res.status}`);
      }
      setForm(boshlangichForm);
      setFormOchiq(false);
      yuklash();
    } catch (err) {
      alert(`${t('opening_balance_page.error_prefix')}${err.message}`);
    } finally {
      setSaqlash(false);
    }
  };

  const formatSumma = (s) => parseFloat(s || 0).toLocaleString('uz-UZ');

  const tuzatishBoshlash = (k) => {
    setTuzatishKlient(k);
    setTuzatishUZS(String(parseFloat(k.balance_uzs || 0)));
    setTuzatishUSD(String(parseFloat(k.balance_usd || 0)));
  };

  const tuzatishSaqlash = async () => {
    if (!tuzatishKlient) return;
    setTuzatishSaving(true);
    try {
      const res = await authFetch(`${API_URL}/api/clients/${tuzatishKlient.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          full_name: tuzatishKlient.full_name,
          phone: tuzatishKlient.phone,
          address: tuzatishKlient.address,
          balance_uzs: parseFloat(tuzatishUZS) || 0,
          balance_usd: parseFloat(tuzatishUSD) || 0,
        }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      setTuzatishKlient(null);
      yuklash();
    } catch (err) { alert(err.message); }
    finally { setTuzatishSaving(false); }
  };

  return (
    <div className="page-section fade-in">
      <div className="section-header">
        <div className="section-title-row">
          <PageIcon icon={<IcoClients />} color="#3b82f6" />
          <h2 className="section-title">{t('clients_page.title')}</h2>
        </div>
        <button className="btn btn-primary btn-large" onClick={() => setFormOchiq(!formOchiq)}>
          {formOchiq ? `✕ ${t('clients_page.close_button')}` : `+ ${t('clients_page.add_button')}`}
        </button>
      </div>
      <p className="text-muted" style={{ marginBottom: '1.5rem', fontWeight: 600 }}>{t('clients_page.subtitle')}</p>

      {formOchiq && (
        <form className="add-form fade-in" onSubmit={qoshish}>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">{t('clients_page.form.name_label')}</label>
              <input className="form-input" placeholder={t('clients_page.form.name_placeholder')} required
                value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('clients_page.form.phone_label')}</label>
              <input className="form-input" placeholder="+998..."
                value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="form-group form-group-full">
              <label className="form-label">{t('clients_page.form.address_label')}</label>
              <input className="form-input" placeholder={t('clients_page.form.address_placeholder')}
                value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
            </div>
          </div>
          <button className="btn btn-success btn-large" type="submit" disabled={saqlash}>
            {saqlash ? t('clients_page.form.saving') : t('clients_page.form.save')}
          </button>
        </form>
      )}

      {/* Stats */}
      {!loading && !error && (
        <div className="stats-row stats-row-2">
          <div className="stat-item">
            <div className="stat-value">{klientlar.length}</div>
            <div className="stat-label">{t('clients_page.stats.total')}</div>
          </div>
          <div className="stat-item">
            <div className="stat-value">{klientlar.filter(k => k.phone).length}</div>
            <div className="stat-label">{t('clients_page.stats.has_phone')}</div>
          </div>
        </div>
      )}

      {loading && (
        <div className="loading-container"><div className="spinner"></div>
          <span className="loading-text">{t('clients_page.loading')}</span></div>
      )}
      {error && <div className="error-message"><span>⚠️</span><span>{t('clients_page.error')}: {error}</span></div>}
      {!loading && !error && klientlar.length === 0 && (
        <div className="empty-state"><div className="empty-state-icon">👤</div>
          <div className="empty-state-text">{t('clients_page.empty')}</div></div>
      )}

      {/* Qidiruv maydoni */}
      {!loading && !error && klientlar.length > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <input
            type="text"
            className="form-input"
            placeholder={t('clients_page.search_placeholder')}
            value={qidiruv}
            onChange={(e) => setQidiruv(e.target.value)}
          />
        </div>
      )}

      {!loading && !error && klientlar.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>{t('clients_page.table.name')}</th>
                <th>{t('clients_page.table.phone')}</th>
                <th>{t('clients_page.table.address')}</th>
                <th style={{ textAlign: 'right' }}>{t('clients_page.table.balance_uzs')}</th>
                <th style={{ textAlign: 'right' }}>{t('clients_page.table.balance_usd')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {klientlar.filter(k =>
                (k.full_name && k.full_name.toLowerCase().includes(qidiruv.toLowerCase())) ||
                (k.phone && k.phone.includes(qidiruv))
              ).map(k => (
                <tr key={k.id}>
                  <td><span className="row-id">{k.id}</span></td>
                  <td className="text-black font-bold">{k.full_name}</td>
                  <td>{k.phone || <span className="text-muted">—</span>}</td>
                  <td className="text-muted">{k.address || '—'}</td>
                  <td className={parseFloat(k.balance_uzs || 0) >= 0 ? 'text-success font-bold' : 'text-danger font-bold'} style={{ textAlign: 'right' }}>
                    {formatSumma(k.balance_uzs)} <small className="text-muted">so'm</small>
                  </td>
                  <td className={parseFloat(k.balance_usd || 0) >= 0 ? 'text-success font-bold' : 'text-danger font-bold'} style={{ textAlign: 'right' }}>
                    ${formatSumma(k.balance_usd)}
                  </td>
                  <td>
                    <button className="btn btn-sm" style={{ background: '#f59e0b', color: '#fff', whiteSpace: 'nowrap' }} onClick={() => tuzatishBoshlash(k)} title={t('clients_page.table.adjust')}>{t('clients_page.table.adjust')}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── BALANS TUZATISH MODALI ── */}
      {tuzatishKlient && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setTuzatishKlient(null)}>
          <div className="modal-content" style={{ maxWidth: 440, padding: '1.75rem' }}>
            <h3 style={{ marginBottom: '0.5rem', color: 'var(--text-primary)' }}>⚖️ {t('clients_page.adjust_modal.title')}</h3>
            <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
              <strong>{tuzatishKlient.full_name}</strong> — {t('clients_page.adjust_modal.desc')}<br/>
              <em>{t('clients_page.adjust_modal.hint')}</em>
            </p>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">{t('clients_page.adjust_modal.uzs_label')}</label>
                <input type="number" className="form-input" value={tuzatishUZS}
                  onChange={e => setTuzatishUZS(e.target.value)}
                  placeholder="-90000000 yoki 60000000" />
              </div>
              <div className="form-group">
                <label className="form-label">{t('clients_page.adjust_modal.usd_label')}</label>
                <input type="number" className="form-input" value={tuzatishUSD}
                  onChange={e => setTuzatishUSD(e.target.value)}
                  placeholder="0" />
              </div>
            </div>
            <div style={{ background: '#fefce8', border: '1px solid #fde68a', borderRadius: 8, padding: '0.75rem', marginBottom: '1rem', fontSize: '0.85rem', color: '#92400e' }}>
              ⚠️ {t('clients_page.adjust_modal.warning')}
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-outline btn-sm" onClick={() => setTuzatishKlient(null)}>{t('clients_page.adjust_modal.cancel')}</button>
              <button className="btn btn-primary" onClick={tuzatishSaqlash} disabled={tuzatishSaving}>
                {tuzatishSaving ? t('clients_page.adjust_modal.saving') : t('clients_page.adjust_modal.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
