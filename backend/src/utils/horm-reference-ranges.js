/**
 * Hormone reference intervals per species.
 */
const { defaultCritical } = require('./reference-range');

const mk = (min, max, crit_low, crit_high) => ({
  min, max,
  crit_low: crit_low ?? defaultCritical(min, max).crit_low,
  crit_high: crit_high ?? defaultCritical(min, max).crit_high,
});

const HORM_REFERENCE_RANGES = {
  camel: { T4: mk(1.0, 4.0, 0.5, 8) },
  horse: { T4: mk(1.0, 3.5, 0.5, 7) },
  sheep: { T4: mk(0.8, 3.5, 0.4, 6.5) },
  goat: { T4: mk(0.8, 3.5, 0.4, 6.5) },
};

const getHormReference = (animalType, parameterCode) => (
  HORM_REFERENCE_RANGES[animalType]?.[parameterCode] || null
);

module.exports = { HORM_REFERENCE_RANGES, getHormReference };
