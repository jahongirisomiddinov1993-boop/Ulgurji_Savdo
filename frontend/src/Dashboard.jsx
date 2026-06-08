import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from './AuthContext';
import { IcoSales, IcoPurchases, IcoKassa, IcoProducts, IcoClients, IcoSuppliers, IcoChart } from './icons';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const fmt = (n) => {
  const v = parseFloat(n || 0);
  if (!isFinite(v)) return '0';
  return Math.abs(v).toFixed(Math.abs(v) % 1 === 0 ? 0 : 2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
};

const pct = (cur, prev) => {
  const c = parseFloat(cur || 0), p = parseFloat(prev || 0);
  if (p === 0) return c > 0 ? 100 : 0;
  return Math.round(((c - p) / Math.abs(p)) * 100);
};

const makeTimeAgo = (t) => (iso) => {
  if (!iso) return '';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return t('dashboard.feed.sec_ago', { n: diff });
  if (diff < 3600) return t('dashboard.feed.min_ago', { n: Math.floor(diff / 60) });
  if (diff < 86400) return t('dashboard.feed.hour_ago', { n: Math.floor(diff / 3600) });
  return t('dashboard.feed.day_ago', { n: Math.floor(diff / 86400) });
};

const TX_TYPE_COLOR = {
  sotuv: '#16a34a', sotuv_nasiya: '#16a34a',
  xarid: '#dc2626', xarid_nasiya: '#dc2626',
  tulov_kirim: '#0ea5e9', tulov_chiqim: '#d97706',
  opening_balance: '#7c3aed',
};
const TX_TYPE_ICON = {
  sotuv: '↑', sotuv_nasiya: '↑',
  xarid: '↓', xarid_nasiya: '↓',
  tulov_kirim: '●', tulov_chiqim: '●',
  opening_balance: '◆',
};

const makeTxTypeLabel = (t) => (type) =>
  t(`dashboard.tx_type.${type}`, { defaultValue: type });

/* ── ERP Area Chart (pure SVG) ─────────────────────────────── */
const AreaChart = ({ labels, sales, purchases, height = 200 }) => {
  if (!labels || labels.length === 0) return null;
  const max = Math.max(...sales, ...purchases, 1);
  const W = 800, H = height;
  const pL = 52, pR = 12, pT = 12, pB = 28;
  const pw = W - pL - pR, ph = H - pT - pB;
  const step = pw / (labels.length - 1 || 1);
  const x = (i) => (pL + i * step).toFixed(1);
  const y = (v) => (pT + ph - (v / max) * ph).toFixed(1);
  const linePath = (arr) => arr.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(v)}`).join(' ');
  const areaPath = (arr) =>
    `M${x(0)},${pT + ph} ` + arr.map((v, i) => `L${x(i)},${y(v)}`).join(' ') + ` L${x(arr.length - 1)},${pT + ph}Z`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(r => ({ yv: pT + ph - r * ph, val: r * max }));
  const xLabels = labels.length <= 10
    ? labels.map((l, i) => ({ i, l }))
    : [0, Math.floor(labels.length / 4), Math.floor(labels.length / 2),
       Math.floor(labels.length * 3 / 4), labels.length - 1].map(i => ({ i, l: labels[i] }));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      <defs>
        <linearGradient id="gSales" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#16a34a" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#16a34a" stopOpacity="0.02" />
        </linearGradient>
        <linearGradient id="gPurchases" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#dc2626" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#dc2626" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={pL} y1={t.yv} x2={W - pR} y2={t.yv} stroke="#e8edf3" strokeWidth="1" />
          <text x={pL - 5} y={t.yv + 4} textAnchor="end" fontSize="9" fill="#94a3b8">
            {t.val >= 1e9 ? (t.val / 1e9).toFixed(1) + 'B' : t.val >= 1e6 ? (t.val / 1e6).toFixed(1) + 'M' : t.val >= 1e3 ? (t.val / 1e3).toFixed(0) + 'k' : t.val.toFixed(0)}
          </text>
        </g>
      ))}
      <path d={areaPath(purchases)} fill="url(#gPurchases)" />
      <path d={linePath(purchases)} fill="none" stroke="#dc2626" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      <path d={areaPath(sales)} fill="url(#gSales)" />
      <path d={linePath(sales)} fill="none" stroke="#16a34a" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      {xLabels.map(({ i, l }) => (
        <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="9" fill="#94a3b8">
          {String(l).slice(5)}
        </text>
      ))}
    </svg>
  );
};

/* ── ERP KPI Card ──────────────────────────────────────────── */
const KpiCard = ({ icon, label, valueUZS, valueUSD, change, color, link, subtitle }) => (
  <Link to={link || '#'} className="erp-kpi-card">
    <div className="erp-kpi-icon" style={{ background: color + '18', color }}>
      {icon}
    </div>
    <div className="erp-kpi-content">
      <div className="erp-kpi-label">{label}</div>
      <div className="erp-kpi-value">
        {fmt(valueUZS)} <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 500 }}>so'm</span>
      </div>
      {valueUSD !== undefined && parseFloat(valueUSD) !== 0 && (
        <div style={{ fontSize: '0.78rem', fontWeight: 600, color, marginTop: 1 }}>${fmt(valueUSD)}</div>
      )}
      {subtitle && <div className="erp-kpi-sub">{subtitle}</div>}
    </div>
    {change !== undefined && change !== null && (
      <span className={`erp-kpi-trend ${change >= 0 ? 'up' : 'down'}`}>
        {change >= 0 ? '↑' : '↓'} {Math.abs(change)}%
      </span>
    )}
  </Link>
);

/* ── ERP Quick Action ──────────────────────────────────────── */
const QuickAction = ({ label, color, link, icon }) => (
  <Link to={link} style={{ textDecoration: 'none' }}>
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
      padding: '0.4rem 0.875rem', borderRadius: '6px', cursor: 'pointer',
      border: `1.5px solid ${color}55`, background: color + '0f',
      color, fontWeight: 600, fontSize: '0.8rem',
      transition: 'background 0.1s, border-color 0.1s',
    }}
      onMouseEnter={e => { e.currentTarget.style.background = color + '20'; e.currentTarget.style.borderColor = color; }}
      onMouseLeave={e => { e.currentTarget.style.background = color + '0f'; e.currentTarget.style.borderColor = color + '55'; }}
    >
      <span>{icon}</span><span>{label}</span>
    </div>
  </Link>
);

/* ── ERP Alert Row ─────────────────────────────────────────── */
const AlertRow = ({ name, valueUZS, type }) => (
  <div style={{
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '0.45rem 0', borderBottom: '1px solid var(--table-border)',
    fontSize: '0.85rem',
  }}>
    <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{name}</span>
    <span style={{
      fontWeight: 700,
      color: type === 'debtor' ? 'var(--danger)' : type === 'payable' ? 'var(--warning)' : 'var(--warning)',
    }}>
      {fmt(valueUZS)} so'm
    </span>
  </div>
);

/* ── ERP Top Rank Row ──────────────────────────────────────── */
const TopRow = ({ rank, name, value, unit, color }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: '0.625rem',
    padding: '0.45rem 0', borderBottom: '1px solid var(--table-border)',
    fontSize: '0.85rem',
  }}>
    <span style={{
      width: 22, height: 22, borderRadius: 4, flexShrink: 0,
      background: rank <= 3 ? '#fef3c7' : '#f1f5f9',
      color: rank <= 3 ? '#b45309' : '#94a3b8',
      fontSize: '0.7rem', fontWeight: 800,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>{rank}</span>
    <span style={{ flex: 1, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
    <span style={{ color, fontWeight: 700, whiteSpace: 'nowrap' }}>{fmt(value)} {unit}</span>
  </div>
);

/* ── ERP Section ────────────────────────────────────────────── */
const ErpSection = ({ title, icon, action, children }) => (
  <div className="erp-section">
    <div className="erp-section-header">
      <div className="erp-section-title">{icon} {title}</div>
      {action}
    </div>
    <div className="erp-section-body">{children}</div>
  </div>
);

export default function Dashboard() {
  const { authFetch, business } = useAuth();
  const { t, i18n } = useTranslation();
  const timeAgo = makeTimeAgo(t);
  const txTypeLabel = makeTxTypeLabel(t);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastFetch, setLastFetch] = useState(null);

  const get30DaysAgo = () => { const d = new Date(); d.setDate(d.getDate() - 29); return d.toISOString().split('T')[0]; };
  const getToday = () => new Date().toISOString().split('T')[0];
  const [chartFrom, setChartFrom] = useState(get30DaysAgo());
  const [chartTo, setChartTo] = useState(getToday());

  const yuklash = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (chartFrom) params.set('chart_from', chartFrom);
      if (chartTo) params.set('chart_to', chartTo);
      const res = await authFetch(`${API_URL}/api/dashboard?${params.toString()}`);
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Dashboard yuklanmadi'); }
      setData(await res.json());
      setError(null);
      setLastFetch(new Date());
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [authFetch, chartFrom, chartTo]);

  useEffect(() => {
    yuklash();
    const id = setInterval(yuklash, 60000);
    return () => clearInterval(id);
  }, [yuklash]);

  if (loading && !data) return (
    <div className="loading-container">
      <div className="spinner"></div>
      <span className="loading-text">{t('dashboard.loading')}</span>
    </div>
  );
  if (error) return <div className="error-message">⚠️ {t('dashboard.error')}: {error}</div>;
  if (!data) return null;

  const role = data.role;
  const isAdmin = role === 'admin';
  const isSeller = role === 'seller';
  const isSupplierAgent = role === 'supplier_agent';
  const isWarehouse = role === 'warehouse_keeper';
  const dateLocale = i18n.language === 'ru' ? 'ru-RU' : 'uz-UZ';
  const salesChange = data.kpi.yesterday_sales_uzs !== undefined
    ? pct(data.kpi.today_sales_uzs, data.kpi.yesterday_sales_uzs) : null;

  return (
    <div className="page-section fade-in">

      {/* ─── ERP HEADER BAR ─── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '1rem', flexWrap: 'wrap', gap: '0.625rem',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{
              width: 34, height: 34, borderRadius: 8,
              background: 'var(--accent-light)', color: 'var(--accent-primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem',
            }}>📊</div>
            <div>
              <h1 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {t('nav.dashboard', { defaultValue: 'Dashboard' })}
              </h1>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {new Date().toLocaleDateString(dateLocale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                {' · '}{business?.business_name}
              </div>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          {lastFetch && (
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a', display: 'inline-block' }}></span>
              {timeAgo(lastFetch)}
            </span>
          )}
          <button onClick={yuklash} className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.375rem 0.75rem' }}>
            ↺ {t('dashboard.refresh')}
          </button>
        </div>
      </div>

      {/* ─── KPI CARDS ─── */}
      <div className="erp-kpi-grid">
        {(isAdmin || isSeller) && (
          <KpiCard icon={<IcoSales />} label={t('dashboard.kpi.today_sales')} color="#16a34a" link="/sotuv"
            valueUZS={data.kpi.today_sales_uzs} valueUSD={data.kpi.today_sales_usd} change={salesChange}
            subtitle={t('dashboard.kpi.month_total', { value: fmt(data.kpi.month_sales_uzs) + " so'm" })} />
        )}
        {(isAdmin || isSupplierAgent) && (
          <KpiCard icon={<IcoPurchases />} label={t('dashboard.kpi.today_purchases')} color="#dc2626" link="/xarid"
            valueUZS={data.kpi.today_purchases_uzs} valueUSD={data.kpi.today_purchases_usd}
            subtitle={t('dashboard.kpi.month_total', { value: fmt(data.kpi.month_purchases_uzs) + " so'm" })} />
        )}
        {isAdmin && (
          <KpiCard icon={<IcoKassa />} label={t('dashboard.kpi.cash_balance')} color="#0ea5e9" link="/kassa"
            valueUZS={data.kpi.cash_uzs} valueUSD={data.kpi.cash_usd} />
        )}
        {(isAdmin || isWarehouse) && (
          <KpiCard icon={<IcoProducts />} label={t('dashboard.kpi.inventory_value')} color="#7c3aed" link="/mahsulotlar"
            valueUZS={data.kpi.inventory_value_uzs} valueUSD={data.kpi.inventory_value_usd}
            subtitle={t('dashboard.kpi.products_qty', { count: data.kpi.total_products || 0, qty: fmt(data.kpi.total_qty) })} />
        )}
        {(isAdmin || isSeller) && data.kpi.receivables_uzs !== undefined && (
          <KpiCard icon={<IcoClients />} label={t('dashboard.kpi.receivables')} color="#16a34a" link="/klientlar"
            valueUZS={data.kpi.receivables_uzs} valueUSD={data.kpi.receivables_usd} />
        )}
        {(isAdmin || isSupplierAgent) && data.kpi.payables_uzs !== undefined && (
          <KpiCard icon={<IcoSuppliers />} label={t('dashboard.kpi.payables')} color="#d97706" link="/pudratchilar"
            valueUZS={data.kpi.payables_uzs} valueUSD={data.kpi.payables_usd} />
        )}
      </div>

      {/* ─── QUICK ACTIONS ─── */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        {(isAdmin || isSeller)        && <QuickAction icon={<IcoSales />}     label={t('dashboard.actions.new_sale')}     color="#16a34a" link="/sotuv" />}
        {(isAdmin || isSupplierAgent) && <QuickAction icon={<IcoPurchases />} label={t('dashboard.actions.new_purchase')} color="#dc2626" link="/xarid" />}
        {isAdmin                      && <QuickAction icon={<IcoKassa />}     label={t('dashboard.actions.kassa')}        color="#0ea5e9" link="/kassa" />}
        <QuickAction icon={<IcoProducts />} label={t('dashboard.actions.products')} color="#7c3aed" link="/mahsulotlar" />
        <QuickAction icon={<IcoClients />}  label={t('nav.clients')}                color="#d97706" link="/klientlar" />
      </div>

      {/* ─── 2-USTUN LAYOUT ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '0.875rem' }}>

        {/* GRAFIK — full width */}
        {data.chart?.labels?.length > 0 && (
          <div style={{ gridColumn: '1 / -1' }}>
            <div className="erp-section">
              <div className="erp-section-header">
                <div className="erp-section-title">
                  <IcoChart /> {t('dashboard.chart.title')}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexWrap: 'wrap' }}>
                  <input type="date" value={chartFrom} onChange={e => setChartFrom(e.target.value)} className="erp-filter-select" style={{ padding: '0.3rem 0.5rem', fontSize: '0.78rem' }} />
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>—</span>
                  <input type="date" value={chartTo} onChange={e => setChartTo(e.target.value)} className="erp-filter-select" style={{ padding: '0.3rem 0.5rem', fontSize: '0.78rem' }} />
                  <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ width: 12, height: 2, background: '#16a34a', display: 'inline-block', borderRadius: 2 }}></span>
                      {t('dashboard.chart.sales')}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ width: 12, height: 2, background: '#dc2626', display: 'inline-block', borderRadius: 2 }}></span>
                      {t('dashboard.chart.purchases')}
                    </span>
                  </div>
                </div>
              </div>
              <div style={{ padding: '0.875rem 1rem 0.5rem' }}>
                <AreaChart labels={data.chart.labels} sales={data.chart.sales_uzs} purchases={data.chart.purchases_uzs} />
              </div>
            </div>
          </div>
        )}

        {/* ALERTS: Debitor mijozlar */}
        {data.alerts.debtors?.length > 0 && (
          <ErpSection
            title={t('dashboard.alerts.debtors', { count: data.alerts.debtors.length })}
            icon={<IcoClients />}
            action={<Link to="/klientlar" style={{ fontSize: '0.78rem', color: 'var(--accent-primary)' }}>{t('dashboard.alerts.all_link')} →</Link>}
          >
            {data.alerts.debtors.slice(0, 8).map(d => (
              <AlertRow key={d.id} name={d.full_name} valueUZS={d.balance_uzs} type="debtor" />
            ))}
          </ErpSection>
        )}

        {/* ALERTS: To'lash kerak */}
        {data.alerts.payables?.length > 0 && (
          <ErpSection
            title={t('dashboard.alerts.payables', { count: data.alerts.payables.length })}
            icon={<IcoSuppliers />}
            action={<Link to="/pudratchilar" style={{ fontSize: '0.78rem', color: 'var(--accent-primary)' }}>{t('dashboard.alerts.all_link')} →</Link>}
          >
            {data.alerts.payables.slice(0, 8).map(d => (
              <AlertRow key={d.id} name={d.full_name} valueUZS={d.balance_uzs} type="payable" />
            ))}
          </ErpSection>
        )}

        {/* ALERTS: Kam qolgan */}
        {data.alerts.low_stock?.length > 0 && (
          <ErpSection
            title={t('dashboard.alerts.low_stock', { count: data.alerts.low_stock.length })}
            icon={<IcoProducts />}
            action={<Link to="/mahsulotlar" style={{ fontSize: '0.78rem', color: 'var(--accent-primary)' }}>{t('dashboard.alerts.warehouse_link')} →</Link>}
          >
            {data.alerts.low_stock.slice(0, 8).map(p => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.45rem 0', borderBottom: '1px solid var(--table-border)', fontSize: '0.85rem' }}>
                <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{p.name}</span>
                <span className={`erp-badge ${p.quantity < 1 ? 'danger' : 'warning'}`}>
                  {fmt(p.quantity)} {t('dashboard.top.qty_unit')}
                </span>
              </div>
            ))}
          </ErpSection>
        )}

        {/* TOP mahsulotlar */}
        {data.top.products?.length > 0 && (
          <ErpSection title={t('dashboard.top.products')} icon="🏆">
            {data.top.products.slice(0, 7).map((p, i) => (
              <TopRow key={p.id} rank={i + 1} name={p.name}
                value={p.revenue_uzs} unit="so'm" color="#16a34a" />
            ))}
          </ErpSection>
        )}

        {/* TOP mijozlar */}
        {data.top.clients?.length > 0 && (
          <ErpSection title={t('dashboard.top.clients')} icon="👑">
            {data.top.clients.slice(0, 7).map((c, i) => (
              <TopRow key={c.id} rank={i + 1} name={c.full_name}
                value={c.turnover_uzs} unit="so'm" color="#16a34a" />
            ))}
          </ErpSection>
        )}

        {/* TOP pudratchilar */}
        {data.top.suppliers?.length > 0 && (
          <ErpSection title={t('dashboard.top.suppliers')} icon="🏭">
            {data.top.suppliers.slice(0, 7).map((s, i) => (
              <TopRow key={s.id} rank={i + 1} name={s.full_name}
                value={s.turnover_uzs} unit="so'm" color="#dc2626" />
            ))}
          </ErpSection>
        )}

        {/* SO'NGGI FAOLLIK */}
        {data.feed?.length > 0 && (
          <div style={{ gridColumn: isWarehouse ? '1 / -1' : 'auto' }}>
            <ErpSection title={t('dashboard.feed.title')} icon="⚡">
              <div style={{ maxHeight: 380, overflowY: 'auto' }}>
                {data.feed.map(f => {
                  const col = TX_TYPE_COLOR[f.transaction_type] || '#64748b';
                  const ico = TX_TYPE_ICON[f.transaction_type] || '●';
                  return (
                    <div key={f.id} style={{
                      display: 'flex', gap: '0.625rem', padding: '0.5rem 0',
                      borderBottom: '1px solid var(--table-border)', alignItems: 'flex-start',
                    }}>
                      <div style={{
                        width: 26, height: 26, borderRadius: 6, flexShrink: 0, marginTop: 1,
                        background: col + '18', color: col,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.65rem', fontWeight: 800,
                      }}>{ico}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.82rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                          {txTypeLabel(f.transaction_type)}
                          {f.client_name && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> · {f.client_name}</span>}
                        </div>
                        {(f.product_name || f.description) && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {f.product_name ? `${f.product_name} × ${fmt(f.quantity)}` : f.description}
                          </div>
                        )}
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: col }}>
                          {parseFloat(f.amount_uzs) ? `${fmt(f.amount_uzs)} so'm` : parseFloat(f.amount_usd) ? `$${fmt(f.amount_usd)}` : '—'}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{timeAgo(f.created_at)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ErpSection>
          </div>
        )}
      </div>
    </div>
  );
}
