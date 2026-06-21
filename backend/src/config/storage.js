const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const env = require('./env');
const logger = require('./logger');

let s3Client = null;

const isS3Storage = () => env.storage.type === 's3' && !!env.storage.s3.bucket;

const getS3Client = () => {
  if (s3Client) return s3Client;
  const { S3Client } = require('@aws-sdk/client-s3');
  const { s3 } = env.storage;
  const config = {
    region: s3.region || 'us-east-1',
  };
  if (s3.accessKey && s3.secretKey) {
    config.credentials = {
      accessKeyId: s3.accessKey,
      secretAccessKey: s3.secretKey,
    };
  }
  if (s3.endpoint) {
    config.endpoint = s3.endpoint;
    config.forcePathStyle = true;
  }
  s3Client = new S3Client(config);
  return s3Client;
};

const parseUploadUrl = (url) => {
  if (!url || !url.startsWith('/uploads/')) return null;
  const parts = url.replace(/^\/uploads\//, '').split('/');
  if (parts.length < 2) return null;
  const filename = parts.pop();
  const subdir = parts.join('/');
  return { subdir, filename, key: `${subdir}/${filename}` };
};

const uploadUrl = (subdir, filename) => `/uploads/${subdir}/${filename}`;

const guessMime = (filename) => {
  const ext = path.extname(filename).toLowerCase();
  const map = {
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
  };
  return map[ext] || 'application/octet-stream';
};

const ensureUploadDir = () => {
  const uploadPath = path.isAbsolute(env.storage.path)
    ? env.storage.path
    : path.resolve(__dirname, '../..', env.storage.path.replace(/^\.\//, ''));
  if (!fs.existsSync(uploadPath)) {
    fs.mkdirSync(uploadPath, { recursive: true });
  }
  ['reports', 'animals', 'signatures', 'temp'].forEach((subdir) => {
    const dir = path.join(uploadPath, subdir);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });
  return uploadPath;
};

const localPathForUrl = (url) => {
  const parsed = parseUploadUrl(url);
  if (!parsed) return null;
  return path.join(ensureUploadDir(), parsed.subdir, parsed.filename);
};

const s3Put = async (key, body, contentType) => {
  const { PutObjectCommand } = require('@aws-sdk/client-s3');
  await getS3Client().send(new PutObjectCommand({
    Bucket: env.storage.s3.bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
  }));
};

const s3GetStream = async (key) => {
  const { GetObjectCommand } = require('@aws-sdk/client-s3');
  const result = await getS3Client().send(new GetObjectCommand({
    Bucket: env.storage.s3.bucket,
    Key: key,
  }));
  return result.Body;
};

const s3Head = async (key) => {
  const { HeadObjectCommand } = require('@aws-sdk/client-s3');
  await getS3Client().send(new HeadObjectCommand({
    Bucket: env.storage.s3.bucket,
    Key: key,
  }));
  return true;
};

const s3Delete = async (key) => {
  const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
  await getS3Client().send(new DeleteObjectCommand({
    Bucket: env.storage.s3.bucket,
    Key: key,
  }));
};

const saveFile = async (buffer, subdir, originalName) => {
  const ext = path.extname(originalName) || '.bin';
  const filename = `${uuidv4()}${ext}`;
  const url = uploadUrl(subdir, filename);

  if (isS3Storage()) {
    await s3Put(`${subdir}/${filename}`, buffer, guessMime(filename));
    logger.info('File saved to S3', { url, subdir });
    return { url, filename, path: null };
  }

  const uploadPath = ensureUploadDir();
  const filePath = path.join(uploadPath, subdir, filename);
  await fs.promises.writeFile(filePath, buffer);
  logger.info('File saved locally', { url, subdir });
  return { url, path: filePath, filename };
};

/** Persist a file written to disk (e.g. PDF) — uploads to S3 when configured. */
const persistLocalFile = async (filePath, subdir, filename) => {
  const url = uploadUrl(subdir, filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  if (isS3Storage()) {
    const buffer = await fs.promises.readFile(filePath);
    await s3Put(`${subdir}/${filename}`, buffer, guessMime(filename));
    await fs.promises.unlink(filePath).catch(() => {});
    logger.info('File persisted to S3', { url });
    return { url, filename, path: null };
  }

  return { url, filename, path: filePath };
};

const fileExists = async (url) => {
  const parsed = parseUploadUrl(url);
  if (!parsed) return false;

  if (isS3Storage()) {
    try {
      await s3Head(parsed.key);
      return true;
    } catch {
      const local = localPathForUrl(url);
      return local ? fs.existsSync(local) : false;
    }
  }

  const local = localPathForUrl(url);
  return local ? fs.existsSync(local) : false;
};

const createReadStream = async (url) => {
  const parsed = parseUploadUrl(url);
  if (!parsed) throw new Error('Invalid upload URL');

  if (isS3Storage()) {
    try {
      return await s3GetStream(parsed.key);
    } catch {
      const local = localPathForUrl(url);
      if (local && fs.existsSync(local)) return fs.createReadStream(local);
      throw new Error('File not found');
    }
  }

  const local = localPathForUrl(url);
  if (!local || !fs.existsSync(local)) throw new Error('File not found');
  return fs.createReadStream(local);
};

const deleteFile = async (url) => {
  if (!url || !url.startsWith('/uploads/')) return;
  const parsed = parseUploadUrl(url);
  if (!parsed) return;

  if (isS3Storage()) {
    try {
      await s3Delete(parsed.key);
    } catch (err) {
      logger.warn('S3 delete failed', { url, error: err.message });
    }
  }

  const local = localPathForUrl(url);
  if (local && fs.existsSync(local)) {
    await fs.promises.unlink(local);
  }
};

/** Express middleware — serves /uploads from local disk or S3. */
const serveUploads = async (req, res, next) => {
  const rel = req.path.replace(/^\//, '');
  if (!rel || rel.includes('..')) return next();

  const url = `/uploads/${rel}`;
  try {
    const stream = await createReadStream(url);
    res.setHeader('Content-Type', guessMime(path.basename(rel)));
    res.setHeader('Cache-Control', 'private, max-age=3600');
    stream.on('error', next);
    stream.pipe(res);
  } catch {
    next();
  }
};

module.exports = {
  isS3Storage,
  ensureUploadDir,
  saveFile,
  persistLocalFile,
  deleteFile,
  fileExists,
  createReadStream,
  serveUploads,
  parseUploadUrl,
};
