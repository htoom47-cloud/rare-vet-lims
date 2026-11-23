/** Parse catalog entry_options (JSONB / string / array) for pick-or-type fields. */

export function normalizeEntryOptions(raw) {
  if (raw == null || raw === '') return [];
  let list = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      list = JSON.parse(trimmed);
    } catch {
      list = trimmed.split(/[\n,;]+/);
    }
  }
  if (!Array.isArray(list)) return [];
  return [...new Set(
    list.map((item) => String(item == null ? '' : item).trim()).filter(Boolean)
  )];
}

export function entryOptionsToText(raw) {
  return normalizeEntryOptions(raw).join('\n');
}

export function entryOptionsFromText(text) {
  return normalizeEntryOptions(String(text || '').split('\n'));
}

export const URINE_ENTRY_SECTIONS = ['physical', 'chemical', 'microscopic'];

export function urineSectionLabel(section, t) {
  if (section === 'physical') {
    return t('workbench.urinePhysical', { defaultValue: 'Physical Examination' });
  }
  if (section === 'chemical') {
    return t('workbench.urineChemical', { defaultValue: 'Chemical Examination' });
  }
  if (section === 'microscopic') {
    return t('workbench.urineMicroscopic', { defaultValue: 'Microscopic Examination' });
  }
  return section;
}

export const SEMEN_ENTRY_SECTIONS = ['physical', 'microscopic', 'other_cells', 'impression'];

export function semenSectionLabel(section, t) {
  if (section === 'physical') {
    return t('workbench.semenPhysical', { defaultValue: 'Physical Characteristics' });
  }
  if (section === 'microscopic') {
    return t('workbench.semenMicroscopic', { defaultValue: 'Microscopic Examination' });
  }
  if (section === 'other_cells') {
    return t('workbench.semenOtherCells', { defaultValue: 'Other Cells & Debris' });
  }
  if (section === 'impression') {
    return t('workbench.semenImpression', { defaultValue: 'Impression & Evaluation' });
  }
  return section;
}
