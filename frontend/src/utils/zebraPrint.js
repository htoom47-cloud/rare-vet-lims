import { buildThermalLabelContent, buildZebraThermalLabelContent } from './labelPanel';
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
      if (!text) return { data: null, base };
      try {
        return { data: JSON.parse(text), base };
      } catch {
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

/** Quick probe — is LIMS Zebra Bridge or Browser Print listening on localhost? */
export async function isZebraBridgeAvailable() {
  try {
    await browserPrintFetch('/available', { timeoutMs: 900 });
    return true;
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

const TOP_MARGIN_DOTS = 8; // 1 mm @ 203 dpi

/** Vertical layout v10 — 50×25 mm, 1 mm top margin, centered text. */
const LAYOUT = {
  barcodeY: TOP_MARGIN_DOTS,
  barcodeHeight: 44,
  digitsY: 56,
  sampleY: 76,
  testY: 96,
  animalY: 116,
};

const zplEscape = (value) => String(value ?? '')
  .replace(/\\/g, '\\\\')
  .replace(/\^/g, '\\^')
  .replace(/~/g, '\\~');

/** Code128-C payload — even length; display digits on label stay unpadded. */
export const thermalScanDigits = (barcode) => encodeCode128C(barcode);

const code128CModules = (digits) => {
  const pairs = String(digits).length / 2;
  return 11 + pairs * 11 + 11 + 13;
};

const zplLandscapeHeader = (isArabic = false) => [
  '^XA',
  isArabic ? '^FX LIMS label v9 Arabic UTF-8' : '^FX LIMS label v9 larger text',
  isArabic ? '^CI28' : '^CI0',
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

const field = (zpl) => `^FWN${zpl}`;

const FONT_DIGITS = '^A0N,30,28';
const FONT_LINE = '^A0N,24,22';
const FONT_LINE_BOLD = '^A0N,24,24';

const textLine = (y, value, font = FONT_LINE) => (
  field(`^FO0,${y}^FB${LABEL_WIDTH},1,0,C,0${font}^FD${zplEscape(value)}^FS`)
);

/** Thick Code128-C — fits 50 mm, readable by 1D USB scanners (size unchanged). */
const barcodeField = (barcode) => {
  const digits = thermalScanDigits(barcode);
  const moduleWidth = 3;
  const barHeight = LAYOUT.barcodeHeight;
  const w = code128CModules(digits) * moduleWidth;
  const x = Math.max(10, Math.floor((LABEL_WIDTH - w) / 2));
  return field(`^FO${x},${LAYOUT.barcodeY}^BY${moduleWidth},3,${barHeight}^BCN,${barHeight},N,N,N^FD>;>8${digits}^FS`);
};

export const getLabelPrintFields = (sample, { isArabic = false } = {}) => (
  buildThermalLabelContent(sample, { isArabic })
);

/** ZPL for Zebra ZD421 50×25 mm — English only, no Arabic in ^FD fields. */
export const buildCbcLabelZpl = (sample) => {
  const content = buildZebraThermalLabelContent(sample);
  const lines = [...zplLandscapeHeader(false)];

  if (content.barcode) {
    lines.push(barcodeField(content.barcode));
    if (content.barcodeDigits) {
      lines.push(textLine(LAYOUT.digitsY, content.barcodeDigits, FONT_DIGITS));
    }
    if (content.sampleLine) {
      lines.push(textLine(LAYOUT.sampleY, content.sampleLine, FONT_LINE));
    }
    if (content.testLine) {
      lines.push(textLine(LAYOUT.testY, content.testLine, FONT_LINE_BOLD));
    }
    if (content.animalTypeLine) {
      lines.push(textLine(LAYOUT.animalY, content.animalTypeLine, FONT_LINE));
    }
  }

  lines.push('^XZ');
  return lines.join('\n');
};

const sendZplSdk = (device, zpl) => new Promise((resolve, reject) => {
  device.send(zpl, () => resolve(), (err) => {
    reject(new Error(typeof err === 'string' ? err : 'ZPL send failed'));
  });
});

async function sendZplHttp(device, zpl, { timeoutMs = 8000 } = {}) {
  await browserPrintFetch('/write', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device: device || { name: 'LIMS Zebra Bridge' }, data: zpl }),
    timeoutMs,
  });
}

/** Send ZPL via local LIMS bridge (RAW) — preferred on Windows with zebra-local-bridge. */
async function sendZplLocalBridge(zpl) {
  await sendZplHttp(null, zpl, { timeoutMs: 2000 });
}

export async function printToZebra(sample) {
  const zpl = buildCbcLabelZpl(sample);
  if (!zpl || !String(zpl).includes('^FD')) {
    throw new ZebraPrintError('Empty label data', 'EMPTY_ZPL');
  }

  // 1) LIMS local bridge (RAW) — reception PC: start-zebra-bridge.bat
  try {
    await sendZplLocalBridge(zpl);
    return { method: 'zpl-bridge', device: 'LIMS Zebra Bridge' };
  } catch (bridgeError) {
    // 2) Official Zebra Browser Print SDK
    try {
      const device = await getDefaultDeviceSdk();
      await sendZplSdk(device, zpl);
      return { method: 'zpl', device: device.name || device.uid };
    } catch (sdkError) {
      try {
        const device = await getDefaultPrinter();
        if (!device) throw sdkError;
        await sendZplHttp(device, zpl);
        return { method: 'zpl', device: device.name || device.uid };
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
