/**
 * Saxansaxo shared constants — SCLR micro-grants tenant (v0, July 2026).
 *
 * Mirrors SAX_STAGES in app/models/saxansaxo.py. `not_selected` is a
 * terminal branch, not a step on the happy path, so the journey strip
 * uses SAX_JOURNEY (the 8 SCLR steps) while lists/counts use
 * SAX_STAGE_ORDER (all stages including the branch).
 */

export const SAX_STAGE_LABELS: Record<string, string> = {
  permission: 'Permission',
  inquiry: 'Inquiry',
  proposal: 'Proposal',
  vetting: 'Vetting',
  not_selected: 'Not selected',
  selected: 'Selected',
  disbursed: 'Disbursed',
  reported: 'Reported',
  closed: 'Closed',
};

export const SAX_STAGE_ORDER = [
  'permission', 'inquiry', 'proposal', 'vetting', 'not_selected',
  'selected', 'disbursed', 'reported', 'closed',
] as const;

/** The happy-path journey shown on the group detail strip. */
export const SAX_JOURNEY = [
  'permission', 'inquiry', 'proposal', 'vetting',
  'selected', 'disbursed', 'reported', 'closed',
] as const;

export const SAX_STAGE_TONES: Record<string, string> = {
  permission: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  inquiry: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  proposal: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  vetting: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  not_selected: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  selected: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  disbursed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  reported: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
  closed: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
};
