import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import { useTranslation } from 'react-i18next';
import { PageIcon, IcoKassa } from './icons';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

export default function Kassa() {
  const { authFetch, user } = useAuth();
  const { t } = useTranslation();
  const [yozuvlar, setYozuvlar] = useState([]);
  const [clients, setClients] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Smena state
  const [activeSmenalar, setActiveSmenalar] = useState([]);
  const [arxivSmenalar, setArxivSmenalar] = useState([]);
  const [tab, setTab] = useState('joriy'); // 'joriy' | 'arxiv'
  const [smenaLoading, setSmenaLoading] = useState(false);

  // Smena ochish modal
  const [openModal, setOpenModal] = useState(null); // null | 'UZS' | 'USD'
  const [openBalance, setOpenBalance] = useState('');

  // Smena yopish modal
  const [closeModal, setCloseModal] = useState(null); // null | smena object
  const [realNaqd, setRealNaqd] = useState('');
  const [closeNotes, setCloseNotes] = useState('');
  const [closeSaving, setCloseSaving] = useState(false);

  const getBugun = () => {
    const bugun = new Date();
    bugun.setMinutes(bugun.getMinutes() - bugun.getTimezoneOffset());
    return bugun.toISOString().split('T')[0];
  };

  const [formOchiq, setFormOchiq] = useState(false);
  const [sana, setSana] = useState(getBugun());
  const [turi, setTuri] = useState('kirim');
  const [tanlanganHamkor, setTanlanganHamkor] = useState('');
  const [hamkorTuri, setHamkorTuri] = useState('boshqa');
  const [qidiruvHamkor, setQidiruvHamkor] = useState('');
  const [dropdownOchiq, setDropdownOchiq] = useState(false);
  const [summaStr, setSummaStr] = useState('');
  const [valuta, setValuta] = useState('UZS');
  const [kurs, setKurs] = useState('');
  const [izoh, setIzoh] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('naqd');
  const [saqlash, setSaqlash] = useState(false);
  const [qidiruv, setQidiruv] = useState('');

  const turiRef = useRef(null);
  const hamkorRef = useRef(null);
  const valutaRef = useRef(null);
  const summaRef = useRef(null);
  const kursRef = useRef(null);
  const izohRef = useRef(null);
  const btnRef = useRef(null);

  const yuklash = useCallback(async () => {
    setLoading(true);
    try {
      const [resKassa, resClients, resSuppliers, resSmena] = await Promise.all([
        authFetch(`${API_URL}/api/kassa`),
        authFetch(`${API_URL}/api/clients`),
        authFetch(`${API_URL}/api/suppliers`),
        authFetch(`${API_URL}/api/kassa-smena/active`)
      ]);
      if (!resKassa.ok) throw new Error(`Kassa yuklash xatosi: ${await resKassa.text()}`);
      setYozuvlar(await resKassa.json());
      if (resClients.ok) setClients(await resClients.json());
      if (resSuppliers.ok) setSuppliers(await resSuppliers.json());
      if (resSmena.ok) setActiveSmenalar(await resSmena.json());
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  const yuklashArxiv = useCallback(async () => {
    setSmenaLoading(true);
    try {
      const res = await authFetch(`${API_URL}/api/kassa-smena`);
      if (res.ok) setArxivSmenalar(await res.json());
    } catch (e) { /* silent */ }
    finally { setSmenaLoading(false); }
  }, [authFetch]);

  useEffect(() => { yuklash(); }, [yuklash]);
  useEffect(() => { if (tab === 'arxiv') yuklashArxiv(); }, [tab, yuklashArxiv]);

  // Smena ochish
  const smenaOchish = async (v) => {
    try {
      const bal = openBalance !== '' ? parseFloat(parseRawNumber(openBalance)) : undefined;
      const body = { valuta: v };
      if (bal !== undefined && !isNaN(bal)) body.opening_balance = bal;
      const res = await authFetch(`${API_URL}/api/kassa-smena/open`, { method: 'POST', body: JSON.stringify(body) });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      setOpenModal(null); setOpenBalance('');
      yuklash();
    } catch (err) { alert(err.message); }
  };

  // Smena yopish
  const smenaYopish = async () => {
    if (!closeModal) return;
    if (realNaqd === '') return alert('Real naqd qoldiqni kiriting!');
    setCloseSaving(true);
    try {
      const res = await authFetch(`${API_URL}/api/kassa-smena/${closeModal.id}/close`, {
        method: 'POST',
        body: JSON.stringify({ real_naqd: parseFloat(parseRawNumber(realNaqd)), notes: closeNotes || null })
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      setCloseModal(null); setRealNaqd(''); setCloseNotes('');
      yuklash();
    } catch (err) { alert(err.message); }
    finally { setCloseSaving(false); }
  };

  // Smena qayta ochish (admin)
  const smenaQaytaOchish = async (id) => {
    if (!window.confirm('Smenani qayta ochishni tasdiqlaysizmi?')) return;
    try {
      const res = await authFetch(`${API_URL}/api/kassa-smena/${id}/reopen`, { method: 'POST' });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      yuklashArxiv(); yuklash();
    } catch (err) { alert(err.message); }
  };

  // Smena o'chirish (admin)
  const smenaOchirish = async (id) => {
    if (!window.confirm('Smenani o\'chirishni tasdiqlaysizmi?')) return;
    try {
      const res = await authFetch(`${API_URL}/api/kassa-smena/${id}`, { method: 'DELETE' });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      yuklashArxiv();
    } catch (err) { alert(err.message); }
  };

  const parseRawNumber = (val) => {
    if (!val) return '';
    return val.toString().replace(/[^0-9.]/g, '');
  };

  const formatWithSpaces = (val) => {
    const raw = parseRawNumber(val);
    if (!raw) return '';
    const parts = raw.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return parts.join('.');
  };

  const qoshish = async (e) => {
    e.preventDefault();
    const parsedSumma = parseFloat(parseRawNumber(summaStr));
    if (!parsedSumma || parsedSumma <= 0) return alert(t('kassa.form.invalid_amount'));

    setSaqlash(true);
    try {
      if (tanlanganHamkor) {
        const [type, id] = tanlanganHamkor.split('_');
        const res = await authFetch(`${API_URL}/api/kassa/settlement`, {
          method: 'POST',
          body: JSON.stringify({
            client_id: id,
            client_type: type,
            turi: turi,
            summa: parsedSumma,
            valuta: valuta,
            kurs: kurs ? parseFloat(kurs) : null,
            izoh: izoh || null,
            sana: sana,
            payment_method: paymentMethod
          })
        });
        if (!res.ok) throw new Error((await res.json()).error);
      } else {
        const res = await authFetch(`${API_URL}/api/kassa`, {
          method: 'POST',
          body: JSON.stringify({
            turi: turi,
            summa: parsedSumma,
            valuta: valuta,
            kurs: kurs ? parseFloat(kurs) : null,
            izoh: izoh || null,
            sana: sana,
            payment_method: paymentMethod
          })
        });
        if (!res.ok) throw new Error((await res.json()).error);
      }

      setFormOchiq(false);
      setSummaStr('');
      setIzoh('');
      setTanlanganHamkor('');
      setQidiruvHamkor('');
      setHamkorTuri('boshqa');
      setPaymentMethod('naqd');
      setSana(getBugun());
      yuklash();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaqlash(false);
    }
  };

  const formatSumma = (s) => parseFloat(s || 0).toLocaleString('ru-RU');
  const formatSana = (sana) => {
    const d = new Date(sana);
    return d.toLocaleDateString('uz-UZ', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const handleHamkorTuriChange = (e) => {
    setHamkorTuri(e.target.value);
    setTanlanganHamkor('');
    setQidiruvHamkor('');
    setDropdownOchiq(false);
  };

  const getFilteredHamkorlar = () => {
    let list = [];
    if (hamkorTuri === 'client') list = clients;
    else if (hamkorTuri === 'supplier') list = suppliers;

    if (!qidiruvHamkor) return list;
    return list.filter(h => h.full_name.toLowerCase().includes(qidiruvHamkor.toLowerCase()));
  };

  const filteredHamkorlar = getFilteredHamkorlar();

  const getHamkorBalance = () => {
    if (!tanlanganHamkor) return null;
    const [type, id] = tanlanganHamkor.split('_');
    if (type === 'client') return clients.find(c => c.id.toString() === id);
    if (type === 'supplier') return suppliers.find(s => s.id.toString() === id);
    return null;
  };
  const hamkor = getHamkorBalance();

  return (
    <div className="page-section fade-in">
      <div className="section-header">
        <div className="section-title-row">
          <PageIcon icon={<IcoKassa />} color="#0ea5e9" />
          <h2 className="section-title">{t('kassa.title')}</h2>
        </div>
        <button className="btn btn-primary btn-large" onClick={() => setFormOchiq(!formOchiq)}>
          {formOchiq ? `✕ ${t('kassa.close_button')}` : `+ ${t('kassa.new_button')}`}
        </button>
      </div>

      {formOchiq && (
        <form className="add-form fade-in" onSubmit={qoshish}>

          {/* Joriy Qarz Info */}
          {hamkor && (
            <div style={{ padding: '0.75rem 1rem', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', marginBottom: '0.875rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '0.875rem', color: '#1e293b' }}>
                <strong>{hamkor.full_name}</strong> — {t('kassa.balance_status')}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: parseFloat(hamkor.balance_uzs) > 0 ? '#dc2626' : '#16a34a' }}>
                  {formatSumma(hamkor.balance_uzs)} UZS
                </div>
                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: parseFloat(hamkor.balance_usd) > 0 ? '#dc2626' : '#16a34a' }}>
                  ${formatSumma(hamkor.balance_usd)}
                </div>
              </div>
            </div>
          )}

          <div className="form-grid">

            <div className="form-group">
              <label className="form-label">{t('kassa.form.date')}</label>
              <input type="date" className="form-input font-bold" value={sana} onChange={e => setSana(e.target.value)} />
            </div>

            <div className="form-group">
              <label className="form-label">{t('kassa.form.operation_type')}</label>
              <select ref={turiRef} className="form-input font-bold"
                style={{ color: turi === 'kirim' ? '#16a34a' : '#dc2626' }}
                value={turi} onChange={e => setTuri(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') hamkorRef.current?.focus(); }}>
                <option value="kirim">{t('kassa.form.kirim')}</option>
                <option value="chiqim">{t('kassa.form.chiqim')}</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">{t('kassa.form.partner_type')}</label>
              <select className="form-input" value={hamkorTuri} onChange={handleHamkorTuriChange}
                onKeyDown={e => { if (e.key === 'Enter') { if (hamkorTuri !== 'boshqa') hamkorRef.current?.focus(); else valutaRef.current?.focus(); } }}>
                <option value="boshqa">{t('kassa.form.partner_other')}</option>
                <option value="client">{t('kassa.form.partner_client')}</option>
                <option value="supplier">{t('kassa.form.partner_supplier')}</option>
              </select>
            </div>

            {hamkorTuri !== 'boshqa' && (
              <div className="form-group" style={{ position: 'relative' }}>
                <label className="form-label">{t('kassa.form.search_partner')}</label>
                <input ref={hamkorRef} type="text" className="form-input" placeholder={t('kassa.form.search_placeholder')}
                  value={qidiruvHamkor}
                  onChange={e => {
                    setQidiruvHamkor(e.target.value);
                    setDropdownOchiq(true);
                  }}
                  onFocus={() => setDropdownOchiq(true)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      setDropdownOchiq(false);
                      valutaRef.current?.focus();
                    }
                  }}
                />
                {dropdownOchiq && filteredHamkorlar.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid var(--border-color)', borderRadius: '8px', zIndex: 10, maxHeight: '180px', overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', marginTop: '3px' }}>
                    {filteredHamkorlar.map(h => (
                      <div key={h.id}
                        style={{ padding: '7px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border-color)', fontSize: '0.875rem', fontWeight: 600 }}
                        onClick={() => { setTanlanganHamkor(`${hamkorTuri}_${h.id}`); setQidiruvHamkor(h.full_name); setDropdownOchiq(false); }}
                        onMouseEnter={e => e.currentTarget.style.background = '#eff6ff'}
                        onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                        {h.full_name}
                      </div>
                    ))}
                  </div>
                )}
                {dropdownOchiq && filteredHamkorlar.length === 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid var(--border-color)', borderRadius: '8px', zIndex: 10, padding: '8px 12px', color: '#94a3b8', fontSize: '0.85rem', marginTop: '3px' }}>
                    {t('kassa.form.not_found')}
                  </div>
                )}
              </div>
            )}

            <div className="form-group">
              <label className="form-label">{t('kassa.form.currency')}</label>
              <select ref={valutaRef} className="form-input" value={valuta} onChange={e => setValuta(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') summaRef.current?.focus(); }}>
                <option value="UZS">{t('kassa.form.uzs')}</option>
                <option value="USD">{t('kassa.form.usd')}</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">To'lov turi</label>
              <select className="form-input" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                <option value="naqd">Naqd</option>
                <option value="karta">Karta</option>
                <option value="kochirma">Pul ko'chirish</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">{t('kassa.form.amount')}</label>
              <input ref={summaRef} type="text" className="form-input font-bold"
                style={{ borderColor: '#3b82f6', color: '#1d4ed8' }}
                placeholder="0" required
                value={summaStr ? formatWithSpaces(summaStr) : ''}
                onChange={e => setSummaStr(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { if (valuta === 'USD') kursRef.current?.focus(); else izohRef.current?.focus(); } }} />
            </div>

            {valuta === 'USD' && (
              <div className="form-group">
                <label className="form-label">{t('kassa.form.rate')}</label>
                <input ref={kursRef} type="number" className="form-input" placeholder={t('kassa.form.rate_placeholder')}
                  value={kurs} onChange={e => setKurs(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') izohRef.current?.focus(); }} />
              </div>
            )}

            <div className="form-group form-group-full">
              <label className="form-label">{t('kassa.form.comment')}</label>
              <input ref={izohRef} type="text" className="form-input" placeholder={t('kassa.form.comment_placeholder')}
                value={izoh} onChange={e => setIzoh(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') btnRef.current?.focus(); }} />
            </div>

          </div>

          <button type="submit" ref={btnRef} className="btn btn-large btn-success" disabled={saqlash}>
            {saqlash ? t('kassa.form.saving') : t('kassa.form.save')}
          </button>
        </form>
      )}

      {/* ═══ SMENA STATUS PANELI ═══ */}
      {!loading && !error && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem', marginBottom: '1rem' }}>
          {['UZS', 'USD'].map(v => {
            const smena = activeSmenalar.find(s => s.valuta === v);
            const sym = v === 'USD' ? '$' : '';
            const flag = v === 'USD' ? '🇺🇸' : '🇺🇿';
            return (
              <div key={v} className="card" style={{ padding: '0.875rem 1rem', borderLeft: smena ? '4px solid #16a34a' : '4px solid #94a3b8' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>
                    {flag} {v} Smena
                    {smena
                      ? <span style={{ color: '#16a34a', fontWeight: 600, marginLeft: '0.5rem', fontSize: '0.78rem' }}>● Ochiq</span>
                      : <span style={{ color: '#94a3b8', fontWeight: 600, marginLeft: '0.5rem', fontSize: '0.78rem' }}>● Yopiq</span>
                    }
                  </div>
                  {smena
                    ? <button className="btn btn-sm" style={{ background: '#dc2626', color: '#fff', fontSize: '0.75rem', padding: '4px 10px' }} onClick={() => { setCloseModal(smena); setRealNaqd(''); setCloseNotes(''); }}>■ Yopish</button>
                    : <button className="btn btn-sm" style={{ background: '#16a34a', color: '#fff', fontSize: '0.75rem', padding: '4px 10px' }} onClick={() => { setOpenModal(v); setOpenBalance(''); }}>▶ Ochish</button>
                  }
                </div>
                {smena && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', fontSize: '0.78rem' }}>
                    <div className="stat-item" style={{ borderLeftColor: '#64748b', padding: '0.4rem 0.5rem' }}>
                      <div className="stat-value" style={{ fontSize: '0.85rem', color: '#475569' }}>{sym}{formatSumma(smena.opening_balance)}</div>
                      <div className="stat-label" style={{ fontSize: '0.65rem' }}>Boshlang'ich</div>
                    </div>
                    <div className="stat-item" style={{ borderLeftColor: '#16a34a', background: '#f0fdf4', padding: '0.4rem 0.5rem' }}>
                      <div className="stat-value text-success" style={{ fontSize: '0.85rem' }}>+{sym}{formatSumma((smena.live_naqd_in || 0) + (smena.live_karta_in || 0) + (smena.live_kochirma_in || 0))}</div>
                      <div className="stat-label" style={{ fontSize: '0.65rem' }}>Kirim</div>
                    </div>
                    <div className="stat-item" style={{ borderLeftColor: '#dc2626', background: '#fef2f2', padding: '0.4rem 0.5rem' }}>
                      <div className="stat-value text-danger" style={{ fontSize: '0.85rem' }}>−{sym}{formatSumma((smena.live_naqd_out || 0) + (smena.live_karta_out || 0) + (smena.live_kochirma_out || 0))}</div>
                      <div className="stat-label" style={{ fontSize: '0.65rem' }}>Chiqim</div>
                    </div>
                    <div className="stat-item" style={{ borderLeftColor: (smena.live_balance || 0) >= 0 ? '#16a34a' : '#dc2626', background: (smena.live_balance || 0) >= 0 ? '#f0fdf4' : '#fef2f2', padding: '0.4rem 0.5rem' }}>
                      <div className="stat-value" style={{ fontSize: '0.85rem', color: (smena.live_balance || 0) >= 0 ? '#15803d' : '#b91c1c' }}>{sym}{formatSumma(smena.live_balance || 0)}</div>
                      <div className="stat-label" style={{ fontSize: '0.65rem' }}>Joriy qoldiq</div>
                    </div>
                  </div>
                )}
                {smena && (
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.4rem' }}>
                    Ochilgan: {formatSana(smena.opened_at)} | {smena.opened_by_name || '—'}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ═══ TAB NAVIGATION ═══ */}
      {!loading && !error && (
        <div style={{ display: 'flex', gap: '0', marginBottom: '1rem', borderBottom: '2px solid var(--border-color)' }}>
          <button onClick={() => setTab('joriy')}
            style={{ padding: '0.5rem 1.25rem', fontWeight: 700, fontSize: '0.85rem', border: 'none', borderBottom: tab === 'joriy' ? '2px solid #3b82f6' : '2px solid transparent', background: 'transparent', color: tab === 'joriy' ? '#3b82f6' : '#64748b', cursor: 'pointer', marginBottom: '-2px' }}>
            Joriy smena
          </button>
          <button onClick={() => setTab('arxiv')}
            style={{ padding: '0.5rem 1.25rem', fontWeight: 700, fontSize: '0.85rem', border: 'none', borderBottom: tab === 'arxiv' ? '2px solid #3b82f6' : '2px solid transparent', background: 'transparent', color: tab === 'arxiv' ? '#3b82f6' : '#64748b', cursor: 'pointer', marginBottom: '-2px' }}>
            Yopilgan smenalar
          </button>
        </div>
      )}

      {loading && (
        <div className="loading-container"><div className="spinner"></div>
          <span className="loading-text">{t('kassa.loading')}</span></div>
      )}
      {error && <div className="error-message"><span>⚠️</span><span>{t('kassa.error')}: {error}</span></div>}

      {/* ═══ JORIY SMENA TAB ═══ */}
      {tab === 'joriy' && !loading && !error && (
        <>
          {yozuvlar.length === 0 && (
            <div className="empty-state"><div className="empty-state-icon">🏦</div>
              <div className="empty-state-text">{t('kassa.empty')}</div></div>
          )}

          {yozuvlar.length > 0 && (
            <div style={{ marginBottom: '0.75rem' }}>
              <input type="text" className="form-input" placeholder={t('kassa.search_placeholder')}
                value={qidiruv} onChange={(e) => setQidiruv(e.target.value)} />
            </div>
          )}

          {yozuvlar.length > 0 && (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('kassa.table.date')}</th>
                    <th>{t('kassa.table.type')}</th>
                    <th>To'lov</th>
                    <th>{t('kassa.table.from_to')}</th>
                    <th style={{ textAlign: 'right' }}>{t('kassa.table.amount')}</th>
                    <th>{t('kassa.table.comment')}</th>
                    <th>{t('kassa.table.user')}</th>
                  </tr>
                </thead>
                <tbody>
                  {yozuvlar.filter(y =>
                    !qidiruv ||
                    (y.izoh && y.izoh.toLowerCase().includes(qidiruv.toLowerCase())) ||
                    (y.user_name && y.user_name.toLowerCase().includes(qidiruv.toLowerCase())) ||
                    (y.client_name && y.client_name.toLowerCase().includes(qidiruv.toLowerCase())) ||
                    (y.summa && y.summa.toString().includes(qidiruv))
                  ).map((y) => (
                    <tr key={y.id}>
                      <td className="text-muted">{formatSana(y.created_at)}</td>
                      <td>
                        <span className="badge" style={{ background: y.turi === 'kirim' ? '#dcfce7' : '#fee2e2', color: y.turi === 'kirim' ? '#15803d' : '#b91c1c' }}>
                          {y.turi === 'kirim' ? t('kassa.table.kirim') : t('kassa.table.chiqim')}
                        </span>
                      </td>
                      <td>
                        <span className="badge" style={{ background: y.payment_method === 'karta' ? '#e0e7ff' : y.payment_method === 'kochirma' ? '#fef3c7' : '#f1f5f9', color: y.payment_method === 'karta' ? '#4338ca' : y.payment_method === 'kochirma' ? '#92400e' : '#475569', fontSize: '0.72rem' }}>
                          {y.payment_method === 'karta' ? 'Karta' : y.payment_method === 'kochirma' ? "Ko'chirma" : 'Naqd'}
                        </span>
                      </td>
                      <td className="font-bold">{y.client_name || <span className="text-muted">{t('kassa.table.general')}</span>}</td>
                      <td className={y.turi === 'kirim' ? 'text-success font-bold' : 'text-danger font-bold'} style={{ textAlign: 'right' }}>
                        {y.turi === 'kirim' ? '+' : '−'}{y.valuta === 'USD' ? '$' : ''}{formatSumma(y.summa)}{y.valuta === 'UZS' || !y.valuta ? ' so\'m' : ''}
                      </td>
                      <td className="text-muted">{y.izoh || '—'}</td>
                      <td className="text-muted">{y.user_name || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ═══ ARXIV TAB ═══ */}
      {tab === 'arxiv' && !loading && !error && (
        <>
          {smenaLoading && (
            <div className="loading-container"><div className="spinner"></div><span className="loading-text">Yuklanmoqda...</span></div>
          )}
          {!smenaLoading && arxivSmenalar.length === 0 && (
            <div className="empty-state"><div className="empty-state-icon">📋</div><div className="empty-state-text">Yopilgan smenalar yo'q</div></div>
          )}
          {!smenaLoading && arxivSmenalar.length > 0 && (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Valyuta</th>
                    <th>Ochilgan</th>
                    <th>Yopilgan</th>
                    <th style={{ textAlign: 'right' }}>Boshlang'ich</th>
                    <th style={{ textAlign: 'right' }}>Kirim</th>
                    <th style={{ textAlign: 'right' }}>Chiqim</th>
                    <th style={{ textAlign: 'right' }}>Yakuniy</th>
                    <th style={{ textAlign: 'right' }}>Real naqd</th>
                    <th style={{ textAlign: 'right' }}>Farq</th>
                    <th>Status</th>
                    <th>Amallar</th>
                  </tr>
                </thead>
                <tbody>
                  {arxivSmenalar.map((s) => {
                    const sym = s.valuta === 'USD' ? '$' : '';
                    const totalIn = parseFloat(s.total_naqd_in || 0) + parseFloat(s.total_karta_in || 0) + parseFloat(s.total_kochirma_in || 0);
                    const totalOut = parseFloat(s.total_naqd_out || 0) + parseFloat(s.total_karta_out || 0) + parseFloat(s.total_kochirma_out || 0);
                    const farqNum = parseFloat(s.farq || 0);
                    return (
                      <tr key={s.id}>
                        <td className="text-muted">{s.id}</td>
                        <td><span className="badge" style={{ background: s.valuta === 'USD' ? '#dbeafe' : '#f0fdf4', color: s.valuta === 'USD' ? '#1d4ed8' : '#15803d' }}>{s.valuta}</span></td>
                        <td className="text-muted">{formatSana(s.opened_at)}</td>
                        <td className="text-muted">{s.closed_at ? formatSana(s.closed_at) : '—'}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{sym}{formatSumma(s.opening_balance)}</td>
                        <td className="text-success" style={{ textAlign: 'right', fontWeight: 600 }}>+{sym}{formatSumma(totalIn)}</td>
                        <td className="text-danger" style={{ textAlign: 'right', fontWeight: 600 }}>−{sym}{formatSumma(totalOut)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{sym}{formatSumma(s.closing_balance)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{s.real_naqd != null ? `${sym}${formatSumma(s.real_naqd)}` : '—'}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: farqNum > 0 ? '#16a34a' : farqNum < 0 ? '#dc2626' : '#64748b' }}>
                          {s.farq != null ? `${farqNum > 0 ? '+' : ''}${sym}${formatSumma(s.farq)}` : '—'}
                        </td>
                        <td>
                          {s.status === 'closed' && s.auto_closed && <span className="badge" style={{ background: '#fef3c7', color: '#92400e', fontSize: '0.7rem' }}>Avto</span>}
                          {s.status === 'closed' && !s.auto_closed && <span className="badge" style={{ background: '#dcfce7', color: '#15803d', fontSize: '0.7rem' }}>Yopilgan</span>}
                          {s.status === 'open' && <span className="badge" style={{ background: '#dbeafe', color: '#1d4ed8', fontSize: '0.7rem' }}>Ochiq</span>}
                        </td>
                        <td>
                          {s.status === 'closed' && user?.role === 'admin' && (
                            <div style={{ display: 'flex', gap: '0.3rem' }}>
                              <button className="btn btn-sm" style={{ background: '#3b82f6', color: '#fff', fontSize: '0.72rem', padding: '3px 8px' }} title="Qayta ochish" onClick={() => smenaQaytaOchish(s.id)}>✏️</button>
                              <button className="btn btn-sm" style={{ background: '#dc2626', color: '#fff', fontSize: '0.72rem', padding: '3px 8px' }} title="O'chirish" onClick={() => smenaOchirish(s.id)}>🗑</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ═══ SMENA OCHISH MODALI ═══ */}
      {openModal && (
        <div className="modal-overlay" onClick={() => setOpenModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '420px' }}>
            <h3 style={{ marginBottom: '1rem' }}>{openModal} Smena ochish</h3>
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="form-label">Boshlang'ich qoldiq (avto-yuklanadi, o'zgartirish mumkin)</label>
              <input type="text" className="form-input font-bold"
                placeholder="Avto-yuklanadi"
                value={openBalance} onChange={e => setOpenBalance(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setOpenModal(null)}>Bekor</button>
              <button className="btn btn-success" onClick={() => smenaOchish(openModal)}>▶ Ochish</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ SMENA YOPISH MODALI ═══ */}
      {closeModal && (
        <div className="modal-overlay" onClick={() => setCloseModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px' }}>
            <h3 style={{ marginBottom: '1rem' }}>{closeModal.valuta} Smenani yopish</h3>
            {(() => {
              const sym = closeModal.valuta === 'USD' ? '$' : '';
              const opening = parseFloat(closeModal.opening_balance) || 0;
              const naqdIn = closeModal.live_naqd_in || 0;
              const kartaIn = closeModal.live_karta_in || 0;
              const kochIn = closeModal.live_kochirma_in || 0;
              const naqdOut = closeModal.live_naqd_out || 0;
              const kartaOut = closeModal.live_karta_out || 0;
              const kochOut = closeModal.live_kochirma_out || 0;
              const totalIn = naqdIn + kartaIn + kochIn;
              const totalOut = naqdOut + kartaOut + kochOut;
              const hisob = opening + totalIn - totalOut;
              const naqdHisob = opening + naqdIn - naqdOut;
              const realNum = parseFloat(parseRawNumber(realNaqd)) || 0;
              const farq = realNaqd !== '' ? realNum - naqdHisob : null;
              return (
                <div style={{ display: 'grid', gap: '0.5rem', fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0', borderBottom: '1px solid var(--border-color)' }}>
                    <span>Boshlang'ich qoldiq:</span><strong>{sym}{formatSumma(opening)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0' }}>
                    <span style={{ color: '#16a34a' }}>Naqd kirim:</span><strong className="text-success">+{sym}{formatSumma(naqdIn)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0' }}>
                    <span style={{ color: '#16a34a' }}>Karta kirim:</span><strong className="text-success">+{sym}{formatSumma(kartaIn)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0' }}>
                    <span style={{ color: '#16a34a' }}>Ko'chirma kirim:</span><strong className="text-success">+{sym}{formatSumma(kochIn)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0' }}>
                    <span style={{ color: '#dc2626' }}>Naqd chiqim:</span><strong className="text-danger">−{sym}{formatSumma(naqdOut)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0' }}>
                    <span style={{ color: '#dc2626' }}>Karta chiqim:</span><strong className="text-danger">−{sym}{formatSumma(kartaOut)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0' }}>
                    <span style={{ color: '#dc2626' }}>Ko'chirma chiqim:</span><strong className="text-danger">−{sym}{formatSumma(kochOut)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderTop: '2px solid var(--border-color)', fontWeight: 700, fontSize: '0.95rem' }}>
                    <span>Hisob bo'yicha jami:</span><span>{sym}{formatSumma(hisob)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, background: '#eff6ff', padding: '0.5rem', borderRadius: '6px' }}>
                    <span>Naqd bo'yicha hisob:</span><span>{sym}{formatSumma(naqdHisob)}</span>
                  </div>

                  <div className="form-group" style={{ marginTop: '0.5rem' }}>
                    <label className="form-label" style={{ fontWeight: 700 }}>Real naqd (sanab kiriting) *</label>
                    <input type="text" className="form-input font-bold" style={{ borderColor: '#3b82f6', fontSize: '1.1rem' }}
                      placeholder="0" value={realNaqd ? formatWithSpaces(realNaqd) : ''} onChange={e => setRealNaqd(e.target.value)} autoFocus />
                  </div>

                  {farq !== null && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem', borderRadius: '6px', fontWeight: 700, background: farq > 0 ? '#f0fdf4' : farq < 0 ? '#fef2f2' : '#f1f5f9', color: farq > 0 ? '#16a34a' : farq < 0 ? '#dc2626' : '#64748b' }}>
                      <span>Farq:</span>
                      <span>{farq > 0 ? '+' : ''}{sym}{formatSumma(farq)}</span>
                    </div>
                  )}

                  <div className="form-group">
                    <label className="form-label">Izoh</label>
                    <input type="text" className="form-input" placeholder="Ixtiyoriy izoh..."
                      value={closeNotes} onChange={e => setCloseNotes(e.target.value)} />
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                    <button className="btn" onClick={() => setCloseModal(null)}>Bekor</button>
                    <button className="btn btn-danger" onClick={smenaYopish} disabled={closeSaving}>
                      {closeSaving ? 'Saqlanmoqda...' : '■ Yopish va saqlash'}
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
