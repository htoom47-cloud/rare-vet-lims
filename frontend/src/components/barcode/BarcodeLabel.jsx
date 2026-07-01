import Barcode from 'react-barcode';
import QRCode from 'react-qr-code';
import { useTranslation } from 'react-i18next';
import { panelCode } from '../../utils/labelPanel';

const truncate = (text, max) => {
  const s = String(text || '').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
};

/**
 * Sample label — default layout fits Zebra ZD421 direct thermal 50×25 mm rolls.
 * @param {'thermal-50x25'|'full'} size
 */
export default function BarcodeLabel({ sample, format = 'code128', size = 'thermal-50x25' }) {
  const { i18n } = useTranslation();
  const isArabic = i18n.language === 'ar';

  const testLabel = sample.panelKey
    ? panelCode(sample.panelKey)
    : (sample.tests || [])
      .map((t) => (isArabic ? t.test_name_ar : t.test_name) || t.test_name || t.test_code)
      .filter(Boolean)
      .join(' · ');

  const data = {
    sampleId: sample.sample_code,
    clientName: sample.customer_name,
    animalId: sample.animal_code,
    animalName: sample.animal_name,
    testTypes: testLabel,
    date: new Date(sample.collection_date).toLocaleDateString(),
  };

  const barcodeText = String(sample.barcode || sample.sample_code || '').trim();
  const isThermal = size === 'thermal-50x25';

  const animalLine = [data.animalId, data.animalName].filter(Boolean).join(' · ');

  if (isThermal) {
    return (
      <div className="label-preview label-50x25 bg-white text-black">
        {format === 'qr' ? (
          <div className="label-50x25-qr">
            <QRCode value={barcodeText || data.sampleId} size={56} />
          </div>
        ) : barcodeText ? (
          <div className="label-50x25-barcode">
            <Barcode
              value={barcodeText}
              format="CODE128"
              width={1.05}
              height={22}
              fontSize={10}
              margin={0}
              displayValue
              background="#ffffff"
              lineColor="#000000"
            />
          </div>
        ) : (
          <p className="label-50x25-error">No barcode</p>
        )}

        <div className="label-50x25-details">
          {data.testTypes && (
            <p className="label-50x25-line label-50x25-tests" title={data.testTypes}>
              {truncate(data.testTypes, 30)}
            </p>
          )}
          {animalLine && (
            <p className="label-50x25-line" title={animalLine}>
              {truncate(animalLine, 28)}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="label-preview label-full bg-white p-4 text-black">
      <div className="text-center mb-2">
        <p className="font-bold text-sm">مركز رعاية النوادر البيطري</p>
        <p className="text-xs text-gray-600">{data.date}</p>
      </div>

      {format === 'qr' ? (
        <div className="flex justify-center">
          <QRCode value={JSON.stringify(data)} size={120} />
        </div>
      ) : barcodeText ? (
        <div className="flex justify-center my-3 min-h-[70px]">
          <Barcode
            value={barcodeText}
            format="CODE128"
            width={1.8}
            height={56}
            fontSize={11}
            margin={4}
            displayValue
            background="#ffffff"
            lineColor="#000000"
          />
        </div>
      ) : (
        <p className="text-center text-xs text-red-600 my-3">لا يوجد رقم باركود للعينة</p>
      )}

      <div className="mt-2 text-xs space-y-0.5">
        <p><strong>Sample:</strong> {data.sampleId}</p>
        <p><strong>Client:</strong> {data.clientName}</p>
        <p><strong>Animal:</strong> {animalLine || data.animalId}</p>
        {data.testTypes && <p><strong>Tests:</strong> {data.testTypes}</p>}
      </div>
    </div>
  );
}
