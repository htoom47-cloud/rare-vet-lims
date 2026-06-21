/** Emoji icon per test category — matched by code, then department/name. */
const CODE_ICONS = {
  CBC: '🩸',
  CHEM: '🧪',
  PCR: '🧬',
  MICRO: '🔬',
  CULT: '🦠',
  HORM: '💉',
  ELISA: '🛡️',
  SERO: '🛡️',
  PAR: '🪱',
  PARA: '🪱',
};

const KEYWORD_ICONS = [
  ['hematology', '🩸'],
  ['blood count', '🩸'],
  ['cbc', '🩸'],
  ['chemistry', '🧪'],
  ['chem', '🧪'],
  ['pcr', '🧬'],
  ['molecular', '🧬'],
  ['microscopy', '🔬'],
  ['micro', '🔬'],
  ['culture', '🦠'],
  ['microbiology', '🦠'],
  ['parasitology', '🪱'],
  ['parasite', '🪱'],
  ['endocrin', '💉'],
  ['hormone', '💉'],
  ['immunology', '🛡️'],
  ['elisa', '🛡️'],
  ['serology', '🛡️'],
  ['sero', '🛡️'],
];

const DEFAULT_ICON = '🧫';

export function getCategoryEmoji(category) {
  if (!category) return DEFAULT_ICON;

  const code = String(category.code || category.category_code || '').toUpperCase();
  if (CODE_ICONS[code]) return CODE_ICONS[code];

  const haystack = [
    category.department,
    category.name,
    category.name_ar,
    category.category_name,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  for (const [keyword, emoji] of KEYWORD_ICONS) {
    if (haystack.includes(keyword)) return emoji;
  }

  return DEFAULT_ICON;
}
