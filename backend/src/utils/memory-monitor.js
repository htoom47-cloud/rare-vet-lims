/**
 * Lightweight memory usage reporting for production (no log flood).
 */
const logger = require('../config/logger');

const MB = 1024 * 1024;

const snapshot = () => {
  const m = process.memoryUsage();
  return {
    rssMb: Math.round((m.rss / MB) * 10) / 10,
    heapUsedMb: Math.round((m.heapUsed / MB) * 10) / 10,
    heapTotalMb: Math.round((m.heapTotal / MB) * 10) / 10,
    externalMb: Math.round((m.external / MB) * 10) / 10,
    arrayBuffersMb: Math.round(((m.arrayBuffers || 0) / MB) * 10) / 10,
  };
};

const logMemory = (reason = 'checkpoint') => {
  logger.info('Memory usage', { reason, uptimeSec: Math.floor(process.uptime()), ...snapshot() });
};

/**
 * Start periodic memory logging (production only by default).
 * @returns {() => void} stop function
 */
const startMemoryMonitor = ({
  intervalMs = 5 * 60 * 1000,
  enabled = process.env.NODE_ENV === 'production',
} = {}) => {
  logMemory('startup');
  if (!enabled) return () => {};

  const timer = setInterval(() => logMemory('interval'), intervalMs);
  if (typeof timer.unref === 'function') timer.unref();

  return () => clearInterval(timer);
};

module.exports = { snapshot, logMemory, startMemoryMonitor };
