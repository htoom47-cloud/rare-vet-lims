/**
 * Norma iVet-5 / Icon CBC reference intervals for LIMS.
 * Fallback defaults for camel — overridden automatically when Norma sends OBX-7 in HL7.
 * Run apply-norma-hl7-refs.js after changing device profiles to sync DB from latest import.
 */
const { defaultCritical } = require('./reference-range');

const mk = (min, max, crit_low, crit_high) => ({
  min, max,
  crit_low: crit_low ?? defaultCritical(min, max).crit_low,
  crit_high: crit_high ?? defaultCritical(min, max).crit_high,
});

/** Norma iVet camel (إبل) — 26 CBC parameters */
const NORMA_CBC_REFERENCES = {
  camel: {
    WBC: mk(4, 15, 2, 30),
    LYM: mk(1, 8, 0.5, 12),
    LYM_PCT: mk(15, 65, 5, 80),
    MON: mk(0.1, 2, 0, 4),
    MON_PCT: mk(1, 12, 0, 20),
    NEU: mk(2, 12, 1, 20),
    NEU_PCT: mk(25, 80, 10, 90),
    EOS: mk(0, 2, 0, 5),
    EOS_PCT: mk(0, 15, 0, 25),
    BAS: mk(0, 0.5, 0, 2),
    BAS_PCT: mk(0, 3, 0, 8),
    RBC: mk(5, 12, 3, 15),
    HGB: mk(80, 180, 50, 220),
    MCV: mk(24, 40, 18, 50),
    HCT: mk(24, 46, 15, 55),
    MCH: mk(10, 18, 7, 22),
    MCHC: mk(350, 480, 280, 550),
    'RDW-SD': mk(15, 40, 10, 55),
    'RDW-CV': mk(12, 35, 8, 45),
    PLT: mk(100, 800, 50, 1000),
    MPV: mk(3, 10, 2, 15),
    PCT: mk(0.05, 0.8, 0.02, 1.2),
    'PDW-SD': mk(3, 12, 2, 18),
    'PDW-CV': mk(15, 35, 10, 45),
    'PLC-R': mk(5, 40, 2, 55),
    'PLC-C': mk(5, 150, 2, 250),
    RDW: mk(12, 35, 8, 45),
  },
};

const getNormaReference = (animalType, parameterCode) => {
  const species = NORMA_CBC_REFERENCES[animalType];
  if (!species) return null;
  return species[parameterCode] || null;
};

module.exports = { NORMA_CBC_REFERENCES, getNormaReference };
