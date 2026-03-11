import { createContext, useContext, useEffect, useState } from 'react';
import api from '../api/axios';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user,    setUser]    = useState(() => {
    // Initialise synchronously from localStorage so ProtectedRoute
    // never sees a blank user on first render after login
    try {
      const saved = localStorage.getItem('rms_user');
      const token = localStorage.getItem('rms_token');
      if (token && saved) {
        const parsed = JSON.parse(saved);
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        return parsed;
      }
    } catch {}
    return null;
  });
  const [loading, setLoading] = useState(false); // no async init needed

  const login = (token, userData) => {
    localStorage.setItem('rms_token', token);
    localStorage.setItem('rms_user', JSON.stringify(userData));
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('rms_token');
    localStorage.removeItem('rms_user');
    delete api.defaults.headers.common['Authorization'];
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      login,
      logout,
      isManager:  user?.role === 'manager',
      isLandlord: user?.role === 'landlord',
      isTenant:   user?.role === 'tenant',
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};
