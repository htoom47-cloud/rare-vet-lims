import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { billingAPI } from '../../services/api';

const emptyForm = () => ({
  name: '',
  name_ar: '',
  percent: '',
  min_animal_count: 0,
  sort_order: 0,
});

export default function DiscountPresetsAdmin({ canEdit }) {
  const { t } = useTranslation();
  const [presets, setPresets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [editingId, setEditingId] = useState(null);

  const load = () => {
    setLoading(true);
    billingAPI.listDiscountPresets({ all: true })
      .then(({ data }) => setPresets(data.data || []))
      .catch(() => toast.error(t('invoiceSettings.discountLoadFailed')))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const startEdit = (preset) => {
    setEditingId(preset.id);
    setForm({
      name: preset.name || '',
      name_ar: preset.name_ar || '',
      percent: String(parseFloat(preset.percent) || ''),
      min_animal_count: parseInt(preset.min_animal_count, 10) || 0,
      sort_order: parseInt(preset.sort_order, 10) || 0,
      is_active: preset.is_active !== false,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(emptyForm());
  };

  const save = async (e) => {
    e.preventDefault();
    if (!canEdit) return;
    const percent = parseFloat(form.percent);
    if (!(percent > 0) || percent > 100) {
      toast.error(t('invoiceSettings.discountPercentInvalid'));
      return;
    }
    if (!String(form.name_ar || '').trim() && !String(form.name || '').trim()) {
      toast.error(t('invoiceSettings.discountNameRequired'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: String(form.name || '').trim(),
        name_ar: String(form.name_ar || '').trim(),
        percent,
        min_animal_count: Math.max(0, parseInt(form.min_animal_count, 10) || 0),
        sort_order: parseInt(form.sort_order, 10) || 0,
        is_active: form.is_active !== false,
      };
      if (editingId) {
        await billingAPI.updateDiscountPreset(editingId, payload);
      } else {
        await billingAPI.createDiscountPreset(payload);
      }
      toast.success(t('invoiceSettings.discountSaved'));
      cancelEdit();
      load();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || t('invoiceSettings.discountSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async (id) => {
    if (!canEdit) return;
    try {
      await billingAPI.deactivateDiscountPreset(id);
      toast.success(t('invoiceSettings.discountDeleted'));
      if (editingId === id) cancelEdit();
      load();
    } catch {
      toast.error(t('invoiceSettings.discountSaveFailed'));
    }
  };

  const reactivate = async (preset) => {
    if (!canEdit) return;
    try {
      await billingAPI.updateDiscountPreset(preset.id, {
        name: preset.name,
        name_ar: preset.name_ar,
        percent: parseFloat(preset.percent),
        min_animal_count: parseInt(preset.min_animal_count, 10) || 0,
        sort_order: parseInt(preset.sort_order, 10) || 0,
        is_active: true,
      });
      toast.success(t('invoiceSettings.discountSaved'));
      load();
    } catch {
      toast.error(t('invoiceSettings.discountSaveFailed'));
    }
  };

  if (loading) {
    return <div className="text-center py-10 text-gray-500">{t('common.loading')}</div>;
  }

  const ar = i18n.language?.startsWith('ar');

  return (
    <div className="card p-5 space-y-5">
      <div>
        <h2 className="font-semibold">{t('invoiceSettings.discountsTitle')}</h2>
        <p className="text-sm text-gray-500 mt-1">{t('invoiceSettings.discountsHint')}</p>
      </div>

      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="p-2 text-start">{t('invoiceSettings.discountNameAr')}</th>
              <th className="p-2 text-start">{t('invoiceSettings.discountNameEn')}</th>
              <th className="p-2 text-start">{t('invoiceSettings.discountPercentLabel')}</th>
              <th className="p-2 text-start">{t('invoiceSettings.discountMinAnimals')}</th>
              <th className="p-2 text-start">{t('invoiceSettings.discountActive')}</th>
              {canEdit && <th className="p-2" />}
            </tr>
          </thead>
          <tbody>
            {presets.map((preset) => (
              <tr key={preset.id} className="border-t">
                <td className="p-2">{preset.name_ar || preset.name}</td>
                <td className="p-2">{preset.name || preset.name_ar}</td>
                <td className="p-2">{parseFloat(preset.percent)}%</td>
                <td className="p-2">
                  {(parseInt(preset.min_animal_count, 10) || 0) > 0
                    ? t('billing.discountMinAnimals', { count: parseInt(preset.min_animal_count, 10) })
                    : '—'}
                </td>
                <td className="p-2">
                  {preset.is_active === false ? t('invoiceSettings.discountOff') : t('invoiceSettings.discountOn')}
                </td>
                {canEdit && (
                  <td className="p-2 whitespace-nowrap text-end">
                    <button type="button" className="text-primary-700 text-xs me-2" onClick={() => startEdit(preset)}>
                      {t('common.edit')}
                    </button>
                    {preset.is_active === false ? (
                      <button type="button" className="text-green-700 text-xs" onClick={() => reactivate(preset)}>
                        {t('invoiceSettings.discountActivate')}
                      </button>
                    ) : (
                      <button type="button" className="text-red-600 text-xs" onClick={() => deactivate(preset.id)}>
                        {t('invoiceSettings.discountDeactivate')}
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <form onSubmit={save} className="grid grid-cols-1 md:grid-cols-2 gap-3 border-t pt-4">
          <h3 className="md:col-span-2 font-medium">
            {editingId ? t('invoiceSettings.discountEdit') : t('invoiceSettings.discountAdd')}
          </h3>
          <div>
            <label className="block text-sm font-medium mb-1">{t('invoiceSettings.discountNameAr')}</label>
            <input
              className="input-field w-full"
              dir="rtl"
              value={form.name_ar}
              onChange={(e) => setForm({ ...form, name_ar: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('invoiceSettings.discountNameEn')}</label>
            <input
              className="input-field w-full"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('invoiceSettings.discountPercentLabel')}</label>
            <input
              type="number"
              min="0.01"
              max="100"
              step="0.01"
              className="input-field w-full"
              value={form.percent}
              onChange={(e) => setForm({ ...form, percent: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('invoiceSettings.discountMinAnimals')}</label>
            <input
              type="number"
              min="0"
              className="input-field w-full"
              value={form.min_animal_count}
              onChange={(e) => setForm({ ...form, min_animal_count: e.target.value })}
            />
            <p className="text-xs text-gray-500 mt-1">{t('invoiceSettings.discountMinAnimalsHint')}</p>
          </div>
          <div className="md:col-span-2 flex gap-2">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? t('common.loading') : t('invoiceSettings.save')}
            </button>
            {editingId && (
              <button type="button" className="btn-secondary" onClick={cancelEdit}>
                {t('common.cancel')}
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
