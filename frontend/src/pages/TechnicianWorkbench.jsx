import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import StatusBadge from '../components/ui/StatusBadge';
import Modal from '../components/ui/Modal';
import { samplesAPI, resultsAPI, testsAPI } from '../services/api';
import { filterNonParasTests } from '../utils/parasitologyTests';
import { NORMA_CBC_SECTIONS, normaSectionLabel, isNormaCbcTest, buildCbcResultFields } from '../constants/normaCbcPanel';

export default function TechnicianWorkbench() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [queue, setQueue] = useState([]);
  const [imported, setImported] = useState([]);
  const [critical, setCritical] = useState([]);
  const [selectedSample, setSelectedSample] = useState(null);
  const [resultForm, setResultForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      samplesAPI.getQueue(),
      resultsAPI.critical(),
      samplesAPI.list({ awaiting_validation: true, limit: 50 }),
    ])
      .then(([queueRes, critRes, importedRes]) => {
        setQueue(queueRes.data.data);
        setCritical(critRes.data.data);
        setImported(importedRes.data.data || []);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const sampleId = searchParams.get('sample');
    if (!sampleId) return;
    const match = queue.find((s) => s.id === sampleId);
    if (match) {
      openResultEntry(match);
    } else {
      samplesAPI.get(sampleId).then(({ data }) => openResultEntry(data.data));
    }
  }, [searchParams, queue]);

  const openResultEntry = async (sample) => {
    const { data } = await samplesAPI.get(sample.id);
    const labTests = filterNonParasTests(data.data.tests || []);
    if (!labTests.length) {
      toast(t('workbench.parasOnlyHint'), { icon: '🪱' });
      navigate(`/parasitology?sample=${sample.id}`);
      return;
    }
    setSelectedSample({ ...data.data, tests: labTests });
    const form = {};
    for (const test of labTests) {
      const testDetail = await testsAPI.get(test.test_id);
      const isCbc = testDetail.data.data.code === 'CBC-FULL' || test.test_code === 'CBC-FULL';
      let existing = null;
      try {
        const res = await resultsAPI.get(test.id);
        existing = res.data.data;
      } catch { /* no results yet */ }
      form[test.id] = isCbc
        ? buildCbcResultFields(testDetail.data.data.parameters || [], existing)
        : (testDetail.data.data.parameters || []).map((p) => {
          const val = existing?.values?.find((v) => v.parameter_id === p.id);
          return {
            parameter_id: p.id,
            code: p.code,
            name: p.name,
            unit: p.unit,
            value: val?.value || '',
            flag: val?.flag,
            reference: val?.reference || '',
          };
        });
    }
    setResultForm(form);
  };

  const submitAllResults = async () => {
    if (!selectedSample?.tests?.length) return;

    const payloads = selectedSample.tests
      .map((test) => {
        const fields = resultForm[test.id] || [];
        const values = fields
          .filter((v) => v.parameter_id && String(v.value ?? '').trim() !== '');
        if (!values.length) return null;
        return {
          sample_test_id: test.id,
          values: values.map((v) => ({ parameter_id: v.parameter_id, value: v.value })),
        };
      })
      .filter(Boolean);

    if (!payloads.length) return toast.error(t('workbench.enterOneValue'));

    setSaving(true);
    try {
      for (const payload of payloads) {
        await resultsAPI.enter(payload);
      }
      toast.success(t('workbench.saved'));
      setSelectedSample(null);
      load();
    } catch (err) {
      const msg = err.response?.data?.error?.message
        || err.response?.data?.error?.details?.[0]?.message
        || 'Error';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const hasEnterableFields = selectedSample?.tests?.some(
    (test) => (resultForm[test.id] || []).length > 0
  );

  const clearTestResults = async (test) => {
    if (!window.confirm(t('workbench.clearResultsConfirm'))) return;
    try {
      await resultsAPI.clear(test.id);
      toast.success(t('workbench.resultsCleared'));
      await openResultEntry(selectedSample);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Error');
    }
  };

  const renderParamField = (test, param, idx) => (
    <div key={param.parameter_id}>
      <label className="text-sm font-medium">
        {param.name}
        {param.unit && param.unit !== 'qual' && ` (${param.unit})`}
        {param.missing_in_db && (
          <span className="text-xs text-amber-600 ms-1">({t('workbench.paramMissing', { defaultValue: 'not synced' })})</span>
        )}
        {param.reference && (
          <span className="text-xs font-normal text-gray-500 ms-2">
            {t('workbench.ref', { defaultValue: 'Ref' })}: {param.reference}
            {param.flag && param.flag !== 'NORMAL' && param.flag !== '' && (
              <span className={`ms-1 font-semibold ${['HIGH', 'CRIT_HIGH', 'POS'].includes(param.flag) ? 'text-red-600' : 'text-blue-600'}`}>
                {param.flag}
              </span>
            )}
          </span>
        )}
      </label>
      {param.unit === 'qual' ? (
        <select
          value={param.value}
          onChange={(e) => {
            const updated = [...resultForm[test.id]];
            updated[idx] = { ...param, value: e.target.value };
            setResultForm({ ...resultForm, [test.id]: updated });
          }}
          className="input-field mt-1"
        >
          <option value="">—</option>
          <option value="Negative">{t('parasitology.negative', { defaultValue: 'Negative' })}</option>
          <option value="Positive">{t('parasitology.positive', { defaultValue: 'Positive' })}</option>
        </select>
      ) : (
        <input
          value={param.value}
          onChange={(e) => {
            const updated = [...resultForm[test.id]];
            updated[idx] = { ...param, value: e.target.value };
            setResultForm({ ...resultForm, [test.id]: updated });
          }}
          className="input-field mt-1"
        />
      )}
    </div>
  );

  const renderTestFields = (test, fields) => {
    if (!isNormaCbcTest(test)) {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {fields.map((param, idx) => renderParamField(test, param, idx))}
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {NORMA_CBC_SECTIONS.map((section) => {
          const sectionRows = fields
            .map((param, idx) => ({ param, idx }))
            .filter(({ param }) => param.norma_section === section);
          if (!sectionRows.length) return null;
          return (
            <div key={section}>
              <h5 className="text-sm font-semibold text-primary-700 dark:text-primary-300 mb-2 border-b border-primary-100 dark:border-primary-800 pb-1">
                {normaSectionLabel(section, t)}
              </h5>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {sectionRows.map(({ param, idx }) => renderParamField(test, param, idx))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  if (loading) return <div className="text-center py-20">{t('common.loading')}</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">{t('workbench.title')}</h1>

      {critical.length > 0 && (
        <div className="card mb-6 border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
          <h3 className="font-semibold text-red-700 dark:text-red-400 mb-2">{t('dashboard.critical')} ({critical.length})</h3>
          {critical.map((c) => (
            <p key={c.id} className="text-sm">{c.sample_code} - {c.test_name} - {c.customer_name}</p>
          ))}
        </div>
      )}

      {imported.length > 0 && (
        <div className="card mb-6 border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-900/20">
          <h3 className="font-semibold text-green-800 dark:text-green-300 mb-2">{t('workbench.importedTitle')}</h3>
          <p className="text-sm text-green-700 dark:text-green-400 mb-3">{t('workbench.importedHint')}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {imported.map((sample) => (
              <button
                key={sample.id}
                type="button"
                onClick={() => openResultEntry(sample)}
                className="text-start p-3 rounded-lg border border-green-200 dark:border-green-800 bg-white/80 dark:bg-gray-900/40 hover:border-green-500"
              >
                <span className="font-mono font-medium">{sample.sample_code}</span>
                <p className="text-xs text-gray-500 mt-1">{sample.customer_name}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      <h2 className="text-lg font-semibold mb-3">{t('workbench.awaitingEntry')}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {queue.map((sample) => (
          <div key={sample.id} className="card hover:border-primary-500 transition cursor-pointer" onClick={() => openResultEntry(sample)}>
            <div className="flex justify-between items-start mb-2">
              <span className="font-mono font-medium">{sample.sample_code}</span>
              <StatusBadge status={sample.status} label={t(`samples.statuses.${sample.status}`)} />
            </div>
            <p className="text-sm text-gray-500">{sample.customer_name}</p>
            <p className="text-sm">{sample.animal_code}</p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 font-medium">
              {sample.pending_tests} {t('workbench.testsPending')}
            </p>
            {sample.pending_test_names?.length > 0 && (
              <p className="text-xs text-gray-500 mt-1 line-clamp-2" title={sample.pending_test_names.join('، ')}>
                {sample.pending_test_names.join('، ')}
              </p>
            )}
          </div>
        ))}
        {!queue.length && <p className="text-gray-500 col-span-full text-center py-8">{t('workbench.emptyQueue')}</p>}
      </div>

      <Modal isOpen={!!selectedSample} onClose={() => setSelectedSample(null)} title={`${t('workbench.resultsFor')}: ${selectedSample?.sample_code}`} size="xl">
        {selectedSample?.tests?.map((test) => {
          const fields = resultForm[test.id] || [];
          return (
            <div key={test.id} className="mb-6 border-b pb-4 last:border-0">
              <div className="flex justify-between items-center mb-3 gap-2">
                <h4 className="font-semibold">{test.test_name}</h4>
                {(resultForm[test.id] || []).some((v) => String(v.value ?? '').trim() !== '') && (
                  <button type="button" onClick={() => clearTestResults(test)} className="text-red-600 text-sm hover:underline">
                    {t('workbench.clearResults')}
                  </button>
                )}
              </div>
              {fields.length === 0 ? (
                <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-sm text-amber-800 dark:text-amber-300">
                  <p className="mb-2">{t('workbench.noParametersHint')}</p>
                  <Link to="/tests" className="text-primary-600 underline font-medium" onClick={() => setSelectedSample(null)}>
                    {t('workbench.goToTests')}
                  </Link>
                </div>
              ) : (
                renderTestFields(test, fields)
              )}
            </div>
          );
        })}
        {hasEnterableFields && (
          <div className="pt-4 mt-2 border-t border-primary-200 dark:border-primary-700">
            <button
              type="button"
              onClick={submitAllResults}
              disabled={saving}
              className="btn-primary w-full py-3"
            >
              {saving ? t('common.loading') : t('workbench.save')}
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
