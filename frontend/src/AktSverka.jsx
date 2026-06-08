import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import { useTranslation } from 'react-i18next';
import * as XLSX from 'xlsx';
import { PageIcon, IcoAkt } from './icons';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

export default function AktSverka() {
  const { authFetch, user, business } = useAuth();
  const { t } = useTranslation();
  const [clients, setClients] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const getFirstDayOfMonth = () => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
  };

  const getToday = () => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().split('T')[0];
  };

  const [sanaDan, setSanaDan] = useState(getFirstDayOfMonth());
  const [sanaGacha, setSanaGacha] = useState(getToday());
  
  const [hamkorTuri, setHamkorTuri] = useState('client');
  const [qidiruvHamkor, setQidiruvHamkor] = useState('');
  const [tanlanganHamkor, setTanlanganHamkor] = useState('');
  const [dropdownOchiq, setDropdownOchiq] = useState(false);

  const [sverkaData, setSverkaData] = useState(null);

  const hamkorRef = useRef(null);

  // Dastlabki ma'lumotlarni yuklash (Mijozlar va Pudratchilar)
  const yuklashAsosiy = useCallback(async () => {
    try {
      const [resClients, resSuppliers] = await Promise.all([
        authFetch(`${API_URL}/api/clients`),
        authFetch(`${API_URL}/api/suppliers`)
      ]);
      if (resClients.ok) setClients(await resClients.json());
      if (resSuppliers.ok) setSuppliers(await resSuppliers.json());
    } catch (err) {
      console.error('Hamkorlarni yuklash xatosi', err);
    }
  }, [authFetch]);

  useEffect(() => { yuklashAsosiy(); }, [yuklashAsosiy]);

  const getFilteredHamkorlar = () => {
    let list = hamkorTuri === 'client' ? clients : suppliers;
    if (!qidiruvHamkor) return list;
    return list.filter(h => h.full_name.toLowerCase().includes(qidiruvHamkor.toLowerCase()));
  };

  const filteredHamkorlar = getFilteredHamkorlar();

  const hujjatniShakllantirish = async () => {
    if (!tanlanganHamkor) {
      alert(t('akt_sverka.select_partner'));
      return;
    }
    const id = tanlanganHamkor.split('_')[1];

    setLoading(true);
    setError(null);
    setSverkaData(null);

    try {
      const res = await authFetch(`${API_URL}/api/akt-sverka?client_id=${id}&start_date=${sanaDan}&end_date=${sanaGacha}`);
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Xatolik yuz berdi');
      }
      const data = await res.json();
      setSverkaData(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatSumma = (s) => {
    const num = parseFloat(s || 0);
    if (num === 0) return '';
    // Probel bilan ajratish: 150 000 000
    return Math.abs(num).toFixed(Math.abs(num) % 1 === 0 ? 0 : 2)
      .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  };

  const formatSana = (sana) => {
    if (!sana) return '';
    const d = new Date(sana);
    return d.toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  // Buxgalterlik mantiqi:
  //  Saldo ishorasi: + bo'lsa hamkor bizga qarizdor (biz haqdormiz),
  //                  − bo'lsa biz hamkorga qarzdormiz (biz qarizdormiz).
  //  Korxona (Sardor MCHJ) DT = bizning haqimiz oshdi (qarzga sotuv yoki avans qaytarish)
  //  Korxona KT = bizning qarzimiz oshdi (xarid qarzga yoki to'lov olganda)
  //  Hamkor tomonida — har bir amaliyot Korxona ga nisbatan oyna kabi aks etadi.
  let rows = [];
  if (sverkaData) {
    let saldoUZS = parseFloat(sverkaData.start_balance_uzs || 0);
    let saldoUSD = parseFloat(sverkaData.start_balance_usd || 0);

    rows = sverkaData.transactions.map(tx => {
      const aUZS = parseFloat(tx.amount_uzs || 0);
      const aUSD = parseFloat(tx.amount_usd || 0);

      // Har bir tomon uchun DT/KT qiymatlari
      let kDT_uzs = 0, kKT_uzs = 0, kDT_usd = 0, kKT_usd = 0; // Korxona
      let hDT_uzs = 0, hKT_uzs = 0, hDT_usd = 0, hKT_usd = 0; // Hamkor
      let deltaUZS = 0, deltaUSD = 0;

      const ct = sverkaData.client.client_type;

      if (tx.transaction_type === 'opening_balance') {
        // ishora bo'yicha taqsimlanadi
        if (aUZS >= 0) { kDT_uzs = aUZS; hKT_uzs = aUZS; } else { kKT_uzs = -aUZS; hDT_uzs = -aUZS; }
        if (aUSD >= 0) { kDT_usd = aUSD; hKT_usd = aUSD; } else { kKT_usd = -aUSD; hDT_usd = -aUSD; }
        deltaUZS = aUZS; deltaUSD = aUSD;
      } else if (ct === 'customer') {
        if (tx.transaction_type === 'sotuv_nasiya' || tx.transaction_type === 'sotuv') {
          // Mol berdik — mijozda qarz oshdi (biz haqdormiz)
          kDT_uzs = aUZS; kDT_usd = aUSD; hKT_uzs = aUZS; hKT_usd = aUSD;
          deltaUZS = aUZS; deltaUSD = aUSD;
        } else if (tx.transaction_type === 'tulov_kirim') {
          // Mijozdan to'lov oldik — qarz kamaydi
          kKT_uzs = aUZS; kKT_usd = aUSD; hDT_uzs = aUZS; hDT_usd = aUSD;
          deltaUZS = -aUZS; deltaUSD = -aUSD;
        }
      } else if (ct === 'supplier') {
        if (tx.transaction_type === 'xarid_nasiya' || tx.transaction_type === 'xarid') {
          // Mol oldik — biz qarzdormiz
          kKT_uzs = aUZS; kKT_usd = aUSD; hDT_uzs = aUZS; hDT_usd = aUSD;
          deltaUZS = aUZS; deltaUSD = aUSD;
        } else if (tx.transaction_type === 'tulov_chiqim') {
          // To'ladik — qarzimiz kamaydi
          kDT_uzs = aUZS; kDT_usd = aUSD; hKT_uzs = aUZS; hKT_usd = aUSD;
          deltaUZS = -aUZS; deltaUSD = -aUSD;
        }
      }

      saldoUZS += deltaUZS;
      saldoUSD += deltaUSD;

      return {
        ...tx,
        kDT_uzs, kKT_uzs, kDT_usd, kKT_usd,
        hDT_uzs, hKT_uzs, hDT_usd, hKT_usd,
        qoldiqUZS: saldoUZS, qoldiqUSD: saldoUSD,
      };
    });
  }

  // Jami aylanma summalari
  const totals = rows.reduce((acc, r) => {
    acc.kDT_uzs += r.kDT_uzs; acc.kKT_uzs += r.kKT_uzs;
    acc.kDT_usd += r.kDT_usd; acc.kKT_usd += r.kKT_usd;
    acc.hDT_uzs += r.hDT_uzs; acc.hKT_uzs += r.hKT_uzs;
    acc.hDT_usd += r.hDT_usd; acc.hKT_usd += r.hKT_usd;
    return acc;
  }, { kDT_uzs:0,kKT_uzs:0,kDT_usd:0,kKT_usd:0,hDT_uzs:0,hKT_uzs:0,hDT_usd:0,hKT_usd:0 });

  const printDocument = () => {
    window.print();
  };

  const exportToExcel = () => {
    if (!sverkaData) return;

    const wsData = [];
    
    // Sarlavhalar
    wsData.push(["O'zaro hisob-kitoblar solishtirma dalolatnomasi (Akt Sverka)"]);
    wsData.push([`Davr: ${new Date(sanaDan).toLocaleDateString('uz-UZ')} dan ${new Date(sanaGacha).toLocaleDateString('uz-UZ')} gacha`]);
    wsData.push([]);
    wsData.push([`Korxona: ${business?.business_name || 'Ulgurji Savdo'}`, "", "", `${sverkaData.client.client_type === 'customer' ? 'Mijoz' : 'Pudratchi'}: ${sverkaData.client.full_name}`]);
    wsData.push([]);

    const korxNomi = business?.business_name || 'Korxona';
    const hamkorNomi = sverkaData.client.full_name;
    const startUZS = parseFloat(sverkaData.start_balance_uzs || 0);
    const startUSD = parseFloat(sverkaData.start_balance_usd || 0);
    const endUZS = rows.length ? rows[rows.length-1].qoldiqUZS : startUZS;
    const endUSD = rows.length ? rows[rows.length-1].qoldiqUSD : startUSD;

    // Jadval bosh sarlavhasi (ikki tomonli)
    wsData.push([
      "Sana", "Amaliyot",
      `${korxNomi} — DEBET (UZS)`, `${korxNomi} — DEBET (USD)`,
      `${korxNomi} — KREDIT (UZS)`, `${korxNomi} — KREDIT (USD)`,
      `${hamkorNomi} — DEBET (UZS)`, `${hamkorNomi} — DEBET (USD)`,
      `${hamkorNomi} — KREDIT (UZS)`, `${hamkorNomi} — KREDIT (USD)`,
    ]);

    // Boshlang'ich qoldiq — ishorasiga qarab DT/KT ga tushadi
    const opK_DT_UZS = startUZS > 0 ? startUZS : 0;
    const opK_KT_UZS = startUZS < 0 ? -startUZS : 0;
    const opK_DT_USD = startUSD > 0 ? startUSD : 0;
    const opK_KT_USD = startUSD < 0 ? -startUSD : 0;
    wsData.push([
      "", "Boshlang'ich qoldiq",
      opK_DT_UZS, opK_DT_USD, opK_KT_UZS, opK_KT_USD,
      opK_KT_UZS, opK_KT_USD, opK_DT_UZS, opK_DT_USD,
    ]);

    rows.forEach(r => {
      let typeText = "";
      if (r.transaction_type === 'sotuv_nasiya' || r.transaction_type === 'sotuv') typeText = t('akt_sverka.report.tx_sale');
      else if (r.transaction_type === 'xarid_nasiya' || r.transaction_type === 'xarid') typeText = t('akt_sverka.report.tx_purchase');
      else if (r.transaction_type === 'tulov_kirim') typeText = t('akt_sverka.report.tx_payment_in');
      else if (r.transaction_type === 'tulov_chiqim') typeText = t('akt_sverka.report.tx_payment_out');
      else if (r.transaction_type === 'opening_balance') typeText = t('akt_sverka.report.tx_opening');

      wsData.push([
        formatSana(r.created_at),
        `${typeText}${r.description ? ' - ' + r.description : ''}`,
        r.kDT_uzs, r.kDT_usd, r.kKT_uzs, r.kKT_usd,
        r.hDT_uzs, r.hDT_usd, r.hKT_uzs, r.hKT_usd,
      ]);
    });

    // Davriy aylanma
    wsData.push([
      "", "Davriy aylanma:",
      totals.kDT_uzs, totals.kDT_usd, totals.kKT_uzs, totals.kKT_usd,
      totals.hDT_uzs, totals.hDT_usd, totals.hKT_uzs, totals.hKT_usd,
    ]);

    // Yakuniy qoldiq — qarama-qarshi tomonga qo'yiladi (jamilarni tenglashtirish uchun)
    const fK_DT_UZS = endUZS < 0 ? -endUZS : 0;
    const fK_KT_UZS = endUZS > 0 ? endUZS : 0;
    const fK_DT_USD = endUSD < 0 ? -endUSD : 0;
    const fK_KT_USD = endUSD > 0 ? endUSD : 0;
    wsData.push([
      "", "Yakuniy qoldiq",
      fK_DT_UZS, fK_DT_USD, fK_KT_UZS, fK_KT_USD,
      fK_KT_UZS, fK_KT_USD, fK_DT_UZS, fK_DT_USD,
    ]);

    // Jami (oborotlar tengligini tasdiqlash)
    wsData.push([
      "", "JAMI:",
      totals.kDT_uzs + opK_DT_UZS + fK_DT_UZS,
      totals.kDT_usd + opK_DT_USD + fK_DT_USD,
      totals.kKT_uzs + opK_KT_UZS + fK_KT_UZS,
      totals.kKT_usd + opK_KT_USD + fK_KT_USD,
      totals.hDT_uzs + opK_KT_UZS + fK_KT_UZS,
      totals.hDT_usd + opK_KT_USD + fK_KT_USD,
      totals.hKT_uzs + opK_DT_UZS + fK_DT_UZS,
      totals.hKT_usd + opK_DT_USD + fK_DT_USD,
    ]);

    const ws = XLSX.utils.aoa_to_sheet(wsData);

    ws['!cols'] = [
      { wch: 18 }, { wch: 40 },
      { wch: 16 }, { wch: 12 }, { wch: 16 }, { wch: 12 },
      { wch: 16 }, { wch: 12 }, { wch: 16 }, { wch: 12 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Akt Sverka");

    const fileName = `Akt_Sverka_${hamkorNomi.replace(/\s+/g, '_')}.xlsx`;

    XLSX.writeFile(wb, fileName);
  };

  // Qoldiq rangini tanlash (Ijobiy bo'lsa qarz (qizil), Manfiy bo'lsa haq (yashil) yoki nol bo'lsa kulrang)
  const renderQoldiqColor = (val) => {
    if (val > 0.001) return '#d90000'; // Bizga yoki bizdan qarz
    if (val < -0.001) return '#00a800'; // Haqdor
    return '#333';
  };

  return (
    <div className="page-section fade-in">
      <style>
        {`
          @media print {
            @page {
              size: A4;
              margin: 10mm;
            }
            
            /* Barcha elementlarni yashirish (to'g'ridan-to'g'ri body ichidagilarni) */
            body > *:not(#root) { 
              display: none !important; 
            }
            
            /* Dastur menyulari, sidebar va navigatsiyani yashirish */
            .sidebar, .nav-bar, .top-bar, .clock-bar, .no-print {
              display: none !important;
            }
            
            /* Asosiy konteynerlardagi ortiqcha bo'shliq va marginlarni olib tashlash */
            body, #root, .app-container, .main-content, .page-section {
              margin: 0 !important;
              padding: 0 !important;
              width: 100% !important;
              max-width: 100% !important;
              position: static !important;
              background: #fff !important;
            }

            /* Print areani normal flowda qoldirish (Absolute qilsangiz jadval qatorlari uziladi) */
            #print-area {
              display: block !important;
              width: 100% !important;
              position: static !important;
              margin: 0 !important;
              padding: 0 !important;
              box-shadow: none !important;
            }

            .print-header {
              text-align: center;
              margin-bottom: 15px;
              page-break-after: avoid;
            }
            
            .data-table {
              width: 100%;
              border-collapse: collapse;
              page-break-inside: auto;
            }
            
            .data-table tr {
              page-break-inside: avoid;
              page-break-after: auto;
            }
            
            .data-table th, .data-table td {
              border: 1px solid #000 !important;
              padding: 4px 6px !important;
              font-size: 11px !important;
            }
            
            .print-footer {
              page-break-inside: avoid;
              margin-top: 20px;
            }
          }
        `}
      </style>

      <div className="section-header no-print">
        <div className="section-title-row">
          <PageIcon icon={<IcoAkt />} color="#6366f1" />
          <h2 className="section-title">{t('akt_sverka.title')}</h2>
        </div>
      </div>

      {/* FILTERS */}
      <div className="card fade-in no-print">
        <div className="form-grid" style={{ alignItems: 'flex-end' }}>
          <div className="form-group">
            <label className="form-label">{t('akt_sverka.filter.partner_type')}</label>
            <select className="form-input" value={hamkorTuri}
              onChange={(e) => { setHamkorTuri(e.target.value); setTanlanganHamkor(''); setQidiruvHamkor(''); setSverkaData(null); }}>
              <option value="client">{t('akt_sverka.filter.client')}</option>
              <option value="supplier">{t('akt_sverka.filter.supplier')}</option>
            </select>
          </div>

          <div className="form-group" style={{ position: 'relative' }}>
            <label className="form-label">{t('akt_sverka.filter.search_label')}</label>
            <input ref={hamkorRef} type="text" className="form-input"
              placeholder={t('akt_sverka.filter.search_placeholder')}
              value={qidiruvHamkor}
              onChange={e => { setQidiruvHamkor(e.target.value); setDropdownOchiq(true); }}
              onFocus={() => setDropdownOchiq(true)}
              onKeyDown={e => {
                if (e.key === 'Enter' && filteredHamkorlar.length > 0) {
                  setTanlanganHamkor(`${hamkorTuri}_${filteredHamkorlar[0].id}`);
                  setQidiruvHamkor(filteredHamkorlar[0].full_name);
                  setDropdownOchiq(false);
                }
              }} />
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
          </div>

          <div className="form-group">
            <label className="form-label">{t('akt_sverka.filter.date_from')}</label>
            <input type="date" className="form-input" value={sanaDan} onChange={e => setSanaDan(e.target.value)} />
          </div>

          <div className="form-group">
            <label className="form-label">{t('akt_sverka.filter.date_to')}</label>
            <input type="date" className="form-input" value={sanaGacha} onChange={e => setSanaGacha(e.target.value)} />
          </div>

          <div className="form-group" style={{ justifyContent: 'flex-end' }}>
            <label className="form-label" style={{ visibility: 'hidden' }}>.</label>
            <button className="btn btn-primary btn-large" onClick={hujjatniShakllantirish} disabled={loading}>
              {loading ? t('akt_sverka.loading') : t('akt_sverka.generate_button')}
            </button>
          </div>
        </div>
      </div>

      {error && <div className="error-message no-print">⚠️ {t('akt_sverka.error')}: {error}</div>}

      {/* JADVAL / REPORT */}
      {sverkaData && (
        <div id="print-area" className="card" style={{ padding: '1.25rem' }}>
          
          <div className="print-header" style={{ borderBottom: '2px solid #e2e8f0', paddingBottom: '0.75rem', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#1e293b' }}>{t('akt_sverka.report.title')}</h1>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>
                {t('akt_sverka.report.period')} <strong>{new Date(sanaDan).toLocaleDateString('uz-UZ')}</strong> {t('akt_sverka.report.period_from')} <strong>{new Date(sanaGacha).toLocaleDateString('uz-UZ')}</strong> {t('akt_sverka.report.period_to')}
              </p>
            </div>
            <div className="no-print" style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-success btn-sm" onClick={exportToExcel}>{t('akt_sverka.excel_button')}</button>
              <button className="btn btn-primary btn-sm" onClick={printDocument}>{t('akt_sverka.print_button')}</button>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', fontSize: '0.875rem' }}>
            <div>
              <div style={{ color: '#64748b', marginBottom: '5px' }}>{t('akt_sverka.report.company')}</div>
              <strong style={{ fontSize: '1rem' }}>{business?.business_name || 'Ulgurji Savdo'}</strong>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: '#64748b', marginBottom: '5px' }}>{sverkaData.client.client_type === 'customer' ? t('akt_sverka.report.client_label') : t('akt_sverka.report.supplier_label')}:</div>
              <strong style={{ fontSize: '1rem' }}>{sverkaData.client.full_name}</strong>
              <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Tel: {sverkaData.client.phone || '-'}</div>
            </div>
          </div>

          {(() => {
            const korxNomi = business?.business_name || 'Korxona';
            const hamkorNomi = sverkaData.client.full_name;
            const startUZS = parseFloat(sverkaData.start_balance_uzs || 0);
            const startUSD = parseFloat(sverkaData.start_balance_usd || 0);
            const lastRow = rows[rows.length - 1];
            const endUZS = lastRow ? lastRow.qoldiqUZS : startUZS;
            const endUSD = lastRow ? lastRow.qoldiqUSD : startUSD;

            // Boshlang'ich: + bo'lsa korxona DT tomonida, hamkor KT tomonida
            const opK_DT_UZS = startUZS > 0 ? startUZS : 0;
            const opK_KT_UZS = startUZS < 0 ? -startUZS : 0;
            const opK_DT_USD = startUSD > 0 ? startUSD : 0;
            const opK_KT_USD = startUSD < 0 ? -startUSD : 0;
            // Yakuniy: tenglashtirish uchun teskari tomonga qo'yiladi
            const fK_DT_UZS = endUZS < 0 ? -endUZS : 0;
            const fK_KT_UZS = endUZS > 0 ? endUZS : 0;
            const fK_DT_USD = endUSD < 0 ? -endUSD : 0;
            const fK_KT_USD = endUSD > 0 ? endUSD : 0;

            const dualCell = (uzs, usd, color) => (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                {uzs ? <span style={{ color, fontWeight: 700 }}>{formatSumma(uzs)} <small style={{ opacity: 0.7 }}>so'm</small></span> : null}
                {usd ? <span style={{ color, fontWeight: 700, fontSize: '0.9em' }}>${formatSumma(usd)}</span> : null}
                {!uzs && !usd ? <span style={{ color: '#cbd5e1' }}>—</span> : null}
              </div>
            );
            const dtBg = '#f0fdf4', dtColor = '#15803d'; // DT — biz haqdormiz (yashil)
            const ktBg = '#fef2f2', ktColor = '#b91c1c'; // KT — biz qarzdormiz (qizil)

            return (
          <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #cbd5e1', fontSize: '0.95rem' }}>
            <thead style={{ backgroundColor: '#f8fafc' }}>
              <tr>
                <th rowSpan="2" style={{ padding: '10px', border: '1px solid #cbd5e1', textAlign: 'left', width: '110px' }}>{t('akt_sverka.report.col_date')}</th>
                <th rowSpan="2" style={{ padding: '10px', border: '1px solid #cbd5e1', textAlign: 'left' }}>{t('akt_sverka.report.col_operation')}</th>
                <th colSpan="2" style={{ padding: '10px', border: '1px solid #cbd5e1', textAlign: 'center', background: '#eef2ff', color: '#1e3a8a' }}>
                  Korxona — <strong>{korxNomi}</strong>
                </th>
                <th colSpan="2" style={{ padding: '10px', border: '1px solid #cbd5e1', textAlign: 'center', background: '#fef3c7', color: '#92400e' }}>
                  Hamkor — <strong>{hamkorNomi}</strong>
                </th>
              </tr>
              <tr>
                <th style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'right', background: dtBg, color: dtColor }}>DEBET (DT)</th>
                <th style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'right', background: ktBg, color: ktColor }}>KREDIT (KT)</th>
                <th style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'right', background: dtBg, color: dtColor }}>DEBET (DT)</th>
                <th style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'right', background: ktBg, color: ktColor }}>KREDIT (KT)</th>
              </tr>
            </thead>
            <tbody>
              {/* BOSHLANG'ICH QOLDIQ — yuqorida */}
              <tr style={{ backgroundColor: '#fffbeb', fontWeight: 'bold' }}>
                <td colSpan="2" style={{ padding: '12px', border: '1px solid #cbd5e1', textAlign: 'right' }}>
                  {t('akt_sverka.report.opening_balance')} ({new Date(sanaDan).toLocaleDateString('uz-UZ')} ga):
                </td>
                <td style={{ padding: '12px', border: '1px solid #cbd5e1', textAlign: 'right' }}>{dualCell(opK_DT_UZS, opK_DT_USD, dtColor)}</td>
                <td style={{ padding: '12px', border: '1px solid #cbd5e1', textAlign: 'right' }}>{dualCell(opK_KT_UZS, opK_KT_USD, ktColor)}</td>
                <td style={{ padding: '12px', border: '1px solid #cbd5e1', textAlign: 'right' }}>{dualCell(opK_KT_UZS, opK_KT_USD, dtColor)}</td>
                <td style={{ padding: '12px', border: '1px solid #cbd5e1', textAlign: 'right' }}>{dualCell(opK_DT_UZS, opK_DT_USD, ktColor)}</td>
              </tr>

              {/* TRANZAKSIYALAR */}
              {rows.length === 0 ? (
                <tr><td colSpan="6" style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>{t('akt_sverka.report.no_transactions')}</td></tr>
              ) : (
                rows.map((r, idx) => (
                  <tr key={r.id || idx}>
                    <td style={{ padding: '10px', border: '1px solid #cbd5e1' }}>{formatSana(r.created_at)}</td>
                    <td style={{ padding: '10px', border: '1px solid #cbd5e1' }}>
                      <div style={{ fontWeight: 'bold', color: '#334155' }}>
                        {(r.transaction_type === 'sotuv_nasiya' || r.transaction_type === 'sotuv') && t('akt_sverka.report.tx_sale')}
                        {(r.transaction_type === 'xarid_nasiya' || r.transaction_type === 'xarid') && t('akt_sverka.report.tx_purchase')}
                        {r.transaction_type === 'tulov_kirim' && t('akt_sverka.report.tx_payment_in')}
                        {r.transaction_type === 'tulov_chiqim' && t('akt_sverka.report.tx_payment_out')}
                        {r.transaction_type === 'opening_balance' && t('akt_sverka.report.tx_opening')}
                      </div>
                      <div style={{ color: '#64748b', fontSize: '0.85rem', marginTop: 2 }}>{r.description || '-'}</div>
                    </td>
                    <td style={{ padding: '10px', border: '1px solid #cbd5e1', textAlign: 'right', background: (r.kDT_uzs||r.kDT_usd) ? dtBg : 'transparent' }}>{dualCell(r.kDT_uzs, r.kDT_usd, dtColor)}</td>
                    <td style={{ padding: '10px', border: '1px solid #cbd5e1', textAlign: 'right', background: (r.kKT_uzs||r.kKT_usd) ? ktBg : 'transparent' }}>{dualCell(r.kKT_uzs, r.kKT_usd, ktColor)}</td>
                    <td style={{ padding: '10px', border: '1px solid #cbd5e1', textAlign: 'right', background: (r.hDT_uzs||r.hDT_usd) ? dtBg : 'transparent' }}>{dualCell(r.hDT_uzs, r.hDT_usd, dtColor)}</td>
                    <td style={{ padding: '10px', border: '1px solid #cbd5e1', textAlign: 'right', background: (r.hKT_uzs||r.hKT_usd) ? ktBg : 'transparent' }}>{dualCell(r.hKT_uzs, r.hKT_usd, ktColor)}</td>
                  </tr>
                ))
              )}

              {/* DAVRIY AYLANMA */}
              <tr style={{ background: '#f1f5f9', fontWeight: 'bold' }}>
                <td colSpan="2" style={{ padding: '10px', border: '1px solid #cbd5e1', textAlign: 'right' }}>{t('akt_sverka.report.turnover')}</td>
                <td style={{ padding: '10px', border: '1px solid #cbd5e1', textAlign: 'right' }}>{dualCell(totals.kDT_uzs, totals.kDT_usd, dtColor)}</td>
                <td style={{ padding: '10px', border: '1px solid #cbd5e1', textAlign: 'right' }}>{dualCell(totals.kKT_uzs, totals.kKT_usd, ktColor)}</td>
                <td style={{ padding: '10px', border: '1px solid #cbd5e1', textAlign: 'right' }}>{dualCell(totals.hDT_uzs, totals.hDT_usd, dtColor)}</td>
                <td style={{ padding: '10px', border: '1px solid #cbd5e1', textAlign: 'right' }}>{dualCell(totals.hKT_uzs, totals.hKT_usd, ktColor)}</td>
              </tr>

              {/* YAKUNIY QOLDIQ — pastda, qarama-qarshi tomonda (saldo tenglashishi uchun) */}
              <tr style={{ backgroundColor: '#fffbeb', fontWeight: 'bold' }}>
                <td colSpan="2" style={{ padding: '12px', border: '1px solid #cbd5e1', textAlign: 'right' }}>
                  {t('akt_sverka.report.closing_balance')} ({new Date(sanaGacha).toLocaleDateString('uz-UZ')} ga):
                </td>
                <td style={{ padding: '12px', border: '1px solid #cbd5e1', textAlign: 'right' }}>{dualCell(fK_DT_UZS, fK_DT_USD, dtColor)}</td>
                <td style={{ padding: '12px', border: '1px solid #cbd5e1', textAlign: 'right' }}>{dualCell(fK_KT_UZS, fK_KT_USD, ktColor)}</td>
                <td style={{ padding: '12px', border: '1px solid #cbd5e1', textAlign: 'right' }}>{dualCell(fK_KT_UZS, fK_KT_USD, dtColor)}</td>
                <td style={{ padding: '12px', border: '1px solid #cbd5e1', textAlign: 'right' }}>{dualCell(fK_DT_UZS, fK_DT_USD, ktColor)}</td>
              </tr>

              {/* JAMI — DT va KT teng bo'lishi kerak */}
              <tr style={{ background: '#dbeafe', fontWeight: 800 }}>
                <td colSpan="2" style={{ padding: '12px', border: '1px solid #cbd5e1', textAlign: 'right', fontSize: '1rem' }}>{t('akt_sverka.report.total')}</td>
                <td style={{ padding: '12px', border: '1px solid #cbd5e1', textAlign: 'right' }}>{dualCell(totals.kDT_uzs + opK_DT_UZS + fK_DT_UZS, totals.kDT_usd + opK_DT_USD + fK_DT_USD, '#1e293b')}</td>
                <td style={{ padding: '12px', border: '1px solid #cbd5e1', textAlign: 'right' }}>{dualCell(totals.kKT_uzs + opK_KT_UZS + fK_KT_UZS, totals.kKT_usd + opK_KT_USD + fK_KT_USD, '#1e293b')}</td>
                <td style={{ padding: '12px', border: '1px solid #cbd5e1', textAlign: 'right' }}>{dualCell(totals.hDT_uzs + opK_KT_UZS + fK_KT_UZS, totals.hDT_usd + opK_KT_USD + fK_KT_USD, '#1e293b')}</td>
                <td style={{ padding: '12px', border: '1px solid #cbd5e1', textAlign: 'right' }}>{dualCell(totals.hKT_uzs + opK_DT_UZS + fK_DT_UZS, totals.hKT_usd + opK_DT_USD + fK_DT_USD, '#1e293b')}</td>
              </tr>
            </tbody>
          </table>
            );
          })()}

          {/* ── KIM HAQ / QARIZDOR BANNERI ── */}
          {(() => {
            const lastRow = rows[rows.length - 1];
            const finUZS = lastRow ? lastRow.qoldiqUZS : parseFloat(sverkaData.start_balance_uzs || 0);
            const finUSD = lastRow ? lastRow.qoldiqUSD : parseFloat(sverkaData.start_balance_usd || 0);
            const isQarizdor = finUZS > 0.001 || finUSD > 0.001;
            const isHaqdor   = finUZS < -0.001 || finUSD < -0.001;
            const hamkorNomi = sverkaData.client.full_name;
            const bgColor    = isQarizdor ? '#fef2f2' : isHaqdor ? '#f0fdf4' : '#f8fafc';
            const bdColor    = isQarizdor ? '#fca5a5' : isHaqdor ? '#86efac' : '#cbd5e1';
            const txColor    = isQarizdor ? '#dc2626' : isHaqdor ? '#16a34a' : '#64748b';
            return (
              <div style={{ marginTop: '1.5rem', padding: '1.25rem 1.5rem', borderRadius: 12, background: bgColor, border: `2px solid ${bdColor}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }} className="no-print">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontSize: '2rem' }}>{isQarizdor ? '🔴' : isHaqdor ? '🟢' : '⚖️'}</span>
                  <div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t('akt_sverka.report.status_label')}</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800, color: txColor }}>
                      {isQarizdor ? `${hamkorNomi} ${t('akt_sverka.report.debtor')}` : isHaqdor ? `${t('akt_sverka.report.creditor_prefix')} ${hamkorNomi} ${t('akt_sverka.report.creditor_suffix')}` : t('akt_sverka.report.balanced')}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  {finUZS !== 0 && <div style={{ fontSize: '1.8rem', fontWeight: 900, color: txColor, lineHeight: 1.2 }}>{Math.abs(finUZS).toLocaleString('ru-RU')} <span style={{ fontSize: '1rem' }}>UZS</span></div>}
                  {finUSD !== 0 && <div style={{ fontSize: '1.3rem', fontWeight: 700, color: txColor }}>${Math.abs(finUSD).toLocaleString('ru-RU')}</div>}
                  {finUZS === 0 && finUSD === 0 && <div style={{ fontSize: '1.4rem', fontWeight: 700, color: txColor }}>0 UZS</div>}
                </div>
              </div>
            );
          })()}

          <div style={{ marginTop: '40px', display: 'flex', justifyContent: 'space-between', padding: '0 20px' }} className="print-footer">
            <div style={{ textAlign: 'center' }}>
              <div style={{ marginBottom: '40px' }}><strong>{t('akt_sverka.report.company_rep')}</strong></div>
              <div style={{ borderTop: '1px solid #000', width: '200px', paddingTop: '10px' }}>{t('akt_sverka.report.signature')}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ marginBottom: '40px' }}><strong>{sverkaData.client.client_type === 'customer' ? t('akt_sverka.report.client_rep') : t('akt_sverka.report.supplier_rep')}</strong></div>
              <div style={{ borderTop: '1px solid #000', width: '200px', paddingTop: '10px' }}>{t('akt_sverka.report.signature')}</div>
            </div>
          </div>

        </div>
      )}

    </div>
  );
}
