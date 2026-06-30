import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams, Link } from 'react-router-dom';
import { CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import StatusBadge from '../components/ui/StatusBadge';
import Modal from '../components/ui/Modal';
import { samplesAPI, resultsAPI } from '../services/api';
import { NORMA_CBC_SECTIONS, normaSectionLabel, isNormaCbcTest } from '../constants/normaCbcPanel';

export default function VetReview() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [samples, setSamples] = useState([]);
  const [selected, setSelected] = useState(null);
  const [results, setResults] = useState({});
  const [doctorNotes, setDoctorNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [validating, setValidating] = useState(false);

  const load = () => {
    setLoading(true);
    samplesAPI.list({ awaiting_validation: true, limit: 100 })
      .then(({ data }) => setSamples(data.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const sampleId = searchParams.get('sample');
    if (!sampleId) return;
    const match = samples.find((s) => s.id === sampleId);
    if (match) {
      openReview(match);
    } else {
      samplesAPI.get(sampleId).then(({ data }) => openReview(data.data));
    }
  }, [searchParams, samples]);

  const openReview = async (sample) => {
    const { data } = await samplesAPI.get(sample.id);
    setSelected(data.data);
    const resMap = {};
    for (const test of data.data.tests || []) {
      try {
        const res = await resultsAPI.get(test.id);
        resMap[test.id] = res.data.data;
      } catch { resMap[test.id] = null; }
    }
    setResults(resMap);
    setDoctorNotes('');
  };

  const hasFilledValues = (values) => (values || []).some(
    (v) => String(v.value ?? '').trim() !== '' || String(v.pct_value ?? '').trim() !== ''
  );

  const pendingTests = (sample) => (sample?.tests || []).filter((test) => {
    const res = results[test.id];
    return res && !res.is_validated && hasFilledValues(res.values);
  });

  const validateTest = async (sampleTestId, closeAfter = true) => {
    await resultsAPI.validate(sampleTestId, doctorNotes);
    if (closeAfter) {
      toast.success(t('resultValidation.approved'));
      setSelected(null);
      load();
    }
  };

  const validateAll = async () => {
    const tests = pendingTests(selected);
    if (!tests.length) return toast.error(t('resultValidation.nothingToApprove'));
    setValidating(true);
    try {
      for (const test of tests) {
        await validateTest(test.id, false);
      }
      toast.success(t('resultValidation.approvedAll'));
      setSelected(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'خطأ');
    } finally {
      setValidating(false);
    }
  };

  const flagLabel = (flag) => t(`resultValidation.flags.${flag}`, { defaultValue: flag });

  const renderFlagCell = (v) => {
    const hasValue = String(v.value ?? '').trim() !== '' || String(v.pct_value ?? '').trim() !== '';
    if (!hasValue) return <td className="text-gray-400">—</td>;
    const flag = v.flag || 'NORMAL';
    return (
      <td>
        <StatusBadge status={flag} label={flagLabel(flag)} />
      </td>
    );
  };

  const renderValueRows = (test, values) => {
    const rows = (items) => items.map((v) => (
      <tr key={v.parameter_code || v.parameter_id} className="border-t">
        <td className="py-1">
          {v.parameter_name}
          {v.pct_value && <span className="text-gray-500 text-xs ms-1">*{v.pct_value}%</span>}
        </td>
        <td>
          {String(v.value ?? '').trim() !== '' ? `${v.value} ${v.unit || ''}`.trim() : '—'}
        </td>
        <td className="text-gray-500">{v.reference || '—'}</td>
        {renderFlagCell(v)}
      </tr>
    ));

    if (!isNormaCbcTest(test)) return rows(values);

    return NORMA_CBC_SECTIONS.flatMap((section) => {
      const sectionValues = values.filter((v) => v.norma_section === section);
      if (!sectionValues.length) return [];
      return [
        <tr key={`hdr-${section}`} className="bg-primary-50 dark:bg-primary-900/20">
          <td colSpan={4} className="py-1.5 font-semibold text-primary-700 dark:text-primary-300 text-xs">
            {normaSectionLabel(section, t)}
          </td>
        </tr>,
        ...rows(sectionValues),
      ];
    });
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">{t('resultValidation.title')}</h1>
      <p className="text-sm text-primary-500 mb-6">{t('resultValidation.subtitle')}</p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {samples.map((s) => (
          <div key={s.id} className="card hover:border-primary-500 cursor-pointer transition" onClick={() => openReview(s)}>
            <div className="flex justify-between mb-2">
              <span className="font-mono font-medium">{s.sample_code}</span>
              <StatusBadge status={s.status} label={t(`samples.statuses.${s.status}`)} />
            </div>
            <p className="text-sm text-gray-500">{s.customer_name}</p>
            <p className="text-sm">{s.animal_code}</p>
          </div>
        ))}
        {!samples.length && (
          <div className="col-span-full card text-center py-10">
            <p className="text-gray-600 dark:text-gray-300 font-medium mb-3">{t('resultValidation.emptyTitle')}</p>
            <ol className="text-sm text-gray-500 space-y-2 max-w-md mx-auto text-start list-decimal list-inside mb-4">
              <li>{t('resultValidation.emptyStep1')}</li>
              <li>{t('resultValidation.emptyStep2')}</li>
              <li>{t('resultValidation.emptyStep3')}</li>
            </ol>
            <div className="flex flex-wrap justify-center gap-2">
              <Link to="/workbench" className="btn-primary">{t('nav.workbench')}</Link>
              <Link to="/parasitology" className="btn-secondary">{t('nav.parasitology')}</Link>
            </div>
          </div>
        )}
      </div>

      <Modal isOpen={!!selected} onClose={() => setSelected(null)} title={`${t('resultValidation.review')}: ${selected?.sample_code}`} size="xl">
        {selected?.tests?.map((test) => {
          const res = results[test.id];
          return (
            <div key={test.id} className="mb-6 border-b pb-4 last:border-0">
              <div className="flex justify-between items-center mb-3">
                <h4 className="font-semibold">{test.test_name}</h4>
                {res?.is_validated && (
                  <span className="text-green-600 text-sm flex items-center gap-1">
                    <CheckCircle size={14} /> {t('resultValidation.approvedBadge')}
                  </span>
                )}
              </div>
              {res?.values?.length > 0 && hasFilledValues(res.values) ? (
                <table className="w-full text-sm mb-3">
                  <thead>
                    <tr className="text-gray-500">
                      <th className="text-start py-1">{t('resultValidation.parameter')}</th>
                      <th className="text-start">{t('resultValidation.result')}</th>
                      <th className="text-start">{t('resultValidation.reference', { defaultValue: 'Reference' })}</th>
                      <th className="text-start">{t('resultValidation.flag')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {renderValueRows(test, res.values)}
                  </tbody>
                </table>
              ) : (
                <p className="text-gray-500 text-sm mb-3">{t('resultValidation.noResultsYet')}</p>
              )}
              {res && !res.is_validated && hasFilledValues(res.values) && (
                <button type="button" onClick={() => validateTest(test.id)} className="btn-secondary text-sm">
                  {t('resultValidation.approveTest')}
                </button>
              )}
            </div>
          );
        })}
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">{t('resultValidation.notes')}</label>
            <textarea
              value={doctorNotes}
              onChange={(e) => setDoctorNotes(e.target.value)}
              className="input-field"
              rows={2}
              placeholder={t('resultValidation.notesPlaceholder')}
            />
          </div>
          {pendingTests(selected).length > 0 && (
            <button type="button" onClick={validateAll} disabled={validating} className="btn-primary w-full py-3">
              {validating ? t('common.loading') : t('resultValidation.approveAll')}
            </button>
          )}
        </div>
      </Modal>
    </div>
  );
}
