import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      const refreshToken = localStorage.getItem('refreshToken');
      if (refreshToken) {
        try {
          const { data } = await axios.post(`${API_URL}/auth/refresh`, { refreshToken });
          localStorage.setItem('accessToken', data.data.accessToken);
          original.headers.Authorization = `Bearer ${data.data.accessToken}`;
          return api(original);
        } catch {
          localStorage.clear();
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

export const authAPI = {
  login: (username, password) => api.post('/auth/login', { username, password }),
  logout: (refreshToken) => api.post('/auth/logout', { refreshToken }),
  me: () => api.get('/auth/me'),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }),
  resetPassword: (token, password) => api.post('/auth/reset-password', { token, password }),
};

export const customersAPI = {
  list: (params) => api.get('/customers', { params }),
  get: (id) => api.get(`/customers/${id}`),
  create: (data) => api.post('/customers', data),
  update: (id, data) => api.put(`/customers/${id}`, data),
  delete: (id) => api.delete(`/customers/${id}`),
};

export const animalsAPI = {
  list: (params) => api.get('/animals', { params }),
  get: (id, history) => api.get(`/animals/${id}`, { params: { history } }),
  create: (data) => api.post('/animals', data),
  update: (id, data) => api.put(`/animals/${id}`, data),
  uploadImage: (id, file) => {
    const form = new FormData();
    form.append('image', file);
    return api.post(`/animals/${id}/image`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
};

export const samplesAPI = {
  list: (params) => api.get('/samples', { params }),
  get: (id) => api.get(`/samples/${id}`),
  create: (data) => api.post('/samples', data),
  updateStatus: (id, data) => api.patch(`/samples/${id}/status`, data),
  getQueue: () => api.get('/samples/queue'),
  scan: (barcode) => api.get(`/samples/scan/${barcode}`),
  getBarcode: (id, format) => api.get(`/samples/${id}/barcode`, { params: { format } }),
};

export const testsAPI = {
  list: (params) => api.get('/tests', { params }),
  get: (id) => api.get(`/tests/${id}`),
  categories: () => api.get('/tests/categories'),
  create: (data) => api.post('/tests', data),
  update: (id, data) => api.put(`/tests/${id}`, data),
  addParameter: (testId, data) => api.post(`/tests/${testId}/parameters`, data),
  addReferenceRange: (parameterId, data) => api.post(`/tests/parameters/${parameterId}/ranges`, data),
};

export const resultsAPI = {
  get: (sampleTestId) => api.get(`/results/sample-test/${sampleTestId}`),
  enter: (data) => api.post('/results/enter', data),
  validate: (sampleTestId, doctorNotes) => api.post(`/results/validate/${sampleTestId}`, { doctor_notes: doctorNotes }),
  critical: () => api.get('/results/critical'),
  previous: (animalId, parameterId) => api.get(`/results/previous/${animalId}/${parameterId}`),
};

export const openReportPdf = async (pdfUrl) => {
  const filename = pdfUrl?.split('/').pop();
  if (!filename) throw new Error('Missing report file');

  const token = localStorage.getItem('accessToken');
  const response = await fetch(`${API_URL}/reports/download/${encodeURIComponent(filename)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    const err = new Error('Report PDF not found');
    err.response = { status: response.status };
    throw err;
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  window.open(objectUrl, '_blank');
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
};

export const reportsAPI = {
  list: (params) => api.get('/reports', { params }),
  interpret: (sampleId, language = 'ar') => api.post(`/reports/interpret/${sampleId}`, { language }),
  generate: (sampleId, { language = 'ar', treatment_recommendations = '' } = {}) =>
    api.post(`/reports/generate/${sampleId}`, { language, treatment_recommendations }),
  verify: (code) => api.get(`/reports/verify/${code}`),
  openPdf: openReportPdf,
};

export const notificationsAPI = {
  sendReport: (sampleId, channel, recipient) =>
    api.post(`/notifications/send-report/${sampleId}`, { channel, recipient }),
};

export const billingAPI = {
  invoices: (params) => api.get('/billing/invoices', { params }),
  getInvoice: (id) => api.get(`/billing/invoices/${id}`),
  createInvoice: (data) => api.post('/billing/invoices', data),
  recordPayment: (data) => api.post('/billing/payments', data),
  packages: () => api.get('/billing/packages'),
  refund: (data) => api.post('/billing/refunds', data),
};

export const inventoryAPI = {
  list: (params) => api.get('/inventory', { params }),
  get: (id) => api.get(`/inventory/${id}`),
  create: (data) => api.post('/inventory', data),
  update: (id, data) => api.put(`/inventory/${id}`, data),
  adjust: (id, data) => api.post(`/inventory/${id}/adjust`, data),
  alerts: () => api.get('/inventory/alerts'),
};

export const qualityAPI = {
  qc: (params) => api.get('/quality/qc', { params }),
  createQC: (data) => api.post('/quality/qc', data),
  maintenance: () => api.get('/quality/maintenance'),
  createMaintenance: (data) => api.post('/quality/maintenance', data),
  calibrations: () => api.get('/quality/calibrations'),
  createCalibration: (data) => api.post('/quality/calibrations', data),
  temperature: () => api.get('/quality/temperature'),
  createTemperature: (data) => api.post('/quality/temperature', data),
};

export const dashboardAPI = {
  stats: () => api.get('/dashboard/stats'),
};

export const usersAPI = {
  list: (params) => api.get('/users', { params }),
  roles: () => api.get('/users/roles'),
  allPermissions: () => api.get('/users/permissions'),
  permissions: (roleId) => api.get(`/users/roles/${roleId}/permissions`),
  updateRolePermissions: (roleId, permissions) => api.put(`/users/roles/${roleId}/permissions`, { permissions }),
  create: (data) => api.post('/users', data),
  update: (id, data) => api.put(`/users/${id}`, data),
  remove: (id) => api.delete(`/users/${id}`),
  purgeDemo: () => api.post('/users/purge-demo'),
};

export const auditAPI = {
  list: (params) => api.get('/audit', { params }),
};

export const devicesAPI = {
  list: () => api.get('/devices'),
  create: (data) => api.post('/devices', data),
  update: (id, data) => api.put(`/devices/${id}`, data),
  regenerateKey: (id) => api.post(`/devices/${id}/regenerate-key`),
  messages: (id) => api.get(`/devices/${id}/messages`),
};

export const settingsAPI = {
  get: () => api.get('/settings'),
  update: (key, value) => api.put(`/settings/${key}`, { value }),
  public: () => api.get('/settings/public'),
};

export default api;
