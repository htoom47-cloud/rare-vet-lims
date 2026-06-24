import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const portalApi = axios.create({
  baseURL: `${API_URL}/portal`,
  headers: { 'Content-Type': 'application/json' },
});

portalApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('portalAccessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

portalApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !error.config?.url?.includes('/auth/')) {
      localStorage.removeItem('portalAccessToken');
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export const portalAuthAPI = {
  requestOtp: (mobile) => portalApi.post('/auth/request-otp', { mobile }),
  verifyOtp: (mobile, otp) => portalApi.post('/auth/verify-otp', { mobile, otp }),
  me: () => portalApi.get('/me'),
};

export const portalDashboardAPI = {
  get: () => portalApi.get('/dashboard'),
};

export const portalSearchAPI = {
  search: (q) => portalApi.get('/search', { params: { q } }),
};

export const portalDocumentsAPI = {
  list: (params) => portalApi.get('/documents', { params }),
};

export const portalAnimalsAPI = {
  list: () => portalApi.get('/animals'),
  dashboard: (animalId) => portalApi.get(`/animals/${animalId}/dashboard`),
  trends: (animalId, parameterCode, limit) => portalApi.get(
    `/animals/${animalId}/trends/${encodeURIComponent(parameterCode)}`,
    { params: { limit } }
  ),
  compare: (animalId, reportIds) => portalApi.get(`/animals/${animalId}/compare`, {
    params: { reportIds: reportIds.join(',') },
  }),
};

export const portalReportsAPI = {
  list: (params) => portalApi.get('/reports', { params }),
  getPreview: (id) => portalApi.get(`/reports/${id}/preview`),
  openPdf: async (pdfUrl) => {
    const filename = pdfUrl?.split('/').pop();
    if (!filename) throw new Error('Missing report file');

    const token = localStorage.getItem('portalAccessToken');
    const response = await fetch(`${API_URL}/portal/reports/download/${encodeURIComponent(filename)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (!response.ok) {
      const err = new Error('Report PDF not found');
      err.response = { status: response.status };
      throw err;
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const opened = window.open(objectUrl, '_blank');
    if (!opened) {
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
    }
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  },
};

export default portalApi;
