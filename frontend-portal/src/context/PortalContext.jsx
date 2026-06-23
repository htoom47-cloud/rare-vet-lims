import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { portalAuthAPI } from '../services/portalApi';

const PortalContext = createContext(null);

export const PortalProvider = ({ children }) => {
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadCustomer = useCallback(async () => {
    const token = localStorage.getItem('portalAccessToken');
    if (!token) { setLoading(false); return; }
    try {
      const { data } = await portalAuthAPI.me();
      setCustomer(data.data);
    } catch {
      localStorage.removeItem('portalAccessToken');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCustomer(); }, [loadCustomer]);

  const requestOtp = async (mobile) => {
    const { data } = await portalAuthAPI.requestOtp(mobile);
    return data.data;
  };

  const verifyOtp = async (mobile, otp) => {
    const { data } = await portalAuthAPI.verifyOtp(mobile, otp);
    localStorage.setItem('portalAccessToken', data.data.accessToken);
    setCustomer(data.data.customer);
    return data.data.customer;
  };

  const logout = () => {
    localStorage.removeItem('portalAccessToken');
    setCustomer(null);
  };

  return (
    <PortalContext.Provider value={{ customer, loading, requestOtp, verifyOtp, logout, loadCustomer }}>
      {children}
    </PortalContext.Provider>
  );
};

export const usePortal = () => {
  const ctx = useContext(PortalContext);
  if (!ctx) throw new Error('usePortal must be used within PortalProvider');
  return ctx;
};
