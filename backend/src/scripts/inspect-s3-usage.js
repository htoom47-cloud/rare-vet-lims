/**
 * Read-only S3/R2 usage inspector — count + bytes by top-level prefix.
 * Run on Render Shell (where S3 env vars exist):
 *   cd backend && node src/scripts/inspect-s3-usage.js
 *
 * Does NOT upload, modify, or delete objects.
 */
require('dotenv').config();
const { ListObjectsV2Command, S3Client } = require('@aws-sdk/client-s3');
const env = require('../config/env');
const { isS3Storage } = require('../config/storage');

const KNOWN_PREFIXES = [
  'reports',
  'microscope',
  'invoices',
  'animals',
  'quotes',
  'closings',
  'signatures',
  'temp',
  'backups',
  'ministry-docs',
];

const formatBytes = (bytes) => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  const digits = i === 0 ? 0 : i === 1 ? 1 : 2;
  return `${n.toFixed(digits)} ${units[i]}`;
};

const resolveRegion = () => {
  const region = env.storage.s3.region;
  if (!region || region === 'auto') return 'us-east-1';
  return region;
};

const buildClient = () => {
  const { s3 } = env.storage;
  const config = {
    region: resolveRegion(),
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
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
  return new S3Client(config);
};

const topPrefix = (key) => {
  const slash = String(key || '').indexOf('/');
  if (slash <= 0) return '(root)';
  return key.slice(0, slash);
};

async function listAllObjects(client, bucket) {
  const objects = [];
  let ContinuationToken;
  do {
    // eslint-disable-next-line no-await-in-loop
    const page = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      ContinuationToken,
      MaxKeys: 1000,
    }));
    for (const obj of page.Contents || []) {
      objects.push({
        key: obj.Key,
        size: Number(obj.Size || 0),
      });
    }
    ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (ContinuationToken);
  return objects;
}

async function main() {
  console.log('=== S3/R2 usage (read-only) ===\n');
  console.log('STORAGE_TYPE:', env.storage.type);
  console.log('S3 configured:', isS3Storage());
  console.log('S3_BUCKET:', env.storage.s3.bucket || '(missing)');
  console.log('S3_ENDPOINT:', env.storage.s3.endpoint || '(default AWS)');
  console.log('S3_REGION:', env.storage.s3.region || '(missing)');
  console.log('S3_ACCESS_KEY set:', !!env.storage.s3.accessKey);
  console.log('S3_SECRET_KEY set:', !!env.storage.s3.secretKey);
  console.log('');

  if (!isS3Storage()) {
    console.error('FAIL: STORAGE_TYPE is not s3 or credentials/bucket missing.');
    console.error('Run this on Render Shell for the production service.');
    process.exit(1);
  }

  const bucket = env.storage.s3.bucket;
  const client = buildClient();
  const objects = await listAllObjects(client, bucket);

  const byPrefix = {};
  let totalBytes = 0;
  for (const obj of objects) {
    const prefix = topPrefix(obj.key);
    if (!byPrefix[prefix]) byPrefix[prefix] = { count: 0, bytes: 0 };
    byPrefix[prefix].count += 1;
    byPrefix[prefix].bytes += obj.size;
    totalBytes += obj.size;
  }

  const rows = Object.entries(byPrefix)
    .map(([prefix, stats]) => ({ prefix, ...stats }))
    .sort((a, b) => b.bytes - a.bytes || b.count - a.count);

  console.log(`Bucket: ${bucket}`);
  console.log(`Total files: ${objects.length}`);
  console.log(`Total size:  ${formatBytes(totalBytes)} (${totalBytes} bytes)`);
  console.log('');
  console.log('By prefix:');
  console.log(`${'prefix'.padEnd(18)} ${'files'.padStart(8)} ${'size'.padStart(12)}`);
  console.log('-'.repeat(40));
  for (const row of rows) {
    console.log(
      `${row.prefix.padEnd(18)} ${String(row.count).padStart(8)} ${formatBytes(row.bytes).padStart(12)}`
    );
  }

  const missingKnown = KNOWN_PREFIXES.filter((p) => !byPrefix[p]);
  if (missingKnown.length) {
    console.log(`\nKnown prefixes with 0 files: ${missingKnown.join(', ')}`);
  }

  console.log('\nDone (read-only; no objects changed).');
}

main().catch((err) => {
  console.error('\nFAIL:', err.message);
  if (err.Code || err.name) console.error('Code:', err.Code || err.name);
  process.exit(1);
});
