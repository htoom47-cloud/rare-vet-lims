/**
 * Creates config.json with valid JSON (safe paths on Windows).
 * Usage: node setup.js [watchDir]
 */
const fs = require('fs');
const path = require('path');

const watchDir = process.argv[2] || 'C:\\Users\\User\\Desktop\\صور الطفيليات';

const config = {
  apiUrl: 'https://rare-vet-lims.onrender.com/api',
  username: 'admin',
  password: 'Htoome449944@',
  watchDir,
  panel: 'blood',
  localPort: 3920,
  deleteAfterUpload: false,
  moveAfterUpload: false,
  uploadedDir: 'uploaded',
};

try {
  fs.mkdirSync(watchDir, { recursive: true });
} catch (err) {
  console.warn('تنبيه: لم يُنشأ المجلد محلياً (طبيعي على جهاز آخر):', err.message);
}
fs.writeFileSync(path.join(__dirname, 'config.json'), JSON.stringify(config, null, 2), 'utf8');
console.log('config.json created');
console.log('watchDir:', watchDir);
