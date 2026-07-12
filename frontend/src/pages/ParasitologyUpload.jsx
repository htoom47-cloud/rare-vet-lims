import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, Loader2, ScanLine } from 'lucide-react';
import toast from 'react-hot-toast';
import { samplesAPI, resultsAPI } from '../services/api';
import {
  isParasitologyTest,
  sortParasSampleTests,
  panelI18nKey,
} from '../utils/parasitologyTests';
import mediaUrl from '../utils/mediaUrl';
import { normalizeSampleScanId } from '../utils/barcodeScan';
import { compressImageForUpload, UPLOAD_MAX_BYTES } from '../utils/compressImageUpload';

const API_ORIGIN = (import.meta.env.VITE_API_URL || '/api').replace(/\/api\/?$/, '');

const normalizeUploadFile = (file) => {
  if (!file || typeof File === 'undefined') return file;
  const hasExt = /\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?)$/i.test(file.name || '');
  if (hasExt && file.type?.startsWith('image/')) return file;
  const type = file.type?.startsWith('image/') ? file.type : 'image/jpeg';
  const ext = type.includes('png') ? '.png' : '.jpg';
  const base = (file.name || 'microscope').replace(/\.[^.]+$/, '') || 'microscope';
  return new File([file], `${base}${ext}`, { type, lastModified: file.lastModified });
};

const panelLabel = (testRow, t, i18n) => {
  const key = panelI18nKey(testRow.test_code);
  if (key) return t(key);
  return i18n.language === 'ar' && testRow.test_name_ar
    ? testRow.test_name_ar
    : (testRow.test_name || testRow.test_code);
};

export default function ParasitologyUpload() {
  const { t, i18n } = useTranslation();
  const barcodeRef = useRef(null);
  const fileRef = useRef(null);
  const [barcode, setBarcode] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sample, setSample] = useState(null);
  const [panelCode, setPanelCode] = useState(null);
  const [attachments, setAttachments] = useState([]);

  const parasTests = sortParasSampleTests(sample?.tests || []);
  const activeTest = parasTests.find((tst) => tst.test_code === panelCode) || parasTests[0] || null;

  useEffect(() => {
    fetch(`${API_ORIGIN}/api/health`).catch(() => {});
    barcodeRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!sample) {
      setPanelCode(null);
      return;
    }
    const tests = sortParasSampleTests(sample.tests || []);
    if (!tests.length) {
      setPanelCode(null);
      return;
    }
    setPanelCode((current) => (
      current && tests.some((tst) => tst.test_code === current) ? current : tests[0].test_code
    ));
  }, [sample?.id, sample?.tests]);

  const loadAttachments = useCallback(async (testRow) => {
    if (!testRow?.id) {
      setAttachments([]);
      return;
    }
    try {
      const { data } = await resultsAPI.get(testRow.id);
      setAttachments(data.data?.attachments || []);
    } catch {
      setAttachments([]);
    }
  }, []);

  useEffect(() => {
    if (activeTest?.id) loadAttachments(activeTest);
  }, [activeTest?.id, loadAttachments]);

  const loadSample = async (code) => {
    const trimmed = normalizeSampleScanId(code.trim()) || code.trim();
    if (!trimmed) return;
    setLoading(true);
    try {
      let sampleId;
      try {
        const { data } = await samplesAPI.scan(trimmed);
        sampleId = data.data?.id;
      } catch {
        const { data } = await samplesAPI.list({ search: trimmed, limit: 5 });
        const rows = data.data?.samples || data.data || [];
        const hit = rows.find((s) => s.sample_code === trimmed || String(s.sample_code).includes(trimmed));
        if (!hit) throw new Error('not found');
        sampleId = hit.id;
      }
      const { data } = await samplesAPI.get(sampleId);
      const s = data.data;
      const paras = sortParasSampleTests(s.tests || []);
      if (!paras.length) {
        toast.error(t('parasitology.noParasTests'));
        setSample(null);
        return;
      }
      setSample(s);
      setPanelCode(paras[0].test_code);
      await loadAttachments(paras[0]);
      toast.success(t('parasitologyUpload.ready'));
      fileRef.current?.click();
    } catch {
      toast.error(t('parasitologyUpload.sampleNotFound'));
      setSample(null);
    } finally {
      setLoading(false);
      barcodeRef.current?.select();
    }
  };

  const onBarcodeKey = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      loadSample(barcode);
    }
  };

  const onPanelChange = async (testCode) => {
    setPanelCode(testCode);
    const testRow = parasTests.find((tst) => tst.test_code === testCode);
    await loadAttachments(testRow);
  };

  const onFilePick = async (e) => {
    const raw = normalizeUploadFile(e.target.files?.[0]);
    e.target.value = '';
    if (!raw || !activeTest?.id) {
      if (!activeTest?.id) toast.error(t('parasitology.noParasTests'));
      return;
    }
    setUploading(true);
    try {
      const file = await compressImageForUpload(raw);
      if (file.size > UPLOAD_MAX_BYTES) {
        toast.error(t('parasitology.imageTooLarge'));
        return;
      }
      await resultsAPI.uploadAttachment(activeTest.id, file);
      toast.success(t('parasitology.imageUploaded'));
      await loadAttachments(activeTest);
      barcodeRef.current?.focus();
    } catch (err) {
      const status = err.response?.status;
      const apiMsg = err.response?.data?.error?.message || '';
      if (err?.code === 'HEIC_UNSUPPORTED') toast.error(t('parasitology.imageHeicUnsupported'));
      else if (status === 403) toast.error(t('parasitology.uploadForbidden'));
      else if (status === 502 || status === 503) toast.error(t('parasitology.serverWaking'));
      else if (
        err.response?.data?.error?.code === 'IMAGE_TOO_LARGE'
        || /under \d+ MB|too large|file size/i.test(apiMsg)
      ) toast.error(t('parasitology.imageTooLarge'));
      else toast.error(apiMsg || t('parasitology.imageUploadFailed'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto space-y-6 py-4">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-primary-900 dark:text-primary-100">
          {t('parasitologyUpload.title')}
        </h1>
        <p className="text-sm text-gray-500 mt-2">{t('parasitologyUpload.subtitle')}</p>
      </div>

      <div className="card space-y-3">
        <label className="text-sm font-semibold flex items-center gap-2">
          <ScanLine size={18} />
          {t('parasitologyUpload.scanBarcode')}
        </label>
        <input
          ref={barcodeRef}
          type="text"
          value={barcode}
          onChange={(e) => setBarcode(e.target.value)}
          onKeyDown={onBarcodeKey}
          placeholder="SMP-260623-022279"
          className="input text-lg text-center font-mono"
          autoComplete="off"
          disabled={loading || uploading}
        />
        <button
          type="button"
          onClick={() => loadSample(barcode)}
          disabled={loading || !barcode.trim()}
          className="btn-primary w-full py-3"
        >
          {loading ? t('common.loading') : t('parasitologyUpload.findSample')}
        </button>
      </div>

      {sample && (
        <div className="card space-y-4 border-2 border-primary-200 dark:border-primary-700">
          <div className="text-center">
            <p className="text-xs text-gray-500">{t('parasitologyUpload.currentSample')}</p>
            <p className="text-xl font-bold font-mono">{sample.sample_code}</p>
            <p className="text-sm text-gray-600">{sample.animal_code || sample.animal?.name || '—'}</p>
          </div>

          {parasTests.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {parasTests.map((tst) => (
                <button
                  key={tst.test_code}
                  type="button"
                  onClick={() => onPanelChange(tst.test_code)}
                  className={`flex-1 min-w-[100px] py-2 px-2 rounded-lg text-sm font-medium border ${
                    panelCode === tst.test_code
                      ? 'bg-primary-700 text-white border-primary-700'
                      : 'border-primary-200'
                  }`}
                >
                  {panelLabel(tst, t, i18n)}
                </button>
              ))}
            </div>
          )}

          {parasTests.length === 1 && activeTest && (
            <p className="text-sm text-center text-primary-700 dark:text-primary-300 font-medium">
              {panelLabel(activeTest, t, i18n)}
            </p>
          )}

          <input
            ref={fileRef}
            type="file"
            accept="image/*,.tif,.tiff"
            className="hidden"
            onChange={onFilePick}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading || !activeTest}
            className="w-full py-6 rounded-2xl bg-primary-700 hover:bg-primary-800 text-white text-lg font-bold flex flex-col items-center gap-2 disabled:opacity-50"
          >
            {uploading ? (
              <>
                <Loader2 className="animate-spin" size={32} />
                {t('parasitology.imageUploading')}
              </>
            ) : (
              <>
                <Camera size={36} />
                {t('parasitologyUpload.uploadOnly')}
              </>
            )}
          </button>

          {attachments.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-2">{t('parasitologyUpload.uploadedCount', { count: attachments.length })}</p>
              <div className="grid grid-cols-3 gap-2">
                {attachments.map((a) => (
                  <img
                    key={a.id}
                    src={mediaUrl(a.file_url)}
                    alt=""
                    className="w-full aspect-square object-cover rounded-lg border"
                  />
                ))}
              </div>
            </div>
          )}

          <p className="text-xs text-center text-gray-500">{t('parasitologyUpload.nextSample')}</p>
        </div>
      )}
    </div>
  );
}
