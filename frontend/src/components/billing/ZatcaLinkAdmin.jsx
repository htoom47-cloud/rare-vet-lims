import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { billingAPI } from '../../services/api';

const empty = () => ({
  environment: 'sandbox',
  vat_number: '',
  organization: '',
  organization_unit: '',
  common_name: 'RareVet-LIMS',
  address: '',
  invoice_types: '1100',
  status: 'not_linked',
  linked_at: null,
  has_certificate: false,
  last_error: null,
  send_live_invoices: false,
  compliance_status: 'not_run',
  compliance_ran_at: null,
  compliance_results: [],
  has_production_certificate: false,
  production_status: 'not_issued',
  production_linked_at: null,
});

export default function ZatcaLinkAdmin({ canEdit }) {
  const { t } = useTranslation();
  const [form, setForm] = useState(empty);
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [linking, setLinking] = useState(false);
  const [testing, setTesting] = useState(false);
  const [requestingProduction, setRequestingProduction] = useState(false);

  const load = () => billingAPI.zatcaStatus()
    .then(({ data }) => setForm({ ...empty(), ...(data.data || {}) }))
    .catch(() => toast.error(t('zatca.loadFailed')));

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [t]);

  const setField = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const save = async () => {
    if (!canEdit) return;
    setSaving(true);
    try {
      const { data } = await billingAPI.updateZatca({
        environment: form.environment,
        vat_number: form.vat_number,
        organization: form.organization,
        organization_unit: form.organization_unit,
        common_name: form.common_name,
        address: form.address,
        invoice_types: form.invoice_types,
      });
      setForm({ ...empty(), ...(data.data || {}) });
      toast.success(t('zatca.saved'));
    } catch (err) {
      toast.error(err.response?.data?.message || t('zatca.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const onboard = async () => {
    if (!canEdit) return;
    setLinking(true);
    try {
      await save();
      const { data } = await billingAPI.onboardZatca({ otp });
      setForm({ ...empty(), ...(data.data || {}) });
      setOtp('');
      toast.success(t('zatca.linked'));
    } catch (err) {
      toast.error(err.response?.data?.message || t('zatca.linkFailed'));
      load();
    } finally {
      setLinking(false);
    }
  };

  const runCompliance = async () => {
    if (!canEdit) return;
    setTesting(true);
    try {
      const { data } = await billingAPI.zatcaComplianceTests();
      setForm({ ...empty(), ...(data.data || {}) });
      toast.success(t('zatca.complianceDone'));
    } catch (err) {
      toast.error(err.response?.data?.message || t('zatca.complianceFailed'));
      load();
    } finally {
      setTesting(false);
    }
  };

  const requestProduction = async () => {
    if (!canEdit) return;
    setRequestingProduction(true);
    try {
      const { data } = await billingAPI.zatcaProductionCsid();
      setForm({ ...empty(), ...(data.data || {}) });
      toast.success(t('zatca.productionIssued'));
    } catch (err) {
      toast.error(err.response?.data?.message || t('zatca.productionFailed'));
      load();
    } finally {
      setRequestingProduction(false);
    }
  };

  if (loading) {
    return <p className="text-center py-10 text-gray-500">{t('common.loading')}</p>;
  }

  const statusLabel = t(`zatca.status.${form.status}`, { defaultValue: form.status });

  return (
    <div className="card p-5 space-y-4">
      <div>
        <h2 className="font-semibold">{t('zatca.title')}</h2>
        <p className="text-sm text-gray-500 mt-1">{t('zatca.subtitle')}</p>
      </div>

      <div className="rounded-lg border p-3 text-sm bg-gray-50 dark:bg-gray-800">
        <p><strong>{t('zatca.currentStatus')}:</strong> {statusLabel}</p>
        {form.linked_at && <p className="text-gray-500 mt-1">{t('zatca.linkedAt')}: {new Date(form.linked_at).toLocaleString()}</p>}
        <p className="text-gray-500 mt-1">
          {form.send_live_invoices ? t('zatca.liveOn') : t('zatca.liveOff')}
        </p>
        {form.last_error && <p className="text-red-700 mt-2">{form.last_error}</p>}
        <p className="mt-2">
          <strong>{t('zatca.complianceStatus')}:</strong>{' '}
          {t(`zatca.compliance.${form.compliance_status || 'not_run'}`, { defaultValue: form.compliance_status })}
        </p>
        {form.compliance_ran_at && (
          <p className="text-gray-500 mt-1">
            {t('zatca.complianceAt')}: {new Date(form.compliance_ran_at).toLocaleString()}
          </p>
        )}
        <p className="mt-2">
          <strong>{t('zatca.productionStatus')}:</strong>{' '}
          {t(`zatca.production.${form.production_status || 'not_issued'}`, { defaultValue: form.production_status })}
        </p>
        {form.production_linked_at && (
          <p className="text-gray-500 mt-1">
            {t('zatca.productionAt')}: {new Date(form.production_linked_at).toLocaleString()}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="text-sm">
          <span className="block mb-1">{t('zatca.environment')}</span>
          <select className="input-field" value={form.environment} disabled={!canEdit} onChange={(e) => setField('environment', e.target.value)}>
            <option value="sandbox">{t('zatca.envSandbox')}</option>
            <option value="simulation">{t('zatca.envSimulation')}</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="block mb-1">{t('invoiceSettings.vatNumber')}</span>
          <input className="input-field" value={form.vat_number} disabled={!canEdit} onChange={(e) => setField('vat_number', e.target.value)} />
        </label>
        <label className="text-sm">
          <span className="block mb-1">{t('zatca.organization')}</span>
          <input className="input-field" value={form.organization} disabled={!canEdit} onChange={(e) => setField('organization', e.target.value)} />
        </label>
        <label className="text-sm">
          <span className="block mb-1">{t('zatca.organizationUnit')}</span>
          <input className="input-field" value={form.organization_unit} disabled={!canEdit} onChange={(e) => setField('organization_unit', e.target.value)} />
        </label>
        <label className="text-sm">
          <span className="block mb-1">{t('zatca.commonName')}</span>
          <input className="input-field" value={form.common_name} disabled={!canEdit} onChange={(e) => setField('common_name', e.target.value)} />
        </label>
        <label className="text-sm">
          <span className="block mb-1">{t('invoiceSettings.address')}</span>
          <input className="input-field" value={form.address} disabled={!canEdit} onChange={(e) => setField('address', e.target.value)} />
        </label>
      </div>

      {canEdit && (
        <div className="flex flex-col sm:flex-row gap-3 items-end">
          <label className="text-sm flex-1">
            <span className="block mb-1">{t('zatca.otp')}</span>
            <input className="input-field" inputMode="numeric" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="123456" />
            <span className="block text-xs text-gray-500 mt-1">{t('zatca.otpHint')}</span>
          </label>
          <button type="button" className="btn-secondary" onClick={save} disabled={saving}>
            {saving ? t('common.loading') : t('invoiceSettings.save')}
          </button>
          <button type="button" className="btn-primary" onClick={onboard} disabled={linking || otp.replace(/\D/g, '').length !== 6}>
            {linking ? t('common.loading') : t('zatca.connect')}
          </button>
        </div>
      )}

      {canEdit && form.has_certificate && (
        <div className="border-t pt-4 space-y-3">
          <p className="text-sm text-gray-500">{t('zatca.complianceHint')}</p>
          <button
            type="button"
            className="btn-primary"
            onClick={runCompliance}
            disabled={testing || form.status !== 'sandbox_linked'}
          >
            {testing ? t('common.loading') : t('zatca.runCompliance')}
          </button>
          {Array.isArray(form.compliance_results) && form.compliance_results.length > 0 && (
            <ul className="text-sm space-y-1">
              {form.compliance_results.map((row) => (
                <li key={row.key || row.label}>
                  <strong>{row.label}:</strong> {row.status}
                  {row.message && row.message !== row.status ? ` — ${row.message}` : ''}
                </li>
              ))}
            </ul>
          )}
          <p className="text-sm text-gray-500 pt-2">{t('zatca.productionHint')}</p>
          <button
            type="button"
            className="btn-primary"
            onClick={requestProduction}
            disabled={requestingProduction || form.compliance_status !== 'passed' || form.has_production_certificate}
          >
            {requestingProduction ? t('common.loading') : t('zatca.requestProduction')}
          </button>
        </div>
      )}
    </div>
  );
}
