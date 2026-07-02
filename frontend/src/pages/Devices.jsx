import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Cpu, RefreshCw, Power, Copy } from 'lucide-react';
import toast from 'react-hot-toast';
import { devicesAPI } from '../services/api';

const BRIDGE_LISTEN_PORT = 21110;
const LIMS_CLOUD_API = 'https://lims.rarevetcare.com/api';

/** Full cloud API URL for bridge.env (never a relative /api path). */
const resolveBridgeApiUrl = () => {
  const env = import.meta.env.VITE_API_URL;
  if (env && /^https?:\/\//i.test(env)) return env.replace(/\/$/, '');
  if (typeof window !== 'undefined') return `${window.location.origin}/api`.replace(/\/$/, '');
  return LIMS_CLOUD_API;
};

const buildBridgeEnvFile = (norma, apiKeyOnce) => {
  if (!norma) return '';
  const key = apiKeyOnce || norma.config?.api_key_once || 'REGENERATE_KEY_IN_DEVICES_PAGE';
  return [
    `LIMS_API_URL=${resolveBridgeApiUrl()}`,
    `DEVICE_ID=${norma.id}`,
    `DEVICE_API_KEY=${key}`,
    `LISTEN_PORT=${BRIDGE_LISTEN_PORT}`,
  ].join('\n');
};

export default function Devices() {
  const { t } = useTranslation();
  const [configured, setConfigured] = useState([]);
  const [supported, setSupported] = useState([]);
  const [messages, setMessages] = useState([]);
  const [selected, setSelected] = useState(null);
  const [revealedApiKey, setRevealedApiKey] = useState(null);
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
    setRevealedApiKey(device.api_key_once || null);
    const { data } = await devicesAPI.messages(device.id);
    setMessages(data.data || []);
  };

  const activateNorma = async () => {
    const norma = supported.find((d) => d.name === 'Norma CBC');
    const existing = configured.find((d) => d.name === 'Norma CBC');
    try {
      if (existing) {
        const { data } = await devicesAPI.update(existing.id, { ...existing, is_active: true, protocol: 'HL7', connection_type: 'tcp', port: BRIDGE_LISTEN_PORT });
        toast.success(t('devices.activated'));
        setSelected(data.data);
        setRevealedApiKey(null);
      } else {
        const { data } = await devicesAPI.create({
          name: 'Norma CBC',
          model: norma?.model || 'iVet-5',
          protocol: 'HL7',
          connection_type: 'tcp',
          host: '0.0.0.0',
          port: BRIDGE_LISTEN_PORT,
          is_active: true,
          config: { test_code: 'CBC-FULL' },
        });
        toast.success(t('devices.created'));
        setSelected(data.data);
        setRevealedApiKey(data.data?.api_key_once || null);
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
      setRevealedApiKey(data.data?.api_key_once || null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'خطأ');
    }
  };

  const copyKey = () => {
    const key = revealedApiKey || selected?.api_key_once;
    if (!key) {
      toast.error(t('devices.keyHiddenHint') || 'Regenerate key to view once');
      return;
    }
    navigator.clipboard.writeText(key);
    toast.success(t('devices.keyCopied'));
  };

  const copyBridgeEnv = () => {
    const text = buildBridgeEnvFile(norma, revealedApiKey || selected?.api_key_once);
    if (!text) return;
    navigator.clipboard.writeText(text);
    toast.success(t('devices.bridgeEnvCopied'));
  };

  const copyPm2Commands = () => {
    const text = [
      'cd C:\\RareVet\\bridge',
      '.\\configure-lab-bridge.ps1',
      'pm2 status',
      'pm2 logs norma-bridge --lines 20',
    ].join('\n');
    navigator.clipboard.writeText(text);
    toast.success(t('devices.commandsCopied'));
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
                    <code className="text-xs break-all">
                      {revealedApiKey || selected?.api_key_once || norma.config?.api_key_masked || '••••••••'}
                    </code>
                    <button onClick={copyKey} className="text-primary-600"><Copy size={14} /></button>
                    <button onClick={regenerateKey} className="text-primary-600"><RefreshCw size={14} /></button>
                  </p>
                  <p><strong>{t('devices.protocol')}:</strong> HL7 (أو ASTM)</p>
                  <p><strong>{t('devices.lisPort')}:</strong> {BRIDGE_LISTEN_PORT}</p>
                  <p className="text-xs text-primary-600 dark:text-primary-400 pt-1 border-t border-primary-200/60">
                    {t('devices.lisIpHint')}
                  </p>
                  <p className="text-xs text-primary-600 dark:text-primary-400">
                    {t('devices.bcSmpHint')}
                  </p>
                </div>

                <div className="text-sm space-y-2">
                  <p className="font-medium">{t('devices.normaLisTitle')}</p>
                  <ul className="text-xs space-y-1 text-primary-700 dark:text-primary-300 list-disc list-inside">
                    <li>{t('devices.normaLisIp')}</li>
                    <li>{t('devices.normaLisPort', { port: BRIDGE_LISTEN_PORT })}</li>
                    <li>{t('devices.normaLisHl7')}</li>
                    <li>{t('devices.normaLisAuto')}</li>
                    <li>{t('devices.normaLisRepeatId')}</li>
                  </ul>
                </div>

                <div className="text-sm space-y-2">
                  <p className="font-medium">{t('devices.stepsTitle')}</p>
                  <ol className="list-decimal list-inside space-y-1 text-primary-700 dark:text-primary-300">
                    <li>{t('devices.step1')}</li>
                    <li>{t('devices.step2')}</li>
                    <li>{t('devices.step3')}</li>
                    <li>{t('devices.step4')}</li>
                    <li>{t('devices.step5')}</li>
                  </ol>
                </div>

                <div>
                  <p className="text-sm font-medium mb-1">{t('devices.bridgeEnvTitle')}</p>
                  <p className="text-xs text-gray-500 mb-2">{t('devices.bridgeEnvHint')}</p>
                  <pre className="text-xs bg-gray-900 text-green-400 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap">
{buildBridgeEnvFile(norma)}
                  </pre>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <button type="button" onClick={copyBridgeEnv} className="btn-secondary text-xs py-1.5">
                      {t('devices.copyBridgeEnv')}
                    </button>
                    <button type="button" onClick={copyPm2Commands} className="btn-secondary text-xs py-1.5">
                      {t('devices.copyPm2Commands')}
                    </button>
                  </div>
                </div>

                <pre className="text-xs bg-gray-800 text-gray-300 p-3 rounded-lg overflow-x-auto">
{`cd C:\\RareVet\\bridge
.\\configure-lab-bridge.ps1
pm2 logs norma-bridge --lines 20`}
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
