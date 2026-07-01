import { buildLabelLines, panelCode } from './labelPanel';

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

  for (let i = 0; i < bases.length; i += 1) {
    const base = bases[i];
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 3000);
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
const BAR_HEIGHT = 52;
const BAR_RATIO = 3;
const TEXT_LINE_H = 14;
const AFTER_BAR_GAP = 6;
const LINE_STEP = 14;
const MIN_TOP_Y = 18;

const zplEscape = (value) => String(value ?? '')
  .replace(/\\/g, '\\\\')
  .replace(/\^/g, '\\^')
  .replace(/~/g, '\\~');

const truncate = (text, max) => {
  const s = String(text || '').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
};

/** ZPL header — ZD421 direct thermal 50×25 mm. Use ^CI0 so ^BC Code128 renders (UTF-8 ^CI28 breaks barcodes). */
const zplLandscapeHeader = () => [
  '^XA',
  '^CI0',
  '^MTD',
  '^MD40',
  '^MNW',
  `^PW${LABEL_WIDTH}`,
  `^LL${LABEL_HEIGHT}`,
  '^LH0,0',
  '^LT0',
  '^LS0',
  '^FWN',
  '^PON',
  '^PR2',
];

const TEXT_LINE = '^A0N,14,12';

/** Centered text line across full label width. */
const textLine = (y, value) => (
  `^FO0,${y}^FB${LABEL_WIDTH},1,0,C,0${TEXT_LINE}^FD${zplEscape(value)}^FS`
);

/** Code128 module width that fits long BC-… IDs on 400-dot width. */
const pickBarcodeModule = (barcode) => {
  const modules = 11 * String(barcode).length + 35;
  if (modules * 2 <= LABEL_WIDTH - 30) return 2;
  if (modules * 1.5 <= LABEL_WIDTH - 30) return 1.5;
  return 1;
};

const estimateCode128WidthDots = (barcode, moduleWidth) => {
  const modules = 11 * String(barcode).length + 35;
  return Math.ceil(modules * moduleWidth);
};

/** Code128 — auto subset; taller bars + darker print for handheld scanners. */
const barcodeField = (barcode, barcodeY) => {
  const mod = pickBarcodeModule(barcode);
  const widthDots = estimateCode128WidthDots(barcode, mod);
  const x = Math.max(12, Math.floor((LABEL_WIDTH - widthDots) / 2));
  return `^FO${x},${barcodeY}^BY${mod},${BAR_RATIO},${BAR_HEIGHT}^BCN,${BAR_HEIGHT},N,N,N^FD${zplEscape(barcode)}^FS`;
};

const computeLayout = ({ showBarcodeText, showPanel, showAnimal }) => {
  const textLineCount = [showBarcodeText, showPanel, showAnimal].filter(Boolean).length;
  const blockHeight = BAR_HEIGHT + AFTER_BAR_GAP + textLineCount * LINE_STEP;
  const barcodeY = Math.max(MIN_TOP_Y, Math.floor((LABEL_HEIGHT - blockHeight) / 2));
  const firstTextY = barcodeY + BAR_HEIGHT + AFTER_BAR_GAP;

  let line = 0;
  const nextTextY = () => {
    const y = firstTextY + line * LINE_STEP;
    line += 1;
    return y;
  };

  return {
    barcodeY,
    barcodeTextY: showBarcodeText ? nextTextY() : null,
    panelY: showPanel ? nextTextY() : null,
    animalY: showAnimal ? nextTextY() : null,
  };
};

export const buildCbcLabelZpl = (sample, { isArabic = false } = {}) => {
  const { barcode, panelKey } = buildLabelLines(sample, {
    isArabic,
    panelKey: sample.panelKey,
  });

  const panelZpl = panelCode(panelKey);
  const animal = truncate(String(sample?.animal_code || '').trim(), 24);
  const layout = computeLayout({
    showBarcodeText: !!barcode,
    showPanel: !!panelZpl,
    showAnimal: !!animal,
  });

  const lines = [...zplLandscapeHeader()];

  if (barcode) {
    lines.push(barcodeField(barcode, layout.barcodeY));
    lines.push(textLine(layout.barcodeTextY, truncate(barcode, 24)));
  }

  if (panelZpl) {
    lines.push(textLine(layout.panelY, panelZpl));
  }

  if (animal) {
    lines.push(textLine(layout.animalY, animal));
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
    body: JSON.stringify({ device: device || { name: 'LIMS Zebra Bridge' }, data: zpl }),
    timeoutMs: 8000,
  });
}

/** Send ZPL via local LIMS bridge (RAW) — preferred on Windows with zebra-local-bridge. */
async function sendZplLocalBridge(zpl) {
  await sendZplHttp(null, zpl);
}

export async function printToZebra(sample, { isArabic = false } = {}) {
  const zpl = buildCbcLabelZpl(sample, { isArabic });

  // 1) LIMS local bridge (RAW) — works with send-zebra-raw.ps1
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
