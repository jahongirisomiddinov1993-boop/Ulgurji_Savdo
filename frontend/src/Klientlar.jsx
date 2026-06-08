import React, { useState, useEffect, useCallback } from 'react';
import { IcoClients } from './icons';
import { useAuth } from './AuthContext';
import { useTranslation } from 'react-i18next';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const boshlangichForm = { full_name: '', phone: '', address: '' };

const fmt = (n) => {
  const v = parseFloat(n || 0);
  if (!isFinite(v)) return '0';
  return Math.abs(v).toFixed(Math.abs(v) % 1 === 0 ? 0 : 2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
};

const avatarColor = (name = '') => {
  const colors = ['#1d4ed8','#16a34a','#dc2626','#d97706','#7c3aed','#0ea5e9','#db2777'];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return colors[Math.abs(h) % colors.length];
};

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
  const [filterTuri, setFilterTuri] = useState('all');
  const [drawerKlient, setDrawerKlient] = useState(null);

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

  const tuzatishBoshlash = (k) => {
    setTuzatishKlient(k);
    setTuzatishUZS(String(parseFloat(k.balance_uzs || 0)));
    setTuzatishUSD(String(parseFloat(k.balance_usd || 0)));
    setDrawerKlient(null);
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

  /* ── Computed stats ── */
  const jami        = klientlar.length;
  const qarzdorlar  = klientlar.filter(k => parseFloat(k.balance_uzs || 0) > 0);
  const jamiQarz    = klientlar.reduce((s, k) => s + Math.max(0, parseFloat(k.balance_uzs || 0)), 0);
  const jamiTolagan = klientlar.reduce((s, k) => s + Math.max(0, -parseFloat(k.balance_uzs || 0)), 0);

  /* ── Filtered list ── */
  const filtered = klientlar.filter(k => {
    const q = qidiruv.toLowerCase();
    const match = (k.full_name?.toLowerCase().includes(q) || k.phone?.includes(q));
    if (!match) return false;
    if (filterTuri === 'debtor')  return parseFloat(k.balance_uzs || 0) > 0;
    if (filterTuri === 'cleared') return parseFloat(k.balance_uzs || 0) <= 0;
    return true;
  });

  const balanceCls = (v) => {
    const n = parseFloat(v || 0);
    if (n > 0) return 'erp-balance-positive';
    if (n < 0) return 'erp-balance-negative';
    return 'erp-balance-zero';
  };

  return (
    <div className="page-section fade-in">

      {/* ── ERP PAGE HEADER ── */}
      <div className="erp-page-header">
        <div className="erp-page-title">
          <div style={{ width: 32, height: 32, borderRadius: 7, background: '#dbeafe', color: '#1d4ed8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <IcoClients />
          </div>
          <div>
            <h1>{t('clients_page.title')}</h1>
            <div className="erp-breadcrumb">{t('clients_page.subtitle')}</div>
          </div>
        </div>
        <div className="erp-page-actions">
          <button className="btn btn-primary" onClick={() => { setFormOchiq(!formOchiq); setDrawerKlient(null); }}>
            {formOchiq ? `✕ ${t('clients_page.close_button')}` : `+ ${t('clients_page.add_button')}`}
          </button>
        </div>
      </div>

      {/* ── ADD FORM (modal style) ── */}
      {formOchiq && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setFormOchiq(false)}>
          <div className="modal-content" style={{ maxWidth: 500 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>+ {t('clients_page.add_button')}</h3>
              <button className="erp-drawer-close" onClick={() => setFormOchiq(false)}>✕</button>
            </div>
            <form onSubmit={qoshish}>
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
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button type="button" className="btn btn-outline" onClick={() => setFormOchiq(false)}>{t('clients_page.adjust_modal.cancel')}</button>
                <button className="btn btn-primary" type="submit" disabled={saqlash}>
                  {saqlash ? t('clients_page.form.saving') : t('clients_page.form.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── ERP STATS BAR ── */}
      {!loading && !error && (
        <div className="erp-stats-bar">
          <div className="erp-stat-card primary">
            <div className="erp-stat-label">{t('clients_page.stats.total')}</div>
            <div className="erp-stat-value">{jami}</div>
            <div className="erp-stat-sub">{t('clients_page.stats.has_phone')}: {klientlar.filter(k => k.phone).length}</div>
          </div>
          <div className="erp-stat-card danger">
            <div className="erp-stat-label">Qarzdorlar</div>
            <div className="erp-stat-value">{qarzdorlar.length}</div>
            <div className="erp-stat-sub">{fmt(jamiQarz)} so'm</div>
          </div>
          <div className="erp-stat-card success">
            <div className="erp-stat-label">Kredit (bizdan olgan)</div>
            <div className="erp-stat-value">{klientlar.filter(k => parseFloat(k.balance_uzs || 0) < 0).length}</div>
            <div className="erp-stat-sub">{fmt(jamiTolagan)} so'm</div>
          </div>
          <div className="erp-stat-card info">
            <div className="erp-stat-label">USD balansi</div>
            <div className="erp-stat-value">${fmt(klientlar.reduce((s, k) => s + parseFloat(k.balance_usd || 0), 0))}</div>
            <div className="erp-stat-sub">Jami USD</div>
          </div>
        </div>
      )}

      {loading && <div className="loading-container"><div className="spinner"></div><span className="loading-text">{t('clients_page.loading')}</span></div>}
      {error && <div className="error-message">⚠️ {t('clients_page.error')}: {error}</div>}

      {!loading && !error && (
        <>
          {/* ── TOOLBAR ── */}
          <div className="erp-toolbar">
            <div className="erp-search">
              <span className="erp-search-icon">🔍</span>
              <input type="text" placeholder={t('clients_page.search_placeholder')}
                value={qidiruv} onChange={e => setQidiruv(e.target.value)} />
            </div>
            <select className="erp-filter-select" value={filterTuri} onChange={e => setFilterTuri(e.target.value)}>
              <option value="all">Barchasi ({jami})</option>
              <option value="debtor">Qarzdorlar ({qarzdorlar.length})</option>
              <option value="cleared">Tozalar</option>
            </select>
            <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              {filtered.length} ta natija
            </span>
          </div>

          {/* ── ERP TABLE ── */}
          {klientlar.length === 0 ? (
            <div className="erp-empty"><div className="erp-empty-icon">👤</div><div className="erp-empty-text">{t('clients_page.empty')}</div></div>
          ) : (
            <div className="erp-table-wrap">
              <table className="erp-table">
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>#</th>
                    <th>{t('clients_page.table.name')}</th>
                    <th>{t('clients_page.table.phone')}</th>
                    <th className="num">{t('clients_page.table.balance_uzs')}</th>
                    <th className="num">{t('clients_page.table.balance_usd')}</th>
                    <th style={{ width: 90 }}>Holat</th>
                    <th style={{ width: 100 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((k, idx) => {
                    const uzs = parseFloat(k.balance_uzs || 0);
                    const usd = parseFloat(k.balance_usd || 0);
                    const color = avatarColor(k.full_name || '');
                    const initials = (k.full_name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
                    return (
                      <tr key={k.id} style={{ cursor: 'pointer' }} onClick={() => setDrawerKlient(k)}>
                        <td style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>{idx + 1}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div className="erp-avatar" style={{ background: color }}>{initials}</div>
                            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{k.full_name}</span>
                          </div>
                        </td>
                        <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{k.phone || '—'}</td>
                        <td className={`num ${balanceCls(uzs)}`}>
                          {uzs !== 0 ? `${fmt(uzs)} so'm` : <span className="erp-balance-zero">0</span>}
                        </td>
                        <td className={`num ${usd !== 0 ? (usd > 0 ? 'erp-balance-positive' : 'erp-balance-negative') : 'erp-balance-zero'}`}>
                          {usd !== 0 ? `$${fmt(usd)}` : '—'}
                        </td>
                        <td>
                          {uzs > 0
                            ? <span className="erp-badge danger">Qarzdor</span>
                            : uzs < 0
                              ? <span className="erp-badge success">Kredit</span>
                              : <span className="erp-badge neutral">Toza</span>}
                        </td>
                        <td className="actions" onClick={e => e.stopPropagation()}>
                          <div className="erp-row-actions">
                            <button className="erp-action-btn view" title="Ko'rish" onClick={() => setDrawerKlient(k)}>👁</button>
                            <button className="erp-action-btn pay" title={t('clients_page.table.adjust')} onClick={() => tuzatishBoshlash(k)}>⚖️</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="erp-pagination">
                <span className="erp-pagination-info">Jami: {filtered.length} ta mijoz</span>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── DRAWER PANEL ── */}
      {drawerKlient && (
        <>
          <div className="erp-drawer-overlay" onClick={() => setDrawerKlient(null)} />
          <div className="erp-drawer">
            <div className="erp-drawer-header">
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                  <div className="erp-avatar" style={{ background: avatarColor(drawerKlient.full_name || ''), width: 36, height: 36, fontSize: '0.875rem' }}>
                    {(drawerKlient.full_name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="erp-drawer-title">{drawerKlient.full_name}</div>
                    {drawerKlient.phone && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{drawerKlient.phone}</div>}
                  </div>
                </div>
              </div>
              <button className="erp-drawer-close" onClick={() => setDrawerKlient(null)}>✕</button>
            </div>
            <div className="erp-drawer-body">
              <div style={{ marginBottom: '1rem' }}>
                {parseFloat(drawerKlient.balance_uzs || 0) > 0
                  ? <span className="erp-badge danger" style={{ fontSize: '0.82rem', padding: '4px 10px' }}>Qarzdor mijoz</span>
                  : parseFloat(drawerKlient.balance_uzs || 0) < 0
                    ? <span className="erp-badge success" style={{ fontSize: '0.82rem', padding: '4px 10px' }}>Kredit</span>
                    : <span className="erp-badge neutral" style={{ fontSize: '0.82rem', padding: '4px 10px' }}>Toza balans</span>
                }
              </div>
              <div style={{ background: 'var(--bg-primary)', borderRadius: 8, padding: '0.875rem', marginBottom: '1rem' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.5rem' }}>Balans</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: parseFloat(drawerKlient.balance_uzs || 0) > 0 ? 'var(--danger)' : parseFloat(drawerKlient.balance_uzs || 0) < 0 ? 'var(--success)' : 'var(--text-muted)' }}>
                  {fmt(drawerKlient.balance_uzs)} so'm
                </div>
                {parseFloat(drawerKlient.balance_usd || 0) !== 0 && (
                  <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--info)', marginTop: 4 }}>${fmt(drawerKlient.balance_usd)}</div>
                )}
              </div>
              <div className="erp-info-row"><span className="erp-info-key">ID</span><span className="erp-info-val">#{drawerKlient.id}</span></div>
              <div className="erp-info-row"><span className="erp-info-key">Telefon</span><span className="erp-info-val">{drawerKlient.phone || '—'}</span></div>
              <div className="erp-info-row"><span className="erp-info-key">Manzil</span><span className="erp-info-val">{drawerKlient.address || '—'}</span></div>
              {drawerKlient.created_at && (
                <div className="erp-info-row">
                  <span className="erp-info-key">Qo'shilgan</span>
                  <span className="erp-info-val">{new Date(drawerKlient.created_at).toLocaleDateString('uz-UZ')}</span>
                </div>
              )}
            </div>
            <div className="erp-drawer-footer">
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => tuzatishBoshlash(drawerKlient)}>
                ⚖️ {t('clients_page.table.adjust')}
              </button>
              <button className="btn btn-outline" onClick={() => setDrawerKlient(null)}>Yopish</button>
            </div>
          </div>
        </>
      )}

      {/* ── BALANS TUZATISH MODALI ── */}
      {tuzatishKlient && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setTuzatishKlient(null)}>
          <div className="modal-content" style={{ maxWidth: 440, padding: '1.75rem' }}>
            <h3 style={{ marginBottom: '0.5rem', color: 'var(--text-primary)' }}>⚖️ {t('clients_page.adjust_modal.title')}</h3>
            <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
              <strong>{tuzatishKlient.full_name}</strong> — {t('clients_page.adjust_modal.desc')}<br/>
              <em style={{ fontSize: '0.8rem' }}>{t('clients_page.adjust_modal.hint')}</em>
            </p>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">{t('clients_page.adjust_modal.uzs_label')}</label>
                <input type="number" className="form-input" value={tuzatishUZS}
                  onChange={e => setTuzatishUZS(e.target.value)} placeholder="-90000000 yoki 60000000" />
              </div>
              <div className="form-group">
                <label className="form-label">{t('clients_page.adjust_modal.usd_label')}</label>
                <input type="number" className="form-input" value={tuzatishUSD}
                  onChange={e => setTuzatishUSD(e.target.value)} placeholder="0" />
              </div>
            </div>
            <div style={{ background: '#fefce8', border: '1px solid #fde68a', borderRadius: 7, padding: '0.625rem 0.875rem', marginBottom: '1rem', fontSize: '0.82rem', color: '#92400e' }}>
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
