const Joi = require('joi');
const { computeInvoiceTotals, toHalalas, TAX_CATEGORIES } = require('./purchases-money');

const LOW_CONFIDENCE = 0.7;
const TAX_NUMBER_FORM = /^3\d{13}3$|^\d{10,15}$/;

const confidence = Joi.number().min(0).max(1).allow(null);

const itemSchema = Joi.object({
  description: Joi.string().trim().max(500).allow('', null),
  quantity: Joi.number().positive().allow(null),
  unit_price_sar: Joi.number().min(0).allow(null),
  discount_sar: Joi.number().min(0).allow(null),
  tax_category: Joi.string().valid(...TAX_CATEGORIES, null),
  tax_rate: Joi.number().valid(0, 15, null),
  vat_sar: Joi.number().min(0).allow(null),
  line_total_sar: Joi.number().min(0).allow(null),
  confidence: confidence,
}).unknown(false);

const qrSchema = Joi.object({
  seller_name: Joi.string().trim().max(255).allow('', null),
  vat_number: Joi.string().trim().max(30).allow('', null),
  timestamp: Joi.string().trim().max(40).allow('', null),
  total_sar: Joi.number().min(0).allow(null),
  vat_sar: Joi.number().min(0).allow(null),
}).unknown(false);

const extractionPayloadSchema = Joi.object({
  supplier_name: Joi.string().trim().max(255).allow('', null),
  supplier_name_ar: Joi.string().trim().max(255).allow('', null),
  supplier_name_en: Joi.string().trim().max(255).allow('', null),
  supplier_tax_number: Joi.string().trim().max(30).allow('', null),
  supplier_invoice_number: Joi.string().trim().max(80).allow('', null),
  invoice_date: Joi.string().trim().max(20).allow('', null),
  currency: Joi.string().trim().max(8).allow('', null),
  payment_method: Joi.string().valid('cash', 'bank_transfer', 'credit', 'other', null),
  purchase_order_numbers: Joi.array().items(Joi.string().trim().max(80)).max(10).allow(null),
  notes: Joi.string().trim().max(2000).allow('', null),
  qr_payload: Joi.string().trim().max(4000).allow('', null),
  qr_tax_data: qrSchema.allow(null),
  items: Joi.array().items(itemSchema).max(200).allow(null),
  subtotal_sar: Joi.number().min(0).allow(null),
  discount_sar: Joi.number().min(0).allow(null),
  vat_sar: Joi.number().min(0).allow(null),
  total_sar: Joi.number().min(0).allow(null),
  field_confidence: Joi.object().pattern(Joi.string(), confidence).allow(null),
  overall_confidence: confidence,
}).unknown(false);

const emptyPayload = () => ({
  supplier_name: '',
  supplier_name_ar: '',
  supplier_name_en: '',
  supplier_tax_number: '',
  supplier_invoice_number: '',
  invoice_date: '',
  currency: 'SAR',
  payment_method: 'cash',
  purchase_order_numbers: [],
  notes: '',
  qr_payload: '',
  qr_tax_data: null,
  items: [],
  subtotal_sar: null,
  discount_sar: 0,
  vat_sar: null,
  total_sar: null,
  field_confidence: {},
  overall_confidence: null,
});

const stripUntrustedKeys = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const blocked = [
    'sql', 'path', 'file_url', 'status', 'permissions', 'role', 'approved', 'query',
    'supplier_id', 'uses_cash_unregistered', 'id', 'warnings', 'computed', 'can_confirm',
  ];
  const copy = { ...value };
  blocked.forEach((key) => { delete copy[key]; });
  delete copy.reasoning;
  delete copy.chain_of_thought;
  delete copy.internal;
  return copy;
};

const sanitizeExtractionMessage = (err) => {
  let msg = String(err?.message || 'failed').slice(0, 200);
  msg = msg.replace(/sk-[a-zA-Z0-9_-]+/gi, '[redacted]');
  msg = msg.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]');
  msg = msg.replace(/\/uploads\/[^\s"'\\]+/gi, '[file]');
  msg = msg.replace(/https?:\/\/[^\s"'\\]+/gi, '[url]');
  return msg;
};

const parseProviderJson = (raw) => {
  const stripped = stripUntrustedKeys(raw);
  const { error, value } = extractionPayloadSchema.validate(stripped, {
    abortEarly: false,
    stripUnknown: true,
    allowUnknown: false,
  });
  if (error) {
    const err = new Error('Provider payload failed schema validation');
    err.code = 'EXTRACTION_PAYLOAD_INVALID';
    err.statusCode = 422;
    err.details = error.details.map((item) => item.message);
    throw err;
  }
  return {
    ...emptyPayload(),
    ...value,
    items: Array.isArray(value.items) ? value.items : [],
    purchase_order_numbers: value.purchase_order_numbers || [],
    field_confidence: value.field_confidence || {},
  };
};

const fieldConfidenceOf = (payload, name, fallback = null) => {
  const mapped = payload.field_confidence && payload.field_confidence[name];
  if (mapped != null) return Number(mapped);
  return fallback;
};

const todayStamp = () => new Date().toISOString().slice(0, 10);

const isFutureDate = (value) => {
  if (!value) return false;
  const stamp = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(stamp)) return true;
  return stamp > todayStamp();
};

const taxNumberInvalid = (value) => {
  const tax = String(value || '').trim();
  if (!tax) return false;
  return !TAX_NUMBER_FORM.test(tax);
};

const computeFromItems = (payload) => {
  const items = (payload.items || []).filter((item) => Number(item.quantity) > 0);
  if (!items.length) {
    return { subtotal_halalas: 0, discount_halalas: 0, vat_halalas: 0, total_halalas: 0, items: [] };
  }
  const cash = !String(payload.supplier_tax_number || '').trim();
  return computeInvoiceTotals(
    items.map((item) => ({
      description: item.description || 'Item',
      quantity: item.quantity,
      unit_price_sar: item.unit_price_sar || 0,
      discount_sar: item.discount_sar || 0,
      tax_category: item.tax_category || (cash ? 'out_of_scope' : 'standard'),
      tax_rate: item.tax_rate,
    })),
    toHalalas(payload.discount_sar),
    { defaultCategory: cash ? 'out_of_scope' : 'standard' }
  );
};

const buildWarnings = (payload, extras = {}) => {
  const warnings = [];
  const computed = extras.computed || computeFromItems(payload);
  const extractedTotal = payload.total_sar == null ? null : toHalalas(payload.total_sar);
  const extractedVat = payload.vat_sar == null ? null : toHalalas(payload.vat_sar);

  if (!String(payload.supplier_invoice_number || '').trim()) {
    warnings.push({ code: 'MISSING_INVOICE_NUMBER', blocking: true, field: 'supplier_invoice_number' });
  }
  if (!extras.supplier_id && !extras.uses_cash_unregistered) {
    warnings.push({ code: 'MISSING_SUPPLIER', blocking: true, field: 'supplier_id' });
  }
  if (taxNumberInvalid(payload.supplier_tax_number)) {
    warnings.push({ code: 'INVALID_TAX_NUMBER', blocking: true, field: 'supplier_tax_number' });
  }
  if (!payload.invoice_date || !/^\d{4}-\d{2}-\d{2}$/.test(String(payload.invoice_date).slice(0, 10))) {
    warnings.push({ code: 'UNCLEAR_DATE', blocking: true, field: 'invoice_date' });
  } else if (isFutureDate(payload.invoice_date)) {
    warnings.push({ code: 'FUTURE_DATE', blocking: true, field: 'invoice_date' });
  }
  if (!computed.items.length) {
    warnings.push({ code: 'MISSING_ITEMS', blocking: true, field: 'items' });
  }
  if (extractedTotal != null && extractedTotal !== computed.total_halalas) {
    warnings.push({
      code: 'TOTALS_MISMATCH',
      blocking: false,
      extracted_halalas: extractedTotal,
      computed_halalas: computed.total_halalas,
      difference_halalas: extractedTotal - computed.total_halalas,
    });
  }
  if (extractedVat != null && extractedVat !== computed.vat_halalas) {
    warnings.push({
      code: 'VAT_MISMATCH',
      blocking: false,
      extracted_halalas: extractedVat,
      computed_halalas: computed.vat_halalas,
    });
  }
  if (extras.duplicate) {
    warnings.push({ code: 'DUPLICATE_SUPPLIER_INVOICE', blocking: true });
  }
  if (extras.similar && extras.similar.length) {
    warnings.push({ code: 'SIMILAR_INVOICE', blocking: false, matches: extras.similar });
  }
  if (extras.supplier_candidates && extras.supplier_candidates.length > 1) {
    warnings.push({ code: 'SUPPLIER_AMBIGUOUS', blocking: true, field: 'supplier_id' });
  }
  Object.entries(payload.field_confidence || {}).forEach(([field, score]) => {
    if (score != null && Number(score) < LOW_CONFIDENCE) {
      warnings.push({ code: 'LOW_CONFIDENCE', blocking: false, field, confidence: Number(score) });
    }
  });
  (payload.items || []).forEach((item, index) => {
    if (item.confidence != null && Number(item.confidence) < LOW_CONFIDENCE) {
      warnings.push({ code: 'LOW_CONFIDENCE', blocking: false, field: `items.${index}`, confidence: Number(item.confidence) });
    }
  });
  return { warnings, computed };
};

const canConfirm = (warnings) => !warnings.some((item) => item.blocking);

const toDraftBody = (payload, extras = {}) => ({
  supplier_id: extras.uses_cash_unregistered ? null : extras.supplier_id,
  uses_cash_unregistered: Boolean(extras.uses_cash_unregistered),
  supplier_invoice_number: String(payload.supplier_invoice_number || '').trim(),
  invoice_date: String(payload.invoice_date).slice(0, 10),
  payment_method: payload.payment_method || 'cash',
  notes: [
    payload.notes,
    (payload.purchase_order_numbers || []).length
      ? `PO: ${(payload.purchase_order_numbers || []).join(', ')}`
      : '',
  ].filter(Boolean).join('\n') || null,
  discount_sar: Number(payload.discount_sar || 0),
  items: (payload.items || []).map((item) => ({
    description: item.description || 'Item',
    quantity: Number(item.quantity),
    unit_price_sar: Number(item.unit_price_sar || 0),
    discount_sar: Number(item.discount_sar || 0),
    tax_category: item.tax_category || (extras.uses_cash_unregistered ? 'out_of_scope' : 'standard'),
  })),
});

const countPdfPages = (buffer) => {
  if (!buffer || buffer.slice(0, 5).toString('ascii') !== '%PDF-') return 1;
  const text = buffer.toString('latin1');
  const matches = text.match(/\/Type\s*\/Page(?!s)\b/g);
  return matches && matches.length ? matches.length : 1;
};

const OPENAI_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'supplier_name', 'supplier_name_ar', 'supplier_name_en', 'supplier_tax_number',
    'supplier_invoice_number', 'invoice_date', 'currency', 'payment_method',
    'purchase_order_numbers', 'notes', 'qr_payload', 'items',
    'subtotal_sar', 'discount_sar', 'vat_sar', 'total_sar',
    'field_confidence', 'overall_confidence',
  ],
  properties: {
    supplier_name: { type: ['string', 'null'] },
    supplier_name_ar: { type: ['string', 'null'] },
    supplier_name_en: { type: ['string', 'null'] },
    supplier_tax_number: { type: ['string', 'null'] },
    supplier_invoice_number: { type: ['string', 'null'] },
    invoice_date: { type: ['string', 'null'], description: 'ISO date YYYY-MM-DD' },
    currency: { type: ['string', 'null'] },
    payment_method: { type: ['string', 'null'], enum: ['cash', 'bank_transfer', 'credit', 'other', null] },
    purchase_order_numbers: { type: 'array', items: { type: 'string' } },
    notes: { type: ['string', 'null'] },
    qr_payload: { type: ['string', 'null'] },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'description', 'quantity', 'unit_price_sar', 'discount_sar',
          'tax_category', 'tax_rate', 'vat_sar', 'line_total_sar', 'confidence',
        ],
        properties: {
          description: { type: ['string', 'null'] },
          quantity: { type: ['number', 'null'] },
          unit_price_sar: { type: ['number', 'null'] },
          discount_sar: { type: ['number', 'null'] },
          tax_category: { type: ['string', 'null'], enum: [...TAX_CATEGORIES, null] },
          tax_rate: { type: ['number', 'null'], enum: [0, 15, null] },
          vat_sar: { type: ['number', 'null'] },
          line_total_sar: { type: ['number', 'null'] },
          confidence: { type: ['number', 'null'] },
        },
      },
    },
    subtotal_sar: { type: ['number', 'null'] },
    discount_sar: { type: ['number', 'null'] },
    vat_sar: { type: ['number', 'null'] },
    total_sar: { type: ['number', 'null'] },
    field_confidence: {
      type: 'object',
      additionalProperties: false,
      required: [
        'supplier_name', 'supplier_tax_number', 'supplier_invoice_number',
        'invoice_date', 'subtotal_sar', 'vat_sar', 'total_sar',
      ],
      properties: {
        supplier_name: { type: ['number', 'null'] },
        supplier_tax_number: { type: ['number', 'null'] },
        supplier_invoice_number: { type: ['number', 'null'] },
        invoice_date: { type: ['number', 'null'] },
        subtotal_sar: { type: ['number', 'null'] },
        vat_sar: { type: ['number', 'null'] },
        total_sar: { type: ['number', 'null'] },
      },
    },
    overall_confidence: { type: ['number', 'null'] },
  },
};

module.exports = {
  LOW_CONFIDENCE,
  extractionPayloadSchema,
  emptyPayload,
  parseProviderJson,
  fieldConfidenceOf,
  buildWarnings,
  canConfirm,
  toDraftBody,
  computeFromItems,
  countPdfPages,
  taxNumberInvalid,
  OPENAI_JSON_SCHEMA,
  stripUntrustedKeys,
  sanitizeExtractionMessage,
};
