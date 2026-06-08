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

// Vaqt formatlash i18n bilan
const makeTimeAgo = (t) => (iso) => {
  if (!iso) return '';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return t('dashboard.feed.sec_ago', { n: diff });
  if (diff < 3600) return t('dashboard.feed.min_ago', { n: Math.floor(diff / 60) });
  if (diff < 86400) return t('dashboard.feed.hour_ago', { n: Math.floor(diff / 3600) });
  return t('dashboard.feed.day_ago', { n: Math.floor(diff / 86400) });
};

const txTypeIcon = {
  sotuv: '🛒', sotuv_nasiya: '🛒',
  xarid: '📥', xarid_nasiya: '📥',
  tulov_kirim: '💵', tulov_chiqim: '💸',
  opening_balance: '⚖️',
};
const makeTxTypeLabel = (t) => (type) => {
  const icon = txTypeIcon[type] || '';
  return `${icon} ${t(`dashboard.tx_type.${type}`, { defaultValue: type })}`.trim();
};

// Mini sparkline chart (pure SVG, no dependency)
const Sparkline = ({ data, color = '#3b82f6', height = 60 }) => {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data, 1);
  const w = 100, h = height;
  const step = w / (data.length - 1 || 1);
  const points = data.map((v, i) => `${(i * step).toFixed(2)},${(h - (v / max) * h * 0.95).toFixed(2)}`).join(' ');
  const areaPoints = `0,${h} ${points} ${w},${h}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height: h }}>
      <polygon points={areaPoints} fill={color} opacity="0.15" />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
};

// Full chart with dual line
const LineChart = ({ labels, sales, purchases, height = 220 }) => {
  if (!labels || labels.length === 0) return null;
  const max = Math.max(...sales, ...purchases, 1);
  const w = 800, h = height;
  const padL = 50, padR = 10, padT = 10, padB = 30;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const step = plotW / (labels.length - 1 || 1);

  const pathFor = (arr) => arr.map((v, i) =>
    `${i === 0 ? 'M' : 'L'} ${(padL + i * step).toFixed(2)},${(padT + plotH - (v / max) * plotH).toFixed(2)}`
  ).join(' ');

  // Y axis ticks
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(t => ({
    y: padT + plotH - t * plotH,
    v: t * max,
  }));

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 'auto', maxHeight: h + 20 }}>
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={padL} y1={t.y} x2={w - padR} y2={t.y} stroke="#e5e7eb" strokeWidth="1" strokeDasharray="3 3" />
          <text x={padL - 5} y={t.y + 4} textAnchor="end" fontSize="10" fill="#64748b">
            {t.v >= 1e6 ? (t.v / 1e6).toFixed(1) + 'M' : t.v >= 1e3 ? (t.v / 1e3).toFixed(0) + 'k' : t.v.toFixed(0)}
          </text>
        </g>
      ))}
      <path d={pathFor(sales)} fill="none" stroke="#16a34a" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      <path d={pathFor(purchases)} fill="none" stroke="#dc2626" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      {/* x labels — only first, middle, last */}
      {[0, Math.floor(labels.length / 2), labels.length - 1].map(i => (
        <text key={i} x={padL + i * step} y={h - 10} textAnchor="middle" fontSize="10" fill="#64748b">
          {labels[i]?.slice(5)}
        </text>
      ))}
    </svg>
  );
};

// KPI Card — POS style with colored icon box
const KpiCard = ({ icon, label, valueUZS, valueUSD, change, color, link, subtitle }) => (
  <Link to={link || '#'} style={{ textDecoration: 'none', color: 'inherit' }}>
    <div style={{
      background: '#fff', borderRadius: 10, padding: '1rem 1.25rem',
      boxShadow: '0 2px 10px rgba(0,0,0,0.06)', border: '1px solid #e8ecf1',
      transition: 'box-shadow 0.2s, transform 0.2s', cursor: 'pointer', height: '100%',
      display: 'flex', alignItems: 'center', gap: '0.875rem',
    }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.1)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 2px 10px rgba(0,0,0,0.06)'; e.currentTarget.style.transform = 'translateY(0)'; }}
    >
      <div style={{
        width: 40, height: 40, borderRadius: 9, flexShrink: 0,
        background: color + '1a', border: `1.5px solid ${color}33`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', color,
      }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>
          {fmt(valueUZS)} <small style={{ fontSize: '0.68rem', fontWeight: 500, color: '#94a3b8' }}>so'm</small>
        </div>
        {valueUSD !== undefined && parseFloat(valueUSD) !== 0 && (
          <div style={{ fontSize: '0.85rem', fontWeight: 600, color }}>${fmt(valueUSD)}</div>
        )}
        {subtitle && <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 2 }}>{subtitle}</div>}
      </div>
      {change !== undefined && change !== null && (
        <div style={{
          fontSize: '0.75rem', fontWeight: 700, padding: '3px 7px', borderRadius: 20, flexShrink: 0,
          color: change >= 0 ? '#16a34a' : '#ef4444',
          background: change >= 0 ? '#f0fdf4' : '#fef2f2',
        }}>
          {change >= 0 ? '↑' : '↓'} {Math.abs(change)}%
        </div>
      )}
    </div>
  </Link>
);

// Quick Action Card
const QuickAction = ({ icon, label, bg, link }) => (
  <Link to={link} style={{ textDecoration: 'none' }}>
    <div style={{
      background: bg, borderRadius: 8, padding: '0.625rem 1rem',
      display: 'flex', alignItems: 'center', gap: '0.5rem',
      cursor: 'pointer', transition: 'filter 0.15s, transform 0.15s',
      color: '#fff', fontWeight: 600, fontSize: '0.85rem',
      boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
    }}
      onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.1)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={e => { e.currentTarget.style.filter = 'brightness(1)'; e.currentTarget.style.transform = 'translateY(0)'; }}
    >
      <span style={{ display: 'flex', alignItems: 'center' }}>{icon}</span>
      <span>{label}</span>
    </div>
  </Link>
);

const Section = ({ title, icon, children, action }) => (
  <div style={{ background: '#fff', borderRadius: 12, padding: '1.25rem 1.375rem', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid #e8ecf1', marginBottom: '1rem' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
      <h3 style={{ margin: 0, fontSize: '1rem', color: '#1e293b', fontWeight: 700 }}>
        {icon} {title}
      </h3>
      {action}
    </div>
    {children}
  </div>
);

export default function Dashboard() {
  const { authFetch, user, business } = useAuth();
  const { t, i18n } = useTranslation();
  const timeAgo = makeTimeAgo(t);
  const txTypeLabel = makeTxTypeLabel(t);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastFetch, setLastFetch] = useState(null);

  // Chart sana filterlari
  const get30DaysAgo = () => {
    const d = new Date(); d.setDate(d.getDate() - 29);
    return d.toISOString().split('T')[0];
  };
  const getToday = () => new Date().toISOString().split('T')[0];
  const [chartFrom, setChartFrom] = useState(get30DaysAgo());
  const [chartTo, setChartTo] = useState(getToday());

  const yuklash = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (chartFrom) params.set('chart_from', chartFrom);
      if (chartTo) params.set('chart_to', chartTo);
      const res = await authFetch(`${API_URL}/api/dashboard?${params.toString()}`);
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || 'Dashboard yuklanmadi');
      }
      setData(await res.json());
      setError(null);
      setLastFetch(new Date());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [authFetch, chartFrom, chartTo]);

  useEffect(() => {
    yuklash();
    const id = setInterval(yuklash, 60000); // har 60 soniyada
    return () => clearInterval(id);
  }, [yuklash]);

  if (loading && !data) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <span className="loading-text">{t('dashboard.loading')}</span>
      </div>
    );
  }

  if (error) {
    return <div className="error-message">⚠️ {t('dashboard.error')}: {error}</div>;
  }

  if (!data) return null;

  const role = data.role;
  const isAdmin = role === 'admin';
  const isSeller = role === 'seller';
  const isSupplierAgent = role === 'supplier_agent';
  const isWarehouse = role === 'warehouse_keeper';

  const roleIcon = { admin: '👑', seller: '🛒', supplier_agent: '📥', warehouse_keeper: '📦' }[role] || '';
  const roleLabel = `${roleIcon} ${t(`roles.${role}`, { defaultValue: role })}`.trim();

  // Til kodi locale uchun (sana formatlash)
  const dateLocale = i18n.language === 'ru' ? 'ru-RU' : i18n.language === 'uz-cyrillic' ? 'uz-Cyrl' : 'uz-UZ';

  const salesChange = data.kpi.yesterday_sales_uzs !== undefined
    ? pct(data.kpi.today_sales_uzs, data.kpi.yesterday_sales_uzs) : null;

  return (
    <div className="page-section fade-in">

      {/* ─── GREETING BANNER (POS style) ─── */}
      <div style={{
        background: 'linear-gradient(135deg, #1e3a5f 0%, #1a2332 60%, #0f172a 100%)',
        borderRadius: 14, padding: '1.5rem 2rem', marginBottom: '1.25rem',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: '1rem', boxShadow: '0 4px 20px rgba(30,58,95,0.3)',
      }}>
        <div>
          <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.85rem', marginBottom: 4 }}>
            {new Date().toLocaleDateString(dateLocale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
          <h2 style={{ margin: 0, fontSize: '1.5rem', color: '#ffffff', fontWeight: 800 }}>
            👋 {t('dashboard.greeting', { name: user?.full_name || user?.username })}
          </h2>
          <p style={{ margin: '4px 0 0 0', color: 'rgba(255,255,255,0.6)', fontSize: '0.875rem' }}>
            {roleLabel} · {business?.business_name}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {lastFetch && <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.45)' }}>🔄 {timeAgo(lastFetch)}</span>}
          <button onClick={yuklash} style={{
            background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8,
            padding: '8px 16px', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(59,130,246,0.4)',
          }}>{t('dashboard.refresh')}</button>
        </div>
      </div>

      {/* ─── KPI CARDS ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '0.875rem', marginBottom: '1.25rem' }}>
        {(isAdmin || isSeller) && (
          <KpiCard icon={<IcoSales />} label={t('dashboard.kpi.today_sales')} color="#16a34a" link="/sotuv"
            valueUZS={data.kpi.today_sales_uzs} valueUSD={data.kpi.today_sales_usd}
            change={salesChange}
            subtitle={t('dashboard.kpi.month_total', { value: fmt(data.kpi.month_sales_uzs) + " so'm" })} />
        )}
        {(isAdmin || isSupplierAgent) && (
          <KpiCard icon={<IcoPurchases />} label={t('dashboard.kpi.today_purchases')} color="#ef4444" link="/xarid"
            valueUZS={data.kpi.today_purchases_uzs} valueUSD={data.kpi.today_purchases_usd}
            subtitle={t('dashboard.kpi.month_total', { value: fmt(data.kpi.month_purchases_uzs) + " so'm" })} />
        )}
        {isAdmin && (
          <KpiCard icon={<IcoKassa />} label={t('dashboard.kpi.cash_balance')} color="#0ea5e9" link="/kassa"
            valueUZS={data.kpi.cash_uzs} valueUSD={data.kpi.cash_usd} />
        )}
        {(isAdmin || isWarehouse) && (
          <KpiCard icon={<IcoProducts />} label={t('dashboard.kpi.inventory_value')} color="#8b5cf6" link="/mahsulotlar"
            valueUZS={data.kpi.inventory_value_uzs} valueUSD={data.kpi.inventory_value_usd}
            subtitle={t('dashboard.kpi.products_qty', { count: data.kpi.total_products || 0, qty: fmt(data.kpi.total_qty) })} />
        )}
        {(isAdmin || isSeller) && data.kpi.receivables_uzs !== undefined && (
          <KpiCard icon={<IcoClients />} label={t('dashboard.kpi.receivables')} color="#10b981" link="/klientlar"
            valueUZS={data.kpi.receivables_uzs} valueUSD={data.kpi.receivables_usd} />
        )}
        {(isAdmin || isSupplierAgent) && data.kpi.payables_uzs !== undefined && (
          <KpiCard icon={<IcoSuppliers />} label={t('dashboard.kpi.payables')} color="#f59e0b" link="/pudratchilar"
            valueUZS={data.kpi.payables_uzs} valueUSD={data.kpi.payables_usd} />
        )}
      </div>

      {/* ─── TEZKOR AMALLAR (Quick Actions — POS style) ─── */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        {(isAdmin || isSeller) && <QuickAction icon={<IcoSales />} label={t('dashboard.actions.new_sale')} bg="#16a34a" link="/sotuv" />}
        {(isAdmin || isSupplierAgent) && <QuickAction icon={<IcoPurchases />} label={t('dashboard.actions.new_purchase')} bg="#ef4444" link="/xarid" />}
        {isAdmin && <QuickAction icon={<IcoKassa />} label={t('dashboard.actions.kassa')} bg="#0ea5e9" link="/kassa" />}
        <QuickAction icon={<IcoProducts />} label={t('dashboard.actions.products')} bg="#8b5cf6" link="/mahsulotlar" />
        <QuickAction icon={<IcoClients />} label={t('nav.clients')} bg="#f59e0b" link="/klientlar" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1rem' }}>

        {/* ─── GRAFIK ─── */}
        {data.chart && data.chart.labels && data.chart.labels.length > 0 && (
          <div style={{ gridColumn: '1 / -1' }}>
            <Section title={t('dashboard.chart.title')} icon={<IcoChart />}
              action={
                <div style={{ display: 'flex', gap: '1rem', fontSize: '0.85rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <input type="date" value={chartFrom} onChange={e => setChartFrom(e.target.value)}
                    style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: '0.8rem', fontWeight: 600 }} />
                  <span style={{ color: '#94a3b8' }}>—</span>
                  <input type="date" value={chartTo} onChange={e => setChartTo(e.target.value)}
                    style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: '0.8rem', fontWeight: 600 }} />
                  <span style={{ marginLeft: '0.5rem' }}><span style={{ display: 'inline-block', width: 10, height: 10, background: '#16a34a', borderRadius: 2, marginRight: 4 }}></span>{t('dashboard.chart.sales')}</span>
                  <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#dc2626', borderRadius: 2, marginRight: 4 }}></span>{t('dashboard.chart.purchases')}</span>
                </div>
              }
            >
              <LineChart labels={data.chart.labels} sales={data.chart.sales_uzs} purchases={data.chart.purchases_uzs} />
            </Section>
          </div>
        )}

        {/* ─── ALERTS: Qarzdor mijozlar ─── */}
        {data.alerts.debtors && data.alerts.debtors.length > 0 && (
          <Section title={t('dashboard.alerts.debtors', { count: data.alerts.debtors.length })} icon={<IcoClients />}
            action={<Link to="/klientlar" style={{ fontSize: '0.85rem', color: '#3b82f6' }}>{t('dashboard.alerts.all_link')}</Link>}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.alerts.debtors.slice(0, 7).map(d => (
                <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#fef2f2', borderRadius: 8, borderLeft: '3px solid #dc2626' }}>
                  <span style={{ fontWeight: 600, color: '#1e293b' }}>{d.full_name}</span>
                  <span style={{ color: '#b91c1c', fontWeight: 700 }}>{fmt(d.balance_uzs)} so'm</span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* ─── ALERTS: To'lash kerak pudratchilar ─── */}
        {data.alerts.payables && data.alerts.payables.length > 0 && (
          <Section title={t('dashboard.alerts.payables', { count: data.alerts.payables.length })} icon={<IcoSuppliers />}
            action={<Link to="/pudratchilar" style={{ fontSize: '0.85rem', color: '#3b82f6' }}>{t('dashboard.alerts.all_link')}</Link>}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.alerts.payables.slice(0, 7).map(d => (
                <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#fff7ed', borderRadius: 8, borderLeft: '3px solid #ea580c' }}>
                  <span style={{ fontWeight: 600, color: '#1e293b' }}>{d.full_name}</span>
                  <span style={{ color: '#c2410c', fontWeight: 700 }}>{fmt(d.balance_uzs)} so'm</span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* ─── ALERTS: Kam qolgan mahsulotlar ─── */}
        {data.alerts.low_stock && data.alerts.low_stock.length > 0 && (
          <Section title={t('dashboard.alerts.low_stock', { count: data.alerts.low_stock.length })} icon={<IcoProducts />}
            action={<Link to="/mahsulotlar" style={{ fontSize: '0.85rem', color: '#3b82f6' }}>{t('dashboard.alerts.warehouse_link')}</Link>}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.alerts.low_stock.slice(0, 7).map(p => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#fffbeb', borderRadius: 8, borderLeft: '3px solid #f59e0b' }}>
                  <span style={{ fontWeight: 600, color: '#1e293b' }}>{p.name}</span>
                  <span style={{ color: p.quantity < 1 ? '#dc2626' : '#d97706', fontWeight: 700 }}>
                    {fmt(p.quantity)} {t('dashboard.top.qty_unit')}
                  </span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* ─── TOP mahsulotlar ─── */}
        {data.top.products && data.top.products.length > 0 && (
          <Section title={t('dashboard.top.products')} icon="🏆">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {data.top.products.slice(0, 7).map((p, i) => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: i === 0 ? '#fef3c7' : '#f8fafc', borderRadius: 6 }}>
                  <span><strong style={{ color: i < 3 ? '#b45309' : '#475569' }}>#{i + 1}</strong> {p.name}</span>
                  <span style={{ fontSize: '0.85rem', color: '#475569' }}>
                    {fmt(p.qty_sold)} {t('dashboard.top.qty_unit')} · <strong style={{ color: '#16a34a' }}>{fmt(p.revenue_uzs)}</strong>
                  </span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* ─── TOP mijozlar ─── */}
        {data.top.clients && data.top.clients.length > 0 && (
          <Section title={t('dashboard.top.clients')} icon="👑">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {data.top.clients.slice(0, 7).map((c, i) => (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: i === 0 ? '#fef3c7' : '#f8fafc', borderRadius: 6 }}>
                  <span><strong style={{ color: i < 3 ? '#b45309' : '#475569' }}>#{i + 1}</strong> {c.full_name}</span>
                  <strong style={{ color: '#16a34a' }}>{fmt(c.turnover_uzs)} so'm</strong>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* ─── TOP pudratchilar ─── */}
        {data.top.suppliers && data.top.suppliers.length > 0 && (
          <Section title={t('dashboard.top.suppliers')} icon="🏭">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {data.top.suppliers.slice(0, 7).map((s, i) => (
                <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: i === 0 ? '#fef3c7' : '#f8fafc', borderRadius: 6 }}>
                  <span><strong style={{ color: i < 3 ? '#b45309' : '#475569' }}>#{i + 1}</strong> {s.full_name}</span>
                  <strong style={{ color: '#dc2626' }}>{fmt(s.turnover_uzs)} so'm</strong>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* ─── SO'NGGI FAOLLIK (Feed) ─── */}
        {data.feed && data.feed.length > 0 && (
          <div style={{ gridColumn: (isWarehouse ? '1 / -1' : 'auto') }}>
            <Section title={t('dashboard.feed.title')} icon="⚡">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 400, overflowY: 'auto' }}>
                {data.feed.map(f => (
                  <div key={f.id} style={{ display: 'flex', gap: 10, padding: '8px 10px', borderBottom: '1px solid #f1f5f9' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.9rem', color: '#1e293b' }}>
                        <strong>{txTypeLabel(f.transaction_type)}</strong>
                        {f.user_name && <span style={{ color: '#64748b' }}> · {f.user_name}</span>}
                        {f.client_name && <span style={{ color: '#64748b' }}> → {f.client_name}</span>}
                      </div>
                      {f.product_name && <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{f.product_name} × {fmt(f.quantity)}</div>}
                      {f.description && !f.product_name && <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{f.description}</div>}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.9rem' }}>
                        {parseFloat(f.amount_uzs) ? `${fmt(f.amount_uzs)} so'm` : parseFloat(f.amount_usd) ? `$${fmt(f.amount_usd)}` : '—'}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{timeAgo(f.created_at)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          </div>
        )}
      </div>

    </div>
  );
}
