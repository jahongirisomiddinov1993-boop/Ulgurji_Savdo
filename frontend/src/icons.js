import React from 'react';

export const Ico = ({ d, s = 18 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {(Array.isArray(d) ? d : [d]).map((path, i) => <path key={i} d={path} />)}
  </svg>
);

export const PageIcon = ({ icon, color = '#3b82f6' }) => (
  <div style={{
    width: 32, height: 32, borderRadius: 8, flexShrink: 0,
    background: color + '1a',
    border: `1.5px solid ${color}33`,
    display: 'flex', alignItems: 'center', justifyContent: 'center', color,
  }}>
    {icon}
  </div>
);

export const IcoHome      = () => <Ico d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10" />;
export const IcoSales     = () => <Ico d={["M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z","M3 6h18","M16 10a4 4 0 0 1-8 0"]} />;
export const IcoPurchases = () => <Ico d={["M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z","M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"]} />;
export const IcoKassa     = () => <Ico d={["M2 9h20v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9z","M2 9V7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v2","M12 13v4M10 15h4"]} />;
export const IcoAkt       = () => <Ico d={["M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z","M14 2v6h6","M16 13H8M16 17H8M10 9H8"]} />;
export const IcoProducts  = () => <Ico d={["M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 2 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z","M3.27 6.96L12 12.01l8.73-5.05","M12 22.08V12"]} />;
export const IcoClients   = () => <Ico d={["M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2","M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z","M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"]} />;
export const IcoSuppliers = () => <Ico d={["M1 3h15v13H1zM16 8h4l3 3v5h-7V8z","M5.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM18.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"]} />;
export const IcoBalance   = () => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/>
    <path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/>
    <path d="M7 21h10"/>
    <line x1="12" y1="21" x2="12" y2="5"/>
    <path d="M3 5l9-3 9 3"/>
  </svg>
);
export const IcoCoin      = () => <Ico d={["M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z","M12 6v6l4 2"]} />;
export const IcoTrend     = () => <Ico d={["M22 12h-4l-3 9L9 3l-3 9H2"]} />;
export const IcoChart     = () => <Ico d={["M18 20V10M12 20V4M6 20v-6"]} />;
export const IcoDownload  = () => <Ico d={["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4","M7 10l5 5 5-5","M12 15V3"]} />;
export const IcoUpload    = () => <Ico d={["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4","M17 8l-5-5-5 5","M12 3v12"]} />;
export const IcoDatabase  = () => <Ico d={["M12 2C6.48 2 2 4.24 2 7s4.48 5 10 5 10-2.24 10-5-4.48-5-10-5z","M2 7v5c0 2.76 4.48 5 10 5s10-2.24 10-5V7","M2 12v5c0 2.76 4.48 5 10 5s10-2.24 10-5v-5"]} />;
export const IcoBriefcase = () => <Ico d={["M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z","M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"]} />;
export const IcoShield    = () => <Ico d={["M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"]} />;
export const IcoList      = () => <Ico d={["M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"]} />;
export const IcoSettings  = () => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);
