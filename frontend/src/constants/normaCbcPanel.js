/** Norma iVet-5 CBC panel — mirrors backend norma-cbc-panel.js for Workbench display */
export const NORMA_CBC_SECTIONS = ['WBC', 'RBC', 'PLT'];

export const NORMA_CBC_PANEL = [
  { code: 'WBC', symbol: 'WBC', section: 'WBC' },
  { code: 'LYM', symbol: 'LYM', section: 'WBC' },
  { code: 'MON', symbol: 'MON', section: 'WBC' },
  { code: 'NEU', symbol: 'NEU', section: 'WBC' },
  { code: 'EOS', symbol: 'EOS', section: 'WBC' },
  { code: 'BAS', symbol: 'BAS', section: 'WBC' },
  { code: 'LYM_PCT', symbol: 'LYM%', section: 'WBC' },
  { code: 'MON_PCT', symbol: 'MON%', section: 'WBC' },
  { code: 'NEU_PCT', symbol: 'NEU%', section: 'WBC' },
  { code: 'EOS_PCT', symbol: 'EOS%', section: 'WBC' },
  { code: 'BAS_PCT', symbol: 'BAS%', section: 'WBC' },
  { code: 'RBC', symbol: 'RBC', section: 'RBC' },
  { code: 'HGB', symbol: 'HGB', section: 'RBC' },
  { code: 'MCV', symbol: 'MCV', section: 'RBC' },
  { code: 'HCT', symbol: 'HCT', section: 'RBC' },
  { code: 'MCH', symbol: 'MCH', section: 'RBC' },
  { code: 'MCHC', symbol: 'MCHC', section: 'RBC' },
  { code: 'RDW-SD', symbol: 'RDWsd', section: 'RBC' },
  { code: 'RDW-CV', symbol: 'RDWcv', section: 'RBC' },
  { code: 'PLT', symbol: 'PLT', section: 'PLT' },
  { code: 'MPV', symbol: 'MPV', section: 'PLT' },
  { code: 'PCT', symbol: 'PCT', section: 'PLT' },
  { code: 'PDW-SD', symbol: 'PDWsd', section: 'PLT' },
  { code: 'PDW-CV', symbol: 'PDWcv', section: 'PLT' },
  { code: 'PLC-R', symbol: 'PLC-R', section: 'PLT' },
  { code: 'PLC-C', symbol: 'PLC-C', section: 'PLT' },
];

export const normaSectionLabel = (section, t) => {
  const key = { WBC: 'workbench.normaSectionWbc', RBC: 'workbench.normaSectionRbc', PLT: 'workbench.normaSectionPlt' }[section];
  return key ? t(key) : section;
};

export const isNormaCbcTest = (test) => test?.test_code === 'CBC-FULL' || test?.code === 'CBC-FULL';
