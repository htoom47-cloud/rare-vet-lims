import { buildZebraThermalLabelContent, asciiLabelText } from './labelPanel';
import { encodeCode128C } from './barcodeScan';

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

const looksLikeZebraPrinter = (name) => /zdesigner|zd421|zebra/i.test(String(name || ''));

const isLimsBridgePing = (data) => (
  data && typeof data === 'object' && data.limsBridge === true
);

const isLimsBridgeWriteOk = (data) => (
  isLimsBridgePing(data) && data.success === true && Number(data.zplLength) > 0
);

const BROWSER_PRINT_BASES = () => {
  const secure = typeof window !== 'undefined' && window.location.protocol === 'https:';
  return secure
    ? ['https://127.0.0.1:9101', 'https://localhost:9101', 'http://127.0.0.1:9100', 'http://localhost:9100']
    : ['http://127.0.0.1:9100', 'http://localhost:9100', 'https://127.0.0.1:9101', 'https://localhost:9101'];
};

async function browserPrintFetch(path, options = {}) {
  const bases = BROWSER_PRINT_BASES();
  let lastError = null;
  const timeoutMs = options.timeoutMs ?? 2500;
  const requireBody = options.requireBody === true;

  for (let i = 0; i < bases.length; i += 1) {
    const base = bases[i];
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      // eslint-disable-next-line no-await-in-loop
      const res = await fetch(`${base}${path}`, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) {
        lastError = new ZebraPrintError(`Browser Print HTTP ${res.status}`, SERVICE_UNAVAILABLE);
        continue;
      }
      const text = await res.text();
      if (!text) {
        if (requireBody) {
          lastError = new ZebraPrintError('Empty print response', SERVICE_UNAVAILABLE);
          continue;
        }
        return { data: null, base };
      }
      try {
        return { data: JSON.parse(text), base };
      } catch {
        if (requireBody) {
          lastError = new ZebraPrintError('Invalid print response', SERVICE_UNAVAILABLE);
          continue;
        }
        return { data: text, base };
      }
    } catch (error) {
      clearTimeout(timeout);
      lastError = error instanceof ZebraPrintError
        ? error
        : new ZebraPrintError(
          error?.name === 'AbortError' ? 'Browser Print timeout' : 'Browser Print not running',
          SERVICE_UNAVAILABLE
        );
    }
  }

  throw lastError || new ZebraPrintError('Browser Print not running', SERVICE_UNAVAILABLE);
}

/** Find LIMS local bridge — not the official Zebra Browser Print service. */
export async function findLimsBridgeBase() {
  const bases = BROWSER_PRINT_BASES();
  for (let i = 0; i < bases.length; i += 1) {
    const base = bases[i];
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1200);
    try {
      // eslint-disable-next-line no-await-in-loop
      const res = await fetch(`${base}/lims/ping`, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) continue;
      const data = await res.json();
      if (isLimsBridgePing(data)) return { base, printer: data.printer || null };
    } catch {
      clearTimeout(timeout);
    }
  }
  return null;
}

/** Quick probe — is LIMS Zebra Bridge listening on localhost? */
export async function isZebraBridgeAvailable() {
  try {
    const bridge = await findLimsBridgeBase();
    return Boolean(bridge);
  } catch {
    return false;
  }
}

const normalizeDevice = (payload) => {
  if (!payload) return null;
  if (payload.device) return payload.device;
  if (payload.uid) return payload;
  if (Array.isArray(payload.deviceList) && payload.deviceList[0]) return payload.deviceList[0];
  if (Array.isArray(payload) && payload[0]) return payload[0];
  if (payload.printer?.[0]) return payload.printer[0];
  if (payload.printer) return payload.printer;
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
        else reject(new ZebraPrintError('No default printer', SERVICE_UNAVAILABLE));
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
    const { data } = await browserPrintFetch('/default?type=printer', { timeoutMs: 2500 });
    let device = normalizeDevice(data);
    if (device) return device;

    const available = await browserPrintFetch('/available', { timeoutMs: 2500 });
    device = normalizeDevice(available.data);
    if (device) return device;

    const list = available.data?.printer || available.data?.deviceList || available.data;
    if (Array.isArray(list) && list[0]) return list[0];
    return null;
  }
}


const LABEL_WIDTH = 400;  // 50 mm @ 203 dpi
const LABEL_HEIGHT = 200; // 25 mm @ 203 dpi

const TOP_MARGIN_DOTS = 24; // 3 mm @ 203 dpi (1 mm base + 2 mm lower)

/** Vertical layout v12 — +2 mm spacing between text lines (16 dots @ 203 dpi). */
const LAYOUT = {
  barcodeY: TOP_MARGIN_DOTS,
  barcodeHeight: 40,
  digitsY: 68,
  sampleY: 102,
  testY: 138,
  animalY: 174,
};

const zplEscape = (value) => String(value ?? '')
  .replace(/\\/g, '\\\\')
  .replace(/\^/g, '\\^')
  .replace(/~/g, '\\~');

/** ZPL ^FD text — ASCII printable only (^CI0). Strips Arabic / UTF-8 that prints as garbage. */
const zplAsciiField = (value) => {
  const cleaned = String(value ?? '')
    .replace(/[^\x20-\x7E]/g, '')
    .trim();
  return zplEscape(asciiLabelText(cleaned) || cleaned);
};

const zplHeader = () => [
  '^XA',
  '^FX LIMS label v11 50x25 ASCII',
  '^CI0',
  '^MTD',
  '^MD35',
  '^MNW',
  '^PR3',
  `^PW${LABEL_WIDTH}`,
  `^LL${LABEL_HEIGHT}`,
  '^LH0,0',
  '^LT0',
  '^LS0',
  '^FWN',
  '^PON',
];

/** Code128-C payload — even length; display digits on label stay unpadded. */
export const thermalScanDigits = (barcode) => encodeCode128C(barcode);

const code128CModules = (digits) => {
  const pairs = String(digits).length / 2;
  return 11 + pairs * 11 + 11 + 13;
};

const zplLandscapeHeader = () => zplHeader();

const field = (zpl) => `^FWN${zpl}`;

const FONT_DIGITS = '^A0N,30,28';
const FONT_LINE = '^A0N,24,22';
const FONT_LINE_BOLD = '^A0N,24,24';

const textLine = (y, value, font = FONT_LINE) => {
  const text = zplAsciiField(value);
  if (!text) return '';
  return field(`^FO0,${y}^FB${LABEL_WIDTH},1,0,C,0${font}^FD${text}^FS`);
};

/** Thick Code128-C — fits 50 mm, readable by 1D USB scanners (size unchanged). */
const barcodeField = (barcode) => {
  const digits = thermalScanDigits(barcode);
  const moduleWidth = 3;
  const barHeight = LAYOUT.barcodeHeight;
  const w = code128CModules(digits) * moduleWidth;
  const x = Math.max(10, Math.floor((LABEL_WIDTH - w) / 2));
  return field(`^FO${x},${LAYOUT.barcodeY}^BY${moduleWidth},3,${barHeight}^BCN,${barHeight},N,N,N^FD>;>8${digits}^FS`);
};

export const getLabelPrintFields = (sample) => buildZebraThermalLabelContent(sample);

/** ZPL for Zebra ZD421 50×25 mm — English ASCII only. */
export const buildCbcLabelZpl = (sample) => {
  const content = buildZebraThermalLabelContent(sample);
  const lines = [...zplHeader()];

  if (content.barcode) {
    lines.push(barcodeField(content.barcode));
    if (content.barcodeDigits) {
      const digitsLine = textLine(LAYOUT.digitsY, content.barcodeDigits, FONT_DIGITS);
      if (digitsLine) lines.push(digitsLine);
    }
    if (content.sampleLine) {
      const sampleLine = textLine(LAYOUT.sampleY, content.sampleLine, FONT_LINE);
      if (sampleLine) lines.push(sampleLine);
    }
    if (content.testLine) {
      const testLine = textLine(LAYOUT.testY, content.testLine, FONT_LINE_BOLD);
      if (testLine) lines.push(testLine);
    }
    if (content.animalTypeLine) {
      const animalLine = textLine(LAYOUT.animalY, content.animalTypeLine, FONT_LINE);
      if (animalLine) lines.push(animalLine);
    }
  }

  lines.push('^XZ');
  return lines.filter(Boolean).join('\n');
};

const sendZplSdk = (device, zpl) => new Promise((resolve, reject) => {
  device.send(zpl, () => resolve(), (err) => {
    reject(new Error(typeof err === 'string' ? err : 'ZPL send failed'));
  });
});

async function sendZplHttp(device, zpl, { timeoutMs = 8000 } = {}) {
  const { data } = await browserPrintFetch('/write', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device, data: zpl }),
    timeoutMs,
    requireBody: true,
  });
  if (data && typeof data === 'object' && data.error) {
    throw new ZebraPrintError(String(data.error), SERVICE_UNAVAILABLE);
  }
}

/** Send ZPL via verified LIMS local bridge (RAW) — reception PC: start-zebra-bridge.bat */
async function sendZplLocalBridge(zpl) {
  const bridge = await findLimsBridgeBase();
  if (!bridge) {
    throw new ZebraPrintError('LIMS Zebra Bridge not running', SERVICE_UNAVAILABLE);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${bridge.base}/write`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device: { name: 'LIMS Zebra Bridge', limsBridge: true }, data: zpl }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const text = await res.text();
    if (!res.ok) {
      let message = `Bridge HTTP ${res.status}`;
      try {
        const err = JSON.parse(text);
        if (err?.error) message = String(err.error);
      } catch { /* ignore */ }
      throw new ZebraPrintError(message, SERVICE_UNAVAILABLE);
    }
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new ZebraPrintError('Bridge returned invalid response', SERVICE_UNAVAILABLE);
    }
    if (!isLimsBridgeWriteOk(data)) {
      throw new ZebraPrintError(data.error || 'Bridge did not confirm label print', SERVICE_UNAVAILABLE);
    }
    return { printer: data.printer || bridge.printer || 'LIMS Zebra Bridge' };
  } catch (error) {
    clearTimeout(timeout);
    if (error instanceof ZebraPrintError) throw error;
    throw new ZebraPrintError(
      error?.name === 'AbortError' ? 'Bridge timeout' : (error.message || 'Bridge print failed'),
      SERVICE_UNAVAILABLE
    );
  }
}

export async function printToZebra(sample) {
  const zpl = buildCbcLabelZpl(sample);
  if (!zpl || !String(zpl).includes('^FD')) {
    throw new ZebraPrintError('Empty label data', 'EMPTY_ZPL');
  }

  // 1) LIMS local bridge (RAW) — reception PC: start-zebra-bridge.bat
  try {
    const bridgeResult = await sendZplLocalBridge(zpl);
    return {
      method: 'zpl-bridge',
      device: bridgeResult.printer || 'LIMS Zebra Bridge',
      verified: true,
    };
  } catch (bridgeError) {
    // 2) Official Zebra Browser Print SDK
    try {
      const device = await getDefaultDeviceSdk();
      const deviceName = device.name || device.uid || '';
      if (!looksLikeZebraPrinter(deviceName)) {
        throw new ZebraPrintError(
          `Default printer is not Zebra (${deviceName || 'unknown'})`,
          SERVICE_UNAVAILABLE
        );
      }
      await sendZplSdk(device, zpl);
      return { method: 'zpl-sdk', device: deviceName, verified: false };
    } catch (sdkError) {
      try {
        const device = await getDefaultPrinter();
        const deviceName = device?.name || device?.uid || '';
        if (!device || !looksLikeZebraPrinter(deviceName)) {
          throw sdkError;
        }
        await sendZplHttp(device, zpl);
        return { method: 'zpl-http', device: deviceName, verified: false };
      } catch {
        throw isBrowserPrintMissing(bridgeError) && isBrowserPrintMissing(sdkError)
          ? bridgeError
          : new ZebraPrintError(sdkError.message || bridgeError.message || 'Zebra print failed', SERVICE_UNAVAILABLE);
      }
    }
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
