import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import Modal from '../components/ui/Modal';
import { purchasesAPI, suppliersAPI } from '../services/api';

const TAX_CATEGORIES = ['standard', 'zero_rated', 'exempt', 'out_of_scope'];
const LOW = 0.7;
const fromHalalas = (h) => (Number(h || 0) / 100).toFixed(2);

const emptyPayload = () => ({
  supplier_name: '',
  supplier_name_ar: '',
  supplier_name_en: '',
  supplier_tax_number: '',
  supplier_invoice_number: '',
  invoice_date: '',
  currency: 'SAR',
  payment_method: 'cash',
  notes: '',
  items: [{ description: '', quantity: 1, unit_price_sar: 0, discount_sar: 0, tax_category: 'standard', confidence: 1 }],
  discount_sar: 0,
  subtotal_sar: '',
  vat_sar: '',
  total_sar: '',
});

export default function PurchaseExtractionModal({ open, onClose, onCreated }) {
  const { t } = useTranslation();
  const fileRef = useRef(null);
  const processingLock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [extraction, setExtraction] = useState(null);
  const [payload, setPayload] = useState(emptyPayload());
  const [previewUrl, setPreviewUrl] = useState('');
  const [quick, setQuick] = useState({ name: '', tax_number: '', confirm: true });
  const [cash, setCash] = useState(false);
  const [supplierId, setSupplierId] = useState('');

  const confidenceOf = (field) => Number(payload.field_confidence?.[field] ?? 1);
  const low = (field) => confidenceOf(field) < LOW;

  const loadPreview = async (id) => {
    const { data } = await purchasesAPI.extractionFile(id);
    const url = URL.createObjectURL(data);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
  };

  const applyRow = (row) => {
    setExtraction(row);
    const next = { ...emptyPayload(), ...(row.payload || {}) };
    if (!next.items?.length) next.items = emptyPayload().items;
    setPayload(next);
    setSupplierId(row.payload?.supplier_id || row.supplier_match?.supplier?.id || '');
    setCash(Boolean(row.payload?.uses_cash_unregistered) || row.supplier_match?.suggest_cash);
  };

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  useEffect(() => {
    if (!extraction || !['queued', 'processing'].includes(extraction.status)) return undefined;
    const timer = setInterval(async () => {
      const { data } = await purchasesAPI.extraction(extraction.id);
      applyRow(data.data);
    }, 2000);
    return () => clearInterval(timer);
  }, [extraction?.id, extraction?.status]);

  const start = async (file) => {
    if (!file || processingLock.current) return;
    processingLock.current = true;
    setBusy(true);
    try {
      const uploaded = await purchasesAPI.createExtraction(file);
      applyRow(uploaded.data.data);
      await loadPreview(uploaded.data.data.id);
      try {
        const processed = await purchasesAPI.processExtraction(uploaded.data.data.id);
        applyRow(processed.data.data);
      } catch (err) {
        const latest = await purchasesAPI.extraction(uploaded.data.data.id);
        applyRow(latest.data.data);
        throw err;
      }
    } catch (err) {
      const code = err.response?.data?.error?.code;
      toast.error(code === 'EXTRACTION_PROVIDER_UNAVAILABLE' ? t('purchases.providerUnavailable') : (err.response?.data?.error?.message || t('common.error')));
    } finally {
      processingLock.current = false;
      setBusy(false);
    }
  };

  const saveCorrections = async () => {
    if (!extraction) return null;
    const { data } = await purchasesAPI.correctExtraction(extraction.id, {
      payload,
      supplier_id: cash ? null : supplierId || null,
      uses_cash_unregistered: cash,
    });
    applyRow(data.data);
    return data.data;
  };

  const createDraft = async () => {
    if (busy || processingLock.current) return;
    processingLock.current = true;
    setBusy(true);
    try {
      await saveCorrections();
      const { data } = await purchasesAPI.confirmExtraction(extraction.id, {
        payload,
        supplier_id: cash ? null : supplierId || null,
        uses_cash_unregistered: cash,
      });
      if (data.data.draft?.status !== 'draft') {
        toast.error(t('common.error'));
        return;
      }
      toast.success(t('purchases.created'));
      onCreated?.(data.data.draft);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || t('common.error'));
    } finally {
      processingLock.current = false;
      setBusy(false);
    }
  };

  const createQuick = async () => {
    if (!window.confirm(t('purchases.quickConfirm'))) return;
    const { data } = await suppliersAPI.createQuick({
      name: quick.name || payload.supplier_name_en || payload.supplier_name,
      name_ar: payload.supplier_name_ar,
      tax_number: quick.tax_number || payload.supplier_tax_number,
      confirm: true,
    });
    setSupplierId(data.data.id);
    setCash(false);
    toast.success(t('purchases.created'));
  };

  const warnings = extraction?.warnings || [];
  const canConfirm = extraction?.can_confirm && extraction?.status === 'needs_review';
  const totals = extraction?.computed;

  const fieldClass = (name) => `input-field ${low(name) ? 'ring-2 ring-amber-400' : ''}`;

  const updateItem = (index, patch) => {
    const items = [...payload.items];
    items[index] = { ...items[index], ...patch };
    setPayload({ ...payload, items });
  };

  return (
    <Modal isOpen={open} onClose={onClose} title={t('purchases.extract')} size="lg">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">{t('purchases.extractHint')}</p>
        <input
          ref={fileRef}
          type="file"
          accept=".jpg,.jpeg,.png,.webp,.pdf"
          capture="environment"
          onChange={(e) => start(e.target.files?.[0])}
        />
        {busy || extraction?.status === 'processing' || extraction?.status === 'queued' ? (
          <div className="text-sm text-primary-700">{t('purchases.extracting')}</div>
        ) : null}

        {extraction && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-sm font-medium mb-2">{t('purchases.preview')}</div>
              {previewUrl && extraction.mime_type === 'application/pdf' ? (
                <iframe title="invoice" src={previewUrl} className="w-full h-72 border rounded" />
              ) : previewUrl ? (
                <img src={previewUrl} alt="" className="w-full max-h-72 object-contain border rounded bg-gray-50" />
              ) : null}
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={cash} onChange={(e) => { setCash(e.target.checked); if (e.target.checked) setSupplierId(''); }} />
                {t('purchases.cashUnregistered')}
              </label>
              {!cash && (
                <>
                  {extraction.supplier_match?.candidates?.length > 1 && (
                    <select className="input-field" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                      <option value="">{t('purchases.pickSupplier')}</option>
                      {extraction.supplier_match.candidates.map((hit) => (
                        <option key={hit.id} value={hit.id}>{hit.name_ar || hit.name} {hit.tax_number || ''}</option>
                      ))}
                    </select>
                  )}
                  {extraction.supplier_match?.match === 'none' || extraction.supplier_match?.suggest_quick ? (
                    <div className="text-xs text-gray-600 space-y-2">
                      <p>{t('purchases.noSupplier')}</p>
                      <input className="input-field" placeholder={t('suppliers.nameEn')} value={quick.name} onChange={(e) => setQuick({ ...quick, name: e.target.value })} />
                      <input className="input-field" placeholder={t('suppliers.taxNumber')} value={quick.tax_number || payload.supplier_tax_number} onChange={(e) => setQuick({ ...quick, tax_number: e.target.value })} />
                      <button type="button" className="text-primary-600 text-sm" onClick={createQuick}>{t('purchases.quickSupplier')}</button>
                    </div>
                  ) : null}
                </>
              )}
              <input className={fieldClass('supplier_name')} value={payload.supplier_name || ''} onChange={(e) => setPayload({ ...payload, supplier_name: e.target.value })} placeholder={t('purchases.supplier')} />
              {low('supplier_name') && <p className="text-xs text-amber-700">{t('purchases.lowConfidence')}</p>}
              <input className={fieldClass('supplier_tax_number')} value={payload.supplier_tax_number || ''} onChange={(e) => setPayload({ ...payload, supplier_tax_number: e.target.value })} placeholder={t('suppliers.taxNumber')} />
              <input className={fieldClass('supplier_invoice_number')} value={payload.supplier_invoice_number || ''} onChange={(e) => setPayload({ ...payload, supplier_invoice_number: e.target.value })} placeholder={t('purchases.supplierInvoice')} required />
              <input type="date" className={fieldClass('invoice_date')} value={String(payload.invoice_date || '').slice(0, 10)} onChange={(e) => setPayload({ ...payload, invoice_date: e.target.value })} />
              <select className="input-field" value={payload.payment_method || 'cash'} onChange={(e) => setPayload({ ...payload, payment_method: e.target.value })}>
                <option value="cash">{t('purchases.cash')}</option>
                <option value="bank_transfer">{t('purchases.bank_transfer')}</option>
                <option value="credit">{t('purchases.credit')}</option>
                <option value="other">{t('purchases.other')}</option>
              </select>
            </div>
          </div>
        )}

        {extraction?.status === 'needs_review' && (
          <>
            <div>
              <div className="font-medium mb-2">{t('purchases.items')}</div>
              {payload.items.map((line, index) => (
                <div key={index} className={`grid grid-cols-12 gap-2 mb-2 ${Number(line.confidence ?? 1) < LOW ? 'ring-1 ring-amber-400 rounded p-1' : ''}`}>
                  <input className="input-field col-span-12 md:col-span-4" value={line.description || ''} onChange={(e) => updateItem(index, { description: e.target.value })} placeholder={t('purchases.description')} />
                  <input type="number" className="input-field col-span-4 md:col-span-2" value={line.quantity || ''} onChange={(e) => updateItem(index, { quantity: e.target.value })} />
                  <input type="number" step="0.01" className="input-field col-span-4 md:col-span-2" value={line.unit_price_sar || ''} onChange={(e) => updateItem(index, { unit_price_sar: e.target.value })} />
                  <select className="input-field col-span-4 md:col-span-4" value={line.tax_category || 'standard'} onChange={(e) => updateItem(index, { tax_category: e.target.value })}>
                    {TAX_CATEGORIES.map((cat) => <option key={cat} value={cat}>{t(`purchases.tax.${cat}`)}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <div className="text-sm space-y-1 bg-gray-50 p-3 rounded">
              <div>{t('purchases.extractedTotal')}: {payload.total_sar ?? '—'}</div>
              <div>{t('purchases.computedTotal')}: {fromHalalas(totals?.total_halalas)}</div>
              <div>{t('purchases.difference')}: {fromHalalas(totals?.difference_halalas)}</div>
            </div>
            {warnings.map((w) => (
              <div key={`${w.code}-${w.field || ''}`} className={`text-sm ${w.blocking ? 'text-red-700' : 'text-amber-700'}`}>
                {w.code}{w.field ? ` (${w.field})` : ''}
              </div>
            ))}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
              <button type="button" className="btn-primary" disabled={busy || !canConfirm} onClick={createDraft}>
                {busy ? t('common.loading') : t('purchases.createDraft')}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
