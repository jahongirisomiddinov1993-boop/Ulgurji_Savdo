import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth as useClerkAuth } from '@clerk/clerk-react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const AuthContext = createContext(null);

/**
 * useAuth — Auth holatini olish uchun hook
 * Qaytaradi: { user, token, business, login, register, logout, authFetch, loading }
 */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth faqat AuthProvider ichida ishlatilishi mumkin');
  return ctx;
}

/**
 * AuthProvider — Clerk authentication va backend user/business holatini boshqarish
 *
 * - Clerk dan token olinadi
 * - Sahifa yangilanganda /api/auth/me orqali backend user/business tekshiriladi
 * - authFetch() — har bir so'rovga avtomatik Authorization header qo'shadi
 */
export function AuthProvider({ children }) {
  const { isLoaded, userId, getToken, signOut } = useClerkAuth();
  const [user, setUser] = useState(null);
  const [business, setBusiness] = useState(null);
  const [loading, setLoading] = useState(true);

  /**
   * authFetch — Authorization: Bearer <token> headeri bilan fetch
   * Barcha API so'rovlarida shu funksiyadan foydalaning
   */
  const authFetch = useCallback(async (url, options = {}) => {
    const currentToken = await getToken();
    if (!currentToken) {
      throw new Error('Token topilmadi. Iltimos, tizimga kiring.');
    }

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${currentToken}`,
      ...options.headers,
    };

    const response = await fetch(url, { ...options, headers });

    // Token muddati tugagan bo'lsa — logout
    if (response.status === 401) {
      await signOut();
      setUser(null);
      setBusiness(null);
      throw new Error('Sessiya muddati tugadi. Qaytadan kiring.');
    }

    return response;
  }, [getToken, signOut]);

  // Clerk user o'zgarganda backend user/business holatini yangilash
  useEffect(() => {
    if (!isLoaded) {
      setLoading(true);
      return;
    }

    if (!userId) {
      setUser(null);
      setBusiness(null);
      setLoading(false);
      return;
    }

    const fetchUser = async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${API_URL}/api/auth/me`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) {
          throw new Error('Backend user topilmadi');
        }

        const data = await res.json();
        setUser(data.user);
        setBusiness(data.business);
      } catch (err) {
        console.warn('Backend user tekshirish xatosi:', err.message);
        setUser(null);
        setBusiness(null);
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, [isLoaded, userId, getToken]);

  /**
   * logout — Tizimdan chiqish (Clerk orqali)
   */
  const logout = async () => {
    await signOut();
    setUser(null);
    setBusiness(null);
  };

  const value = {
    user,
    business,
    loading,
    logout,
    authFetch,
    isAuthenticated: !!user,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export default AuthContext;
