/**
 * Proposed purchase-extraction cleanup.
 * Not wired to cron, migrate.js, or application startup. Do not run against production.
 * Default path is dry-run via proposedCleanupExpiredExtractions({ dryRun: true }).
 */
if (require.main === module) {
  console.error('Proposed extraction cleanup is not enabled and is not scheduled.');
  process.exit(1);
}

module.exports = {
  proposedCleanupExpiredExtractions: require('../services/purchase-extraction.service').proposedCleanupExpiredExtractions,
};
