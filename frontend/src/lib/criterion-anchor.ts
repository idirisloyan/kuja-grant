/**
 * Phase 622 — shared DOM-anchor id for a criterion.
 *
 * The apply page uses one DOM id per criterion (`criterion-<anchor>`) so
 * SubmissionVelocityBar's "Continue here" button + RubricLivePreview's
 * "jump to this criterion" links can scroll the page to the matching
 * textarea. Three call sites need to agree on what `<anchor>` is.
 *
 * Older grants — and the seed-style criteria that use `id` instead of
 * `key` — would otherwise produce `criterion-undefined` and dead anchors,
 * which is the polish residue the team flagged on 2026-06-21 after the
 * Phase 619 v2 ship.
 *
 * Fallback chain (first defined wins):
 *   1. `c.key` — canonical, set on grants created via the wizard
 *   2. `c.id`  — legacy / seed shape
 *   3. a stable slug of `c.label`
 *   4. `crit-<index>` — last resort, always defined
 */
export function criterionAnchorId(
  c: { key?: string | null; id?: string | null; label?: string | null } | null | undefined,
  index: number,
): string {
  if (!c) return `crit-${index}`;
  if (typeof c.key === 'string' && c.key) return c.key;
  if (typeof c.id === 'string' && c.id) return c.id;
  if (typeof c.label === 'string' && c.label) {
    return c.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `crit-${index}`;
  }
  return `crit-${index}`;
}
