import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/library';
import { Camera, Keyboard } from 'lucide-react';

export default function BarcodeScanner({ onScan, onClose }) {
  const videoRef = useRef(null);
  const [mode, setMode] = useState('camera');
  const [manualInput, setManualInput] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (mode !== 'camera') return;

    const reader = new BrowserMultiFormatReader();
    let active = true;

    reader.decodeFromVideoDevice(undefined, videoRef.current, (result, err) => {
      if (result && active) {
        onScan(result.getText());
        reader.reset();
      }
    }).catch(() => setError('Camera access denied or not available'));

    return () => {
      active = false;
      reader.reset();
    };
  }, [mode, onScan]);

  const handleManual = (e) => {
    e.preventDefault();
    if (manualInput.trim()) onScan(manualInput.trim());
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          onClick={() => setMode('camera')}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${mode === 'camera' ? 'bg-primary-600 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}
        >
          <Camera size={16} /> Camera
        </button>
        <button
          onClick={() => setMode('usb')}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${mode === 'usb' ? 'bg-primary-600 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}
        >
          <Keyboard size={16} /> USB Scanner
        </button>
      </div>

      {mode === 'camera' ? (
        <div className="relative">
          <video ref={videoRef} className="w-full rounded-lg bg-black" style={{ maxHeight: 300 }} />
          {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
        </div>
      ) : (
        <form onSubmit={handleManual}>
          <input
            autoFocus
            type="text"
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            placeholder="Scan barcode with USB scanner..."
            className="input-field"
          />
          <p className="text-xs text-gray-500 mt-2">USB scanners work as keyboard input. Focus this field and scan.</p>
        </form>
      )}

      {onClose && (
        <button onClick={onClose} className="btn-secondary w-full">Close</button>
      )}
    </div>
  );
}
