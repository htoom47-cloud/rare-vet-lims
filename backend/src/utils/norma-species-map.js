/**
 * Norma iVet species names/codes → LIMS animal_type.
 * Norma supports multiple species profiles; each has its own reference intervals on the device.
 */
const { ANIMAL_TYPE_CODES } = require('../constants/animal-types');

const NORMA_SPECIES_ALIASES = {
  camel: [
    'camel', 'dromedary', 'dromedarius', 'one hump', 'one-hump', 'bactrian',
    'إبل', 'جمل', 'ابل', 'الابل', 'الإبل',
  ],
  horse: [
    'horse', 'equine', 'equus', 'stallion', 'mare', 'foal',
    'خيل', 'حصان', 'فرس', 'فحل',
  ],
  sheep: [
    'sheep', 'ovine', 'ovis', 'lamb', 'ram', 'ewe',
    'غنم', 'خروف', 'نعجة', 'كبش',
  ],
  goat: [
    'goat', 'caprine', 'capra', 'kid',
    'ماعز', 'عنز', 'تيس',
  ],
  other: [
    'other', 'unknown', 'misc', 'أخرى', 'اخرى',
  ],
};

const aliasIndex = Object.fromEntries(
  Object.entries(NORMA_SPECIES_ALIASES).flatMap(([code, aliases]) =>
    aliases.map((a) => [normalizeSpeciesKey(a), code])
  )
);

function normalizeSpeciesKey(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[^\w\u0600-\u06FF\s]/g, '')
    .trim();
}

/** Map free-text / CWE species from Norma HL7 → LIMS animal_type code. */
function mapNormaSpeciesToLims(raw) {
  if (raw == null || raw === '') return null;
  const key = normalizeSpeciesKey(raw);
  if (!key) return null;
  if (aliasIndex[key]) return aliasIndex[key];
  if (ANIMAL_TYPE_CODES.includes(key)) return key;

  for (const [alias, code] of Object.entries(aliasIndex)) {
    if (alias.length < 3 || key.length < 3) continue;
    if (key.includes(alias) || alias.includes(key)) return code;
  }
  return null;
}

/** Extract species from HL7 PID/SPM/OBR fields (CWE ^code^name^). */
function pickCweSpeciesText(field) {
  if (!field) return null;
  const parts = String(field).split('^').map((p) => p.trim()).filter(Boolean);
  for (const part of parts) {
    if (/^\d+$/.test(part)) continue;
    if (part.length < 2) continue;
    const mapped = mapNormaSpeciesToLims(part);
    if (mapped) return part;
    if (/[a-z\u0600-\u06FF]/i.test(part)) return part;
  }
  return parts[0] || null;
}

function extractAnimalTypeFromSegments(segments) {
  for (const segment of segments) {
    const fields = segment.split('|');
    const type = fields[0];

    if (type === 'PID' || type === 'SPM' || type === 'OBR') {
      for (let i = 1; i < fields.length; i += 1) {
        const text = pickCweSpeciesText(fields[i]);
        const mapped = mapNormaSpeciesToLims(text);
        if (mapped) return mapped;
      }
    }
  }
  return null;
}

module.exports = {
  mapNormaSpeciesToLims,
  extractAnimalTypeFromSegments,
  normalizeSpeciesKey,
};
