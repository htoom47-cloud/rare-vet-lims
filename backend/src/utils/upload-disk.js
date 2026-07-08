/**
 * Shared multer disk storage — avoid holding uploads in RAM (Starter plans ~512MB).
 */
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const os = require('os');
const { uuidv4 } = require('./uuid');

const uploadTmpDir = () => {
  const dir = path.join(os.tmpdir(), 'lims-uploads');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};

const diskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadTmpDir()),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '') || '';
    cb(null, `${Date.now()}-${uuidv4().slice(0, 8)}${ext}`);
  },
});

/**
 * Read uploaded file into a Buffer then delete the temp file.
 * Prefer this after handlers finish — do not keep multer memoryStorage for large images.
 */
const readAndCleanupUpload = async (file) => {
  if (!file) return null;
  if (file.buffer) return file.buffer;
  if (!file.path) throw new Error('Upload missing path and buffer');
  const buffer = await fs.promises.readFile(file.path);
  await fs.promises.unlink(file.path).catch(() => {});
  file.buffer = buffer;
  return buffer;
};

/** Best-effort cleanup if request fails before read. */
const cleanupUploadFile = async (file) => {
  if (file?.path) {
    await fs.promises.unlink(file.path).catch(() => {});
  }
};

module.exports = {
  diskStorage,
  uploadTmpDir,
  readAndCleanupUpload,
  cleanupUploadFile,
};
