import { billingAPI } from '../services/api';

export const EPSON_PRINT_ERROR = {
  BRIDGE_UNAVAILABLE: 'BRIDGE_UNAVAILABLE',
  PRINTER_UNAVAILABLE: 'PRINTER_UNAVAILABLE',
  PRINT_FAILED: 'PRINT_FAILED',
};

export class EpsonPrintError extends Error {
  constructor(message, code, cause) {
    super(message);
    this.name = 'EpsonPrintError';
    this.code = code;
    this.cause = cause;
  }
}

const bridgeBases = () => {
  const secure = typeof window !== 'undefined' && window.location.protocol === 'https:';
  return secure
    ? ['https://127.0.0.1:9101', 'https://localhost:9101']
    : [
      'http://127.0.0.1:9100',
      'http://localhost:9100',
      'https://127.0.0.1:9101',
      'https://localhost:9101',
    ];
};

const parseBridgeResponse = async (response) => {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
};

const classifyBridgeError = (status, message, cause) => {
  if (status === 503 && /printer not found/i.test(message)) {
    return new EpsonPrintError(message, EPSON_PRINT_ERROR.PRINTER_UNAVAILABLE, cause);
  }
  if (!status) {
    return new EpsonPrintError(message, EPSON_PRINT_ERROR.BRIDGE_UNAVAILABLE, cause);
  }
  return new EpsonPrintError(message, EPSON_PRINT_ERROR.PRINT_FAILED, cause);
};

const sendPdfToBridge = async (pdfBlob) => {
  let lastError = null;

  for (const base of bridgeBases()) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      // eslint-disable-next-line no-await-in-loop
      const response = await fetch(`${base}/epson/print-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/pdf' },
        body: pdfBlob,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      // eslint-disable-next-line no-await-in-loop
      const payload = await parseBridgeResponse(response);
      if (!response.ok) {
        lastError = classifyBridgeError(
          response.status,
          payload.error || `Print bridge HTTP ${response.status}`
        );
        if (lastError.code === EPSON_PRINT_ERROR.PRINTER_UNAVAILABLE) throw lastError;
        continue;
      }
      return {
        printer: payload.printer || 'EPSON TM-T20III Receipt',
        success: payload.success === true,
      };
    } catch (error) {
      clearTimeout(timeout);
      if (error instanceof EpsonPrintError
        && error.code === EPSON_PRINT_ERROR.PRINTER_UNAVAILABLE) {
        throw error;
      }
      lastError = error instanceof EpsonPrintError
        ? error
        : classifyBridgeError(
          0,
          error?.name === 'AbortError' ? 'Epson print bridge timed out' : 'Epson print bridge is not running',
          error
        );
    }
  }

  throw lastError || new EpsonPrintError(
    'Epson print bridge is not running',
    EPSON_PRINT_ERROR.BRIDGE_UNAVAILABLE
  );
};

export async function printInvoiceToEpson(invoiceId) {
  const pdfBlob = await billingAPI.getInvoicePdfBlob(invoiceId, { format: 'thermal' });
  if (!pdfBlob || pdfBlob.size < 5) {
    throw new EpsonPrintError('Thermal invoice PDF is empty', EPSON_PRINT_ERROR.PRINT_FAILED);
  }
  return sendPdfToBridge(pdfBlob);
}
