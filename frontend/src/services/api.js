import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  // Let the browser set multipart boundary — manual Content-Type breaks uploads.
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }
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
          window.dispatchEvent(new Event('auth:token-refreshed'));
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
  uploadImage: async (id, file) => {
    const form = new FormData();
    form.append('image', file, file?.name || 'photo.jpg');
    const token = localStorage.getItem('accessToken');
    const response = await fetch(`${API_URL}/animals/${id}/image`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data?.error?.message || 'Upload failed');
      error.response = { status: response.status, data };
      throw error;
    }
    return { data };
  },
};

export const samplesAPI = {
  list: (params) => api.get('/samples', { params }),
  get: (id) => api.get(`/samples/${id}`),
  create: (data) => api.post('/samples', data),
  updateStatus: (id, data) => api.patch(`/samples/${id}/status`, data),
  getQueue: () => api.get('/samples/queue'),
  parasitologyQueue: () => api.get('/samples/queue/parasitology'),
  scan: (barcode) => api.get(`/samples/scan/${barcode}`),
  getBarcode: (id, format) => api.get(`/samples/${id}/barcode`, { params: { format } }),
};

export const testsAPI = {
  list: (params) => api.get('/tests', { params }),
  get: (id) => api.get(`/tests/${id}`),
  categories: (params) => api.get('/tests/categories', { params }),
  createCategory: (data) => api.post('/tests/categories', data),
  updateCategory: (id, data) => api.put(`/tests/categories/${id}`, data),
  deleteCategory: (id) => api.delete(`/tests/categories/${id}`),
  create: (data) => api.post('/tests', data),
  update: (id, data) => api.put(`/tests/${id}`, data),
  delete: (id) => api.delete(`/tests/${id}`),
  listPackages: (params) => api.get('/tests/packages', { params }),
  getPackage: (id) => api.get(`/tests/packages/${id}`),
  createPackage: (data) => api.post('/tests/packages', data),
  updatePackage: (id, data) => api.put(`/tests/packages/${id}`, data),
  deletePackage: (id) => api.delete(`/tests/packages/${id}`),
  addParameter: (testId, data) => api.post(`/tests/${testId}/parameters`, data),
  updateParameter: (parameterId, data) => api.put(`/tests/parameters/${parameterId}`, data),
  deleteParameter: (parameterId) => api.delete(`/tests/parameters/${parameterId}`),
  addReferenceRange: (parameterId, data) => api.post(`/tests/parameters/${parameterId}/ranges`, data),
};

export const resultsAPI = {
  get: (sampleTestId) => api.get(`/results/sample-test/${sampleTestId}`),
  enter: (data) => api.post('/results/enter', data),
  approveBatch: (items) => api.post('/results/approve-batch', { items }, { timeout: 90000 }),
  validate: (sampleTestId, payload = {}) => api.post(`/results/validate/${sampleTestId}`, payload),
  unvalidate: (sampleTestId) => api.post(`/results/unvalidate/${sampleTestId}`),
  clear: (sampleTestId) => api.delete(`/results/sample-test/${sampleTestId}`),
  critical: () => api.get('/results/critical'),
  previous: (animalId, parameterId) => api.get(`/results/previous/${animalId}/${parameterId}`),
  uploadAttachment: async (sampleTestId, file, opts = {}) => {
    const form = new FormData();
    const raw = file;
    let uploadFile = raw;
    if (raw && typeof File !== 'undefined') {
      const hasExt = /\.(jpe?g|png|gif|webp|heic|heif|bmp)$/i.test(raw.name || '');
      if (!hasExt || !raw.type?.startsWith('image/')) {
        const type = raw.type?.startsWith('image/') ? raw.type : 'image/jpeg';
        const ext = type.includes('png') ? '.png' : '.jpg';
        const base = (raw.name || 'microscope').replace(/\.[^.]+$/, '') || 'microscope';
        uploadFile = new File([raw], `${base}${ext}`, { type, lastModified: raw.lastModified });
      }
    }
    const name = uploadFile?.name || uploadFile?.filename || 'microscope.jpg';
    form.append('image', uploadFile, name);
    if (opts.caption) form.append('caption', opts.caption);
    if (opts.parameter_id) form.append('parameter_id', opts.parameter_id);

    const token = localStorage.getItem('accessToken');
    const response = await fetch(`${API_URL}/results/sample-test/${sampleTestId}/attachments`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
      signal: AbortSignal.timeout(90000),
    });

    let data;
    try {
      data = await response.json();
    } catch {
      data = {};
    }

    if (!response.ok) {
      const fallback = response.status === 502 || response.status === 503
        ? 'Server busy — wait a few seconds and try again'
        : `Upload failed (${response.status})`;
      const error = new Error(data?.error?.message || fallback);
      error.response = { status: response.status, data };
      throw error;
    }

    return { data };
  },
  deleteAttachment: (id) => api.delete(`/results/attachments/${id}`),
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
  const opened = window.open(objectUrl, '_blank');
  if (!opened) {
    await downloadReportPdf(pdfUrl, filename);
  }
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
};

export const downloadReportPdf = async (pdfUrl, saveAs) => {
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
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = saveAs || filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
};

export const reportsAPI = {
  list: (params) => api.get('/reports', { params }),
  getPreview: (id) => api.get(`/reports/${id}/preview`),
  generate: (sampleId, opts = {}) =>
    api.post(`/reports/generate/${sampleId}`, {
      language: opts.language ?? 'ar',
      treatment_recommendations: opts.treatment_recommendations ?? '',
      approve_lab: opts.approve_lab ?? false,
      approve_vet: opts.approve_vet ?? false,
    }, { timeout: 120000 }),
  approve: (reportId, type) => api.post(`/reports/${reportId}/approve`, { type }),
  regeneratePdf: (reportId) => api.post(`/reports/${reportId}/regenerate-pdf`, {}, { timeout: 120000 }),
  verify: (code) => api.get(`/reports/verify/${code}`),
  openPdf: openReportPdf,
  downloadPdf: downloadReportPdf,
  async regenerateAndOpen(reportId, pdfUrl) {
    const { data } = await this.regeneratePdf(reportId);
    await openReportPdf(data.data.pdf_url || pdfUrl);
    return data.data;
  },
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
  extraServices: () => api.get('/billing/extra-services'),
  refund: (data) => api.post('/billing/refunds', data),
  cancelInvoice: (id, reason) => api.post(`/billing/invoices/${id}/cancel`, { reason }),
  dashboardSummary: (params) => api.get('/billing/dashboard-summary', { params }),
  dailySummary: (params) => api.get('/billing/daily-summary', { params }),
  dailyClosing: (params) => api.get('/billing/daily-closing', { params }),
  dailyClosingHistory: (params) => api.get('/billing/daily-closing/history', { params }),
  closeDay: (date) => api.post('/billing/daily-closing/close', { date }),
  reopenDay: (date) => api.post('/billing/daily-closing/reopen', { date }),
  unpaidReport: () => api.get('/billing/reports/unpaid'),
  vatReport: (params) => api.get('/billing/reports/vat', { params }),
  cancelledRefundedReport: (params) => api.get('/billing/reports/cancelled-refunded', { params }),
  revenueByServiceReport: (params) => api.get('/billing/reports/by-service', { params }),
  revenueByCustomerReport: (params) => api.get('/billing/reports/by-customer', { params }),
  exportInvoicesCsv: async (params) => {
    const token = localStorage.getItem('accessToken');
    const qs = new URLSearchParams(params || {}).toString();
    const url = `${API_URL}/billing/invoices/export/csv${qs ? `?${qs}` : ''}`;
    const response = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!response.ok) throw new Error('Export failed');
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = 'invoices.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  },
  openClosingPdf: async (id) => {
    const token = localStorage.getItem('accessToken');
    const url = `${API_URL}/billing/daily-closing/${id}/pdf`;
    const response = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!response.ok) throw new Error('Closing PDF not found');
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    window.open(objectUrl, '_blank');
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  },
  openInvoicePdf: async (id, { regenerate = false } = {}) => {
    const token = localStorage.getItem('accessToken');
    const url = `${API_URL}/billing/invoices/${id}/pdf${regenerate ? '?regenerate=1' : ''}`;
    const response = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) throw new Error('Invoice PDF not found');
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const opened = window.open(objectUrl, '_blank');
    if (!opened) {
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `invoice-${id}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    }
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  },
  quotes: (params) => api.get('/billing/quotes', { params }),
  createQuote: (data) => api.post('/billing/quotes', data),
  getQuote: (id) => api.get(`/billing/quotes/${id}`),
  openQuotePdf: async (id, { regenerate = false } = {}) => {
    const token = localStorage.getItem('accessToken');
    const url = `${API_URL}/billing/quotes/${id}/pdf${regenerate ? '?regenerate=1' : ''}`;
    const response = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) throw new Error('Quote PDF not found');
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const opened = window.open(objectUrl, '_blank');
    if (!opened) {
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `quote-${id}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    }
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  },
  collectionsReport: (params) => api.get('/billing/reports/collections', { params }),
  arAgingReport: () => api.get('/billing/reports/ar-aging'),
  revenueReport: (params) => api.get('/billing/reports/revenue', { params }),
  journalReport: (params) => api.get('/billing/reports/journal', { params }),
  customerStatement: (customerId) => api.get(`/billing/customers/${customerId}/statement`),
  invoiceSettings: () => api.get('/billing/invoice-settings'),
  updateInvoiceSettings: (data) => api.put('/billing/invoice-settings', data),
  previewInvoiceSettings: async (draft) => {
    const token = localStorage.getItem('accessToken');
    const response = await fetch(`${API_URL}/billing/invoice-settings/preview`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(draft),
    });
    if (!response.ok) throw new Error('Preview failed');
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const opened = window.open(objectUrl, '_blank');
    if (!opened) {
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = 'invoice-preview.pdf';
      document.body.appendChild(link);
      link.click();
      link.remove();
    }
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  },
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
  referenceRanges: (params) => api.get('/devices/reference-ranges/list', { params }),
  referenceRangeLogs: (params) => api.get('/devices/reference-ranges/logs', { params }),
  syncReferenceRanges: (body) => api.post('/devices/reference-ranges/sync', body),
};

export const settingsAPI = {
  get: () => api.get('/settings'),
  update: (key, value) => api.put(`/settings/${key}`, { value }),
  public: () => api.get('/settings/public'),
};

export default api;
