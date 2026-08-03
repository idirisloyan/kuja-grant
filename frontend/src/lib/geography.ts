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
  /**
   * Approximate centre of the state, [lat, lng]. Used ONLY by
   * geolocateState(). These are approximations of each wilaya's centre, not
   * surveyed centroids, and there are no boundary polygons in this file —
   * read geolocateState() for exactly what that costs.
   */
  centre: [number, number];
}

/**
 * The 18 states of Sudan. Codes are stable internal identifiers, not ISO —
 * they must never change once partner records reference them.
 */
export const SUDAN_STATES: State[] = [
  { code: 'SD-KH', name: 'Khartoum', nameAr: 'الخرطوم', centre: [15.6, 32.5] },
  { code: 'SD-GZ', name: 'Al Jazirah', nameAr: 'الجزيرة', centre: [14.4, 33.4] },
  { code: 'SD-NR', name: 'River Nile', nameAr: 'نهر النيل', centre: [17.8, 33.6] },
  { code: 'SD-NO', name: 'Northern', nameAr: 'الشمالية', centre: [19.8, 30.2] },
  { code: 'SD-RS', name: 'Red Sea', nameAr: 'البحر الأحمر', centre: [19, 36] },
  { code: 'SD-KA', name: 'Kassala', nameAr: 'كسلا', centre: [15.8, 36] },
  { code: 'SD-GD', name: 'Al Qadarif', nameAr: 'القضارف', centre: [14, 35.4] },
  { code: 'SD-SI', name: 'Sennar', nameAr: 'سنار', centre: [13.5, 34] },
  { code: 'SD-BN', name: 'Blue Nile', nameAr: 'النيل الأزرق', centre: [11.5, 34.2] },
  { code: 'SD-NW', name: 'White Nile', nameAr: 'النيل الأبيض', centre: [13.2, 32.7] },
  { code: 'SD-NB', name: 'North Kordofan', nameAr: 'شمال كردفان', centre: [13.5, 30.2] },
  { code: 'SD-GK', name: 'South Kordofan', nameAr: 'جنوب كردفان', centre: [11, 29.7] },
  { code: 'SD-WK', name: 'West Kordofan', nameAr: 'غرب كردفان', centre: [12, 28.5] },
  { code: 'SD-DN', name: 'North Darfur', nameAr: 'شمال دارفور', centre: [15.5, 25.5] },
  { code: 'SD-DS', name: 'South Darfur', nameAr: 'جنوب دارفور', centre: [11.5, 24.9] },
  { code: 'SD-DW', name: 'West Darfur', nameAr: 'غرب دارفور', centre: [13.4, 22.6] },
  { code: 'SD-DE', name: 'East Darfur', nameAr: 'شرق دارفور', centre: [11.7, 26.4] },
  { code: 'SD-DC', name: 'Central Darfur', nameAr: 'وسط دارفور', centre: [12.7, 23.5] },
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

// ---------------------------------------------------------------------------
// Coarse "which state am I in?" from a device position
// ---------------------------------------------------------------------------

/**
 * WHAT THIS DELIBERATELY DOES NOT DO: it does not store, transmit or log a
 * coordinate. The position is read in the browser, resolved to a state, and
 * dropped. Nothing leaves the device but the state code the person confirms.
 *
 * That constraint is not incidental. These are community organisations in an
 * active conflict, and a precise location tied to a named group that receives
 * foreign funding is a targeting risk if the database is ever breached or
 * compelled. A state is administrative geography that is already effectively
 * public about an organisation; a GPS fix is not. So we take the resolution we
 * need for reporting and discard the rest immediately.
 *
 * METHOD AND ITS LIMIT: nearest state centre, not boundary containment — there
 * are no polygons here. That is accurate well inside a state and unreliable
 * near a border or across the very large Darfur and Kordofan states. So this
 * function returns a SUGGESTION with a confidence, never an answer, and the
 * caller must let the person confirm or override it. If Proximate supplies
 * authoritative boundary data this can be replaced without changing callers.
 */

export type GeolocateOutcome =
  | { kind: 'suggestion'; state: State; confident: boolean; alternative: State | null }
  | { kind: 'outside_known_area' }
  | { kind: 'unsupported' }
  | { kind: 'denied' }
  | { kind: 'unavailable' };

/** Great-circle distance in km. */
function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Resolve a coordinate to a Sudanese state.
 *
 * `confident` is false when the two nearest states are close enough together
 * that the answer is a coin-flip — near a border, essentially. The caller must
 * surface that rather than hide it: quietly picking one of two adjacent states
 * is how a register fills up with data that looks precise and is wrong.
 */
export function stateFromCoords(lat: number, lng: number): GeolocateOutcome {
  const ranked = SUDAN_STATES
    .map((s) => ({ s, km: haversineKm(lat, lng, s.centre[0], s.centre[1]) }))
    .sort((a, b) => a.km - b.km);

  const nearest = ranked[0];
  const second = ranked[1];

  // Sudan is roughly 1,800km across; no point inside it is 500km from every
  // state centre. Beyond that we are somewhere else entirely and should say so
  // rather than name the least-wrong Sudanese state.
  if (!nearest || nearest.km > 500) return { kind: 'outside_known_area' };

  // Within 60km of each other, centre-distance cannot separate them honestly.
  const confident = !second || second.km - nearest.km > 60;
  return {
    kind: 'suggestion',
    state: nearest.s,
    confident,
    alternative: confident ? null : (second?.s ?? null),
  };
}

/**
 * Ask the browser where it is and resolve that to a state suggestion.
 *
 * Times out at 12s: on a low-end handset over a weak connection a GPS fix can
 * hang indefinitely, and a button that never resolves is worse than one that
 * admits defeat and leaves the dropdown to be used by hand.
 */
export function geolocateState(): Promise<GeolocateOutcome> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve({ kind: 'unsupported' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(stateFromCoords(pos.coords.latitude, pos.coords.longitude)),
      (err) => resolve(err.code === err.PERMISSION_DENIED
        ? { kind: 'denied' }
        : { kind: 'unavailable' }),
      { enableHighAccuracy: false, timeout: 12_000, maximumAge: 600_000 },
    );
  });
}
