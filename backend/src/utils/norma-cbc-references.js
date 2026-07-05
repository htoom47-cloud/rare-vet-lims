/**
 * Norma iVet-5 / Icon CBC reference intervals for LIMS — per species.
 * Fallback defaults — overridden when Norma sends OBX-7 in HL7.
 */
const { defaultCritical } = require('./reference-range');

const mk = (min, max, crit_low, crit_high) => ({
  min, max,
  crit_low: crit_low ?? defaultCritical(min, max).crit_low,
  crit_high: crit_high ?? defaultCritical(min, max).crit_high,
});

const PLATELET_DEFAULTS = {
  MPV: mk(3, 10, 2, 15),
  PCT: mk(0.05, 0.8, 0.02, 1.2),
  'PDW-SD': mk(3, 12, 2, 18),
  'PDW-CV': mk(15, 35, 10, 45),
  'PLC-R': mk(5, 40, 2, 55),
  'PLC-C': mk(5, 150, 2, 250),
};

/** Norma iVet camel (إبل) */
const camel = {
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
  RDW: mk(12, 35, 8, 45),
  PLT: mk(100, 800, 50, 1000),
  ...PLATELET_DEFAULTS,
};

/** Horse (خيل) */
const horse = {
  WBC: mk(5.5, 12.5, 3, 25),
  LYM: mk(2, 6, 0.8, 10),
  LYM_PCT: mk(35, 65, 20, 80),
  MON: mk(0.1, 1.5, 0, 3),
  MON_PCT: mk(0, 5, 0, 10),
  NEU: mk(2.5, 8, 1.5, 15),
  NEU_PCT: mk(30, 65, 15, 85),
  EOS: mk(0, 1, 0, 3),
  EOS_PCT: mk(0, 5, 0, 12),
  BAS: mk(0, 0.3, 0, 1),
  BAS_PCT: mk(0, 1, 0, 3),
  RBC: mk(6.5, 12.5, 4, 16),
  HGB: mk(110, 190, 70, 230),
  MCV: mk(40, 56, 32, 65),
  HCT: mk(32, 53, 22, 62),
  MCH: mk(11, 17, 8, 20),
  MCHC: mk(320, 380, 260, 420),
  'RDW-SD': mk(15, 45, 10, 55),
  'RDW-CV': mk(12, 38, 8, 48),
  RDW: mk(12, 38, 8, 48),
  PLT: mk(100, 600, 50, 900),
  MPV: mk(4, 10, 2, 14),
  PCT: mk(0.05, 0.7, 0.02, 1.0),
  'PDW-SD': mk(3, 14, 2, 18),
  'PDW-CV': mk(15, 38, 10, 45),
  'PLC-R': mk(5, 35, 2, 50),
  'PLC-C': mk(5, 120, 2, 200),
};

/** Sheep (غنم) */
const sheep = {
  WBC: mk(4, 12, 2, 22),
  LYM: mk(2, 8, 0.8, 12),
  LYM_PCT: mk(40, 80, 25, 90),
  MON: mk(0, 1, 0, 2.5),
  MON_PCT: mk(0, 6, 0, 12),
  NEU: mk(1, 6, 0.5, 10),
  NEU_PCT: mk(10, 50, 5, 70),
  EOS: mk(0, 1.5, 0, 4),
  EOS_PCT: mk(0, 10, 0, 18),
  BAS: mk(0, 0.3, 0, 1),
  BAS_PCT: mk(0, 2, 0, 4),
  RBC: mk(8, 16, 5, 20),
  HGB: mk(70, 160, 45, 200),
  MCV: mk(25, 40, 18, 48),
  HCT: mk(22, 45, 14, 55),
  MCH: mk(8, 14, 5, 18),
  MCHC: mk(300, 380, 240, 420),
  'RDW-SD': mk(12, 35, 8, 45),
  'RDW-CV': mk(10, 32, 6, 42),
  RDW: mk(10, 32, 6, 42),
  PLT: mk(150, 650, 80, 900),
  MPV: mk(3, 9, 2, 13),
  PCT: mk(0.04, 0.6, 0.02, 0.9),
  'PDW-SD': mk(3, 12, 2, 16),
  'PDW-CV': mk(14, 35, 10, 42),
  'PLC-R': mk(5, 40, 2, 55),
  'PLC-C': mk(5, 130, 2, 220),
};

/** Goat (ماعز) */
const goat = {
  WBC: mk(4.5, 13, 2.5, 24),
  LYM: mk(2, 7, 0.8, 11),
  LYM_PCT: mk(40, 75, 25, 88),
  MON: mk(0, 1.2, 0, 2.8),
  MON_PCT: mk(0, 7, 0, 14),
  NEU: mk(1.5, 7, 0.8, 12),
  NEU_PCT: mk(15, 55, 8, 72),
  EOS: mk(0, 1.5, 0, 4),
  EOS_PCT: mk(0, 12, 0, 20),
  BAS: mk(0, 0.3, 0, 1),
  BAS_PCT: mk(0, 2, 0, 4),
  RBC: mk(9, 15, 6, 19),
  HGB: mk(70, 155, 45, 195),
  MCV: mk(25, 42, 18, 50),
  HCT: mk(22, 46, 14, 56),
  MCH: mk(8, 14, 5, 18),
  MCHC: mk(300, 380, 240, 420),
  'RDW-SD': mk(12, 36, 8, 46),
  'RDW-CV': mk(10, 33, 6, 43),
  RDW: mk(10, 33, 6, 43),
  PLT: mk(150, 700, 80, 950),
  MPV: mk(3, 9, 2, 13),
  PCT: mk(0.04, 0.65, 0.02, 0.95),
  'PDW-SD': mk(3, 12, 2, 16),
  'PDW-CV': mk(14, 36, 10, 44),
  'PLC-R': mk(5, 40, 2, 55),
  'PLC-C': mk(5, 140, 2, 230),
};

const NORMA_CBC_REFERENCES = { camel, horse, sheep, goat };

const getNormaReference = (animalType, parameterCode) => {
  const species = NORMA_CBC_REFERENCES[animalType];
  if (!species) return null;
  return species[parameterCode] || null;
};

module.exports = { NORMA_CBC_REFERENCES, getNormaReference };
