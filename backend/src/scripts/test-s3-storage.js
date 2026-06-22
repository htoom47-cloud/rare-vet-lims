/**
 * Test R2/S3 connectivity — run with Render env vars:
 *   node src/scripts/test-s3-storage.js
 */
require('dotenv').config();
const env = require('../config/env');
const { isS3Storage, saveFile, fileExists, createReadStream } = require('../config/storage');

async function main() {
  console.log('STORAGE_TYPE:', env.storage.type);
  console.log('S3 configured:', isS3Storage());
  console.log('S3_BUCKET:', env.storage.s3.bucket || '(missing)');
  console.log('S3_ENDPOINT:', env.storage.s3.endpoint || '(default AWS)');
  console.log('S3_REGION:', env.storage.s3.region || '(missing)');
  console.log('S3_ACCESS_KEY set:', !!env.storage.s3.accessKey);
  console.log('S3_SECRET_KEY set:', !!env.storage.s3.secretKey);

  if (!isS3Storage()) {
    console.error('\nFAIL: STORAGE_TYPE is not s3 or S3_BUCKET is missing');
    process.exit(1);
  }

  const testContent = Buffer.from(`rare-vet-lims S3 test ${new Date().toISOString()}`);
  const { url, filename } = await saveFile(testContent, 'reports', 's3-test.txt');
  console.log('\nUpload OK:', url);

  const exists = await fileExists(url);
  console.log('fileExists:', exists);
  if (!exists) {
    console.error('FAIL: uploaded file not found');
    process.exit(1);
  }

  const stream = await createReadStream(url);
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString('utf8');
  console.log('Read back:', body.slice(0, 60));

  console.log('\nSUCCESS: R2/S3 read/write works. Check bucket for reports/s3-test.txt');
  process.exit(0);
}

main().catch((err) => {
  console.error('\nFAIL:', err.message);
  if (err.Code) console.error('AWS Code:', err.Code);
  process.exit(1);
});
