const bwipjs = require('bwip-js');
const QRCode = require('qrcode');

const generateCode128 = async (text) => {
  const png = await bwipjs.toBuffer({
    bcid: 'code128',
    text,
    scale: 3,
    height: 10,
    includetext: true,
    textxalign: 'center',
  });
  return `data:image/png;base64,${png.toString('base64')}`;
};

const generateQR = async (data) => {
  const json = typeof data === 'string' ? data : JSON.stringify(data);
  return QRCode.toDataURL(json, { width: 200, margin: 1 });
};

const buildSampleBarcodeData = (sample) => ({
  sampleId: sample.sample_code,
  clientName: sample.customer_name,
  animalId: sample.animal_code,
  testTypes: sample.test_names || [],
  date: sample.collection_date,
});

const generateSampleBarcode = async (sample, format = 'code128') => {
  const data = buildSampleBarcodeData(sample);
  const text = `${data.sampleId}|${data.clientName}|${data.animalId}|${data.date}`;

  if (format === 'qr') {
    return generateQR(data);
  }
  return generateCode128(text);
};

module.exports = {
  generateCode128,
  generateQR,
  buildSampleBarcodeData,
  generateSampleBarcode,
};
