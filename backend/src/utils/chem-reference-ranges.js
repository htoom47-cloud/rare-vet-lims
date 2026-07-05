/**
 * Chemistry (CHEM-BASIC) reference intervals per species.
 * Units: mg/dL unless noted on parameter.
 */
const { defaultCritical } = require('./reference-range');

const mk = (min, max, crit_low, crit_high) => ({
  min, max,
  crit_low: crit_low ?? defaultCritical(min, max).crit_low,
  crit_high: crit_high ?? defaultCritical(min, max).crit_high,
});

const CHEM_REFERENCE_RANGES = {
  camel: {
    GLU: mk(60, 120, 40, 400),
    BUN: mk(10, 30, 5, 80),
    CREA: mk(0.8, 2.0, 0.3, 5),
    ALT: mk(10, 60, 5, 300),
    AST: mk(10, 50, 5, 250),
    ALP: mk(50, 300, 20, 800),
    TP: mk(5.5, 8.5, 4, 10),
    ALB: mk(2.5, 4.5, 1.5, 5.5),
  },
  horse: {
    GLU: mk(70, 120, 45, 350),
    BUN: mk(10, 25, 5, 60),
    CREA: mk(0.8, 2.0, 0.3, 4.5),
    ALT: mk(4, 50, 2, 250),
    AST: mk(10, 40, 5, 200),
    ALP: mk(100, 400, 40, 900),
    TP: mk(5.5, 8.0, 4, 9.5),
    ALB: mk(2.5, 4.0, 1.5, 5),
  },
  sheep: {
    GLU: mk(40, 80, 25, 250),
    BUN: mk(8, 25, 4, 60),
    CREA: mk(0.8, 2.0, 0.3, 4.5),
    ALT: mk(15, 60, 8, 280),
    AST: mk(15, 60, 8, 250),
    ALP: mk(50, 250, 20, 700),
    TP: mk(6.0, 8.5, 4.5, 10),
    ALB: mk(2.5, 4.5, 1.5, 5.5),
  },
  goat: {
    GLU: mk(50, 90, 30, 280),
    BUN: mk(10, 30, 5, 70),
    CREA: mk(0.8, 2.2, 0.3, 5),
    ALT: mk(10, 80, 5, 320),
    AST: mk(20, 80, 10, 280),
    ALP: mk(50, 350, 20, 850),
    TP: mk(6.0, 8.0, 4.5, 9.5),
    ALB: mk(2.5, 4.0, 1.5, 5),
  },
};

const getChemReference = (animalType, parameterCode) => (
  CHEM_REFERENCE_RANGES[animalType]?.[parameterCode] || null
);

module.exports = { CHEM_REFERENCE_RANGES, getChemReference };
