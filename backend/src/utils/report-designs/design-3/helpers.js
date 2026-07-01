const env = require('../../../config/env');
const { LAB_NAME_EN, LAB_NAME_AR } = require('../../../constants/brand');
const { isAbnormalFlag } = require('../layout-mode');

const { ANIMAL_TYPE_LABELS } = require('../../../constants/animal-types');

const GENDERS = {
  male: { en: 'Male', ar: 'ذكر' },
  female: { en: 'Female', ar: 'أنثى' },
  unknown: { en: 'Unknown', ar: 'غير محدد' },
};

const escapeHtml = (t) => String(t ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const formatDate = (date) => {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const formatDateTime = (date) => {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '-';
  return `${formatDate(d)} ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
};

const formatRef = (row) => {
  if (row.minValue != null && row.maxValue != null) {
    const fmt = (n) => {
      const num = Number(n);
      if (Number.isNaN(num)) return String(n);
      return Number.isInteger(num) ? String(num) : num.toFixed(2).replace(/\.?0+$/, '');
    };
    return `${fmt(row.minValue)} – ${fmt(row.maxValue)}`;
  }
  return row.reference && row.reference !== '-' ? row.reference : '-';
};

const flagMeta = (flag) => {
  if (flag === 'HIGH' || flag === 'CRIT_HIGH' || flag === 'POS') {
    return { sym: '↑', tag: 'HIGH', cls: 'status-high' };
  }
  if (flag === 'LOW' || flag === 'CRIT_LOW') {
    return { sym: '↓', tag: 'LOW', cls: 'status-low' };
  }
  return { sym: '', tag: '', cls: '' };
};

const renderResultCell = (row) => {
  const val = escapeHtml(row.value ?? '-');
  const fm = flagMeta(row.flag);
  if (!isAbnormalFlag(row.flag) || !fm.tag) {
    return `<span class="result-value">${val}</span>`;
  }
  return `<span class="result-value ${fm.cls}"><strong>${val}</strong> <span class="result-flag">${fm.sym} ${fm.tag}</span></span>`;
};

const renderTestCell = (row, lang) => {
  const code = escapeHtml(row.code || row.nameEn || '-');
  if (lang === 'ar' && row.nameAr) {
    return `<div class="test-name"><span class="test-name__primary">${escapeHtml(row.nameAr)}</span><span class="test-name__code">(${code})</span></div>`;
  }
  const nameEn = row.nameEn && row.nameEn !== row.code ? escapeHtml(row.nameEn) : '';
  if (nameEn) {
    return `<div class="test-name"><span class="test-name__primary">${code}</span><span class="test-name__sub">${nameEn}</span></div>`;
  }
  return `<div class="test-name"><span class="test-name__primary">${code}</span></div>`;
};

const getLabMeta = () => ({
  nameEn: env.lab.name || LAB_NAME_EN,
  nameAr: env.lab.nameAr || LAB_NAME_AR,
  subtitle: env.lab.subtitle || 'Veterinary Medical Laboratory',
  phone: env.lab.phone || '',
  email: env.lab.email || '',
  website: env.lab.website || env.appUrl || '',
  address: env.lab.address || '',
  license: env.lab.licenseNumber || '',
});

const getPatientFields = (data) => {
  const lang = data.language || 'ar';
  const isAr = lang === 'ar';
  const species = ANIMAL_TYPE_LABELS[data.animalType] || { en: data.animalType || '-', ar: data.animalType || '-' };
  const gender = GENDERS[data.animalGender] || GENDERS.unknown;

  const defs = isAr
    ? [
      ['المالك', data.customerName],
      ['الجوال', data.customerMobile],
      ['الحيوان', data.animalName],
      ['النوع', species.ar],
      ['السلالة', data.animalBreed],
      ['اللون', data.animalColor],
      ['الجنس', gender.ar],
      ['العمر', data.animalAge],
      ['العينة', data.sampleCode],
      ['السحب', formatDate(data.collectionDate || data.date)],
      ['الإصدار', formatDate(data.issuedDate || data.date)],
    ]
    : [
      ['Owner', data.customerName],
      ['Mobile', data.customerMobile],
      ['Animal', data.animalName],
      ['Species', species.en],
      ['Breed', data.animalBreed],
      ['Color', data.animalColor],
      ['Gender', gender.en],
      ['Age', data.animalAge],
      ['Sample', data.sampleCode],
      ['Collected', formatDate(data.collectionDate || data.date)],
      ['Issued', formatDate(data.issuedDate || data.date)],
    ];

  return defs.map(([label, val]) => ({ label, val: val || '-' }));
};

const resolveInstruments = (results) => {
  const set = new Set((results || []).map((r) => r.instrument).filter(Boolean));
  return [...set].join(' / ') || 'Laboratory Analyzer';
};

const t = (lang, en, ar) => (lang === 'ar' ? ar : en);

module.exports = {
  escapeHtml,
  formatDate,
  formatDateTime,
  formatRef,
  renderResultCell,
  renderTestCell,
  getLabMeta,
  getPatientFields,
  resolveInstruments,
  t,
  isAbnormalFlag,
};
