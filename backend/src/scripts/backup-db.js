require('dotenv').config();
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const logger = require('../config/logger');
const env = require('../config/env');

const DATABASE_URL = process.env.DATABASE_URL;
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, '../../backups');
const RETENTION_DAYS = parseInt(process.env.BACKUP_RETENTION_DAYS || '30', 10);

async function uploadBackupToS3(filePath) {
  if (!env.storage.s3.bucket || !process.env.S3_ACCESS_KEY) return null;

  const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
  const { s3 } = env.storage;
  const client = new S3Client({
    region: s3.region || 'us-east-1',
    credentials: { accessKeyId: s3.accessKey, secretAccessKey: s3.secretKey },
    ...(s3.endpoint ? { endpoint: s3.endpoint, forcePathStyle: true } : {}),
  });

  const prefix = process.env.BACKUP_S3_PREFIX || 'backups/db';
  const key = `${prefix}/${path.basename(filePath)}`;
  const body = await fs.promises.readFile(filePath);

  await client.send(new PutObjectCommand({
    Bucket: s3.bucket,
    Key: key,
    Body: body,
    ContentType: filePath.endsWith('.gz') ? 'application/gzip' : 'application/sql',
  }));

  return `s3://${s3.bucket}/${key}`;
}

function pruneOldBackups(dir) {
  if (!Number.isFinite(RETENTION_DAYS) || RETENTION_DAYS <= 0) return;
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  for (const name of fs.readdirSync(dir)) {
    if (!name.startsWith('rare-vet-lims-')) continue;
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.mtimeMs < cutoff) {
      fs.unlinkSync(full);
      logger.info('Removed old backup', { file: name });
    }
  }
}

async function main() {
  if (!DATABASE_URL) {
    console.error('ERROR: DATABASE_URL is not set.');
    console.error('For Render: Dashboard → rare-vet-db → Connect → External Database URL');
    process.exit(1);
  }

  const pgDump = spawnSync('pg_dump', ['--version'], { encoding: 'utf8' });
  if (pgDump.status !== 0) {
    console.error('ERROR: pg_dump not found.');
    console.error('Install PostgreSQL client tools, then run: npm run backup');
    console.error('Windows: https://www.postgresql.org/download/windows/');
    console.error('Or enable automatic backups in Render Dashboard → rare-vet-db → Backups');
    process.exit(1);
  }

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const sqlFile = path.join(BACKUP_DIR, `rare-vet-lims-${stamp}.sql`);

  console.log('Creating backup...');
  execSync(
    `pg_dump "${DATABASE_URL}" --no-owner --no-acl --clean --if-exists -f "${sqlFile}"`,
    { stdio: 'inherit', shell: true }
  );

  let finalFile = sqlFile;
  const gzip = spawnSync('gzip', ['-f', sqlFile], { encoding: 'utf8' });
  if (gzip.status === 0) {
    finalFile = `${sqlFile}.gz`;
  }

  console.log(`Backup saved: ${finalFile}`);
  pruneOldBackups(BACKUP_DIR);

  try {
    const s3Uri = await uploadBackupToS3(finalFile);
    if (s3Uri) console.log(`Uploaded to ${s3Uri}`);
  } catch (err) {
    console.warn('S3 upload skipped or failed:', err.message);
  }
}

main().catch((err) => {
  logger.error('Backup failed', { error: err.message });
  process.exit(1);
});
