import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Receipt, Save, Eye, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import { billingAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

const emptySettings = () => ({
  lab: {
    name: '', name_ar: '', subtitle: '', subtitle_ar: '',
    address: '', phone: '', email: '', vat_number: '',
  },
  design: {
    primary_color: '#5B3A29', accent_color: '#C9A86A', cream_color: '#F7F5F2', show_logo: true,
  },
  labels: { title_en: '', title_ar: '' },
  footer: { note_en: '', note_ar: '' },
  options: { show_qr: true, show_payment_history: true, default_tax_rate: 15 },
});

const Field = ({ label, children }) => (
  <div>
    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{label}</label>
    {children}
  </div>
);

const inputClass = 'input-field w-full';

export default function InvoiceSettings() {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('billing.create');
  const [form, setForm] = useState(emptySettings());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [tab, setTab] = useState('lab');

  useEffect(() => {
    billingAPI.invoiceSettings()
      .then(({ data }) => setForm(data.data))
      .catch(() => toast.error(t('invoiceSettings.loadFailed')))
      .finally(() => setLoading(false));
  }, [t]);

  const setLab = (key, value) => setForm((f) => ({ ...f, lab: { ...f.lab, [key]: value } }));
  const setDesign = (key, value) => setForm((f) => ({ ...f, design: { ...f.design, [key]: value } }));
  const setLabels = (key, value) => setForm((f) => ({ ...f, labels: { ...f.labels, [key]: value } }));
  const setFooter = (key, value) => setForm((f) => ({ ...f, footer: { ...f.footer, [key]: value } }));
  const setOptions = (key, value) => setForm((f) => ({ ...f, options: { ...f.options, [key]: value } }));

  const save = async () => {
    if (!canEdit) return;
    setSaving(true);
    try {
      const { data } = await billingAPI.updateInvoiceSettings(form);
      setForm(data.data);
      toast.success(t('invoiceSettings.saved'));
    } catch {
      toast.error(t('invoiceSettings.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const preview = async () => {
    setPreviewing(true);
    try {
      await billingAPI.previewInvoiceSettings(form);
    } catch {
      toast.error(t('invoiceSettings.previewFailed'));
    } finally {
      setPreviewing(false);
    }
  };

  const tabs = [
    { id: 'lab', label: t('invoiceSettings.tabLab') },
    { id: 'design', label: t('invoiceSettings.tabDesign') },
    { id: 'options', label: t('invoiceSettings.tabOptions') },
  ];

  if (loading) {
    return <div className="text-center py-16 text-gray-500">{t('common.loading')}</div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-primary-100 text-primary-700 flex items-center justify-center">
            <Receipt size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{t('invoiceSettings.title')}</h1>
            <p className="text-sm text-gray-500">{t('invoiceSettings.subtitle')}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={preview} disabled={previewing} className="btn-secondary flex items-center gap-2">
            <Eye size={16} /> {previewing ? t('common.loading') : t('invoiceSettings.preview')}
          </button>
          {canEdit && (
            <button type="button" onClick={save} disabled={saving} className="btn-primary flex items-center gap-2">
              <Save size={16} /> {saving ? t('common.loading') : t('invoiceSettings.save')}
            </button>
          )}
        </div>
      </div>

      {!canEdit && (
        <div className="card p-4 text-sm text-amber-800 bg-amber-50 border border-amber-200">
          {t('invoiceSettings.readOnly')}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {tabs.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === id ? 'bg-primary-600 text-white' : 'bg-white border hover:bg-gray-50'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'lab' && (
        <div className="card p-5 space-y-4">
          <h2 className="font-semibold">{t('invoiceSettings.labInfo')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label={t('invoiceSettings.nameEn')}>
              <input className={inputClass} value={form.lab.name} onChange={(e) => setLab('name', e.target.value)} disabled={!canEdit} />
            </Field>
            <Field label={t('invoiceSettings.nameAr')}>
              <input className={inputClass} dir="rtl" value={form.lab.name_ar} onChange={(e) => setLab('name_ar', e.target.value)} disabled={!canEdit} />
            </Field>
            <Field label={t('invoiceSettings.subtitleEn')}>
              <input className={inputClass} value={form.lab.subtitle} onChange={(e) => setLab('subtitle', e.target.value)} disabled={!canEdit} />
            </Field>
            <Field label={t('invoiceSettings.subtitleAr')}>
              <input className={inputClass} dir="rtl" value={form.lab.subtitle_ar} onChange={(e) => setLab('subtitle_ar', e.target.value)} disabled={!canEdit} />
            </Field>
            <Field label={t('invoiceSettings.address')}>
              <input className={inputClass} value={form.lab.address} onChange={(e) => setLab('address', e.target.value)} disabled={!canEdit} />
            </Field>
            <Field label={t('invoiceSettings.vatNumber')}>
              <input className={inputClass} value={form.lab.vat_number} onChange={(e) => setLab('vat_number', e.target.value)} disabled={!canEdit} />
            </Field>
            <Field label={t('invoiceSettings.phone')}>
              <input className={inputClass} value={form.lab.phone} onChange={(e) => setLab('phone', e.target.value)} disabled={!canEdit} />
            </Field>
            <Field label={t('invoiceSettings.email')}>
              <input className={inputClass} type="email" value={form.lab.email} onChange={(e) => setLab('email', e.target.value)} disabled={!canEdit} />
            </Field>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t">
            <Field label={t('invoiceSettings.titleEn')}>
              <input className={inputClass} value={form.labels.title_en} onChange={(e) => setLabels('title_en', e.target.value)} disabled={!canEdit} />
            </Field>
            <Field label={t('invoiceSettings.titleAr')}>
              <input className={inputClass} dir="rtl" value={form.labels.title_ar} onChange={(e) => setLabels('title_ar', e.target.value)} disabled={!canEdit} />
            </Field>
          </div>
        </div>
      )}

      {tab === 'design' && (
        <div className="card p-5 space-y-4">
          <h2 className="font-semibold">{t('invoiceSettings.appearance')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              ['primary_color', t('invoiceSettings.primaryColor')],
              ['accent_color', t('invoiceSettings.accentColor')],
              ['cream_color', t('invoiceSettings.creamColor')],
            ].map(([key, label]) => (
              <Field key={key} label={label}>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.design[key]}
                    onChange={(e) => setDesign(key, e.target.value)}
                    disabled={!canEdit}
                    className="w-10 h-10 rounded border cursor-pointer"
                  />
                  <input className={inputClass} value={form.design[key]} onChange={(e) => setDesign(key, e.target.value)} disabled={!canEdit} />
                </div>
              </Field>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.design.show_logo} onChange={(e) => setDesign('show_logo', e.target.checked)} disabled={!canEdit} />
            {t('invoiceSettings.showLogo')}
          </label>
          <div className="rounded-xl border p-4 flex gap-3 items-center" style={{ background: form.design.cream_color }}>
            <div className="w-16 h-8 rounded" style={{ background: form.design.primary_color }} />
            <div className="w-16 h-2 rounded" style={{ background: form.design.accent_color }} />
            <span className="text-xs text-gray-600">{t('invoiceSettings.colorPreview')}</span>
          </div>
        </div>
      )}

      {tab === 'options' && (
        <div className="card p-5 space-y-4">
          <h2 className="font-semibold">{t('invoiceSettings.optionsTitle')}</h2>
          <Field label={t('invoiceSettings.defaultTax')}>
            <input
              type="number"
              min="0"
              max="100"
              className={`${inputClass} max-w-[8rem]`}
              value={form.options.default_tax_rate}
              onChange={(e) => setOptions('default_tax_rate', Number(e.target.value))}
              disabled={!canEdit}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.options.show_qr} onChange={(e) => setOptions('show_qr', e.target.checked)} disabled={!canEdit} />
            {t('invoiceSettings.showQr')}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.options.show_payment_history} onChange={(e) => setOptions('show_payment_history', e.target.checked)} disabled={!canEdit} />
            {t('invoiceSettings.showPayments')}
          </label>
          <div className="grid grid-cols-1 gap-4 pt-2 border-t">
            <Field label={t('invoiceSettings.footerEn')}>
              <textarea className={inputClass} rows={2} value={form.footer.note_en} onChange={(e) => setFooter('note_en', e.target.value)} disabled={!canEdit} />
            </Field>
            <Field label={t('invoiceSettings.footerAr')}>
              <textarea className={inputClass} dir="rtl" rows={2} value={form.footer.note_ar} onChange={(e) => setFooter('note_ar', e.target.value)} disabled={!canEdit} />
            </Field>
          </div>
          <p className="text-xs text-gray-500 flex items-center gap-1">
            <RotateCcw size={12} /> {t('invoiceSettings.regenerateHint')}
          </p>
        </div>
      )}
    </div>
  );
}
