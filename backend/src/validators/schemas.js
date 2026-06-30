const Joi = require('joi');

const loginSchema = Joi.object({
  username: Joi.string().min(2).max(50).required(),
  password: Joi.string().min(6).required(),
});

const registerSchema = Joi.object({
  username: Joi.string().min(2).max(50).pattern(/^[a-zA-Z0-9._-]+$/).required(),
  email: Joi.string().email().allow('', null).empty(''),
  password: Joi.string().min(8).required(),
  full_name: Joi.string().min(2).required(),
  full_name_ar: Joi.string().allow('', null),
  phone: Joi.string().allow('', null),
  role_id: Joi.number().integer().required(),
});

const customerSchema = Joi.object({
  full_name: Joi.string().min(2).required(),
  full_name_ar: Joi.string().allow('', null),
  mobile: Joi.string().required(),
  city: Joi.string().allow('', null),
  farm_company: Joi.string().allow('', null),
  notes: Joi.string().allow('', null),
  credit_limit: Joi.number().min(0).default(0),
});

const animalSchema = Joi.object({
  animal_type: Joi.string().valid('camel', 'horse', 'sheep', 'goat', 'bird', 'cat', 'dog').required(),
  name_tag: Joi.string().allow('', null),
  age: Joi.string().allow('', null),
  gender: Joi.string().valid('male', 'female', 'unknown').default('unknown'),
  weight: Joi.number().allow(null),
  color: Joi.string().allow('', null),
  rfid_chip: Joi.string().allow('', null),
  owner_id: Joi.string().uuid().required(),
  medical_history: Joi.string().allow('', null),
});

const sampleSchema = Joi.object({
  customer_id: Joi.string().uuid().required(),
  animal_id: Joi.string().uuid().required(),
  test_ids: Joi.array().items(Joi.string().uuid()).default([]),
  package_ids: Joi.array().items(Joi.string().uuid()).default([]),
  invoice_id: Joi.string().uuid().allow(null),
  department: Joi.string().allow('', null),
  priority: Joi.string().valid('normal', 'urgent', 'stat').default('normal'),
  notes: Joi.string().allow('', null),
}).custom((value, helpers) => {
  const hasTests = (value.test_ids || []).length > 0;
  const hasPackages = (value.package_ids || []).length > 0;
  if (!hasTests && !hasPackages) {
    return helpers.message('Select at least one test or package');
  }
  return value;
});

const testSchema = Joi.object({
  code: Joi.string().required(),
  name: Joi.string().required(),
  name_ar: Joi.string().allow('', null),
  category_id: Joi.number().integer().required(),
  description: Joi.string().allow('', null),
  price: Joi.number().min(0).default(0),
  turnaround_hours: Joi.number().integer().min(1).default(24),
  unit: Joi.string().allow('', null),
  method: Joi.string().allow('', null),
  label_copies: Joi.number().integer().min(1).max(20).default(1),
});

const testCategorySchema = Joi.object({
  code: Joi.string().max(20).required(),
  name: Joi.string().required(),
  name_ar: Joi.string().allow('', null),
  department: Joi.string().allow('', null),
  sort_order: Joi.number().integer().default(0),
});

const packageSchema = Joi.object({
  name: Joi.string().required(),
  name_ar: Joi.string().allow('', null),
  description: Joi.string().allow('', null),
  price: Joi.number().min(0).required(),
  discount_percent: Joi.number().min(0).max(100).default(0),
  test_ids: Joi.array().items(Joi.string().uuid()).min(1).required(),
});

const resultEntrySchema = Joi.object({
  sample_test_id: Joi.string().uuid().required(),
  values: Joi.array().items(Joi.object({
    parameter_id: Joi.string().uuid().required(),
    value: Joi.alternatives().try(Joi.string(), Joi.number()).required(),
  })).min(1).required(),
  technician_notes: Joi.string().allow('', null),
});

const resultApproveBatchSchema = Joi.object({
  items: Joi.array().items(Joi.object({
    sample_test_id: Joi.string().uuid().required(),
    values: Joi.array().items(Joi.object({
      parameter_id: Joi.string().uuid().required(),
      value: Joi.alternatives().try(Joi.string(), Joi.number()).required(),
    })).min(1).required(),
    doctor_notes: Joi.string().allow('', null),
    technician_notes: Joi.string().allow('', null),
  })).min(1).required(),
});

const invoiceSchema = Joi.object({
  customer_id: Joi.string().uuid().required(),
  sample_id: Joi.string().uuid().allow(null),
  items: Joi.array().items(Joi.object({
    test_id: Joi.string().uuid().allow(null),
    package_id: Joi.string().uuid().allow(null),
    animal_id: Joi.string().uuid().allow(null),
    description: Joi.string().required(),
    quantity: Joi.number().integer().min(1).default(1),
    unit_price: Joi.number().min(0).required(),
  })).min(1).required(),
  discount_amount: Joi.number().min(0).default(0),
  discount_percent: Joi.number().min(0).max(100).default(0),
  notes: Joi.string().allow('', null),
});

const quoteSchema = Joi.object({
  customer_id: Joi.string().uuid().allow(null),
  customer_name: Joi.string().min(2).required(),
  customer_name_ar: Joi.string().allow('', null),
  customer_mobile: Joi.string().allow('', null),
  items: Joi.array().items(Joi.object({
    test_id: Joi.string().uuid().allow(null),
    package_id: Joi.string().uuid().allow(null),
    description: Joi.string().required(),
    quantity: Joi.number().integer().min(1).default(1),
    unit_price: Joi.number().min(0).required(),
  })).min(1).required(),
  discount_amount: Joi.number().min(0).default(0),
  discount_percent: Joi.number().min(0).max(100).default(0),
  notes: Joi.string().allow('', null),
  valid_until: Joi.date().iso().allow(null),
});

const paymentSchema = Joi.object({
  invoice_id: Joi.string().uuid().required(),
  amount: Joi.number().positive().required(),
  method: Joi.string().valid('cash', 'card', 'bank_transfer', 'credit').required(),
  reference_number: Joi.string().allow('', null),
  notes: Joi.string().allow('', null),
  discount_amount: Joi.number().min(0).default(0),
  discount_percent: Joi.number().min(0).max(100).default(0),
});

const inventorySchema = Joi.object({
  sku: Joi.string().required(),
  name: Joi.string().required(),
  name_ar: Joi.string().allow('', null),
  category: Joi.string().valid('reagent', 'tube', 'slide', 'consumable', 'chemical', 'other').required(),
  unit: Joi.string().default('unit'),
  quantity: Joi.number().min(0).default(0),
  min_quantity: Joi.number().min(0).default(0),
  lot_number: Joi.string().allow('', null),
  expiry_date: Joi.date().allow(null),
  location: Joi.string().allow('', null),
  supplier: Joi.string().allow('', null),
  cost_per_unit: Joi.number().min(0).allow(null),
});

const portalOtpRequestSchema = Joi.object({
  mobile: Joi.string().min(9).max(20).required(),
});

const portalOtpVerifySchema = Joi.object({
  mobile: Joi.string().min(9).max(20).required(),
  otp: Joi.string().length(4).pattern(/^\d{4}$/).required(),
});

module.exports = {
  loginSchema,
  registerSchema,
  portalOtpRequestSchema,
  portalOtpVerifySchema,
  customerSchema,
  animalSchema,
  sampleSchema,
  testSchema,
  testCategorySchema,
  packageSchema,
  resultEntrySchema,
  resultApproveBatchSchema,
  invoiceSchema,
  quoteSchema,
  paymentSchema,
  inventorySchema,
};
