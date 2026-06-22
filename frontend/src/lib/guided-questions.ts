/**
 * Phase 87 — Guided questions instead of fields.
 *
 * The team's review: "Guided questions instead of fields — 'How many
 * people did you train?' not 'Beneficiaries reached.'"
 *
 * This module provides:
 *   - asQuestion(label) — heuristic that turns a noun-phrase field label
 *     into a natural question if it isn't already one.
 *   - QUESTION_OVERRIDES — explicit translations for the most common
 *     donor field labels where the heuristic would be awkward.
 *   - asPlaceholder(label) — an example-style placeholder for the
 *     textarea ("e.g. 47 women in Garissa County over three months").
 *
 * Apply with `getQuestionForLabel(label)` anywhere a raw field label is
 * rendered to the NGO.
 */

const QUESTION_OVERRIDES: Record<string, string> = {
  // Reporting framework fields (donor-side)
  'beneficiaries_reached': 'How many people did you reach this period — and who were they?',
  'activities_completed':  'What did your team actually do this period?',
  'budget_utilisation':    'What did you spend, and on what?',
  'budget_utilization':    'What did you spend, and on what?',
  'risks_identified':      'What got in your way this period — and how did you handle it?',
  'lessons_learned':       'What did you learn that you would do differently next time?',
  'next_period_plan':      'What is your plan for the next period?',
  'narrative':             'Tell us what happened this period in your own words.',
  'mitigation':            'How are you reducing the risks you identified?',
  'kpi_status':            'How are you tracking against your targets?',

  // Capacity assessment / governance fields
  'governance_structure':     'How does your Board make decisions?',
  'financial_controls':       'How do you keep track of money coming in and going out?',
  'safeguarding_policy':      'How do you keep the people you serve safe in your work?',
  'monitoring_evaluation':    'How do you know your work is making a difference?',
  'staff_capacity':           'Who is on your team, and what are their roles?',
  'partnerships':             'Who do you work with — and how do those partnerships work?',

  // Grant application fields
  'project_description':   'In one paragraph, what is this project?',
  'theory_of_change':      'How do you think this work will lead to lasting change?',
  'target_population':     'Who exactly are you serving with this work?',
  'expected_outcomes':     'What will be different at the end of the grant?',
  'sustainability':        'How will the work continue after this grant ends?',
  'gender_inclusion':      'How does this work reach women, men, and people of different ages fairly?',
  'risk_management':       'What could go wrong, and what is your plan if it does?',

  // Declaration fields (NEAR)
  'crisis_summary':        'Tell us what is happening on the ground in your own words.',
  'affected_population':   'Roughly how many people are affected — and where?',
  'response_plan':         'What is the network response we are activating?',
  'proposed_budget':       'How much do we need, and what would it pay for?',
};

const PLACEHOLDERS: Record<string, string> = {
  'beneficiaries_reached': 'e.g. "47 women aged 18-50, mostly subsistence farmers, in three sub-counties of Garissa."',
  'activities_completed':  'e.g. "Held a 3-day training on maize processing for 47 women. Delivered seeds to 23 households. Two community meetings."',
  'budget_utilisation':    'e.g. "Spent 580,000 KES of the 750,000 KES quarterly tranche. Main lines: trainers 180k, materials 220k, transport 95k, food 85k."',
  'budget_utilization':    'e.g. "Spent 580,000 KES of the 750,000 KES quarterly tranche. Main lines: trainers 180k, materials 220k, transport 95k, food 85k."',
  'risks_identified':      'e.g. "Two community meetings were postponed because of heavy rain — we rescheduled them for the next week and let beneficiaries know on WhatsApp."',
  'lessons_learned':       'e.g. "Sending WhatsApp reminders the day before sessions dramatically reduced no-shows. We will do that for every session from now on."',
  'next_period_plan':      'e.g. "Run a follow-up training for the same cohort. Distribute starter kits to top 10 graduates. Begin baseline survey for Cohort 2."',
};

/** Heuristic: convert a snake_case or noun-phrase label into a natural
 *  question. If the label is already a question (ends in "?"), return it
 *  as-is. Used as a fallback for fields not in QUESTION_OVERRIDES. */
function heuristicAsQuestion(label: string): string {
  const trimmed = label.trim();
  if (trimmed.endsWith('?')) return trimmed;
  // Try to detect common patterns and rewrite as a question.
  const normalised = trimmed.replace(/_/g, ' ').toLowerCase();
  if (/^(number|count) of /.test(normalised))
    return 'How many ' + normalised.replace(/^(number|count) of /, '') + '?';
  if (/^(amount|total) /.test(normalised))
    return 'What is the ' + normalised + '?';
  if (/^(date|when) /.test(normalised))
    return 'When did ' + normalised.replace(/^(date|when) /, '') + '?';
  if (/^(reason|cause) /.test(normalised))
    return 'Why ' + normalised.replace(/^(reason|cause) /, '') + '?';
  // Default: prepend "Tell us about" — softer than a bare label, less
  // awkward than forcing a question if we can't infer the right form.
  return `Tell us about ${normalised}.`;
}

/** Public lookup: get the natural-language question for a field key.
 *
 * 2026-06-21 — guard undefined/null key. Crashed apply page on prod
 * for grants whose criteria came in with `id` (seed shape) instead of
 * `key`, or were authored without a key at all. The criterion map
 * called `key.toLowerCase()` and threw, taking the whole proposal
 * step down with it. Now: missing key → fall back to label or empty
 * string; never crashes.
 */
export function getQuestionForLabel(key: string | null | undefined, fallbackLabel?: string): string {
  if (!key || typeof key !== 'string') {
    return heuristicAsQuestion(fallbackLabel || '');
  }
  const normKey = key.toLowerCase().replace(/[ -]/g, '_');
  if (QUESTION_OVERRIDES[normKey]) return QUESTION_OVERRIDES[normKey];
  return heuristicAsQuestion(fallbackLabel || key);
}

/** Public lookup: get the example placeholder for a field key. */
export function getPlaceholderForLabel(key: string | null | undefined): string | null {
  if (!key || typeof key !== 'string') return null;
  const normKey = key.toLowerCase().replace(/[ -]/g, '_');
  return PLACEHOLDERS[normKey] ?? null;
}
