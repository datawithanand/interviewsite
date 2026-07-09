import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, setAuthToken, getStoredToken, setUnauthorizedHandler } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Local-only clear — used as the 401 handler so an already-invalid token
  // never triggers another doomed API call.
  const clearLocalSession = useCallback(() => {
    setAuthToken(null);
    setUser(null);
  }, []);

  // User-initiated sign out — best-effort revoke on the server, then clear locally.
  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout', {});
    } catch {
      // token may already be invalid/expired — clearing locally is enough
    }
    clearLocalSession();
  }, [clearLocalSession]);

  useEffect(() => {
    setUnauthorizedHandler(clearLocalSession);
  }, [clearLocalSession]);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setLoading(false);
      return;
    }
    setAuthToken(token);
    api
      .get('/auth/me')
      .then((res) => setUser(res.user))
      .catch(() => clearLocalSession())
      .finally(() => setLoading(false));
  }, []);

  const login = async (username, password) => {
    const res = await api.post('/auth/login', { username, password });
    setAuthToken(res.token);
    setUser(res.user);
    return res.user;
  };

  const register = async (payload) => {
    const res = await api.post('/auth/register', payload);
    setAuthToken(res.token);
    setUser(res.user);
    return res.user;
  };

  const refreshUser = async () => {
    const res = await api.get('/auth/me');
    setUser(res.user);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function isWriterOrAdmin(user) {
  return !!user && (user.role === 'WRITER' || user.role === 'ADMIN');
}

export function isAdmin(user) {
  return !!user && user.role === 'ADMIN';
}
