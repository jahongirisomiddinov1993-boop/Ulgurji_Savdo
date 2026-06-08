import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from './AuthContext';
import { PageIcon, IcoSettings, IcoDatabase, IcoBriefcase, IcoShield, IcoList } from './icons';

const API = process.env.REACT_APP_API_URL || 'http://localhost:5000';

export default function Sozlamalar() {
  const { t } = useTranslation();
  const { authFetch, user } = useAuth();
  const fileInputRef = useRef(null);

  const [activeTab, setActiveTab] = useState('database');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  // Business settings state
  const [settings, setSettings] = useState({
    company_name: '', phone: '', address: '',
    default_currency: 'UZS', default_exchange_rate: 0,
    low_stock_threshold: 10, receipt_format: 'A4'
  });

  // Password change state
  const [passwords, setPasswords] = useState({ current: '', new_pw: '', confirm: '' });

  // Audit log state
  const [auditLog, setAuditLog] = useState([]);

  // Restore confirm modal
  const [restoreConfirm, setRestoreConfirm] = useState(false);
  const [restoreData, setRestoreData] = useState(null);

  const showMessage = (text, type = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage({ text: '', type: '' }), 5000);
  };

  // Load settings
  useEffect(() => {
    if (user?.role === 'admin') {
      loadSettings();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadSettings = async () => {
    try {
      const res = await authFetch(`${API}/api/settings`);
      if (res.ok) {
        const data = await res.json();
        setSettings({
          company_name: data.company_name || '',
          phone: data.phone || '',
          address: data.address || '',
          default_currency: data.default_currency || 'UZS',
          default_exchange_rate: data.default_exchange_rate || 0,
          low_stock_threshold: data.low_stock_threshold || 10,
          receipt_format: data.receipt_format || 'A4',
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const loadAuditLog = async () => {
    try {
      const res = await authFetch(`${API}/api/settings/audit-log`);
      if (res.ok) {
        const data = await res.json();
        setAuditLog(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Save settings
  const saveSettings = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await authFetch(`${API}/api/settings`, {
        method: 'PUT',
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        showMessage(t('settings_page.messages.settings_saved'));
      } else {
        const err = await res.json();
        showMessage(err.error || t('settings_page.messages.error'), 'error');
      }
    } catch (err) {
      showMessage(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Change password
  const changePassword = async (e) => {
    e.preventDefault();
    if (passwords.new_pw !== passwords.confirm) {
      showMessage(t('settings_page.messages.password_mismatch'), 'error');
      return;
    }
    if (passwords.new_pw.length < 6) {
      showMessage(t('settings_page.messages.password_short'), 'error');
      return;
    }
    setLoading(true);
    try {
      const res = await authFetch(`${API}/api/settings/change-password`, {
        method: 'POST',
        body: JSON.stringify({ current_password: passwords.current, new_password: passwords.new_pw }),
      });
      const data = await res.json();
      if (res.ok) {
        showMessage(data.message || t('settings_page.messages.password_changed'));
        setPasswords({ current: '', new_pw: '', confirm: '' });
      } else {
        showMessage(data.error || t('settings_page.messages.error'), 'error');
      }
    } catch (err) {
      showMessage(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Backup (download)
  const handleBackup = async () => {
    setLoading(true);
    try {
      const res = await authFetch(`${API}/api/settings/backup`);
      if (res.ok) {
        const data = await res.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `backup_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showMessage(t('settings_page.messages.backup_success'));
      } else {
        const err = await res.json();
        showMessage(err.error || t('settings_page.messages.error'), 'error');
      }
    } catch (err) {
      showMessage(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Restore (upload) — step 1: file select
  const handleRestoreFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        if (!parsed.data || !parsed.data.products || !parsed.data.clients) {
          showMessage(t('settings_page.messages.invalid_backup'), 'error');
          return;
        }
        setRestoreData(parsed);
        setRestoreConfirm(true);
      } catch {
        showMessage(t('settings_page.messages.invalid_file'), 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Restore — step 2: confirm and send
  const handleRestoreConfirm = async () => {
    setRestoreConfirm(false);
    setLoading(true);
    try {
      const res = await authFetch(`${API}/api/settings/restore`, {
        method: 'POST',
        body: JSON.stringify(restoreData),
      });
      const result = await res.json();
      if (res.ok) {
        showMessage(`${t('settings_page.messages.restore_success')} (${result.stats.products} ${t('settings_page.database.products')}, ${result.stats.clients} ${t('settings_page.database.clients')})`);
      } else {
        showMessage(result.error || t('settings_page.messages.error'), 'error');
      }
    } catch (err) {
      showMessage(err.message, 'error');
    } finally {
      setLoading(false);
      setRestoreData(null);
    }
  };

  const isAdmin = user?.role === 'admin';

  const tabs = [
    { key: 'database', label: t('settings_page.tabs.database'), icon: <IcoDatabase />, adminOnly: true },
    { key: 'business', label: t('settings_page.tabs.business'), icon: <IcoBriefcase />, adminOnly: true },
    { key: 'security', label: t('settings_page.tabs.security'), icon: <IcoShield />, adminOnly: false },
    { key: 'system', label: t('settings_page.tabs.system'), icon: <IcoSettings />, adminOnly: true },
    { key: 'audit', label: t('settings_page.tabs.audit'), icon: <IcoList />, adminOnly: true },
  ].filter(tab => !tab.adminOnly || isAdmin);

  const actionLabels = {
    settings_update: t('settings_page.audit_actions.settings_update'),
    password_change: t('settings_page.audit_actions.password_change'),
    backup_export: t('settings_page.audit_actions.backup_export'),
    backup_restore: t('settings_page.audit_actions.backup_restore'),
  };

  return (
    <div className="page-section fade-in">
      <div className="section-header">
        <div className="section-title-row">
          <PageIcon icon={<IcoSettings />} color="#6366f1" />
          <h2 className="section-title">{t('settings_page.title')}</h2>
        </div>
      </div>

      {message.text && (
        <div className={`settings-message ${message.type === 'error' ? 'settings-message-error' : 'settings-message-success'}`}>
          {message.type === 'error' ? '❌' : '✅'} {message.text}
        </div>
      )}

      {/* Tabs */}
      <div className="settings-tabs">
        {tabs.map(tab => (
          <button
            key={tab.key}
            className={`settings-tab ${activeTab === tab.key ? 'settings-tab-active' : ''}`}
            onClick={() => {
              setActiveTab(tab.key);
              if (tab.key === 'audit') loadAuditLog();
            }}
          >
            <span>{tab.icon}</span> {tab.label}
          </button>
        ))}
      </div>

      {/* ========== DATABASE TAB ========== */}
      {activeTab === 'database' && isAdmin && (
        <div className="settings-section">
          <h3 style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}><IcoDatabase /> {t('settings_page.database.title')}</h3>
          <p className="settings-desc">{t('settings_page.database.description')}</p>

          <div className="settings-db-actions">
            {/* Export */}
            <div className="settings-db-card">
              <div className="settings-db-card-icon" style={{ color: '#3b82f6', display:'flex', justifyContent:'center' }}><svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></div>
              <h4>{t('settings_page.database.export_title')}</h4>
              <p>{t('settings_page.database.export_desc')}</p>
              <button className="btn btn-primary" onClick={handleBackup} disabled={loading}>
                {loading ? '⏳...' : `📥 ${t('settings_page.database.export_btn')}`}
              </button>
            </div>

            {/* Import */}
            <div className="settings-db-card">
              <div className="settings-db-card-icon" style={{ color: '#f59e0b', display:'flex', justifyContent:'center' }}><svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></div>
              <h4>{t('settings_page.database.import_title')}</h4>
              <p>{t('settings_page.database.import_desc')}</p>
              <input
                type="file"
                accept=".json"
                ref={fileInputRef}
                onChange={handleRestoreFileSelect}
                style={{ display: 'none' }}
              />
              <button
                className="btn btn-warning"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
              >
                {loading ? '⏳...' : `📤 ${t('settings_page.database.import_btn')}`}
              </button>
            </div>
          </div>

          {/* Restore confirm modal */}
          {restoreConfirm && restoreData && (
            <div className="modal-overlay" onClick={() => setRestoreConfirm(false)}>
              <div className="settings-confirm-modal" onClick={e => e.stopPropagation()}>
                <h3>⚠️ {t('settings_page.database.confirm_title')}</h3>
                <p>{t('settings_page.database.confirm_text')}</p>
                <div className="settings-confirm-stats">
                  <div>📦 {t('settings_page.database.products')}: <strong>{restoreData.data.products.length}</strong></div>
                  <div>👥 {t('settings_page.database.clients')}: <strong>{restoreData.data.clients.length}</strong></div>
                  <div>📊 {t('settings_page.database.transactions')}: <strong>{restoreData.data.transactions.length}</strong></div>
                  <div>💰 {t('settings_page.database.kassa')}: <strong>{restoreData.data.kassa.length}</strong></div>
                </div>
                {restoreData.created_at && (
                  <p className="settings-confirm-date">
                    📅 {t('settings_page.database.backup_date')}: {new Date(restoreData.created_at).toLocaleString()}
                  </p>
                )}
                <div className="settings-confirm-buttons">
                  <button className="btn btn-danger" onClick={handleRestoreConfirm}>
                    ✅ {t('settings_page.database.confirm_yes')}
                  </button>
                  <button className="btn" onClick={() => setRestoreConfirm(false)}>
                    ❌ {t('settings_page.database.confirm_no')}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========== BUSINESS TAB ========== */}
      {activeTab === 'business' && isAdmin && (
        <div className="settings-section">
          <h3 style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}><IcoBriefcase /> {t('settings_page.business.title')}</h3>
          <form className="settings-form" onSubmit={saveSettings}>
            <div className="form-grid">
              <div className="form-group">
                <label>{t('settings_page.business.company_name')}</label>
                <input type="text" value={settings.company_name}
                  onChange={e => setSettings({ ...settings, company_name: e.target.value })}
                  placeholder={t('settings_page.business.company_name_ph')} />
              </div>
              <div className="form-group">
                <label>{t('settings_page.business.phone')}</label>
                <input type="text" value={settings.phone}
                  onChange={e => setSettings({ ...settings, phone: e.target.value })}
                  placeholder="+998..." />
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>{t('settings_page.business.address')}</label>
                <input type="text" value={settings.address}
                  onChange={e => setSettings({ ...settings, address: e.target.value })}
                  placeholder={t('settings_page.business.address_ph')} />
              </div>
              <div className="form-group">
                <label>{t('settings_page.business.default_currency')}</label>
                <select value={settings.default_currency}
                  onChange={e => setSettings({ ...settings, default_currency: e.target.value })}>
                  <option value="UZS">UZS (so'm)</option>
                  <option value="USD">USD ($)</option>
                </select>
              </div>
              <div className="form-group">
                <label>{t('settings_page.business.exchange_rate')}</label>
                <input type="number" value={settings.default_exchange_rate}
                  onChange={e => setSettings({ ...settings, default_exchange_rate: parseFloat(e.target.value) || 0 })}
                  placeholder="12800" />
              </div>
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading} style={{ marginTop: 16 }}>
              {loading ? '⏳...' : `💾 ${t('settings_page.business.save')}`}
            </button>
          </form>
        </div>
      )}

      {/* ========== SECURITY TAB ========== */}
      {activeTab === 'security' && (
        <div className="settings-section">
          <h3 style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}><IcoShield /> {t('settings_page.security.title')}</h3>
          <form className="settings-form" onSubmit={changePassword}>
            <div className="form-grid">
              <div className="form-group">
                <label>{t('settings_page.security.current_password')}</label>
                <input type="password" value={passwords.current}
                  onChange={e => setPasswords({ ...passwords, current: e.target.value })}
                  required />
              </div>
              <div className="form-group">
                <label>{t('settings_page.security.new_password')}</label>
                <input type="password" value={passwords.new_pw}
                  onChange={e => setPasswords({ ...passwords, new_pw: e.target.value })}
                  required minLength={6} />
              </div>
              <div className="form-group">
                <label>{t('settings_page.security.confirm_password')}</label>
                <input type="password" value={passwords.confirm}
                  onChange={e => setPasswords({ ...passwords, confirm: e.target.value })}
                  required minLength={6} />
              </div>
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading} style={{ marginTop: 16 }}>
              {loading ? '⏳...' : `🔑 ${t('settings_page.security.change_btn')}`}
            </button>
          </form>
        </div>
      )}

      {/* ========== SYSTEM TAB ========== */}
      {activeTab === 'system' && isAdmin && (
        <div className="settings-section">
          <h3 style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}><IcoSettings /> {t('settings_page.system.title')}</h3>
          <form className="settings-form" onSubmit={saveSettings}>
            <div className="form-grid">
              <div className="form-group">
                <label>{t('settings_page.system.low_stock')}</label>
                <input type="number" value={settings.low_stock_threshold}
                  onChange={e => setSettings({ ...settings, low_stock_threshold: parseInt(e.target.value) || 10 })}
                  min="1" />
                <small className="form-hint">{t('settings_page.system.low_stock_hint')}</small>
              </div>
              <div className="form-group">
                <label>{t('settings_page.system.receipt_format')}</label>
                <select value={settings.receipt_format}
                  onChange={e => setSettings({ ...settings, receipt_format: e.target.value })}>
                  <option value="A4">A4</option>
                  <option value="80mm">80mm ({t('settings_page.system.thermal')})</option>
                  <option value="58mm">58mm ({t('settings_page.system.thermal')})</option>
                </select>
              </div>
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading} style={{ marginTop: 16 }}>
              {loading ? '⏳...' : `💾 ${t('settings_page.system.save')}`}
            </button>
          </form>
        </div>
      )}

      {/* ========== AUDIT LOG TAB ========== */}
      {activeTab === 'audit' && isAdmin && (
        <div className="settings-section">
          <h3 style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}><IcoList /> {t('settings_page.audit.title')}</h3>
          <button className="btn btn-sm" onClick={loadAuditLog} style={{ marginBottom: 12 }}>
            🔄 {t('settings_page.audit.refresh')}
          </button>
          {auditLog.length === 0 ? (
            <p className="text-muted">{t('settings_page.audit.empty')}</p>
          ) : (
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('settings_page.audit.date')}</th>
                    <th>{t('settings_page.audit.user')}</th>
                    <th>{t('settings_page.audit.action')}</th>
                    <th>{t('settings_page.audit.details')}</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLog.map(log => (
                    <tr key={log.id}>
                      <td>{new Date(log.created_at).toLocaleString()}</td>
                      <td>{log.user_name || log.username || '—'}</td>
                      <td>
                        <span className={`audit-badge audit-badge-${log.action}`}>
                          {actionLabels[log.action] || log.action}
                        </span>
                      </td>
                      <td>{log.details || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
