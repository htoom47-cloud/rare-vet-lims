const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const env = require('./env');
const logger = require('./logger');

const ensureUploadDir = () => {
  const uploadPath = path.resolve(env.storage.path);
  if (!fs.existsSync(uploadPath)) {
    fs.mkdirSync(uploadPath, { recursive: true });
  }
  ['reports', 'animals', 'signatures', 'temp'].forEach((subdir) => {
    const dir = path.join(uploadPath, subdir);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });
  return uploadPath;
};

const saveFile = async (buffer, subdir, originalName) => {
  const uploadPath = ensureUploadDir();
  const ext = path.extname(originalName) || '.bin';
  const filename = `${uuidv4()}${ext}`;
  const filePath = path.join(uploadPath, subdir, filename);
  await fs.promises.writeFile(filePath, buffer);
  const url = `/uploads/${subdir}/${filename}`;
  logger.info('File saved', { url, subdir });
  return { url, path: filePath, filename };
};

const deleteFile = async (url) => {
  if (!url || !url.startsWith('/uploads/')) return;
  const filePath = path.join(ensureUploadDir(), url.replace('/uploads/', ''));
  if (fs.existsSync(filePath)) {
    await fs.promises.unlink(filePath);
  }
};

module.exports = { ensureUploadDir, saveFile, deleteFile };
