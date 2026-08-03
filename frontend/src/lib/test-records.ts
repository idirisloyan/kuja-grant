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

const TEST_NAME = /\b(uat|test|qa|codex|demo|fixture)\b/i;

/** True when a record's name marks it as a fixture rather than real data. */
export function isTestRecord(name: string | null | undefined): boolean {
  return !!name && TEST_NAME.test(name);
}

/**
 * Split a list into real records and fixtures in one pass, so callers can show
 * a count of what is hidden rather than hiding it silently. Something the user
 * cannot see must at least be something they are told about.
 */
export function splitTestRecords<T>(
  rows: T[],
  nameOf: (row: T) => string | null | undefined,
): { real: T[]; test: T[] } {
  const real: T[] = [];
  const test: T[] = [];
  for (const row of rows) (isTestRecord(nameOf(row)) ? test : real).push(row);
  return { real, test };
}
