/**
 * Uploads backup — PDFs, reports, images, attachments (local disk).
 * Enable with UPLOAD_BACKUP_ENABLED=true
 *
 * Usage: node src/scripts/backup-uploads.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');
const env = require('../config/env');
const logger = require('../config/logger');

const resolveUploadRoot = () => {
  const p = env.storage.path;
  return path.isAbsolute(p) ? p : path.resolve(__dirname, '../..', p.replace(/^\.\//, ''));
};

async function uploadBackupToS3(filePath) {
  if (!env.storage.s3.bucket || !process.env.S3_ACCESS_KEY) return null;

  const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
  const { s3 } = env.storage;
  const client = new S3Client({
    region: s3.region || 'us-east-1',
    credentials: { accessKeyId: s3.accessKey, secretAccessKey: s3.secretKey },
    ...(s3.endpoint ? { endpoint: s3.endpoint, forcePathStyle: true } : {}),
  });

  const prefix = env.backup.uploads.s3Prefix;
  const key = `${prefix}/${path.basename(filePath)}`;
  const body = await fs.promises.readFile(filePath);

  await client.send(new PutObjectCommand({
    Bucket: s3.bucket,
    Key: key,
    Body: body,
    ContentType: 'application/gzip',
  }));

  return `s3://${s3.bucket}/${key}`;
}

function pruneOldBackups(dir, retentionDays) {
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) return;
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  for (const name of fs.readdirSync(dir)) {
    if (!name.startsWith('uploads-backup-')) continue;
    const full = path.join(dir, name);
    if (fs.statSync(full).mtimeMs < cutoff) {
      fs.unlinkSync(full);
      logger.info('Removed old uploads backup', { file: name });
    }
  }
}

async function main() {
  if (!env.backup.uploads.enabled) {
    console.log('Upload backup disabled (UPLOAD_BACKUP_ENABLED!=true). Skipping.');
    process.exit(0);
  }

  const uploadRoot = resolveUploadRoot();
  if (!fs.existsSync(uploadRoot)) {
    console.error(`Upload directory not found: ${uploadRoot}`);
    process.exit(1);
  }

  const backupDir = env.backup.uploads.dir;
  fs.mkdirSync(backupDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const tarFile = path.join(backupDir, `uploads-backup-${stamp}.tar.gz`);

  console.log(`Backing up ${uploadRoot} → ${tarFile}`);

  const tar = spawnSync('tar', ['-czf', tarFile, '-C', path.dirname(uploadRoot), path.basename(uploadRoot)], {
    encoding: 'utf8',
  });

  if (tar.status !== 0) {
    console.error('tar failed:', tar.stderr || tar.stdout);
    process.exit(1);
  }

  const sizeMb = (fs.statSync(tarFile).size / 1024 / 1024).toFixed(2);
  console.log(`Uploads backup saved: ${tarFile} (${sizeMb} MB)`);

  pruneOldBackups(backupDir, env.backup.uploads.retentionDays);

  try {
    const s3Uri = await uploadBackupToS3(tarFile);
    if (s3Uri) console.log(`Uploaded to ${s3Uri}`);
  } catch (err) {
    console.warn('S3 upload skipped or failed:', err.message);
  }
}

main().catch((err) => {
  logger.error('Uploads backup failed', { error: err.message });
  process.exit(1);
});
