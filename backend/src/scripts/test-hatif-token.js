/**
 * Read-only Hatif auth smoke test. Does not print secrets or tokens.
 * Usage: node src/scripts/test-hatif-token.js
 */
const fs = require('fs');
const path = require('path');

const loadEnvFile = (filePath) => {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"'))
      || (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
};

const root = path.join(__dirname, '../..');
const env = {
  ...loadEnvFile(path.join(root, '.env')),
  ...loadEnvFile(path.join(root, '.env.local')),
};

const clientId = String(env.HATIF_CLIENT_ID || '').trim();
const clientSecret = String(env.HATIF_CLIENT_SECRET || '').trim();
const tokenUrl = String(env.HATIF_TOKEN_URL || 'https://api.voxa.sa/connect/token').trim();

console.log(JSON.stringify({
  hasClientId: !!clientId,
  hasClientSecret: !!clientSecret,
  clientIdLength: clientId.length,
  clientSecretLength: clientSecret.length,
  hasChannelId: !!String(env.HATIF_CHANNEL_ID || '').trim(),
  tokenUrl,
}, null, 2));

if (!clientId || !clientSecret) {
  console.error('MISSING_CREDENTIALS: put HATIF_CLIENT_ID and HATIF_CLIENT_SECRET in backend/.env.local');
  process.exit(2);
}

(async () => {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials',
    scope: 'VoxaAPI',
  });
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json().catch(() => ({}));
  console.log(JSON.stringify({
    httpStatus: res.status,
    ok: res.ok,
    hasAccessToken: !!data.access_token,
    expiresIn: data.expires_in || null,
    error: data.error || null,
    errorDescription: data.error_description || null,
  }, null, 2));
  process.exit(res.ok && data.access_token ? 0 : 1);
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
