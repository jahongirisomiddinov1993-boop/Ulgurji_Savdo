import React, { useState, useEffect, useCallback } from 'react';
import { IcoProducts } from './icons';
import { useAuth } from './AuthContext';
import { useTranslation } from 'react-i18next';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const boshlangichForm = { name: '', price_usd: '', price_uzs: '', quantity: '', unit: 'dona' };
const BIRLIKLAR = ['dona', 'kg', 'g', 'litr', 'ml', 'metr', 'm²', 'm³', 'quti', 'juft', 'to\'plam'];

export default function Mahsulotlar() {
  const { authFetch } = useAuth();
  const { t } = useTranslation();
  const [mahsulotlar, setMahsulotlar] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [formOchiq, setFormOchiq] = useState(false);
  const [form, setForm] = useState(boshlangichForm);
  const [saqlash, setSaqlash] = useState(false);
  const [qidiruv, setQidiruv] = useState('');
  const [tahrirlashId, setTahrirlashId] = useState(null);

  const yuklash = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(`${API_URL}/api/products`);
      if (!res.ok) throw new Error(`Server xatosi: ${res.status}`);
      const data = await res.json();
      setMahsulotlar(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => { yuklash(); }, [yuklash]);

  const saqlashSubmit = async (e) => {
    e.preventDefault();
    setSaqlash(true);
    try {
      const url = tahrirlashId
        ? `${API_URL}/api/products/${tahrirlashId}`
        : `${API_URL}/api/products`;
      const method = tahrirlashId ? 'PUT' : 'POST';
      const res = await authFetch(url, { method, body: JSON.stringify(form) });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || errData.message || 'Xatolik yuz berdi');
      }
      setForm(boshlangichForm);
      setFormOchiq(false);
      setTahrirlashId(null);
      yuklash();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaqlash(false);
    }
  };

  const tahrirlashBoshlash = (m) => {
    setForm({ name: m.name, price_usd: m.price_usd, price_uzs: m.price_uzs, quantity: m.quantity, unit: m.unit || 'dona' });
    setTahrirlashId(m.id);
    setFormOchiq(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const ochirish = async (id) => {
    if (!window.confirm(t('products_page.confirm_delete'))) return;
    try {
      const res = await authFetch(`${API_URL}/api/products/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "O'chirishda xatolik");
      }
      yuklash();
    } catch (err) { alert(err.message); }
  };

  const formYopish = () => {
    setFormOchiq(false);
    setTahrirlashId(null);
    setForm(boshlangichForm);
  };

  const fmt = (n) => {
    const v = parseFloat(n || 0);
    if (!isFinite(v)) return '0';
    return Math.abs(v).toFixed(Math.abs(v) % 1 === 0 ? 0 : 2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  };

  const jami           = mahsulotlar.length;
  const jamiMiqdor     = mahsulotlar.reduce((s, m) => s + parseFloat(m.quantity || 0), 0);
  const jamiQiymatUzs  = mahsulotlar.reduce((s, m) => s + parseFloat(m.price_uzs || 0) * parseFloat(m.quantity || 0), 0);
  const jamiQiymatUsd  = mahsulotlar.reduce((s, m) => s + parseFloat(m.price_usd || 0) * parseFloat(m.quantity || 0), 0);
  const maxQty         = Math.max(...mahsulotlar.map(m => parseFloat(m.quantity || 0)), 1);
  const kamMahsulot    = mahsulotlar.filter(m => parseFloat(m.quantity || 0) < 5 && parseFloat(m.quantity || 0) > 0);
  const tugagan        = mahsulotlar.filter(m => parseFloat(m.quantity || 0) <= 0);

  const filtered = mahsulotlar.filter(m =>
    m.name && m.name.toLowerCase().includes(qidiruv.toLowerCase())
  );

  const qtyClass = (qty) => {
    if (qty <= 0) return 'danger';
    if (qty < 5)  return 'warning';
    return 'success';
  };

  const stockBadge = (qty) => {
    if (qty <= 0) return <span className="erp-badge danger">Tugagan</span>;
    if (qty < 5)  return <span className="erp-badge warning">Kam</span>;
    return <span className="erp-badge success">Mavjud</span>;
  };

  return (
    <div className="page-section fade-in">

      {/* ── ERP PAGE HEADER ── */}
      <div className="erp-page-header">
        <div className="erp-page-title">
          <div style={{ width: 32, height: 32, borderRadius: 7, background: '#ede9fe', color: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <IcoProducts />
          </div>
          <div>
            <h1>{t('products_page.title')}</h1>
            <div className="erp-breadcrumb">Ombor · Mahsulotlar ro'yxati</div>
          </div>
        </div>
        <div className="erp-page-actions">
          {tugagan.length > 0 && (
            <span className="erp-badge danger" style={{ fontSize: '0.78rem', padding: '4px 10px' }}>
              {tugagan.length} mahsulot tugagan
            </span>
          )}
          {kamMahsulot.length > 0 && (
            <span className="erp-badge warning" style={{ fontSize: '0.78rem', padding: '4px 10px' }}>
              {kamMahsulot.length} mahsulot kam
            </span>
          )}
          <button className="btn btn-primary" onClick={() => formOchiq ? formYopish() : setFormOchiq(true)}>
            {formOchiq ? `✕ ${t('products_page.close_button')}` : `+ ${t('products_page.add_button')}`}
          </button>
        </div>
      </div>

      {/* ── ADD / EDIT FORM (modal) ── */}
      {formOchiq && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && formYopish()}>
          <div className="modal-content" style={{ maxWidth: 560 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
                {tahrirlashId ? `✏️ ${t('products_page.form.update')}` : `+ ${t('products_page.add_button')}`}
              </h3>
              <button className="erp-drawer-close" onClick={formYopish}>✕</button>
            </div>
            <form onSubmit={saqlashSubmit}>
              <div className="form-grid">
                <div className="form-group form-group-full">
                  <label className="form-label">{t('products_page.form.name_label')}</label>
                  <input className="form-input" placeholder={t('products_page.form.name_placeholder')} required
                    value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('products_page.form.price_uzs_label')}</label>
                  <input className="form-input" type="number" step="0.01" placeholder="0"
                    value={form.price_uzs} onChange={e => setForm({...form, price_uzs: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('products_page.form.price_usd_label')}</label>
                  <input className="form-input" type="number" step="0.01" placeholder="0"
                    value={form.price_usd} onChange={e => setForm({...form, price_usd: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('products_page.form.qty_label')}</label>
                  <input className="form-input" type="number" placeholder="0"
                    value={form.quantity} onChange={e => setForm({...form, quantity: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('products_page.form.unit_label')}</label>
                  <select className="form-input" value={form.unit} onChange={e => setForm({...form, unit: e.target.value})}>
                    {BIRLIKLAR.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button type="button" className="btn btn-outline" onClick={formYopish}>{t('products_page.form.cancel')}</button>
                <button className="btn btn-primary" type="submit" disabled={saqlash}>
                  {saqlash ? t('products_page.form.saving') : tahrirlashId ? t('products_page.form.update') : t('products_page.form.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── ERP STATS BAR ── */}
      {!loading && !error && (
        <div className="erp-stats-bar">
          <div className="erp-stat-card purple">
            <div className="erp-stat-label">{t('products_page.stats.types')}</div>
            <div className="erp-stat-value">{jami}</div>
            <div className="erp-stat-sub">{t('products_page.stats.types_unit')}</div>
          </div>
          <div className="erp-stat-card info">
            <div className="erp-stat-label">{t('products_page.stats.total_qty')}</div>
            <div className="erp-stat-value">{fmt(jamiMiqdor)}</div>
            <div className="erp-stat-sub">{t('products_page.stats.qty_unit')}</div>
          </div>
          <div className="erp-stat-card success">
            <div className="erp-stat-label">{t('products_page.stats.total_uzs')}</div>
            <div className="erp-stat-value" style={{ fontSize: '1.05rem' }}>{fmt(jamiQiymatUzs)}</div>
            <div className="erp-stat-sub">so'm</div>
          </div>
          <div className="erp-stat-card primary">
            <div className="erp-stat-label">{t('products_page.stats.total_usd')}</div>
            <div className="erp-stat-value">${fmt(jamiQiymatUsd)}</div>
            <div className="erp-stat-sub">USD</div>
          </div>
          <div className="erp-stat-card danger">
            <div className="erp-stat-label">Tugagan / Kam</div>
            <div className="erp-stat-value">{tugagan.length} / {kamMahsulot.length}</div>
            <div className="erp-stat-sub">mahsulot</div>
          </div>
        </div>
      )}

      {loading && <div className="loading-container"><div className="spinner"></div><span className="loading-text">{t('products_page.loading')}</span></div>}
      {error && <div className="error-message">⚠️ {t('products_page.error')}: {error}</div>}

      {!loading && !error && (
        <>
          {/* ── TOOLBAR ── */}
          <div className="erp-toolbar">
            <div className="erp-search">
              <span className="erp-search-icon">🔍</span>
              <input type="text" placeholder={t('products_page.search_placeholder')}
                value={qidiruv} onChange={e => setQidiruv(e.target.value)} />
            </div>
            <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              {filtered.length} ta mahsulot
            </span>
          </div>

          {/* ── ERP TABLE ── */}
          {mahsulotlar.length === 0 ? (
            <div className="erp-empty"><div className="erp-empty-icon">📦</div><div className="erp-empty-text">{t('products_page.empty')}</div></div>
          ) : (
            <div className="erp-table-wrap">
              <table className="erp-table">
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>#</th>
                    <th>{t('products_page.table.name')}</th>
                    <th>{t('products_page.table.unit')}</th>
                    <th className="num">{t('products_page.table.price_uzs')}</th>
                    <th className="num">{t('products_page.table.price_usd')}</th>
                    <th className="num" style={{ width: 180 }}>{t('products_page.table.qty')}</th>
                    <th style={{ width: 90 }}>Holat</th>
                    <th style={{ width: 80 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((m, idx) => {
                    const qty = parseFloat(m.quantity || 0);
                    const pct = Math.min((qty / maxQty) * 100, 100);
                    return (
                      <tr key={m.id}>
                        <td style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>{idx + 1}</td>
                        <td>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{m.name}</span>
                        </td>
                        <td>
                          <span className="erp-badge info">{m.unit || 'dona'}</span>
                        </td>
                        <td className="num" style={{ color: '#16a34a', fontWeight: 600 }}>
                          {fmt(m.price_uzs)} <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400 }}>so'm</span>
                        </td>
                        <td className="num" style={{ color: 'var(--info)', fontWeight: 600 }}>
                          ${fmt(m.price_usd)}
                        </td>
                        <td className="num">
                          <div className="erp-qty-cell">
                            <div className="erp-progress">
                              <div className={`erp-progress-bar ${qtyClass(qty)}`} style={{ width: `${pct}%` }}></div>
                            </div>
                            <span style={{ fontWeight: 700, minWidth: 36, color: qty <= 0 ? 'var(--danger)' : qty < 5 ? 'var(--warning)' : 'var(--text-primary)' }}>
                              {fmt(qty)}
                            </span>
                          </div>
                        </td>
                        <td>{stockBadge(qty)}</td>
                        <td className="actions">
                          <div className="erp-row-actions">
                            <button className="erp-action-btn edit" title={t('products_page.tooltip.edit')} onClick={() => tahrirlashBoshlash(m)}>✏️</button>
                            <button className="erp-action-btn del" title={t('products_page.tooltip.delete')} onClick={() => ochirish(m.id)}>🗑</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="erp-pagination">
                <span className="erp-pagination-info">Jami: {filtered.length} ta mahsulot · {fmt(jamiMiqdor)} dona</span>
                <span style={{ fontSize: '0.78rem', color: '#16a34a', fontWeight: 600 }}>{fmt(jamiQiymatUzs)} so'm qiymat</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
