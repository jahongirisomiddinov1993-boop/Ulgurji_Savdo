import React, { useState, useEffect } from 'react';

function hozirgiVaqt() {
  const hozir = new Date();
  return {
    vaqt: hozir.toLocaleTimeString('uz-UZ', {
      timeZone: 'Asia/Tashkent',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }),
    sana: hozir.toLocaleDateString('uz-UZ', {
      timeZone: 'Asia/Tashkent',
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }),
  };
}

export default function KopVaqtSoat() {
  const [vaqt, setVaqt] = useState(hozirgiVaqt());

  useEffect(() => {
    const interval = setInterval(() => setVaqt(hozirgiVaqt()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="clock-bar" id="clock-bar">
      <span className="clock-bar-flag">🇺🇿</span>
      <span className="clock-bar-label">Toshkent</span>
      <span className="clock-bar-time">{vaqt.vaqt}</span>
      <span className="clock-bar-date">{vaqt.sana}</span>
    </div>
  );
}