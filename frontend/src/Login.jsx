import React from 'react';
import { useTranslation } from 'react-i18next';
import { SignIn } from '@clerk/clerk-react';
import LanguageSwitcher from './LanguageSwitcher';

export default function Login() {
  const { t } = useTranslation();

  return (
    <div className="login-page">
      <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 10 }}>
        <LanguageSwitcher />
      </div>
      <div className="login-card fade-in">
        <div className="login-logo-area">
          <div className="login-logo-icon">📦</div>
          <h1 className="login-title">{t('app.title')}</h1>
          <p className="login-subtitle">{t('login.subtitle_login')}</p>
        </div>
        <SignIn />
      </div>
    </div>
  );
}
