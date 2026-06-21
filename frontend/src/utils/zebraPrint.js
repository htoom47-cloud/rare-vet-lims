const SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE';

export class ZebraPrintError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'ZebraPrintError';
    this.code = code;
  }
}

export const isBrowserPrintMissing = (error) => (
  error instanceof ZebraPrintError && error.code === SERVICE_UNAVAILABLE
);

const browserPrintBase = () => {
  const secure = typeof window !== 'undefined' && window.location.protocol === 'https:';
  return secure ? 'https://127.0.0.1:9101' : 'http://127.0.0.1:9100';
};

async function browserPrintFetch(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 3000);
  try {
    const res = await fetch(`${browserPrintBase()}${path}`, {
      ...options,
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new ZebraPrintError(`Browser Print HTTP ${res.status}`, SERVICE_UNAVAILABLE);
    }
    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  } catch (error) {
    if (error instanceof ZebraPrintError) throw error;
    throw new ZebraPrintError(
      error?.name === 'AbortError' ? 'Browser Print timeout' : 'Browser Print not running',
      SERVICE_UNAVAILABLE
    );
  } finally {
    clearTimeout(timeout);
  }
}

const normalizeDevice = (payload) => {
  if (!payload) return null;
  if (payload.device) return payload.device;
  if (payload.uid) return payload;
  if (Array.isArray(payload.deviceList) && payload.deviceList[0]) return payload.deviceList[0];
  if (Array.isArray(payload) && payload[0]) return payload[0];
  return null;
};

let browserPrintLoader;

export const loadBrowserPrintSdk = () => {
  if (typeof window !== 'undefined' && window.BrowserPrint) {
    return Promise.resolve(window.BrowserPrint);
  }
  if (!browserPrintLoader) {
    browserPrintLoader = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/zebra-browser-print-min@3.0.216/BrowserPrint-3.0.216.min.js';
      script.async = true;
      script.onload = () => {
        if (window.BrowserPrint) resolve(window.BrowserPrint);
        else reject(new ZebraPrintError('BrowserPrint SDK missing', SERVICE_UNAVAILABLE));
      };
      script.onerror = () => reject(new ZebraPrintError('BrowserPrint SDK failed to load', SERVICE_UNAVAILABLE));
      document.head.appendChild(script);
    });
  }
  return browserPrintLoader;
};

const getDefaultDeviceSdk = () => new Promise((resolve, reject) => {
  loadBrowserPrintSdk()
    .then((BrowserPrint) => {
      BrowserPrint.getDefaultDevice('printer', (device) => {
        if (device) resolve(device);
        else reject(new ZebraPrintError('No default Zebra printer', SERVICE_UNAVAILABLE));
      }, (err) => {
        reject(new ZebraPrintError(typeof err === 'string' ? err : 'BrowserPrint device lookup failed', SERVICE_UNAVAILABLE));
      });
    })
    .catch(reject);
});

export async function getDefaultPrinter() {
  try {
    return await getDefaultDeviceSdk();
  } catch {
    const data = await browserPrintFetch('/default?type=printer', { timeoutMs: 2500 });
    return normalizeDevice(data);
  }
}

const LABEL_WIDTH = 400;
const LABEL_HEIGHT = 200;

const zplEscape = (value) => String(value ?? '')
  .replace(/\\/g, '\\\\')
  .replace(/\^/g, '\\^')
  .replace(/~/g, '\\~');

const truncate = (text, max) => {
  const s = String(text || '').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
};

const testLabelFor = (sample, isArabic) => (sample.tests || [])
  .map((t) => (isArabic ? t.test_name_ar : t.test_name) || t.test_name || t.test_code)
  .filter(Boolean)
  .join(' · ');

export const buildCbcLabelZpl = (sample, { isArabic = false } = {}) => {
  const barcode = String(sample.barcode || sample.sample_code || '').trim();
  const animalLine = truncate(
    [sample.animal_code, sample.animal_name].filter(Boolean).join(' · '),
    34
  );
  const testLine = truncate(testLabelFor(sample, isArabic), 36);

  const lines = [
    '^XA',
    '^CI28',
    `^PW${LABEL_WIDTH}`,
    `^LL${LABEL_HEIGHT}`,
    '^LH0,0',
  ];

  if (barcode) {
    lines.push(`^FO30,4^BY2,2,32^BCN,32,Y,N,N^FD${zplEscape(barcode)}^FS`);
  }

  let y = 78;
  if (animalLine) {
    lines.push(`^FO10,${y}^A0N,14,12^FD${zplEscape(animalLine)}^FS`);
    y += 18;
  }
  if (testLine) {
    lines.push(`^FO10,${y}^A0N,14,12^FD${zplEscape(testLine)}^FS`);
  }

  lines.push('^XZ');
  return lines.join('\n');
};

const sendZplSdk = (device, zpl) => new Promise((resolve, reject) => {
  device.send(zpl, () => resolve(), (err) => {
    reject(new Error(typeof err === 'string' ? err : 'ZPL send failed'));
  });
});

async function sendZplHttp(device, zpl) {
  await browserPrintFetch('/write', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device, data: zpl }),
    timeoutMs: 8000,
  });
}

export async function printToZebra(sample, { isArabic = false } = {}) {
  const zpl = buildCbcLabelZpl(sample, { isArabic });

  try {
    const device = await getDefaultDeviceSdk();
    await sendZplSdk(device, zpl);
    return { method: 'zpl', device: device.name || device.uid };
  } catch (sdkError) {
    if (isBrowserPrintMissing(sdkError)) {
      try {
        const device = await getDefaultPrinter();
        if (!device) throw sdkError;
        await sendZplHttp(device, zpl);
        return { method: 'zpl', device: device.name || device.uid };
      } catch {
        throw sdkError;
      }
    }
    throw sdkError;
  }
}

export async function checkZebraPrintReady() {
  try {
    const device = await getDefaultPrinter();
    return { ready: !!device, device: device?.name || device?.uid || null };
  } catch {
    return { ready: false, device: null };
  }
}
