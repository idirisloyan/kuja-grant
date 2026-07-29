// Compliance dates (report-due, disbursed, receipt, contract deadlines) are
// computed server-side in UTC. Rendering them with the browser's local
// timezone shifts the calendar day for viewers behind or ahead of UTC — a
// due date of 2026-08-15T00:00Z reads as 8/14 in the Americas. For a
// compliance system that must read the same for everyone, always format the
// UTC calendar date.
export function formatComplianceDate(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, {
    timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric',
  });
}
