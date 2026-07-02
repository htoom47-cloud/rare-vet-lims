const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const BCRYPT_ROUNDS = 10;
const PREFIX_LEN = 8;

const generatePlaintextKey = () => crypto.randomBytes(24).toString('hex');

const hashApiKey = async (plaintext) => bcrypt.hash(plaintext, BCRYPT_ROUNDS);

const verifyApiKey = async (config = {}, providedKey) => {
  if (!providedKey) return { valid: false, legacy: false };

  if (config.api_key_hash) {
    const valid = await bcrypt.compare(providedKey, config.api_key_hash);
    return { valid, legacy: false };
  }

  if (config.api_key && config.api_key === providedKey) {
    return { valid: true, legacy: true };
  }

  return { valid: false, legacy: false };
};

/** Store hash + prefix only — never persist plaintext api_key. */
const prepareConfigWithHashedKey = async (config = {}, plaintextKey = generatePlaintextKey()) => {
  const next = { ...config };
  delete next.api_key;
  next.api_key_hash = await hashApiKey(plaintextKey);
  next.api_key_prefix = plaintextKey.slice(0, PREFIX_LEN);
  return { config: next, plaintextKey };
};

const upgradeLegacyKeyInConfig = async (config = {}, plaintextKey) => {
  const next = { ...config };
  delete next.api_key;
  next.api_key_hash = await hashApiKey(plaintextKey);
  next.api_key_prefix = plaintextKey.slice(0, PREFIX_LEN);
  return next;
};

const sanitizeDeviceConfig = (config = {}) => {
  const safe = { ...config };
  delete safe.api_key;
  delete safe.api_key_hash;
  if (safe.api_key_prefix) {
    safe.api_key_masked = `${safe.api_key_prefix}…`;
  }
  return safe;
};

const sanitizeDevice = (device) => {
  if (!device) return device;
  const config = typeof device.config === 'string'
    ? JSON.parse(device.config)
    : (device.config || {});
  return {
    ...device,
    config: sanitizeDeviceConfig(config),
  };
};

module.exports = {
  generatePlaintextKey,
  hashApiKey,
  verifyApiKey,
  prepareConfigWithHashedKey,
  upgradeLegacyKeyInConfig,
  sanitizeDeviceConfig,
  sanitizeDevice,
};
