import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Cpu, RefreshCw, Power, Copy } from 'lucide-react';
import toast from 'react-hot-toast';
import { devicesAPI } from '../services/api';

export default function Devices() {
  const { t } = useTranslation();
  const [configured, setConfigured] = useState([]);
  const [supported, setSupported] = useState([]);
  const [messages, setMessages] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    devicesAPI.list()
      .then(({ data }) => {
        setConfigured(data.data.configured || []);
        setSupported(data.data.supported || []);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const selectDevice = async (device) => {
    setSelected(device);
    const { data } = await devicesAPI.messages(device.id);
    setMessages(data.data || []);
  };

  const activateNorma = async () => {
    const norma = supported.find((d) => d.name === 'Norma CBC');
    const existing = configured.find((d) => d.name === 'Norma CBC');
    try {
      if (existing) {
        const { data } = await devicesAPI.update(existing.id, { ...existing, is_active: true, protocol: 'HL7', connection_type: 'tcp', port: 2575 });
        toast.success(t('devices.activated'));
        setSelected(data.data);
      } else {
        const { data } = await devicesAPI.create({
          name: 'Norma CBC',
          model: norma?.model || 'iVet-5',
          protocol: 'HL7',
          connection_type: 'tcp',
          host: '0.0.0.0',
          port: 2575,
          is_active: true,
          config: { test_code: 'CBC-FULL' },
        });
        toast.success(t('devices.created'));
        setSelected(data.data);
      }
      load();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'خطأ');
    }
  };

  const toggleActive = async (device) => {
    try {
      await devicesAPI.update(device.id, { ...device, is_active: !device.is_active });
      toast.success(t('devices.updated'));
      load();
      if (selected?.id === device.id) selectDevice({ ...device, is_active: !device.is_active });
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'خطأ');
    }
  };

  const regenerateKey = async () => {
    if (!selected) return;
    try {
      const { data } = await devicesAPI.regenerateKey(selected.id);
      toast.success(t('devices.keyRegenerated'));
      setSelected(data.data);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'خطأ');
    }
  };

  const copyKey = () => {
    const key = selected?.config?.api_key;
    if (!key) return;
    navigator.clipboard.writeText(key);
    toast.success(t('devices.keyCopied'));
  };

  const norma = configured.find((d) => d.name === 'Norma CBC') || selected;

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Cpu size={24} /> {t('devices.title')}
          </h1>
          <p className="text-sm text-primary-500 mt-1">{t('devices.subtitle')}</p>
        </div>
        <button onClick={activateNorma} className="btn-primary flex items-center gap-2">
          <Power size={18} /> {t('devices.setupNorma')}
        </button>
      </div>

      {loading ? (
        <p className="text-center py-12 text-gray-500">{t('common.loading')}</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card space-y-3">
            <h3 className="font-semibold">{t('devices.configured')}</h3>
            {configured.length === 0 && <p className="text-sm text-gray-500">{t('devices.noneYet')}</p>}
            {configured.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => selectDevice(d)}
                className={`w-full text-start p-3 rounded-lg border ${selected?.id === d.id ? 'border-primary-500 bg-primary-50' : 'border-gray-200'}`}
              >
                <div className="flex justify-between items-center">
                  <span className="font-medium">{d.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded ${d.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100'}`}>
                    {d.is_active ? t('devices.active') : t('devices.inactive')}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">{d.protocol} / {d.connection_type} — {t('devices.port')} {d.port || '—'}</p>
              </button>
            ))}
          </div>

          <div className="card space-y-4">
            {norma ? (
              <>
                <h3 className="font-semibold">{t('devices.normaSetup')}</h3>
                <div className="text-sm space-y-2 bg-primary-50 dark:bg-primary-900/20 p-4 rounded-lg">
                  <p><strong>{t('devices.deviceId')}:</strong> <code className="text-xs break-all">{norma.id}</code></p>
                  <p className="flex items-center gap-2 flex-wrap">
                    <strong>{t('devices.apiKey')}:</strong>
                    <code className="text-xs break-all">{norma.config?.api_key || '—'}</code>
                    <button onClick={copyKey} className="text-primary-600"><Copy size={14} /></button>
                    <button onClick={regenerateKey} className="text-primary-600"><RefreshCw size={14} /></button>
                  </p>
                  <p><strong>{t('devices.protocol')}:</strong> HL7 (أو ASTM)</p>
                  <p><strong>{t('devices.lisPort')}:</strong> 2575</p>
                </div>

                <div className="text-sm space-y-2">
                  <p className="font-medium">{t('devices.stepsTitle')}</p>
                  <ol className="list-decimal list-inside space-y-1 text-primary-700">
                    <li>{t('devices.step1')}</li>
                    <li>{t('devices.step2')}</li>
                    <li>{t('devices.step3')}</li>
                    <li>{t('devices.step4')}</li>
                    <li>{t('devices.step5')}</li>
                  </ol>
                </div>

                <pre className="text-xs bg-gray-900 text-green-400 p-3 rounded-lg overflow-x-auto">
{`cd bridge
set LIMS_API_URL=https://rare-vet-lims.onrender.com/api
set DEVICE_ID=${norma.id}
set DEVICE_API_KEY=${norma.config?.api_key || 'YOUR_KEY'}
set LISTEN_PORT=2575
npm start`}
                </pre>

                <button onClick={() => toggleActive(norma)} className="btn-secondary w-full">
                  {norma.is_active ? t('devices.deactivate') : t('devices.activate')}
                </button>
              </>
            ) : (
              <p className="text-sm text-gray-500">{t('devices.clickSetup')}</p>
            )}
          </div>
        </div>
      )}

      {selected && (
        <div className="card mt-6">
          <h3 className="font-semibold mb-3">{t('devices.recentMessages')}</h3>
          {messages.length === 0 ? (
            <p className="text-sm text-gray-500">{t('devices.noMessages')}</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto text-xs">
              {messages.map((m) => (
                <div key={m.id} className="p-2 bg-gray-50 dark:bg-gray-800 rounded flex justify-between gap-2">
                  <span>{new Date(m.created_at).toLocaleString()}</span>
                  <span className={`font-medium ${m.status === 'imported' ? 'text-green-600' : m.status === 'failed' ? 'text-red-600' : 'text-gray-600'}`}>
                    {m.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
