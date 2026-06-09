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

  const barcodeText = `${data.sampleId}|${data.clientName}|${data.animalId}`;

  return (
    <div className="print-only bg-white p-4 text-black" style={{ width: 300 }}>
      <div className="text-center mb-2">
        <p className="font-bold text-sm">مركز رعاية النوادر البيطري</p>
        <p className="text-xs text-gray-600">{data.date}</p>
      </div>

      {format === 'qr' ? (
        <div className="flex justify-center">
          <QRCode value={JSON.stringify(data)} size={120} />
        </div>
      ) : (
        <div className="flex justify-center">
          <Barcode value={barcodeText} width={1.5} height={50} fontSize={10} />
        </div>
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
