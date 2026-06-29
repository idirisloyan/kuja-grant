/**
 * Proximate audit-action human labels — Phase 704.
 *
 * Maps the dotted `action` codes the audit chain stores
 * (e.g. `proximate.disbursement.recorded`) to human OB-readable
 * labels for the activity card on round detail and elsewhere.
 *
 * Reviewer feedback: OB activity card was showing raw codes, which
 * is fine for an auditor reading the chain export but reads as raw
 * tokens to an operator scanning what just happened.
 *
 * Codes not in this map fall back to the raw action (still
 * monospace so it's clear they're system tokens). New code paths
 * SHOULD add an entry here when they introduce a new action.
 */

export const PROXIMATE_ACTION_LABELS: Record<string, string> = {
  // Partner lifecycle
  'proximate.partner.self_nominated': 'Partner self-nominated',
  'proximate.partner.nominated': 'Partner nominated',
  'proximate.partner.sanctions_screened': 'Sanctions screen ran',
  'proximate.partner.sanctions_rescreen_flagged': 'Sanctions re-screen flipped to flagged',
  'proximate.partner.status_changed.dd_pending': 'Partner status → DD pending',
  'proximate.partner.status_changed.dd_clear': 'Partner cleared (DD)',
  'proximate.partner.status_changed.dd_clear_pending_bank': 'Partner cleared, bank pending',
  'proximate.partner.bank_verified': 'Bank account verified',
  'proximate.partner.suspended': 'Partner suspended',
  'proximate.partner.reactivated': 'Partner reactivated',

  // Endorsement
  'proximate.endorsement.submitted': 'Endorsement submitted',
  'proximate.endorser.approved': 'Endorser approved',
  'proximate.endorser.rejected': 'Endorser rejected',
  'proximate.endorser.reputation_bumped': 'Endorser reputation updated',

  // Disbursement lifecycle
  'proximate.disbursement.recorded': 'Disbursement recorded',
  'proximate.disbursement.cosign_required': 'Disbursement needs cosign',
  'proximate.disbursement.cosigned': 'Disbursement cosigned',
  'proximate.disbursement.tranche_scheduled': 'Tranche scheduled',
  'proximate.disbursement.verifier_assigned': 'Verifier assigned',
  'proximate.disbursement.verifier_attested': 'Verifier attested',
  'proximate.disbursement.flagged': 'Disbursement flagged',

  // Reporting
  'proximate.report.obligation_opened': 'Report obligation opened',
  'proximate.report.submitted': 'Partner submitted report',
  'proximate.report.verified': 'Report verified by OB',
  'proximate.report.acknowledged': 'OB sent acknowledgement',

  // Disbursement-side acknowledgement (Phase 660) — partner
  // acknowledges receipt of disbursed funds. Was missing from
  // the label map so showed raw on the round audit list.
  'proximate.disbursement.acknowledged': 'Partner acknowledged disbursement',

  // Outcomes
  'proximate.outcome.spawned': 'Outcome obligation spawned',
  'proximate.outcome.submitted': 'Partner submitted outcome',
  'proximate.outcome.verified': 'Outcome verified',
  'proximate.outcome.acknowledged': 'OB sent outcome acknowledgement',
  'proximate.outcome.attested': 'Outcome attested',

  // Round lifecycle
  'proximate.round.drafted': 'Round drafted',
  'proximate.round.submitted': 'Round submitted for review',
  'proximate.round.signed': 'Round signed',
  'proximate.round.activated': 'Round activated',
  'proximate.round.closed': 'Round closed',
  'proximate.round.cancelled': 'Round cancelled',
  'proximate.round.donor_shares_updated': 'Donor shares updated',
  'proximate.round.tranche_schedule_updated': 'Tranche schedule updated',
  'proximate.round.report_pdf_generated': 'Round report PDF generated',

  // Intervention register
  'proximate.intervention.opened': 'Intervention opened',
  'proximate.intervention.escalated': 'Intervention escalated',
  'proximate.intervention.closed': 'Intervention closed',
  'proximate.intervention.recovery_recorded': 'Recovery recorded',

  // Crisis selector + AI
  'proximate.crisis_signal.logged': 'Crisis signal logged',
  'proximate.donor.asked': 'Donor asked the AI a question',
  'proximate.retrospective.downloaded': 'Donor retrospective downloaded',
  'proximate.retrospective.generated': 'Donor retrospective generated',
};

/**
 * Resolve an action code to a human label. Falls back to the raw
 * code so the audit chain is never silently mis-rendered.
 */
export function labelForProximateAction(action: string): string {
  return PROXIMATE_ACTION_LABELS[action] ?? action;
}
