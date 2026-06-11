import Barcode from 'react-barcode';
import QRCode from 'react-qr-code';

export default function BarcodeLabel({ sample, format = 'code128' }) {
  const data = {
    sampleId: sample.sample_code,
    clientName: sample.customer_name,
    animalId: sample.animal_code,
    testTypes: sample.tests?.map((t) => t.test_name).join(', ') || '',
    date: new Date(sample.collection_date).toLocaleDateString(),
  };

  // Code128 supports ASCII only — Arabic names break rendering
  const barcodeText = String(sample.barcode || sample.sample_code || '').trim();

  return (
    <div className="label-preview bg-white p-4 text-black" style={{ width: 300 }}>
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
        <p><strong>Animal:</strong> {data.animalId}</p>
        {data.testTypes && <p><strong>Tests:</strong> {data.testTypes}</p>}
      </div>
    </div>
  );
}
