import Barcode from 'react-barcode';
import QRCode from 'react-qr-code';
import { useTranslation } from 'react-i18next';
import { buildThermalLabelContent } from '../../utils/labelPanel';
import { thermalScanDigits } from '../../utils/zebraPrint';

/**
 * Sample label — default layout fits Zebra ZD421 direct thermal 50×25 mm rolls.
 * @param {'thermal-50x25'|'full'} size
 */
export default function BarcodeLabel({ sample, format = 'code128', size = 'thermal-50x25' }) {
  const { i18n } = useTranslation();
  const isArabic = i18n.language === 'ar';

  const content = buildThermalLabelContent(sample, { isArabic });
  const barcodeEncode = content.barcode ? thermalScanDigits(content.barcode) : '';
  const isThermal = size === 'thermal-50x25';

  if (isThermal) {
    return (
      <div className="label-preview label-50x25 bg-white text-black">
        {format === 'qr' ? (
          <div className="label-50x25-qr">
            <QRCode value={content.barcode || content.sampleCode} size={56} />
          </div>
        ) : barcodeEncode ? (
          <div className="label-50x25-barcode-wrap">
            <div className="label-50x25-barcode">
              <Barcode
                value={barcodeEncode}
                format="CODE128"
                width={1.05}
                height={20}
                fontSize={0}
                margin={0}
                displayValue={false}
                background="#ffffff"
                lineColor="#000000"
              />
            </div>
            {content.barcodeDigits && (
              <p className="label-50x25-digits">{content.barcodeDigits}</p>
            )}
          </div>
        ) : (
          <p className="label-50x25-error">No barcode</p>
        )}

        <div className="label-50x25-details">
          {content.sampleLine && (
            <p className="label-50x25-line" title={content.sampleLine}>
              {content.sampleLine}
            </p>
          )}
          {content.animalLine && (
            <p className="label-50x25-line label-50x25-meta" title={content.animalLine}>
              {content.animalLine}
            </p>
          )}
          {content.testLine && (
            <p className="label-50x25-line label-50x25-test" title={content.testLine}>
              {content.testLine}
            </p>
          )}
        </div>
      </div>
    );
  }

  const data = {
    sampleId: content.sampleCode,
    clientName: sample.customer_name,
    animalId: sample.animal_code,
    animalName: content.animalName,
    testTypes: content.testsSummary,
    date: new Date(sample.collection_date).toLocaleDateString(),
  };

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
      ) : content.barcode ? (
        <div className="flex justify-center my-3 min-h-[70px]">
          <Barcode
            value={content.barcode}
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
        <p><strong>Animal:</strong> {data.animalName || data.animalId}</p>
        {data.testTypes && <p><strong>Tests:</strong> {data.testTypes}</p>}
      </div>
    </div>
  );
}
