import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { PageIcon, IcoPurchases } from './icons';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from './AuthContext';
import * as XLSX from 'xlsx';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
const BIRLIKLAR = ['dona', 'kg', 'g', 'litr', 'ml', 'metr', 'm²', 'm³', 'quti', 'juft', "to'plam"];

export default function Xarid() {
  const { authFetch } = useAuth();
  const { t } = useTranslation();

  const [pudratchilar, setPudratchilar] = useState([]);
  const [mahsulotlar, setMahsulotlar]   = useState([]);
  const [history, setHistory]           = useState([]);
  const [loading, setLoading]           = useState(true);

  const [sanaDan, setSanaDan]       = useState('');
  const [sanaGacha, setSanaGacha]   = useState('');
  const [qidiruvNomi, setQidiruvNomi]   = useState('');
  const [tanlanganFiltrId, setTanlanganFiltrId] = useState(null);
  const [suggestOpen, setSuggestOpen]   = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  /* ── Faktura state ── */
  const [valyuta, setValyuta]               = useState('UZS');
  const [kurs, setKurs]                     = useState('');
  const [kursLoading, setKursLoading]       = useState(false);
  const [tanlanganPudratchi, setTanlanganPudratchi] = useState('');
  const [savatcha, setSavatcha]             = useState([]);
  const [tanlanganMahsulotId, setTanlanganMahsulotId] = useState('');
  const [kiritilganNarx, setKiritilganNarx]     = useState('');
  const [kiritilganMiqdor, setKiritilganMiqdor] = useState('');
  const [kiritilganBirlik, setKiritilganBirlik] = useState('dona');
  const [customBirlik, setCustomBirlik]           = useState(false);
  const [birliklarRoyxat, setBirliklarRoyxat]     = useState(BIRLIKLAR);

  const [editingGroup, setEditingGroup]   = useState(null);
  const [editSana, setEditSana]           = useState('');
  const [editSaving, setEditSaving]       = useState(false);
  const [naqdTolov, setNaqdTolov]           = useState('');
  const [nasiyaTolov, setNasiyaTolov]       = useState('');
  const [paymentMethod, setPaymentMethod]   = useState('naqd');
  const [saqlanmoqda, setSaqlanmoqda]       = useState(false);

  const getBugun = () => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().split('T')[0];
  };
  const [sana, setSana] = useState(getBugun());
  const mahsulotRef = useRef(null);

  const yuklash = useCallback(async () => {
    setLoading(true);
    try {
      const [rS, rP, rH] = await Promise.all([
        authFetch(`${API_URL}/api/suppliers`),
        authFetch(`${API_URL}/api/products`),
        authFetch(`${API_URL}/api/transactions?transaction_type=xarid&limit=1000`),
      ]);
      setPudratchilar(await rS.json());
      setMahsulotlar(await rP.json());
      setHistory(await rH.json());
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }, [authFetch]);

  useEffect(() => { yuklash(); }, [yuklash]);

  /* ── CBU kurs ── */
  const fetchKurs = useCallback(async () => {
    setKursLoading(true);
    try {
      const res = await authFetch(`${API_URL}/api/exchange-rate`);
      if (res.ok) { const d = await res.json(); setKurs(d.rate.toString()); }
    } catch (err) { console.warn('Kurs xatosi:', err); }
    finally { setKursLoading(false); }
  }, [authFetch]);

  useEffect(() => {
    if (valyuta === 'USD' && isModalOpen) fetchKurs();
    if (valyuta === 'UZS') setKurs('');
  }, [valyuta, isModalOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredHistory = useMemo(() => history.filter(tx => {
    const d = tx.created_at.split('T')[0];
    const sanaMos = (!sanaDan || d >= sanaDan) && (!sanaGacha || d <= sanaGacha);
    const pudMos = !tanlanganFiltrId || tx.client_id === tanlanganFiltrId;
    return sanaMos && pudMos;
  }), [history, sanaDan, sanaGacha, tanlanganFiltrId]);

  // Bo'sh paytda — barcha pudratchilar (alifbo bo'yicha)
  // Yozilganda — bosh harflar bilan boshlanganlar birinchi, keyin contains
  const mosPudratchilar = useMemo(() => {
    const sortedAll = [...pudratchilar].sort((a, b) =>
      (a.full_name || '').localeCompare(b.full_name || '', undefined, { sensitivity: 'base' })
    );
    if (!qidiruvNomi.trim()) return sortedAll;
    const q = qidiruvNomi.trim().toLocaleLowerCase();
    const starts = [];
    const contains = [];
    for (const p of sortedAll) {
      const name = (p.full_name || '').toLocaleLowerCase();
      if (name.startsWith(q)) starts.push(p);
      else if (name.includes(q)) contains.push(p);
    }
    return [...starts, ...contains];
  }, [qidiruvNomi, pudratchilar]);

  const filtrniTanlash = (p) => {
    setTanlanganFiltrId(p.id);
    setQidiruvNomi(p.full_name);
    setSuggestOpen(false);
  };
  const filtrniTozalash = () => {
    setTanlanganFiltrId(null);
    setQidiruvNomi('');
    setSuggestOpen(false);
  };

  const excelYuklash = () => {
    const rows = filteredHistory.map(tx => ({
      'ID': tx.id, 'Sana': new Date(tx.created_at).toLocaleDateString('uz-UZ'),
      'Pudratchi': tx.client_name,
      'Mahsulot': tx.product_name || tx.description?.replace('Xarid: ', '') || '',
      'O\'lchov': tx.unit || 'dona', 'Miqdor': tx.quantity, 'Narxi': tx.price,
      'Summa': tx.amount_usd > 0 ? tx.amount_usd : tx.amount_uzs,
      'Valyuta': tx.amount_usd > 0 ? 'USD' : 'UZS',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Xaridlar');
    XLSX.writeFile(wb, `Xaridlar_${getBugun()}.xlsx`);
  };

  const ochirish = async (groupId) => {
    if (!window.confirm(t('purchases.alerts.confirm_delete'))) return;
    try {
      const res = await authFetch(`${API_URL}/api/purchases/${groupId}`, { method: 'DELETE' });
      if (res.ok) yuklash();
      else { const d = await res.json(); alert(d.error || t('purchases.alerts.error_default')); }
    } catch (err) { alert(err.message); }
  };

  const parseRaw = (v) => v ? v.toString().replace(/[^0-9.]/g, '') : '';
  const fmtNum = (v) => {
    const r = parseRaw(v); if (!r) return '';
    const [int, dec] = r.split('.');
    return int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (dec !== undefined ? '.' + dec : '');
  };

  const savatgaQoshish = () => {
    const narx = parseFloat(parseRaw(kiritilganNarx));
    const miqdor = parseFloat(kiritilganMiqdor);
    if (!tanlanganMahsulotId || isNaN(miqdor) || miqdor <= 0) return;
    const m = mahsulotlar.find(x => x.id.toString() === tanlanganMahsulotId);
    if (!m) return;
    setSavatcha(prev => [...prev, {
      id: Date.now().toString(), product_id: m.id, name: m.name,
      unit: kiritilganBirlik || m.unit || 'dona',
      price: narx, quantity: miqdor, total: narx * miqdor,
    }]);
    setTanlanganMahsulotId(''); setKiritilganMiqdor(''); setKiritilganNarx(''); setKiritilganBirlik('dona');
    mahsulotRef.current?.focus();
  };

  const jamiSumma = useMemo(() => savatcha.reduce((s, i) => s + i.total, 0), [savatcha]);
  useEffect(() => { setNaqdTolov(jamiSumma.toString()); setNasiyaTolov('0'); }, [jamiSumma]);

  const handleNaqdChange = (e) => {
    const naqd = parseFloat(parseRaw(e.target.value)) || 0;
    setNaqdTolov(e.target.value);
    setNasiyaTolov(Math.max(0, jamiSumma - naqd).toString());
  };

  const xaridSaqlash = async () => {
    if (!tanlanganPudratchi || savatcha.length === 0) {
      alert(!tanlanganPudratchi ? t('purchases.alerts.choose_supplier') : t('purchases.alerts.cart_empty')); return;
    }
    setSaqlanmoqda(true);
    try {
      const res = await authFetch(`${API_URL}/api/purchases`, {
        method: 'POST',
        body: JSON.stringify({
          supplier_id: tanlanganPudratchi, valyuta, kurs: parseFloat(kurs) || 1, sana,
          payment_method: paymentMethod,
          naqd: parseFloat(parseRaw(naqdTolov)) || 0,
          nasiya: parseFloat(parseRaw(nasiyaTolov)) || 0,
          savatcha: savatcha.map(i => ({
            product_id: i.product_id, name: i.name, unit: i.unit,
            quantity: i.quantity, price: i.price, total: i.total,
          })),
        }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || t('purchases.alerts.save_error')); }
      setSavatcha([]); setIsModalOpen(false); yuklash();
    } catch (err) { alert(err.message); } finally { setSaqlanmoqda(false); }
  };

  const tahrirBoshlash = (tx) => {
    const d = new Date(tx.created_at);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    setEditSana(d.toISOString().split('T')[0]);
    setEditingGroup(tx.group_id);
  };

  const tahrirSaqlash = async () => {
    if (!editSana || !editingGroup) return;
    setEditSaving(true);
    try {
      const res = await authFetch(`${API_URL}/api/purchases/${editingGroup}`, {
        method: 'PATCH',
        body: JSON.stringify({ sana: editSana }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      setEditingGroup(null);
      yuklash();
    } catch (err) { alert(err.message); }
    finally { setEditSaving(false); }
  };

  const openModal = () => {
    setTanlanganPudratchi(''); setSavatcha([]); setValyuta('UZS'); setKurs('');
    setCustomBirlik(false); setKiritilganBirlik('dona'); setPaymentMethod('naqd');
    setSana(getBugun()); setIsModalOpen(true);
  };

  const handleBirlikChange = (val) => {
    if (val === '__custom__') { setCustomBirlik(true); setKiritilganBirlik(''); }
    else { setCustomBirlik(false); setKiritilganBirlik(val); }
  };

  const handleCustomBirlikConfirm = (val) => {
    const trimmed = val.trim();
    if (!trimmed) return;
    if (!birliklarRoyxat.includes(trimmed)) setBirliklarRoyxat(prev => [...prev, trimmed]);
    setKiritilganBirlik(trimmed);
    setCustomBirlik(false);
  };

  return (
    <div className="page-section fade-in">

      {/* ── Sarlavha + filtr ── */}
      <div className="section-header">
        <div className="section-title-row">
          <PageIcon icon={<IcoPurchases />} color="#ef4444" />
          <h2 className="section-title">{t('purchases.title')}</h2>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Pudratchi nomi bo'yicha qidiruv (🔍 ikonkali) */}
          <div style={{ position: 'relative', minWidth: 240 }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', fontSize: '1rem' }}>🔍</span>
            <input
              type="text"
              className="form-input"
              placeholder={t('filter.supplier_name')}
              value={qidiruvNomi}
              onChange={e => { setQidiruvNomi(e.target.value); setSuggestOpen(true); setTanlanganFiltrId(null); }}
              onFocus={() => setSuggestOpen(true)}
              onBlur={() => setTimeout(() => setSuggestOpen(false), 200)}
              style={{ paddingLeft: 32, paddingRight: qidiruvNomi ? 32 : 10, width: '100%' }}
            />
            {qidiruvNomi && (
              <button type="button" onClick={filtrniTozalash}
                style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1rem', color: '#94a3b8' }}
                title={t('filter.clear')}>✕</button>
            )}
            {suggestOpen && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
                background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8,
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)', maxHeight: 320, overflowY: 'auto', zIndex: 100
              }}>
                {mosPudratchilar.length === 0 ? (
                  <div style={{ padding: '10px 12px', color: '#94a3b8' }}>{t('purchases.supplier_not_found')}</div>
                ) : (
                  <>
                    {!qidiruvNomi.trim() && (
                      <div style={{ padding: '6px 12px', fontSize: '0.75rem', color: '#94a3b8', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontWeight: 600 }}>
                        Pudratchilar ({mosPudratchilar.length})
                      </div>
                    )}
                    {mosPudratchilar.map(p => (
                      <div key={p.id}
                        onMouseDown={() => filtrniTanlash(p)}
                        style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
                        onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                        <div style={{ fontWeight: 600, color: '#1e293b' }}>{p.full_name}</div>
                        {p.phone && <div style={{ fontSize: '0.8rem', color: '#64748b' }}>📞 {p.phone}</div>}
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          <input type="date" className="form-input" style={{ width: 140 }} value={sanaDan} onChange={e => setSanaDan(e.target.value)} title={t('filter.date_from')} />
          <span className="text-muted">—</span>
          <input type="date" className="form-input" style={{ width: 140 }} value={sanaGacha} onChange={e => setSanaGacha(e.target.value)} title={t('filter.date_to')} />
          <button className="btn btn-outline btn-sm" onClick={excelYuklash}>📥 {t('purchases.excel_button')}</button>
          <button className="btn btn-primary" onClick={openModal}>＋ {t('purchases.new_button')}</button>
        </div>
      </div>

      {/* ── Tarix jadvali ── */}
      {loading
        ? <div className="loading-container"><div className="spinner" /><span className="loading-text">{t('purchases.loading')}</span></div>
        : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th><th>{t('purchases.table.date')}</th><th>{t('purchases.table.supplier')}</th><th>{t('purchases.table.product')}</th>
                  <th>{t('purchases.table.unit')}</th><th>{t('purchases.table.quantity')}</th><th>{t('purchases.table.price')}</th><th>{t('purchases.table.amount')}</th>
                  <th>{t('purchases.table.currency')}</th><th></th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.length === 0
                  ? <tr><td colSpan={10} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>{t('purchases.not_found')}</td></tr>
                  : filteredHistory.map(tx => (
                    <tr key={tx.id}>
                      <td><span className="row-id">{tx.id}</span></td>
                      <td>{new Date(tx.created_at).toLocaleDateString('uz-UZ')}</td>
                      <td className="font-bold">{tx.client_name}</td>
                      <td>{tx.product_name || tx.description?.replace('Xarid: ', '')}</td>
                      <td><span className="badge" style={{ background: '#e0f2fe', color: '#0369a1' }}>{tx.unit || 'dona'}</span></td>
                      <td>{tx.quantity}</td>
                      <td>{parseFloat(tx.price || 0).toLocaleString()}</td>
                      <td className="text-info font-bold">
                        {parseFloat(tx.amount_usd > 0 ? tx.amount_usd : tx.amount_uzs).toLocaleString()}
                      </td>
                      <td><span className="badge" style={{ background: tx.amount_usd > 0 ? '#fef9c3' : '#dbeafe', color: tx.amount_usd > 0 ? '#854d0e' : '#1d4ed8' }}>{tx.amount_usd > 0 ? 'USD' : 'UZS'}</span></td>
                      <td style={{ display: 'flex', gap: '0.25rem' }}>
                        <button className="btn btn-sm" style={{ background: '#2563eb', color: '#fff' }} onClick={() => tahrirBoshlash(tx)} title={t('purchases.tooltip.edit')}>✏️</button>
                        <button className="btn btn-danger btn-sm" onClick={() => ochirish(tx.group_id)} title={t('purchases.tooltip.delete')}>🗑</button>
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        )
      }

      {/* ══ TAHRIRLASH MINI-MODALI ══ */}
      {editingGroup && createPortal(
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setEditingGroup(null)}>
          <div className="modal-content" style={{ maxWidth: 380, padding: '1.5rem' }}>
            <h3 style={{ marginBottom: '1rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>✏️ {t('purchases.edit.title')}</h3>
            <div className="form-group">
              <label className="form-label">{t('purchases.edit.date_label')}</label>
              <input type="date" className="form-input" value={editSana} onChange={e => setEditSana(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-outline btn-sm" onClick={() => setEditingGroup(null)}>{t('purchases.edit.cancel')}</button>
              <button className="btn btn-primary" onClick={tahrirSaqlash} disabled={editSaving}>
                {editSaving ? '⏳ ' + t('purchases.edit.saving') : '✓ ' + t('purchases.edit.save')}
              </button>
            </div>
          </div>
        </div>
      , document.body)}

      {/* ════════════════ ERP FAKTURA MODALI (XARID) ════════════════ */}
      {isModalOpen && createPortal(
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setIsModalOpen(false)}>
          <div className="invoice-modal">

            <div className="invoice-header" style={{ background: '#1d4ed8' }}>
              <span className="inv-title">📥 {t('purchases.modal.title')}</span>
              <button className="modal-close" style={{ position: 'relative', top: 'unset', right: 'unset', marginLeft: 'auto' }} onClick={() => setIsModalOpen(false)}>✕</button>
            </div>

            {/* Sana + Pudratchi */}
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', padding: '0.5rem 1rem', background: '#1d4ed8', borderBottom: '1px solid rgba(255,255,255,0.08)', flexWrap: 'wrap' }}>
              <div className="inv-field-row">
                <label>📅 {t('purchases.modal.date_label')}</label>
                <input type="date" className="inv-input" value={sana} onChange={e => setSana(e.target.value)} />
              </div>
              <div className="inv-field-row" style={{ flex: 1 }}>
                <label>🏗️ {t('purchases.modal.supplier_label')}:</label>
                <select className="inv-input" style={{ flex: 1, minWidth: 160, background: !tanlanganPudratchi ? 'rgba(220,38,38,0.2)' : 'rgba(255,255,255,0.12)', color: '#fff' }} value={tanlanganPudratchi} onChange={e => setTanlanganPudratchi(e.target.value)}>
                  <option value="" style={{ background: '#1d4ed8', color: '#fff' }}>{t('purchases.modal.choose_supplier')}</option>
                  {pudratchilar.map(k => <option key={k.id} value={k.id} style={{ background: '#1d4ed8', color: '#fff' }}>{k.full_name}</option>)}
                </select>
                {!tanlanganPudratchi && <span style={{ fontSize: '0.72rem', color: '#fca5a5', whiteSpace: 'nowrap' }}>⚠ {t('purchases.modal.required')}</span>}
              </div>
            </div>

            <div className="inv-currency-row">
              <div className="currency-toggle">
                <button className={`currency-btn${valyuta === 'UZS' ? ' currency-btn-active' : ''}`} onClick={() => setValyuta('UZS')}>🇺🇿 UZS</button>
                <button className={`currency-btn${valyuta === 'USD' ? ' currency-btn-active' : ''}`} onClick={() => setValyuta('USD')}>🇺🇸 USD</button>
              </div>
              {valyuta === 'USD' && (
                <div className="inv-field-row" style={{ marginLeft: '1rem', gap: '0.5rem' }}>
                  <label style={{ whiteSpace: 'nowrap', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>{t('purchases.modal.rate_label')}</label>
                  <input className="inv-input" type="number" placeholder="12800" style={{ width: 110 }} value={kurs} onChange={e => setKurs(e.target.value)} />
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('purchases.modal.rate_unit')}</span>
                  <button className="btn btn-outline btn-sm" onClick={fetchKurs} disabled={kursLoading} style={{ fontSize: '0.72rem', padding: '0.2rem 0.6rem' }}>
                    {kursLoading ? '...' : t('purchases.modal.fetch_rate')}
                  </button>
                </div>
              )}
            </div>

            <div className="inv-add-row">
              <select ref={mahsulotRef} className="inv-input inv-select-wide" value={tanlanganMahsulotId}
                onChange={e => {
                  setTanlanganMahsulotId(e.target.value);
                  const m = mahsulotlar.find(x => x.id.toString() === e.target.value);
                  if (m) { setKiritilganNarx(valyuta === 'USD' ? String(m.price_usd) : String(m.price_uzs)); setKiritilganBirlik(m.unit || 'dona'); }
                }}
              >
                <option value="">{t('purchases.modal.product_placeholder')}</option>
                {mahsulotlar.map(m => (
                  <option key={m.id} value={m.id}>{m.name} [{m.unit || 'dona'}] — {valyuta === 'USD' ? `$${m.price_usd}` : `${parseFloat(m.price_uzs).toLocaleString()} so'm`}</option>
                ))}
              </select>
              {customBirlik
                ? <input
                    className="inv-input" autoFocus placeholder={t('purchases.modal.unit_placeholder')} style={{ width: 90 }}
                    defaultValue={kiritilganBirlik}
                    onBlur={e => handleCustomBirlikConfirm(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleCustomBirlikConfirm(e.target.value); if (e.key === 'Escape') { setCustomBirlik(false); setKiritilganBirlik('dona'); } }}
                  />
                : <select className="inv-input" style={{ width: 95 }} value={kiritilganBirlik} onChange={e => handleBirlikChange(e.target.value)}>
                    {birliklarRoyxat.map(b => <option key={b} value={b}>{b}</option>)}
                    <option value="__custom__">➕ {t('purchases.modal.new_unit')}</option>
                  </select>
              }
              <input className="inv-input" type="text" placeholder={t('purchases.modal.price_placeholder')} style={{ width: 120 }} value={fmtNum(kiritilganNarx)} onChange={e => setKiritilganNarx(parseRaw(e.target.value))} />
              <input className="inv-input" type="number" placeholder={t('purchases.modal.qty_placeholder')} style={{ width: 80 }} value={kiritilganMiqdor} onChange={e => setKiritilganMiqdor(e.target.value)} onKeyDown={e => e.key === 'Enter' && savatgaQoshish()} />
              <button className="btn btn-primary btn-sm" onClick={savatgaQoshish}>＋ {t('purchases.modal.add_button')}</button>
            </div>

            <div className="inv-table-wrap">
              <table className="inv-table">
                <thead>
                  <tr>
                    <th style={{ width: 32 }}>#</th>
                    <th>{t('purchases.modal.th_product_name')}</th>
                    <th style={{ width: 72 }}>{t('purchases.table.unit')}</th>
                    <th style={{ width: 72, textAlign: 'right' }}>{t('purchases.modal.th_qty_short')}</th>
                    <th style={{ width: 110, textAlign: 'right' }}>{t('purchases.table.price')}</th>
                    <th style={{ width: 120, textAlign: 'right' }}>{t('purchases.table.amount')}</th>
                    <th style={{ width: 32 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {savatcha.length === 0
                    ? <tr><td colSpan={7} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>{t('purchases.modal.empty_cart')}</td></tr>
                    : savatcha.map((item, idx) => (
                      <tr key={item.id}>
                        <td style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{idx + 1}</td>
                        <td className="font-bold" style={{ fontSize: '0.8rem' }}>{item.name}</td>
                        <td><span className="badge" style={{ background: '#dbeafe', color: '#1d4ed8' }}>{item.unit}</span></td>
                        <td style={{ textAlign: 'right' }}>{item.quantity}</td>
                        <td style={{ textAlign: 'right' }}>{fmtNum(item.price.toString())}</td>
                        <td className="text-info font-bold" style={{ textAlign: 'right' }}>{fmtNum(item.total.toString())}</td>
                        <td>
                          <button style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: '0.875rem', padding: 0 }}
                            onClick={() => setSavatcha(savatcha.filter(x => x.id !== item.id))}>×</button>
                        </td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </div>

            <div className="inv-footer">
              <div className="inv-total-block">
                <span className="inv-total-label">{t('purchases.modal.total')}</span>
                <span className="inv-total-value text-info">{fmtNum(jamiSumma.toString())} <span style={{ fontSize: '0.9rem' }}>{valyuta}</span></span>
                {valyuta === 'USD' && kurs && (
                  <span className="inv-total-uzs text-muted">≈ {fmtNum(String(jamiSumma * parseFloat(kurs)))} so'm</span>
                )}
              </div>
              <div className="inv-payments">
                <div className="inv-payment-field">
                  <label className="inv-payment-label">To'lov turi</label>
                  <select className="inv-input" style={{ width: 120 }} value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                    <option value="naqd">Naqd</option>
                    <option value="karta">Karta</option>
                    <option value="kochirma">Ko'chirma</option>
                  </select>
                </div>
                <div className="inv-payment-field">
                  <label className="inv-payment-label">{t('purchases.modal.cash')}</label>
                  <input className="inv-input" type="text" style={{ width: 120 }} value={fmtNum(naqdTolov)} onChange={handleNaqdChange} />
                </div>
                <div className="inv-payment-field">
                  <label className="inv-payment-label">{t('purchases.modal.debt')}</label>
                  <input className="inv-input" type="text" style={{ width: 120, background: 'var(--bg-secondary)' }} value={fmtNum(nasiyaTolov)} readOnly />
                </div>
                <button className="btn btn-primary" onClick={xaridSaqlash}
                  disabled={saqlanmoqda || savatcha.length === 0 || !tanlanganPudratchi}>
                  {saqlanmoqda ? '⏳ ' + t('purchases.modal.saving') : '✓ ' + t('purchases.modal.save_close')}
                </button>
              </div>
            </div>

          </div>
        </div>
      , document.body)}
    </div>
  );
}
