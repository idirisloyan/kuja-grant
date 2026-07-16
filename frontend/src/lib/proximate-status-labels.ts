// ============================================================================
// Proximate disbursement/report status → plain-language labels.
//
// Statuses like `pending_report` are state-machine identifiers, not copy.
// Pilot reviewers kept reading "PENDING_REPORT" off the round report and
// traceability pages, so every surface that shows a disbursement status
// renders through this helper: i18n key first (`proximate.status.<code>`),
// then a hand-written English fallback, then a prettified code so a new
// backend status never regresses to raw snake_case.
// ============================================================================

const EN_FALLBACK: Record<string, string> = {
  draft: 'Draft',
  pending_cosign: 'Awaiting co-sign',
  disbursed: 'Disbursed',
  pending_report: 'Awaiting report',
  reported: 'Report received',
  flagged: 'Flagged for review',
  verified: 'Verified',
};

export function labelForProximateStatus(
  status: string | null | undefined,
  t?: (key: string) => string,
): string {
  if (!status) return '';
  const translated = t ? t(`proximate.status.${status}`) : '';
  if (translated) return translated;
  if (EN_FALLBACK[status]) return EN_FALLBACK[status];
  const pretty = status.replace(/_/g, ' ');
  return pretty.charAt(0).toUpperCase() + pretty.slice(1);
}
