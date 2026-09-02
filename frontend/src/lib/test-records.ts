/**
 * Telling fixture records apart from real operational ones.
 *
 * Khalid and Marwa should not open the disbursements list during a live
 * session and see it filled with "QA Fixture Partner" and "UAT Partner" rows
 * mixed in with Khartoum Sisters Mutual Aid. It makes the fund look unresolved
 * and makes the real work harder to find.
 *
 * HONEST LIMITATION: this is a NAME HEURISTIC, not a data model. It matches on
 * words in the partner name, so a genuine organisation with "Test" in its title
 * would be wrongly hidden, and a fixture named something innocuous would be
 * wrongly shown. The correct fix is an `is_test` column stamped at seed time —
 * tracked in docs/PROXIMATE_BACKLOG.md. Until that exists, this consolidates a
 * regex that was already duplicated inline in two components, so at least the
 * rule is in one place and its weakness is written down.
 *
 * Fixtures are HIDDEN by default and never removed: the QA Fixture partner is a
 * permanent, deliberate production fixture that the regression gate seeds and
 * asserts against (see seed_proximate_happy_path.py). Every surface using this
 * must offer a way to show them again.
 */

// `uat` also catches the hyphenated forms the 2 Sep QA round listed
// ("RPT-UAT…", "LIVE-UAT…") because `-` is a word boundary. `verification`,
// `e2e`, `smoke` and `sandbox` are the names our own end-to-end and
// enforcement runs give the rounds they create ("verification round…").
const TEST_NAME = /\b(uat|test|qa|codex|demo|fixture|verification|e2e|smoke|sandbox|dummy)\b/i;

type MaybeName = string | null | undefined;

/**
 * True when ANY of the given names marks the record as a fixture.
 *
 * Takes several names because test data is inherited, not just self-declared:
 * a grant titled "Sudan Rapid Shelter Support 2026" is real-looking, but if it
 * belongs to "UAT Donor" it is a fixture — exactly the repeated grant rows the
 * 2 Sep QA round flagged. So callers pass the record's own name AND the names
 * of what it belongs to (donor, partner, round), and one rule classifies all
 * five registers the same way (PFX-SEP02-GLOBAL-004).
 */
export function isTestRecord(...names: MaybeName[]): boolean {
  return names.some((n) => !!n && TEST_NAME.test(n));
}

/**
 * Split a list into real records and fixtures in one pass, so callers can show
 * a count of what is hidden rather than hiding it silently. Something the user
 * cannot see must at least be something they are told about.
 *
 * `namesOf` may return one name or the record's own name plus its parents'.
 */
export function splitTestRecords<T>(
  rows: T[],
  namesOf: (row: T) => MaybeName | MaybeName[],
): { real: T[]; test: T[] } {
  const real: T[] = [];
  const test: T[] = [];
  for (const row of rows) {
    const n = namesOf(row);
    (isTestRecord(...(Array.isArray(n) ? n : [n])) ? test : real).push(row);
  }
  return { real, test };
}
