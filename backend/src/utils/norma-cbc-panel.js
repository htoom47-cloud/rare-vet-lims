/**
 * Norma iVet-5 CBC panel — single source of truth for HL7 import, DB sync, and UI order.
 * Matches device screen: WBC → RBC → PLT with Norma symbols (LYM, LYM%, RDWsd, PLC-R, …).
 */
const NORMA_CBC_PANEL = [
  // —— WBC ——
  { code: 'WBC', symbol: 'WBC', section: 'WBC', name_en: 'WBC', name_ar: 'كريات الدم البيضاء', unit: '10³/µL', hl7Index: 0, displayOrder: 0 },
  { code: 'LYM', symbol: 'LYM', section: 'WBC', name_en: 'LYM', name_ar: 'اللمفاويات (#)', unit: '10³/µL', hl7Index: 1, displayOrder: 1 },
  { code: 'MON', symbol: 'MON', section: 'WBC', name_en: 'MON', name_ar: 'الوحيدات (#)', unit: '10³/µL', hl7Index: 2, displayOrder: 2 },
  { code: 'NEU', symbol: 'NEU', section: 'WBC', name_en: 'NEU', name_ar: 'العدلات (#)', unit: '10³/µL', hl7Index: 3, displayOrder: 3 },
  { code: 'EOS', symbol: 'EOS', section: 'WBC', name_en: 'EOS', name_ar: 'الحمضات (#)', unit: '10³/µL', hl7Index: 4, displayOrder: 4 },
  { code: 'BAS', symbol: 'BAS', section: 'WBC', name_en: 'BAS', name_ar: 'القعدات (#)', unit: '10³/µL', hl7Index: 5, displayOrder: 5 },
  { code: 'LYM_PCT', symbol: 'LYM%', section: 'WBC', name_en: 'LYM%', name_ar: 'اللمفاويات (%)', unit: '%', hl7Index: 6, displayOrder: 6 },
  { code: 'MON_PCT', symbol: 'MON%', section: 'WBC', name_en: 'MON%', name_ar: 'الوحيدات (%)', unit: '%', hl7Index: 7, displayOrder: 7 },
  { code: 'NEU_PCT', symbol: 'NEU%', section: 'WBC', name_en: 'NEU%', name_ar: 'العدلات (%)', unit: '%', hl7Index: 8, displayOrder: 8 },
  { code: 'EOS_PCT', symbol: 'EOS%', section: 'WBC', name_en: 'EOS%', name_ar: 'الحمضات (%)', unit: '%', hl7Index: 9, displayOrder: 9 },
  { code: 'BAS_PCT', symbol: 'BAS%', section: 'WBC', name_en: 'BAS%', name_ar: 'القعدات (%)', unit: '%', hl7Index: 10, displayOrder: 10 },
  // —— RBC (screen order: RBC HGB MCV HCT MCH MCHC RDWsd RDWcv) ——
  { code: 'RBC', symbol: 'RBC', section: 'RBC', name_en: 'RBC', name_ar: 'كريات الدم الحمراء', unit: '10⁶/µL', hl7Index: 11, displayOrder: 11 },
  { code: 'HGB', symbol: 'HGB', section: 'RBC', name_en: 'HGB', name_ar: 'الهيموجلوبين', unit: 'g/L', hl7Index: 12, displayOrder: 12 },
  { code: 'MCV', symbol: 'MCV', section: 'RBC', name_en: 'MCV', name_ar: 'حجم الكرية الوسطي', unit: 'fL', hl7Index: 14, displayOrder: 13 },
  { code: 'HCT', symbol: 'HCT', section: 'RBC', name_en: 'HCT', name_ar: 'الهيماتوكريت', unit: '%', hl7Index: 13, displayOrder: 14 },
  { code: 'MCH', symbol: 'MCH', section: 'RBC', name_en: 'MCH', name_ar: 'هيموجلوبين الكرية', unit: 'pg', hl7Index: 17, displayOrder: 15 },
  { code: 'MCHC', symbol: 'MCHC', section: 'RBC', name_en: 'MCHC', name_ar: 'تركيز الهيموجلوبين', unit: 'g/L', hl7Index: 18, displayOrder: 16 },
  { code: 'RDW-SD', symbol: 'RDWsd', section: 'RBC', name_en: 'RDWsd', name_ar: 'توزيع الكريات (SD)', unit: 'fL', hl7Index: 15, displayOrder: 17 },
  { code: 'RDW-CV', symbol: 'RDWcv', section: 'RBC', name_en: 'RDWcv', name_ar: 'توزيع الكريات (CV)', unit: '%', hl7Index: 16, displayOrder: 18 },
  // —— PLT ——
  { code: 'PLT', symbol: 'PLT', section: 'PLT', name_en: 'PLT', name_ar: 'الصفائح الدموية', unit: '10³/µL', hl7Index: 19, displayOrder: 19 },
  { code: 'MPV', symbol: 'MPV', section: 'PLT', name_en: 'MPV', name_ar: 'حجم الصفيح الوسطي', unit: 'fL', hl7Index: 20, displayOrder: 20 },
  { code: 'PCT', symbol: 'PCT', section: 'PLT', name_en: 'PCT', name_ar: 'النسبة الصفية', unit: '%', hl7Index: 21, displayOrder: 21 },
  { code: 'PDW-SD', symbol: 'PDWsd', section: 'PLT', name_en: 'PDWsd', name_ar: 'توزيع الصفائح (SD)', unit: 'fL', hl7Index: 22, displayOrder: 22 },
  { code: 'PDW-CV', symbol: 'PDWcv', section: 'PLT', name_en: 'PDWcv', name_ar: 'توزيع الصفائح (CV)', unit: '%', hl7Index: 23, displayOrder: 23 },
  { code: 'PLC-R', symbol: 'PLC-R', section: 'PLT', name_en: 'PLC-R', name_ar: 'نسبة الصفائح الكبيرة', unit: '%', hl7Index: 24, displayOrder: 24 },
  { code: 'PLC-C', symbol: 'PLC-C', section: 'PLT', name_en: 'PLC-C', name_ar: 'عدد الصفائح الكبيرة', unit: '10³/µL', hl7Index: 25, displayOrder: 25 },
];

const NORMA_IVET_HL7_INDEX = Array.from({ length: 26 }, (_, i) => {
  const row = NORMA_CBC_PANEL.find((p) => p.hl7Index === i);
  return row ? row.code : null;
});

const NORMA_CBC_ORDER = [...NORMA_CBC_PANEL]
  .sort((a, b) => a.displayOrder - b.displayOrder)
  .map((p) => p.code);

const NORMA_SYMBOL_BY_CODE = Object.fromEntries(NORMA_CBC_PANEL.map((p) => [p.code, p.symbol]));
const NORMA_SECTION_BY_CODE = Object.fromEntries(NORMA_CBC_PANEL.map((p) => [p.code, p.section]));

const getNormaPanelRow = (code) => NORMA_CBC_PANEL.find((p) => p.code === code) || null;

/** Norma device screen rows — WBC (+5 diff), RBC (+7), PLT (+6). Percentages are inline, not separate rows. */
const NORMA_CBC_SCREEN_ORDER = [
  'WBC', 'LYM', 'MON', 'NEU', 'EOS', 'BAS',
  'RBC', 'HGB', 'MCV', 'HCT', 'MCH', 'MCHC', 'RDW-SD', 'RDW-CV',
  'PLT', 'MPV', 'PCT', 'PDW-SD', 'PDW-CV', 'PLC-R', 'PLC-C',
];

const NORMA_CBC_PCT_BY_ABS = {
  LYM: 'LYM_PCT',
  MON: 'MON_PCT',
  NEU: 'NEU_PCT',
  EOS: 'EOS_PCT',
  BAS: 'BAS_PCT',
};

const NORMA_CBC_UI_HIDDEN = new Set(Object.values(NORMA_CBC_PCT_BY_ABS));

const NORMA_CBC_PANEL_CODES = new Set(NORMA_CBC_PANEL.map((p) => p.code));

/** Build fixed 21-row display list; pct params attach to their abs row. */
function buildCbcDisplayParameters(dbParams = []) {
  const byCode = Object.fromEntries(dbParams.map((p) => [p.code, p]));

  return NORMA_CBC_SCREEN_ORDER.map((code) => {
    const row = getNormaPanelRow(code);
    const p = byCode[code];
    const pctCode = NORMA_CBC_PCT_BY_ABS[code];
    const pct = pctCode ? byCode[pctCode] : null;

    return {
      ...(p || {
        id: null,
        code,
        name: row?.symbol || code,
        name_ar: row?.name_ar || null,
        unit: row?.unit || null,
        sort_order: row?.displayOrder ?? 0,
        is_active: true,
      }),
      norma_symbol: row?.symbol || code,
      norma_section: row?.section || null,
      pct_code: pctCode || null,
      pct_parameter_id: pct?.id || null,
      ui_hidden: false,
      missing_in_db: !p,
    };
  });
}

module.exports = {
  NORMA_CBC_PANEL,
  NORMA_IVET_HL7_INDEX,
  NORMA_CBC_ORDER,
  NORMA_CBC_SCREEN_ORDER,
  NORMA_CBC_PCT_BY_ABS,
  NORMA_CBC_UI_HIDDEN,
  NORMA_CBC_PANEL_CODES,
  NORMA_SYMBOL_BY_CODE,
  NORMA_SECTION_BY_CODE,
  getNormaPanelRow,
  buildCbcDisplayParameters,
};
