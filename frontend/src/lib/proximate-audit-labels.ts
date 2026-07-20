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
  // Blue Nile intake (2026-07) — these landed without labels, so the
  // round activity card showed raw codes for the entire ingestion.
  'proximate.evidence.attached': 'Evidence file attached',
  'proximate.payment_confirmation.attached': 'Payment confirmation attached',
  'proximate.partner.pif_imported': 'Partner imported from PIF',
  'proximate.partner.media_verified': 'Media check recorded',
  'proximate.panel.candidate_added': 'Panel candidate added',
  'proximate.panel.candidate_updated': 'Panel candidate updated',
  // QA 2026-07-15 ("too busy"): full sweep — every action the backend
  // can append now has a label; the raw-code fallback should only ever
  // fire for actions introduced after this file was last touched.
  'proximate.partner.dd_clear': 'Partner cleared (DD)',
  'proximate.partner.dd_pending': 'Partner moved to DD review',
  'proximate.partner.endorsements_opened': 'Endorsements opened',
  'proximate.partner.reinstated': 'Partner reinstated',
  'proximate.partner.status_changed': 'Partner status changed',
  'proximate.partner.adverse_media_screened': 'Adverse-media screen ran',
  'proximate.partner.adverse_media_flagged': 'Adverse-media hit flagged',
  'proximate.endorsement.submitted_via_invite': 'Endorsement submitted (invite link)',
  'proximate.endorser.registered': 'Endorser registered',
  'proximate.endorser.sanctions_screened': 'Endorser sanctions screen ran',
  'proximate.endorser.reputation_penalised': 'Endorser reputation penalised',
  'proximate.endorser_invite.created': 'Endorser invite created',
  'proximate.disbursement_method.added': 'Payment route added',
  'proximate.disbursement_method.verified': 'Payment route verified',
  'proximate.fsp.registered': 'FSP registered',
  'proximate.fsp.sanctions_screened': 'FSP sanctions screen ran',
  'proximate.donor.registered': 'Donor registered',
  'proximate.grant.created': 'Donor grant created',
  'proximate.grant.agreement_extracted': 'Grant agreement AI-extracted',
  'proximate.grant.allocated_to_round': 'Grant allocated to round',
  'proximate.grant.deliverable_progress_set': 'Deliverable progress updated',
  'proximate.grant.donor_pack_generated': 'Donor pack generated',
  'proximate.grant_report.ai_drafted': 'Donor report AI-drafted',
  'proximate.grant_report.updated': 'Donor report updated',
  'proximate.grant_report.compliance_scored': 'Donor report compliance-scored',
  'proximate.grant_report.due_reminder': 'Donor report due reminder',
  'proximate.report.attachment_added': 'Report attachment added',
  'proximate.report.overdue_nudge': 'Overdue report nudge sent',
  'proximate.outcome.overdue_nudge': 'Overdue outcome nudge sent',
  'proximate.grievance.submitted': 'Grievance submitted',
  'proximate.grievance.triaged': 'Grievance triaged',
  'proximate.grievance.resolved': 'Grievance resolved',
  'proximate.grievance.dismissed': 'Grievance dismissed',
  'proximate.intervention.opened.freeze.auto': 'Auto-freeze intervention opened',
  'proximate.intervention.responded': 'Intervention response recorded',
  'proximate.intervention.withdrawn': 'Intervention withdrawn',
  'proximate.monitoring.due': 'Monitoring visit due',
  'proximate.round.recused': 'Signer recused from round',
  'proximate.round.rejected': 'Round rejected',
  'proximate.retrospective.ready': 'Round retrospective ready',
  'proximate.crisis_brief.drafted': 'Crisis brief AI-drafted',
  'proximate.counterfactual.prompt': 'Counterfactual prompt shown',
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
  const known = PROXIMATE_ACTION_LABELS[action];
  if (known) return known;
  // Fallback for codes added after this map (or non-proximate chains):
  // "near.report.submitted" -> "Report submitted". No surface should
  // ever show a raw machine code to an operator.
  const tail = action.split('.').slice(1).join(' ').replace(/_/g, ' ').trim()
    || action.replace(/[._]/g, ' ').trim();
  return tail.charAt(0).toUpperCase() + tail.slice(1);
}
