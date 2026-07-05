import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { authAPI } from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const location = useLocation();
  const skipPathRefresh = useRef(true);

  const loadUser = useCallback(async ({ silent = false } = {}) => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      if (!silent) setLoading(false);
      return;
    }
    try {
      const { data } = await authAPI.me();
      setUser({ ...data.data, features: data.data.features });
    } catch {
      if (!silent) localStorage.clear();
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { loadUser(); }, [loadUser]);

  // Keep sidebar/button permissions in sync after deploy or admin role edits.
  useEffect(() => {
    const refresh = () => {
      if (localStorage.getItem('accessToken')) loadUser({ silent: true });
    };
    const interval = setInterval(refresh, 5 * 60 * 1000);
    window.addEventListener('focus', refresh);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('auth:token-refreshed', refresh);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('auth:token-refreshed', refresh);
    };
  }, [loadUser]);

  // Refresh permissions when navigating — applies to every role.
  useEffect(() => {
    if (skipPathRefresh.current) {
      skipPathRefresh.current = false;
      return;
    }
    if (localStorage.getItem('accessToken')) loadUser({ silent: true });
  }, [location.pathname, loadUser]);

  const login = async (username, password) => {
    const { data } = await authAPI.login(username, password);
    localStorage.setItem('accessToken', data.data.accessToken);
    localStorage.setItem('refreshToken', data.data.refreshToken);
    setUser({ ...data.data.user, features: data.data.features || data.data.user?.features });
    return data.data.user;
  };

  const logout = async () => {
    const refreshToken = localStorage.getItem('refreshToken');
    try { await authAPI.logout(refreshToken); } catch { /* ignore */ }
    localStorage.clear();
    setUser(null);
  };

  const hasPermission = (permission) => {
    if (!user) return false;
    if (user.role === 'admin' || user.role_name === 'admin') return true;
    return user.permissions?.includes(permission);
  };

  const hasAnyPermission = (...permissions) => {
    if (!permissions.length) return true;
    return permissions.some((p) => hasPermission(p));
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, hasPermission, hasAnyPermission, loadUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
