const bwipjs = require('bwip-js');
const QRCode = require('qrcode');
const { encodeCode128C, displaySampleId } = require('./barcode-scan');
const barcodeEngine = require('../services/barcode-engine.service');

const generateCode128 = async (text) => {
  const scanId = displaySampleId(text) || String(text || '').trim();
  const payload = encodeCode128C(scanId) || scanId;
  // bwip-js exposes bcid "code128" only — not "code128c". Payload stays Code128-C digits (even length).
  const png = await bwipjs.toBuffer({
    bcid: 'code128',
    text: payload,
    scale: 3,
    height: 12,
    includetext: true,
    textxalign: 'center',
    paddingwidth: 10,
    paddingheight: 4,
  });
  return `data:image/png;base64,${png.toString('base64')}`;
};
const generateQR = async (data) => {
  const json = typeof data === 'string' ? data : JSON.stringify(data);
  return QRCode.toDataURL(json, { width: 200, margin: 1 });
};

const buildSampleBarcodeData = (sample) => {
  const payload = barcodeEngine.buildBarcodePayload(sample);
  return {
    sampleId: payload.humanReadable.sampleId,
    clientName: payload.humanReadable.customerName,
    animalId: sample.animal_code,
    animalName: payload.humanReadable.animalName,
    animalType: payload.humanReadable.animalType,
    testTypes: sample.test_names || [],
    date: payload.humanReadable.sampleDate || sample.collection_date,
    barcodeValue: payload.barcodeValue,
    barcodeEncode: payload.barcodeEncode,
  };
};

const generateSampleBarcode = async (sample, format = 'code128') => {
  const scanId = displaySampleId(sample.barcode || sample.sample_code) || String(sample.sample_code || '').trim();

  if (format === 'qr') {
    return generateQR({ sampleId: scanId });
  }
  return generateCode128(scanId);
};
module.exports = {
  generateCode128,
  generateQR,
  buildSampleBarcodeData,
  generateSampleBarcode,
  buildBarcodePayload: barcodeEngine.buildBarcodePayload,
  buildZplLabel: barcodeEngine.buildZplLabel,
};
