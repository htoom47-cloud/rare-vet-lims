/**
 * Critical flag runtime control.
 * When disabled: ignore critical_low/high — keep Min/Max → LOW/HIGH only.
 * Default: enabled (current production behaviour).
 */
const env = require('../config/env');
const { query } = require('../config/database');
const logger = require('../config/logger');

const SETTINGS_KEY = 'disable_critical_flags';

/** null = follow env only; boolean = runtime override from settings table */
let runtimeDisable = null;

const envDisableCriticalFlags = () => !!env.features?.disableCriticalFlags;

/** True when critical rates/alerts must be suppressed. */
const isCriticalFlagsDisabled = () => {
  if (runtimeDisable !== null) return runtimeDisable;
  return envDisableCriticalFlags();
};

/** True when critical evaluation/alerts should run (default). */
const isCriticalFlagsEnabled = () => !isCriticalFlagsDisabled();

const setCriticalFlagsDisabled = (disabled) => {
  runtimeDisable = !!disabled;
};

const loadCriticalFlagsSetting = async () => {
  try {
    const result = await query('SELECT value FROM settings WHERE key = $1 LIMIT 1', [SETTINGS_KEY]);
    if (!result.rows[0]) {
      runtimeDisable = null;
      return isCriticalFlagsDisabled();
    }
    const raw = result.rows[0].value;
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    runtimeDisable = parsed === true || parsed === 'true' || parsed === 1;
    return runtimeDisable;
  } catch (err) {
    logger.warn('critical-flags setting load failed — using env default', { error: err.message });
    runtimeDisable = null;
    return envDisableCriticalFlags();
  }
};

const saveCriticalFlagsDisabled = async (disabled, userId) => {
  const value = !!disabled;
  await query(
    `INSERT INTO settings (key, value, updated_by) VALUES ($1, $2, $3)
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_by = $3, updated_at = NOW()`,
    [SETTINGS_KEY, JSON.stringify(value), userId || null]
  );
  runtimeDisable = value;
  return value;
};

module.exports = {
  SETTINGS_KEY,
  isCriticalFlagsDisabled,
  isCriticalFlagsEnabled,
  setCriticalFlagsDisabled,
  loadCriticalFlagsSetting,
  saveCriticalFlagsDisabled,
  envDisableCriticalFlags,
};
