import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Bug, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import DataTable from '../components/ui/DataTable';
import { devicesAPI } from '../services/api';

export default function NormaRefDebug() {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const [messageId, setMessageId] = useState('');
  const [sampleId, setSampleId] = useState('');
  const [trace, setTrace] = useState(null);
  const [audit, setAudit] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadMessage = async () => {
    if (!messageId.trim()) return;
    setLoading(true);
    try {
      const { data } = await devicesAPI.refDebugMessage(messageId.trim());
      setTrace(data.data);
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Error');
      setTrace(null);
    } finally {
      setLoading(false);
    }
  };

  const loadSample = async () => {
    if (!sampleId.trim()) return;
    setLoading(true);
    try {
      const { data } = await devicesAPI.refDebugSample(sampleId.trim());
      setTrace(data.data);
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Error');
      setTrace(null);
    } finally {
      setLoading(false);
    }
  };

  const runSpeciesAudit = async () => {
    setLoading(true);
    try {
      const { data } = await devicesAPI.refDebugSpeciesAudit();
      setAudit(data.data);
      toast.success(isAr ? 'اكتمل تدقيق الأنواع' : 'Species audit complete');
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Error');
    } finally {
      setLoading(false);
    }
  };

  const paramColumns = [
    { key: 'parameterCode', label: isAr ? 'الكود' : 'Code' },
    { key: 'species', label: isAr ? 'النوع' : 'Species' },
    { key: 'result', label: isAr ? 'النتيجة' : 'Result' },
    { key: 'unit', label: isAr ? 'الوحدة' : 'Unit' },
    { key: 'rawObx7', label: 'OBX-7 (Norma)' },
    { key: 'parsedLow', label: isAr ? 'أدنى' : 'Low' },
    { key: 'parsedHigh', label: isAr ? 'أعلى' : 'High' },
    { key: 'storedInDb', label: isAr ? 'محفوظ DB' : 'DB stored' },
    { key: 'reportReference', label: isAr ? 'التقرير' : 'Report' },
    {
      key: 'mismatch',
      label: isAr ? 'اختلاف' : 'Diff',
      render: (r) => (r.mismatch ? '⚠' : '✓'),
    },
    { key: 'mismatchReason', label: isAr ? 'السبب' : 'Reason' },
  ];

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center gap-2">
        <Bug className="w-6 h-6 text-primary-600" />
        <h1 className="text-xl font-bold">
          {isAr ? 'تصحيح معدلات Norma المرجعية' : 'Norma Reference Debug'}
        </h1>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="card p-4 space-y-2">
          <label className="text-sm font-medium">{isAr ? 'معرّف الرسالة' : 'Message ID'}</label>
          <div className="flex gap-2">
            <input
              className="input flex-1 font-mono text-sm"
              value={messageId}
              onChange={(e) => setMessageId(e.target.value)}
              placeholder="uuid"
            />
            <button type="button" className="btn-primary" onClick={loadMessage} disabled={loading}>
              <Search className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="card p-4 space-y-2">
          <label className="text-sm font-medium">{isAr ? 'معرّف العينة' : 'Sample ID'}</label>
          <div className="flex gap-2">
            <input
              className="input flex-1 font-mono text-sm"
              value={sampleId}
              onChange={(e) => setSampleId(e.target.value)}
              placeholder="uuid"
            />
            <button type="button" className="btn-primary" onClick={loadSample} disabled={loading}>
              <Search className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <button type="button" className="btn-secondary flex items-center gap-2" onClick={runSpeciesAudit} disabled={loading}>
        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        {isAr ? 'تدقيق كل الأنواع (7)' : 'Audit all 7 species'}
      </button>

      {trace && (
        <div className="space-y-4">
          <div className="card p-4 text-sm grid md:grid-cols-3 gap-2">
            <p><strong>{isAr ? 'النوع' : 'Species'}:</strong> {trace.species || '—'}</p>
            <p><strong>{isAr ? 'نص Norma' : 'Norma raw'}:</strong> {trace.speciesRaw || '—'}</p>
            <p><strong>{isAr ? 'اختلالات' : 'Mismatches'}:</strong> {trace.mismatchCount}</p>
          </div>

          <div className="card p-4">
            <h2 className="font-semibold mb-2">{isAr ? 'HL7 خام' : 'Raw HL7'}</h2>
            <pre className="text-xs bg-gray-50 p-3 rounded overflow-auto max-h-48 whitespace-pre-wrap font-mono">
              {trace.rawHl7 || '—'}
            </pre>
          </div>

          <div className="card p-4">
            <h2 className="font-semibold mb-2">{isAr ? 'مقارنة المعدلات' : 'Reference pipeline'}</h2>
            <DataTable columns={paramColumns} data={trace.parameters || []} loading={loading} />
          </div>
        </div>
      )}

      {audit && (
        <div className="card p-4 space-y-4">
          <h2 className="font-semibold">
            {isAr ? 'تقرير الأنواع' : 'Species audit'}
            {' '}
            ({audit.summary?.mismatches}/{audit.summary?.total} {isAr ? 'اختلال' : 'mismatches'})
          </h2>
          {audit.species?.map((block) => (
            <div key={block.species} className="border rounded p-3">
              <p className="font-medium">{block.species} — {block.status}</p>
              {block.parameters?.length > 0 && (
                <ul className="text-xs mt-2 space-y-1 font-mono">
                  {block.parameters.filter((p) => p.mismatch).map((p) => (
                    <li key={p.parameterCode} className="text-amber-800">
                      {p.parameterCode}: {p.mismatchReason}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
