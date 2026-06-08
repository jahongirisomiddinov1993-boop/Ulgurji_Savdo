import React, { useState, useEffect, useCallback } from 'react';
import { PageIcon, IcoProducts } from './icons';
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

  const formatNarx = (narx) => parseFloat(narx || 0).toLocaleString('uz-UZ');

  const jami = mahsulotlar.length;
  const jamiMiqdor = mahsulotlar.reduce((s, m) => s + parseFloat(m.quantity || 0), 0);
  const jamiQiymatUzs = mahsulotlar.reduce((s, m) => s + parseFloat(m.price_uzs || 0) * parseFloat(m.quantity || 0), 0);
  const jamiQiymatUsd = mahsulotlar.reduce((s, m) => s + parseFloat(m.price_usd || 0) * parseFloat(m.quantity || 0), 0);

  return (
    <div className="page-section fade-in">
      <div className="section-header">
        <div className="section-title-row">
          <PageIcon icon={<IcoProducts />} color="#8b5cf6" />
          <h2 className="section-title">{t('products_page.title')}</h2>
        </div>
        <button className="btn btn-large btn-success" onClick={() => formOchiq ? formYopish() : setFormOchiq(true)}>
          {formOchiq ? `✕ ${t('products_page.close_button')}` : t('products_page.add_button')}
        </button>
      </div>

      {/* Qo'shish / Tahrirlash formasi */}
      {formOchiq && (
        <form className="add-form fade-in" onSubmit={saqlashSubmit}>
          <div className="form-grid">
            <div className="form-group">
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
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-success btn-large" type="submit" disabled={saqlash}>
              {saqlash ? t('products_page.form.saving') : tahrirlashId ? t('products_page.form.update') : t('products_page.form.save')}
            </button>
            {tahrirlashId && (
              <button type="button" className="btn btn-outline btn-large" onClick={formYopish}>{t('products_page.form.cancel')}</button>
            )}
          </div>
        </form>
      )}

      {/* Statistik Kartochkalar (Summary Cards) */}
      {!loading && !error && mahsulotlar.length > 0 && (
        <div className="summary-cards-container fade-in">
          <div className="summary-card">
            <div className="summary-card-label">{t('products_page.stats.types')}</div>
            <div className="summary-card-value text-black">{jami} {t('products_page.stats.types_unit')}</div>
          </div>
          
          <div className="summary-card">
            <div className="summary-card-label">{t('products_page.stats.total_qty')}</div>
            <div className="summary-card-value text-black">{jamiMiqdor.toLocaleString('uz-UZ')} {t('products_page.stats.qty_unit')}</div>
          </div>
          
          <div className="summary-card">
            <div className="summary-card-label">{t('products_page.stats.total_uzs')}</div>
            <div className="summary-card-value text-success">
              {formatNarx(jamiQiymatUzs)} <small>so'm</small>
            </div>
          </div>
          
          <div className="summary-card">
            <div className="summary-card-label">{t('products_page.stats.total_usd')}</div>
            <div className="summary-card-value text-info">
              ${formatNarx(jamiQiymatUsd)}
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="loading-container"><div className="spinner"></div>
          <span className="loading-text">{t('products_page.loading')}</span></div>
      )}
      {error && <div className="error-message"><span>⚠️</span><span>{t('products_page.error')}: {error}</span></div>}
      {!loading && !error && mahsulotlar.length === 0 && (
        <div className="empty-state"><div className="empty-state-icon">📭</div>
          <div className="empty-state-text">{t('products_page.empty')}</div></div>
      )}

      {/* Qidiruv maydoni */}
      {!loading && !error && mahsulotlar.length > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <input 
            type="text" 
            className="form-input" 
            placeholder={t('products_page.search_placeholder')} 
            value={qidiruv}
            onChange={(e) => setQidiruv(e.target.value)}
          />
        </div>
      )}

      {!loading && !error && mahsulotlar.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>#</th><th>{t('products_page.table.name')}</th><th>{t('products_page.table.unit')}</th><th>{t('products_page.table.price_uzs')}</th><th>{t('products_page.table.price_usd')}</th><th>{t('products_page.table.qty')}</th><th>{t('products_page.table.date')}</th><th></th></tr>
            </thead>
            <tbody>
              {mahsulotlar.filter(m => 
                (m.name && m.name.toLowerCase().includes(qidiruv.toLowerCase()))
              ).map(m => (
                <tr key={m.id}>
                  <td><span className="row-id">{m.id}</span></td>
                  <td className="text-black font-bold">{m.name}</td>
                  <td><span className="badge" style={{background:'#e0f2fe',color:'#0369a1'}}>{m.unit || 'dona'}</span></td>
                  <td className="text-success font-bold">{formatNarx(m.price_uzs)} <small className="text-muted">so'm</small></td>
                  <td className="text-success font-bold">${formatNarx(m.price_usd)}</td>
                  <td className="font-bold">{parseFloat(m.quantity || 0).toLocaleString('uz-UZ')}</td>
                  <td className="text-muted">{m.created_at ? new Date(m.created_at).toLocaleDateString('uz-UZ') : '—'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button className="btn btn-outline btn-sm" title={t('products_page.tooltip.edit')} onClick={() => tahrirlashBoshlash(m)}>✏️</button>
                      <button className="btn btn-danger btn-sm" title={t('products_page.tooltip.delete')} onClick={() => ochirish(m.id)}>🗑</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
