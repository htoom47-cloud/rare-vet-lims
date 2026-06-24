const env = require('../config/env');

const SETTINGS_KEY = 'invoice_template';

const getDefaultInvoiceSettings = () => ({
  lab: {
    name: env.lab.name,
    name_ar: env.lab.nameAr,
    subtitle: env.lab.subtitle,
    subtitle_ar: env.lab.subtitleAr,
    address: env.lab.address,
    phone: env.lab.phone,
    email: env.lab.email,
    vat_number: env.lab.vatNumber,
  },
  design: {
    primary_color: '#5B3A29',
    accent_color: '#C9A86A',
    cream_color: '#F7F5F2',
    show_logo: true,
  },
  labels: {
    title_en: 'SIMPLIFIED TAX INVOICE',
    title_ar: 'فاتورة ضريبية مبسطة',
  },
  footer: {
    note_en: '',
    note_ar: '',
  },
  options: {
    show_qr: true,
    show_payment_history: true,
    default_tax_rate: 15,
    auto_invoice_trigger: 'manual',
  },
});

const isHexColor = (v) => typeof v === 'string' && /^#[0-9A-Fa-f]{6}$/.test(v);

const mergeInvoiceSettings = (stored) => {
  const defaults = getDefaultInvoiceSettings();
  if (!stored || typeof stored !== 'object') return defaults;

  const merged = {
    lab: { ...defaults.lab, ...(stored.lab || {}) },
    design: { ...defaults.design, ...(stored.design || {}) },
    labels: { ...defaults.labels, ...(stored.labels || {}) },
    footer: { ...defaults.footer, ...(stored.footer || {}) },
    options: { ...defaults.options, ...(stored.options || {}) },
  };

  if (!isHexColor(merged.design.primary_color)) merged.design.primary_color = defaults.design.primary_color;
  if (!isHexColor(merged.design.accent_color)) merged.design.accent_color = defaults.design.accent_color;
  if (!isHexColor(merged.design.cream_color)) merged.design.cream_color = defaults.design.cream_color;

  merged.design.show_logo = merged.design.show_logo !== false;
  merged.options.show_qr = merged.options.show_qr !== false;
  merged.options.show_payment_history = merged.options.show_payment_history !== false;
  merged.options.default_tax_rate = Number(merged.options.default_tax_rate) || defaults.options.default_tax_rate;
  const validTriggers = ['manual', 'sample', 'validation', 'both'];
  if (!validTriggers.includes(merged.options.auto_invoice_trigger)) {
    merged.options.auto_invoice_trigger = defaults.options.auto_invoice_trigger;
  }

  return merged;
};

const buildSampleInvoice = (settings) => {
  const taxRate = settings.options.default_tax_rate;
  const subtotal = 120;
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;

  return {
    invoice_number: 'INV-PREVIEW-001',
    created_at: new Date(),
    status: 'paid',
    customer_name: 'Sample Customer',
    customer_name_ar: 'عميل تجريبي',
    customer_mobile: '0500000000',
    subtotal,
    discount_amount: 0,
    tax_rate: taxRate,
    tax_amount: taxAmount,
    total,
    total_paid: total,
    balance_due: 0,
    vat_qr_data: null,
    items: [
      {
        description: 'Complete Blood Count',
        quantity: 1,
        unit_price: 80,
        total_price: 80,
      },
      {
        description: 'فحص كيمياء',
        quantity: 1,
        unit_price: 40,
        total_price: 40,
      },
    ],
    payments: [
      { method: 'cash', amount: total, created_at: new Date(), reference_number: 'PREVIEW' },
    ],
  };
};

module.exports = {
  SETTINGS_KEY,
  getDefaultInvoiceSettings,
  mergeInvoiceSettings,
  buildSampleInvoice,
};
