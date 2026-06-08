import React, { useState, useEffect, useCallback } from 'react';
import { PageIcon, IcoBalance, IcoClients, IcoSuppliers, IcoProducts, IcoList } from './icons';
import { useAuth } from './AuthContext';
import { useTranslation } from 'react-i18next';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const getBugun = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().split('T')[0];
};

const formatSumma = (s) => {
  const n = parseFloat(s || 0);
  if (!isFinite(n)) return '0';
  // 3 xonali probel bilan ajratish: 150 000 000
  return Math.abs(n).toFixed(Math.abs(n) % 1 === 0 ? 0 : 2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
};

export default function BoshlangichQoldiq() {
  const { authFetch, user } = useAuth();
  const { t } = useTranslation();
  const [tab, setTab] = useState('customer'); // 'customer' | 'supplier' | 'product'

  const [clients, setClients]     = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts]   = useState([]);
  const [openings, setOpenings]   = useState({ partners: [], products: [] });

  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  // Form state
  const [partnerId, setPartnerId] = useState('');
  const [tomon, setTomon] = useState('DT'); // 'DT' = hamkor qarzdor (biz haqdormiz), 'KT' = biz qarzdormiz
  const [bUZS, setBUZS]   = useState('');
  const [bUSD, setBUSD]   = useState('');
  const [izoh, setIzoh]   = useState('');
  const [sana, setSana]   = useState(getBugun());
  const [saving, setSaving] = useState(false);

  const [productId, setProductId] = useState('');
  const [qty, setQty]             = useState('');

  const isAdmin = user?.role === 'admin';

  const yuklash = useCallback(async () => {
    setLoading(true);
    try {
      const [rC, rS, rP, rO] = await Promise.all([
        authFetch(`${API_URL}/api/clients`),
        authFetch(`${API_URL}/api/suppliers`),
        authFetch(`${API_URL}/api/products`),
        authFetch(`${API_URL}/api/opening-balances`),
      ]);
      if (rC.ok) setClients(await rC.json());
      if (rS.ok) setSuppliers(await rS.json());
      if (rP.ok) setProducts(await rP.json());
      if (rO.ok) setOpenings(await rO.json());
      setError(null);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [authFetch]);

  useEffect(() => { yuklash(); }, [yuklash]);

  const formaniTozalash = () => {
    setPartnerId(''); setTomon('DT'); setBUZS(''); setBUSD(''); setIzoh(''); setSana(getBugun());
    setProductId(''); setQty('');
  };

  const partnerSaqlash = async (e) => {
    e.preventDefault();
    if (!partnerId) return alert(t('opening_balance_page.select_partner'));
    const uzsRaw = Math.abs(parseFloat(bUZS) || 0);
    const usdRaw = Math.abs(parseFloat(bUSD) || 0);
    if (uzsRaw === 0 && usdRaw === 0) return alert(t('opening_balance_page.invalid_amount'));

    // DT = hamkor qarzdor → musbat; KT = biz qarzdormiz → manfiy (ichki ishorali saqlash)
    const sign = tomon === 'DT' ? 1 : -1;
    const uzsNum = uzsRaw * sign;
    const usdNum = usdRaw * sign;

    setSaving(true);
    try {
      const res = await authFetch(`${API_URL}/api/opening-balance/partner`, {
        method: 'POST',
        body: JSON.stringify({
          partner_id: parseInt(partnerId),
          balance_uzs: uzsNum,
          balance_usd: usdNum,
          sana, izoh: izoh || null,
        })
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      formaniTozalash();
      yuklash();
      alert(t('opening_balance_page.saved_partner'));
    } catch (err) { alert(t('opening_balance_page.error_prefix') + err.message); }
    finally { setSaving(false); }
  };

  const productSaqlash = async (e) => {
    e.preventDefault();
    if (!productId) return alert(t('opening_balance_page.select_product'));
    const qtyNum = parseFloat(qty);
    if (!qtyNum || qtyNum <= 0) return alert(t('opening_balance_page.invalid_qty'));

    setSaving(true);
    try {
      const res = await authFetch(`${API_URL}/api/opening-balance/product`, {
        method: 'POST',
        body: JSON.stringify({
          product_id: parseInt(productId),
          quantity: qtyNum,
          izoh: izoh || null,
        })
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      formaniTozalash();
      yuklash();
      alert(t('opening_balance_page.saved_product'));
    } catch (err) { alert(t('opening_balance_page.error_prefix') + err.message); }
    finally { setSaving(false); }
  };

  const ochirish = async (id) => {
    if (!window.confirm(t('opening_balance_page.confirm_delete'))) return;
    try {
      const res = await authFetch(`${API_URL}/api/opening-balance/${id}`, { method: 'DELETE' });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      yuklash();
    } catch (err) { alert(t('opening_balance_page.error_prefix') + err.message); }
  };

  const formatSana = (d) => new Date(d).toLocaleDateString('uz-UZ');

  const tabBtnStyle = (active) => ({
    padding: '7px 16px', border: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
    display: 'flex', alignItems: 'center', gap: '0.375rem',
    background: active ? '#3b82f6' : 'transparent',
    color: active ? '#fff' : '#64748b',
    borderRadius: '6px 6px 0 0', marginRight: 2,
    borderBottom: active ? '2px solid #3b82f6' : '2px solid transparent',
  });

  const partnersList = tab === 'customer'
    ? openings.partners.filter(p => p.client_type === 'customer')
    : tab === 'supplier'
    ? openings.partners.filter(p => p.client_type === 'supplier')
    : [];

  return (
    <div className="page-section fade-in">
      <div className="section-header">
        <div className="section-title-row">
          <PageIcon icon={<IcoBalance />} color="#10b981" />
          <h2 className="section-title">{t('opening_balance_page.title')}</h2>
        </div>
      </div>
      <p className="text-muted" style={{ marginBottom: '1rem' }}>
        {t('opening_balance_page.subtitle')}
      </p>

      {!isAdmin && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '1rem', marginBottom: '1rem', color: '#991b1b' }}>
          ⚠️ {t('opening_balance_page.admin_only')}
        </div>
      )}

      {/* TAB BUTTONS */}
      <div style={{ display: 'flex', borderBottom: '2px solid var(--border-color)', marginBottom: '1rem' }}>
        <button style={tabBtnStyle(tab === 'customer')} onClick={() => { setTab('customer'); formaniTozalash(); }}>
          <IcoClients /> {t('opening_balance_page.tab_clients')}
        </button>
        <button style={tabBtnStyle(tab === 'supplier')} onClick={() => { setTab('supplier'); formaniTozalash(); }}>
          <IcoSuppliers /> {t('opening_balance_page.tab_suppliers')}
        </button>
        <button style={tabBtnStyle(tab === 'product')} onClick={() => { setTab('product'); formaniTozalash(); }}>
          <IcoProducts /> {t('opening_balance_page.tab_products')}
        </button>
      </div>

      {loading && <div className="loading-container"><div className="spinner"></div><span className="loading-text">{t('opening_balance_page.loading')}</span></div>}
      {error && <div className="error-message"><span>⚠️</span><span>{error}</span></div>}

      {!loading && (tab === 'customer' || tab === 'supplier') && (
        <>
          {isAdmin && (
            <form className="add-form" onSubmit={partnerSaqlash}>
              <h4 style={{ marginBottom: '0.625rem', fontSize: '0.9rem', color: '#1e293b' }}>
                {tab === 'customer' ? t('opening_balance_page.partner_form.title_client') : t('opening_balance_page.partner_form.title_supplier')}
              </h4>

              <div style={{ background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.9rem', color: '#1e40af' }}>
                {t('opening_balance_page.partner_form.rule_title')}<br/>
                • <strong style={{ color: '#15803d' }}>DEBET (DT)</strong> — {tab === 'customer' ? t('opening_balance_page.partner_form.dt_desc_client') : t('opening_balance_page.partner_form.dt_desc_supplier')}<br/>
                • <strong style={{ color: '#b91c1c' }}>KREDIT (KT)</strong> — {tab === 'customer' ? t('opening_balance_page.partner_form.kt_desc_client') : t('opening_balance_page.partner_form.kt_desc_supplier')}
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">{tab === 'customer' ? t('opening_balance_page.partner_form.partner_label_client') : t('opening_balance_page.partner_form.partner_label_supplier')} *</label>
                  <select className="form-input" value={partnerId} onChange={e => setPartnerId(e.target.value)} required>
                    <option value="">{t('opening_balance_page.partner_form.choose')}</option>
                    {(tab === 'customer' ? clients : suppliers).map(p =>
                      <option key={p.id} value={p.id}>{p.full_name}</option>
                    )}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">{t('opening_balance_page.partner_form.date_label')}</label>
                  <input type="date" className="form-input" value={sana} onChange={e => setSana(e.target.value)} />
                </div>
                <div className="form-group form-group-full">
                  <label className="form-label">{t('opening_balance_page.partner_form.side_label')}</label>
                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <button type="button" onClick={() => setTomon('DT')} style={{
                        flex: '1 1 180px', padding: '8px 12px', borderRadius: 6, cursor: 'pointer',
                        border: tomon === 'DT' ? '2px solid #15803d' : '1.5px solid #e5e7eb',
                        background: tomon === 'DT' ? '#f0fdf4' : '#fff',
                        color: tomon === 'DT' ? '#15803d' : '#64748b',
                        fontWeight: 700, fontSize: '0.85rem', textAlign: 'left'
                      }}>
                      ● DEBET (DT)
                      <div style={{ fontSize: '0.75rem', fontWeight: 400, marginTop: 2, opacity: 0.85 }}>
                        {tab === 'customer' ? t('opening_balance_page.partner_form.dt_btn_client') : t('opening_balance_page.partner_form.dt_btn_supplier')}
                      </div>
                    </button>
                    <button type="button" onClick={() => setTomon('KT')} style={{
                        flex: '1 1 180px', padding: '8px 12px', borderRadius: 6, cursor: 'pointer',
                        border: tomon === 'KT' ? '2px solid #b91c1c' : '1.5px solid #e5e7eb',
                        background: tomon === 'KT' ? '#fef2f2' : '#fff',
                        color: tomon === 'KT' ? '#b91c1c' : '#64748b',
                        fontWeight: 700, fontSize: '0.85rem', textAlign: 'left'
                      }}>
                      ● KREDIT (KT)
                      <div style={{ fontSize: '0.75rem', fontWeight: 400, marginTop: 2, opacity: 0.85 }}>
                        {tab === 'customer' ? t('opening_balance_page.partner_form.kt_btn_client') : t('opening_balance_page.partner_form.kt_btn_supplier')}
                      </div>
                    </button>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">{t('opening_balance_page.partner_form.uzs_label')}</label>
                  <input type="number" min="0" className="form-input" placeholder="150 000 000"
                    value={bUZS} onChange={e => setBUZS(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('opening_balance_page.partner_form.usd_label')}</label>
                  <input type="number" min="0" className="form-input" placeholder="0"
                    value={bUSD} onChange={e => setBUSD(e.target.value)} />
                </div>
                <div className="form-group form-group-full">
                  <label className="form-label">{t('opening_balance_page.partner_form.comment_label')}</label>
                  <input className="form-input" placeholder={t('opening_balance_page.partner_form.comment_placeholder')}
                    value={izoh} onChange={e => setIzoh(e.target.value)} />
                </div>
              </div>
              <button className="btn btn-success btn-large" type="submit" disabled={saving}>
                {saving ? t('opening_balance_page.partner_form.saving') : t('opening_balance_page.partner_form.save')}
              </button>
            </form>
          )}

          <h4 style={{ marginBottom: '0.75rem', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <IcoList /> {tab === 'customer' ? t('opening_balance_page.table_partners.title_client') : t('opening_balance_page.table_partners.title_supplier')}
          </h4>
          {partnersList.length === 0 ? (
            <div className="empty-state"><div className="empty-state-icon">📭</div>
              <div className="empty-state-text">{t('opening_balance_page.empty')}</div></div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th rowSpan="2">{t('opening_balance_page.table_partners.date')}</th>
                    <th rowSpan="2">{tab === 'customer' ? t('opening_balance_page.table_partners.partner_client') : t('opening_balance_page.table_partners.partner_supplier')}</th>
                    <th colSpan="2" style={{ textAlign: 'center', background: '#f0fdf4', color: '#15803d' }}>DEBET (DT)</th>
                    <th colSpan="2" style={{ textAlign: 'center', background: '#fef2f2', color: '#b91c1c' }}>KREDIT (KT)</th>
                    <th rowSpan="2">{t('opening_balance_page.table_partners.comment')}</th>
                    {isAdmin && <th rowSpan="2"></th>}
                  </tr>
                  <tr>
                    <th style={{ textAlign: 'right', background: '#f0fdf4', color: '#15803d' }}>UZS</th>
                    <th style={{ textAlign: 'right', background: '#f0fdf4', color: '#15803d' }}>USD</th>
                    <th style={{ textAlign: 'right', background: '#fef2f2', color: '#b91c1c' }}>UZS</th>
                    <th style={{ textAlign: 'right', background: '#fef2f2', color: '#b91c1c' }}>USD</th>
                  </tr>
                </thead>
                <tbody>
                  {partnersList.map(o => {
                    const uzs = parseFloat(o.amount_uzs || 0);
                    const usd = parseFloat(o.amount_usd || 0);
                    const dtUZS = uzs > 0 ? uzs : 0;
                    const ktUZS = uzs < 0 ? -uzs : 0;
                    const dtUSD = usd > 0 ? usd : 0;
                    const ktUSD = usd < 0 ? -usd : 0;
                    return (
                      <tr key={o.id}>
                        <td>{formatSana(o.created_at)}</td>
                        <td className="font-bold">{o.full_name}</td>
                        <td style={{ textAlign: 'right', color: '#15803d', fontWeight: 'bold', background: dtUZS ? '#f0fdf4' : 'transparent' }}>
                          {dtUZS ? `${formatSumma(dtUZS)} so'm` : '—'}
                        </td>
                        <td style={{ textAlign: 'right', color: '#15803d', fontWeight: 'bold', background: dtUSD ? '#f0fdf4' : 'transparent' }}>
                          {dtUSD ? `$${formatSumma(dtUSD)}` : '—'}
                        </td>
                        <td style={{ textAlign: 'right', color: '#b91c1c', fontWeight: 'bold', background: ktUZS ? '#fef2f2' : 'transparent' }}>
                          {ktUZS ? `${formatSumma(ktUZS)} so'm` : '—'}
                        </td>
                        <td style={{ textAlign: 'right', color: '#b91c1c', fontWeight: 'bold', background: ktUSD ? '#fef2f2' : 'transparent' }}>
                          {ktUSD ? `$${formatSumma(ktUSD)}` : '—'}
                        </td>
                        <td className="text-muted">{o.description || '—'}</td>
                        {isAdmin && (
                          <td>
                            <button className="btn btn-sm" style={{ background: '#dc2626', color: '#fff' }} onClick={() => ochirish(o.id)}>🗑️</button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {!loading && tab === 'product' && (
        <>
          {isAdmin && (
            <form className="add-form" onSubmit={productSaqlash} style={{ marginBottom: '1.5rem' }}>
              <h4 style={{ marginBottom: '1rem', color: '#1e293b' }}>{t('opening_balance_page.product_form.title')}</h4>

              <div style={{ background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.9rem', color: '#1e40af' }}>
                💡 {t('opening_balance_page.product_form.hint')}
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">{t('opening_balance_page.product_form.product_label')}</label>
                  <select className="form-input" value={productId} onChange={e => setProductId(e.target.value)} required>
                    <option value="">{t('opening_balance_page.product_form.choose')}</option>
                    {products.map(p =>
                      <option key={p.id} value={p.id}>{p.name} (joriy: {p.quantity})</option>
                    )}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">{t('opening_balance_page.product_form.qty_label')}</label>
                  <input type="number" className="form-input" placeholder="50000"
                    value={qty} onChange={e => setQty(e.target.value)} required min="0" step="any" />
                </div>
                <div className="form-group form-group-full">
                  <label className="form-label">{t('opening_balance_page.product_form.comment_label')}</label>
                  <input className="form-input" placeholder={t('opening_balance_page.product_form.comment_placeholder')}
                    value={izoh} onChange={e => setIzoh(e.target.value)} />
                </div>
              </div>
              <button className="btn btn-success btn-large" type="submit" disabled={saving}>
                {saving ? t('opening_balance_page.product_form.saving') : t('opening_balance_page.product_form.save')}
              </button>
            </form>
          )}

          <h4 style={{ marginBottom: '0.75rem', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '0.4rem' }}><IcoList /> {t('opening_balance_page.table_products.title')}</h4>
          {openings.products.length === 0 ? (
            <div className="empty-state"><div className="empty-state-icon">📭</div>
              <div className="empty-state-text">{t('opening_balance_page.empty')}</div></div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('opening_balance_page.table_products.date')}</th>
                    <th>{t('opening_balance_page.table_products.product')}</th>
                    <th style={{ textAlign: 'right' }}>{t('opening_balance_page.table_products.qty')}</th>
                    <th>{t('opening_balance_page.table_products.comment')}</th>
                    {isAdmin && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {openings.products.map(o => (
                    <tr key={o.id}>
                      <td>{formatSana(o.created_at)}</td>
                      <td className="font-bold">{o.product_name}</td>
                      <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#1e40af' }}>
                        {formatSumma(o.quantity)} dona
                      </td>
                      <td className="text-muted">{o.description || '—'}</td>
                      {isAdmin && (
                        <td>
                          <button className="btn btn-sm" style={{ background: '#dc2626', color: '#fff' }} onClick={() => ochirish(o.id)}>🗑️</button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
