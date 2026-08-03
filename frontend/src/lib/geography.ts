/**
 * Structured geography for partner records.
 *
 * WHY THIS EXISTS: locality and country were free text, and there was no state
 * field at all. Proximate keys area selection, panel relevance and donor
 * reporting off geography, and free text does not aggregate — "Khartoum",
 * "khartoum", "Al Khartoum" and "الخرطوم" are four places to a GROUP BY and one
 * place to a human. Structured values now; the free-text era's data is NOT
 * discarded (see the migration note below).
 *
 * SCOPE OF WHAT IS ENCODED HERE: Sudan's 18 states (wilayat) are a stable
 * administrative fact and are listed in full. Localities (mahaliyat) are NOT —
 * there are well over a hundred, boundaries have been redrawn during the
 * conflict, and a wrong-but-official-looking dropdown would be worse than a
 * text box. Locality therefore stays free text with the state above it doing
 * the aggregating work. If Proximate supplies an authoritative locality list
 * per state, it drops in here.
 *
 * MIGRATION: existing partners hold free-text locality and country 'SD'. This
 * module does not touch them. Their state is simply unknown, and the UI must
 * say "not recorded" rather than guessing — a state inferred from a locality
 * spelling is exactly the kind of invented precision this codebase refuses.
 */

export interface Country {
  code: string;
  name: string;
  nameAr?: string;
}

/**
 * Countries Proximate actually operates in or receives nominations from.
 * Deliberately short: a 195-entry dropdown is worse than five relevant ones,
 * and "Other" keeps it honest rather than forcing a wrong pick.
 */
export const COUNTRIES: Country[] = [
  { code: 'SD', name: 'Sudan', nameAr: 'السودان' },
  { code: 'SS', name: 'South Sudan', nameAr: 'جنوب السودان' },
  { code: 'TD', name: 'Chad', nameAr: 'تشاد' },
  { code: 'EG', name: 'Egypt', nameAr: 'مصر' },
  { code: 'ET', name: 'Ethiopia', nameAr: 'إثيوبيا' },
  { code: 'ER', name: 'Eritrea', nameAr: 'إريتريا' },
  { code: 'LY', name: 'Libya', nameAr: 'ليبيا' },
  { code: 'CF', name: 'Central African Republic', nameAr: 'جمهورية أفريقيا الوسطى' },
  { code: 'OTHER', name: 'Other / not listed' },
];

export interface State {
  code: string;
  name: string;
  nameAr: string;
}

/**
 * The 18 states of Sudan. Codes are stable internal identifiers, not ISO —
 * they must never change once partner records reference them.
 */
export const SUDAN_STATES: State[] = [
  { code: 'SD-KH', name: 'Khartoum', nameAr: 'الخرطوم' },
  { code: 'SD-GZ', name: 'Al Jazirah', nameAr: 'الجزيرة' },
  { code: 'SD-NR', name: 'River Nile', nameAr: 'نهر النيل' },
  { code: 'SD-NO', name: 'Northern', nameAr: 'الشمالية' },
  { code: 'SD-RS', name: 'Red Sea', nameAr: 'البحر الأحمر' },
  { code: 'SD-KA', name: 'Kassala', nameAr: 'كسلا' },
  { code: 'SD-GD', name: 'Al Qadarif', nameAr: 'القضارف' },
  { code: 'SD-SI', name: 'Sennar', nameAr: 'سنار' },
  { code: 'SD-BN', name: 'Blue Nile', nameAr: 'النيل الأزرق' },
  { code: 'SD-NW', name: 'White Nile', nameAr: 'النيل الأبيض' },
  { code: 'SD-NB', name: 'North Kordofan', nameAr: 'شمال كردفان' },
  { code: 'SD-GK', name: 'South Kordofan', nameAr: 'جنوب كردفان' },
  { code: 'SD-WK', name: 'West Kordofan', nameAr: 'غرب كردفان' },
  { code: 'SD-DN', name: 'North Darfur', nameAr: 'شمال دارفور' },
  { code: 'SD-DS', name: 'South Darfur', nameAr: 'جنوب دارفور' },
  { code: 'SD-DW', name: 'West Darfur', nameAr: 'غرب دارفور' },
  { code: 'SD-DE', name: 'East Darfur', nameAr: 'شرق دارفور' },
  { code: 'SD-DC', name: 'Central Darfur', nameAr: 'وسط دارفور' },
];

/** States for a country, or an empty list where we hold no authoritative set. */
export function statesFor(countryCode: string): State[] {
  return countryCode === 'SD' ? SUDAN_STATES : [];
}

/** Display name for a stored state code; null when unrecorded or unknown. */
export function stateName(code: string | null | undefined, lang = 'en'): string | null {
  if (!code) return null;
  const s = SUDAN_STATES.find((x) => x.code === code);
  if (!s) return null;
  return lang === 'ar' ? s.nameAr : s.name;
}
