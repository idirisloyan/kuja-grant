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
  // translate() falls back to the raw KEY when a locale lacks the entry,
  // so "returned something truthy" is not "translated" — compare against
  // the key or the fallback would leak "proximate.status.<code>" strings.
  const key = `proximate.status.${status}`;
  const translated = t ? t(key) : '';
  if (translated && translated !== key) return translated;
  if (EN_FALLBACK[status]) return EN_FALLBACK[status];
  const pretty = status.replace(/_/g, ' ');
  return pretty.charAt(0).toUpperCase() + pretty.slice(1);
}

// Round trigger type ("disaster" / "programme_cycle") → localized label.
// i18n key first (`proximate.round_type.<code>`), then a prettified fallback
// so a new backend type never leaks a raw snake_case token to the OB.
export function labelForRoundType(
  tt: string | null | undefined,
  t?: (key: string) => string,
): string {
  if (!tt) return '';
  const key = `proximate.round_type.${tt}`;
  const translated = t ? t(key) : '';
  if (translated && translated !== key) return translated;
  return tt.replace(/_/g, ' ');
}
