import React, { useState, useEffect, useCallback } from 'react';
import { PageIcon, IcoSuppliers } from './icons';
import { useAuth } from './AuthContext';
import { useTranslation } from 'react-i18next';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const boshlangichForm = { full_name: '', phone: '', address: '' };

export default function Pudratchilar() {
  const { authFetch, user } = useAuth();
  const { t } = useTranslation();
  const [pudratchilar, setPudratchilar] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [formOchiq, setFormOchiq] = useState(false);
  const [form, setForm] = useState(boshlangichForm);
  const [saqlash, setSaqlash] = useState(false);
  const [qidiruv, setQidiruv] = useState('');
  const [editPudratchi, setEditPudratchi] = useState(null);
  const [editSaving, setEditSaving] = useState(false);

  const yuklash = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(`${API_URL}/api/suppliers`);
      if (!res.ok) throw new Error(`Server xatosi: ${res.status}`);
      const data = await res.json();
      setPudratchilar(data);
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
      const res = await authFetch(`${API_URL}/api/suppliers`, {
        method: 'POST',
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(t('suppliers_page.error'));
      setForm(boshlangichForm);
      setFormOchiq(false);
      yuklash();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaqlash(false);
    }
  };

  const formatSumma = (s) => parseFloat(s || 0).toLocaleString('uz-UZ');

  const ochirish = async (id) => {
    if (!window.confirm(t('suppliers_page.confirm_delete'))) return;
    try {
      const res = await authFetch(`${API_URL}/api/suppliers/${id}`, { method: 'DELETE' });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || t('suppliers_page.error')); }
      yuklash();
    } catch (err) { alert(err.message); }
  };

  const tahrirBoshlash = (p) => setEditPudratchi({ ...p });

  const tahrirSaqlash = async () => {
    if (!editPudratchi) return;
    setEditSaving(true);
    try {
      const res = await authFetch(`${API_URL}/api/suppliers/${editPudratchi.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          full_name: editPudratchi.full_name,
          phone: editPudratchi.phone || null,
          address: editPudratchi.address || null,
          balance_uzs: parseFloat(editPudratchi.balance_uzs) || 0,
          balance_usd: parseFloat(editPudratchi.balance_usd) || 0,
        }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      setEditPudratchi(null);
      yuklash();
    } catch (err) { alert(err.message); }
    finally { setEditSaving(false); }
  };

  return (
    <div className="page-section fade-in">
      <div className="section-header">
        <div className="section-title-row">
          <PageIcon icon={<IcoSuppliers />} color="#f59e0b" />
          <h2 className="section-title">{t('suppliers_page.title')}</h2>
        </div>
        <button className="btn btn-primary btn-large" onClick={() => setFormOchiq(!formOchiq)}>
          {formOchiq ? `✕ ${t('suppliers_page.close_button')}` : `+ ${t('suppliers_page.add_button')}`}
        </button>
      </div>
      <p className="text-muted" style={{marginBottom: '1.5rem', fontWeight: 600}}>{t('suppliers_page.subtitle')}</p>

      {formOchiq && (
        <form className="add-form fade-in" onSubmit={qoshish}>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">{t('suppliers_page.form.name_label')}</label>
              <input className="form-input" placeholder={t('suppliers_page.form.name_placeholder')} required
                value={form.full_name} onChange={e => setForm({...form, full_name: e.target.value})} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('suppliers_page.form.phone_label')}</label>
              <input className="form-input" placeholder="+998..."
                value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} />
            </div>
            <div className="form-group form-group-full">
              <label className="form-label">{t('suppliers_page.form.address_label')}</label>
              <input className="form-input" placeholder={t('suppliers_page.form.address_placeholder')}
                value={form.address} onChange={e => setForm({...form, address: e.target.value})} />
            </div>
          </div>
          <button className="btn btn-success btn-large" type="submit" disabled={saqlash}>
            {saqlash ? t('suppliers_page.form.saving') : t('suppliers_page.form.save')}
          </button>
        </form>
      )}

      {/* Stats */}
      {!loading && !error && (
        <div className="stats-row stats-row-2">
          <div className="stat-item">
            <div className="stat-value">{pudratchilar.length}</div>
            <div className="stat-label">{t('suppliers_page.stats.total')}</div>
          </div>
          <div className="stat-item">
            <div className="stat-value">{pudratchilar.filter(p => p.phone).length}</div>
            <div className="stat-label">{t('suppliers_page.stats.has_phone')}</div>
          </div>
        </div>
      )}

      {loading && (
        <div className="loading-container"><div className="spinner"></div>
          <span className="loading-text">{t('suppliers_page.loading')}</span></div>
      )}
      {error && <div className="error-message"><span>⚠️</span><span>{t('suppliers_page.error')}: {error}</span></div>}
      {!loading && !error && pudratchilar.length === 0 && (
        <div className="empty-state"><div className="empty-state-icon">🏗️</div>
          <div className="empty-state-text">{t('suppliers_page.empty')}</div></div>
      )}

      {/* Qidiruv maydoni */}
      {!loading && !error && pudratchilar.length > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <input 
            type="text" 
            className="form-input" 
            placeholder={t('suppliers_page.search_placeholder')} 
            value={qidiruv}
            onChange={(e) => setQidiruv(e.target.value)}
          />
        </div>
      )}

      {!loading && !error && pudratchilar.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>{t('suppliers_page.table.name')}</th>
                <th>{t('suppliers_page.table.phone')}</th>
                <th>{t('suppliers_page.table.address')}</th>
                <th style={{ textAlign: 'right' }}>{t('suppliers_page.table.balance_uzs')}</th>
                <th style={{ textAlign: 'right' }}>{t('suppliers_page.table.balance_usd')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pudratchilar.filter(p => 
                (p.full_name && p.full_name.toLowerCase().includes(qidiruv.toLowerCase())) ||
                (p.phone && p.phone.includes(qidiruv))
              ).map(p => (
                <tr key={p.id}>
                  <td><span className="row-id">{p.id}</span></td>
                  <td className="text-black font-bold">{p.full_name}</td>
                  <td>{p.phone || <span className="text-muted">—</span>}</td>
                  <td className="text-muted">{p.address || '—'}</td>
                  <td className={parseFloat(p.balance_uzs || 0) >= 0 ? 'text-success font-bold' : 'text-danger font-bold'} style={{ textAlign: 'right' }}>
                    {formatSumma(p.balance_uzs)} <small className="text-muted">so'm</small>
                  </td>
                  <td className={parseFloat(p.balance_usd || 0) >= 0 ? 'text-success font-bold' : 'text-danger font-bold'} style={{ textAlign: 'right' }}>
                    ${formatSumma(p.balance_usd)}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      <button className="btn btn-sm" style={{ background: '#2563eb', color: '#fff' }} onClick={() => tahrirBoshlash(p)} title={t('suppliers_page.table.edit')}>✏️</button>
                      {user?.role === 'admin' && (
                        <button className="btn btn-danger btn-sm" onClick={() => ochirish(p.id)} title={t('suppliers_page.table.delete')}>🗑</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editPudratchi && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setEditPudratchi(null)}>
          <div className="modal-content" style={{ maxWidth: 480, padding: '1.75rem' }}>
            <h3 style={{ marginBottom: '1.25rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>✏️ {t('suppliers_page.edit_modal.title')}</h3>
            <div className="form-grid">
              <div className="form-group form-group-full">
                <label className="form-label">{t('suppliers_page.form.name_label')}</label>
                <input className="form-input" required
                  value={editPudratchi.full_name}
                  onChange={e => setEditPudratchi({...editPudratchi, full_name: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">{t('suppliers_page.form.phone_label')}</label>
                <input className="form-input"
                  value={editPudratchi.phone || ''}
                  onChange={e => setEditPudratchi({...editPudratchi, phone: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">{t('suppliers_page.form.address_label')}</label>
                <input className="form-input"
                  value={editPudratchi.address || ''}
                  onChange={e => setEditPudratchi({...editPudratchi, address: e.target.value})} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-outline btn-sm" onClick={() => setEditPudratchi(null)}>{t('suppliers_page.edit_modal.cancel')}</button>
              <button className="btn btn-primary" onClick={tahrirSaqlash} disabled={editSaving}>
                {editSaving ? t('suppliers_page.form.saving') : t('suppliers_page.form.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
