/**
 * In-app changelog data — Phase 13.16.
 *
 * PMO's pattern: users don't read release-notes emails. They click
 * the sparkle icon in the app. This file is the curated list of the
 * 10 most recent releases the team wants users to know about.
 *
 * Convention: keep newest first, max 10 entries. When you ship a
 * release, prepend the new entry and drop the oldest if needed.
 */

export interface ChangelogEntry {
  /** ISO date — used as the localStorage seen-state key. */
  date: string;
  /** Short headline. Under 60 chars. */
  title: string;
  /** Optional body — 1-3 sentences. */
  body?: string;
  /** Optional category label for the chip. */
  category?: 'feature' | 'fix' | 'security' | 'performance' | 'announcement';
  /** Optional deep-link path inside the app for "Try it" button. */
  href?: string;
}

export const RECENT_RELEASES: ChangelogEntry[] = [
  {
    date: '2026-05-08',
    title: 'Ask Kuja — conversational data assistant',
    body: 'Type a question about your grants, reports, or risks. Kuja queries live data through 8 read-only tools and answers in plain language. Try "show me overdue reports."',
    category: 'feature',
  },
  {
    date: '2026-05-08',
    title: 'Risk register with workflow',
    body: 'AI-flagged risks are no longer read-only cards — assign owners, set due dates, track mitigation through to resolved. Critical risks bubble to the top of your action queue.',
    category: 'feature',
  },
  {
    date: '2026-05-08',
    title: 'Grant compliance health — Why this score?',
    body: 'Donors get a 4-pillar grant compliance score (completion / timeliness / workflow / scale) plus a "Why this score?" dialog showing the inputs that produced the number.',
    category: 'feature',
  },
  {
    date: '2026-05-08',
    title: 'Two-phase document intake',
    body: 'Document uploads return immediately while AI extraction runs in the background. Poll the new /extraction-status endpoint to know when analysis is complete.',
    category: 'performance',
  },
  {
    date: '2026-05-08',
    title: 'Native PDF fallback for scanned documents',
    body: 'Scanned grant agreements without a text layer now flow through Claude\'s vision pipeline automatically. No Tesseract install, no support tickets.',
    category: 'fix',
  },
  {
    date: '2026-05-08',
    title: 'AI timeout contract',
    body: 'Heavy extractors now have 240s budget (was 60s). Dense legal text no longer dies mid-stream while Claude was about to return.',
    category: 'fix',
  },
  {
    date: '2026-05-08',
    title: 'Inline status changes on list rows',
    body: 'Donors and admins can change application + report status directly from the list — no more opening a modal for a routine flip.',
    category: 'feature',
  },
  {
    date: '2026-05-08',
    title: 'Hash-chained tamper-evident audit log',
    body: 'Critical events (user.forgotten, totp.enrolled) are now cryptographically chained. Any tampering breaks every row that follows.',
    category: 'security',
  },
  {
    date: '2026-05-08',
    title: 'TOTP 2FA available',
    body: 'Admin accounts can now enroll in two-factor authentication with 10 single-use recovery codes. Soft-enforced via banner; hard-enforced soon.',
    category: 'security',
  },
  {
    date: '2026-05-08',
    title: 'Admin self-service surfaces',
    body: '/admin/system-health, /admin/ai-spend, /admin/audit-retention, /admin/failed-logins, /admin/api-docs. The single page that lights up red until you flip a switch.',
    category: 'feature',
  },
];
