'use client';

// ============================================================================
// Shared vocabulary for the OB messaging console (wave 3c, July 2026).
//
// Holds the things the inbox, the outbound log and the delivery panel all
// need to agree on: the row shape, the message-status→tone mapping, and the
// human labels for template/subject keys.
//
// On the tone map: status-badge.tsx owns the ONE status→tone system for
// Proximate and rightly says "add new statuses there, never inline classes".
// Message lifecycle statuses (unsent/queued/sent/delivered/read/failed/
// received) are a different vocabulary from the record statuses in that map
// — 'read' and 'sent' would collide in meaning, and every one of them would
// silently fall through to 'neutral', rendering a failed send in calm grey.
// So we map them here but still render through the shared TONE_CLASSES, so
// the colours stay in one place even though the vocabulary is separate.
// ============================================================================

import { TONE_CLASSES, type ProximateTone } from './status-badge';

/** Server shape: ProximateMessage.to_dict(). */
export interface ProximateMessageRow {
  id: number;
  direction: 'in' | 'out';
  channel: string;
  template_key: string | null;
  template_variant: string | null;
  locale: string | null;
  recipient_name: string | null;
  /** Masked server-side to '•••1234' — never a dialable number. */
  recipient_phone: string | null;
  subject_kind: string | null;
  subject_id: number | null;
  status: string;
  error: string | null;
  attempts: number;
  cost_usd: number | null;
  created_at: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  responded_at: string | null;
  handled_at: string | null;
  body?: string;
}

/** Per-template rollup from /api/proximate/messaging/stats. */
export interface MessagingStatRow {
  template: string;
  total: number;
  sent: number;
  delivered: number;
  read: number;
  responded: number;
  unsent: number;
  failed: number;
  cost_usd: number;
  /** null when nothing was sent — a rate over zero sends is meaningless. */
  response_rate: number | null;
}

/**
 * Whether messages can actually be delivered.
 *
 * 'unknown' is deliberately a first-class state rather than being folded
 * into 'not_configured'. If the stats call fails we genuinely do not know,
 * and telling an OB "not configured" on the strength of a network blip is
 * its own kind of lie.
 */
export type MessagingConfigState = 'configured' | 'not_configured' | 'unknown';

const STATUS_TONE: Record<string, ProximateTone> = {
  // Nothing left the building — the loudest state on this page.
  unsent: 'critical',
  failed: 'critical',
  // In motion.
  queued: 'attention',
  sent: 'active',
  delivered: 'active',
  // Confirmed to have reached a human.
  read: 'positive',
  received: 'positive',
};

export function toneForMessageStatus(status: string | null | undefined): ProximateTone {
  return (status && STATUS_TONE[status]) || 'neutral';
}

export function MessageStatusChip({
  status,
  className = '',
  label,
}: {
  status: string | null | undefined;
  className?: string;
  /** Pre-translated label; falls back to the raw key so an unmapped
      status is still legible rather than blank. */
  label?: string;
}) {
  if (!status) return null;
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded border whitespace-nowrap ${
        TONE_CLASSES[toneForMessageStatus(status)]
      } ${className}`}
    >
      {label || status}
    </span>
  );
}

type T = (key: string, params?: Record<string, string | number>) => string;

/** Template keys are snake_case in the DB; show operators real words.
    Unknown keys fall back to the key itself — a new template added
    server-side should still be identifiable here, not blank. */
export function templateLabel(key: string | null | undefined, t: T): string {
  if (!key) return t('proximate.messaging.template.other');
  const translated = t(`proximate.messaging.template.${key}`);
  return translated === `proximate.messaging.template.${key}` ? key : translated;
}

export function subjectLabel(kind: string | null | undefined, t: T): string | null {
  if (!kind) return null;
  const translated = t(`proximate.messaging.subject.${kind}`);
  return translated === `proximate.messaging.subject.${kind}` ? kind : translated;
}

export function statusLabel(status: string | null | undefined, t: T): string {
  if (!status) return '';
  const translated = t(`proximate.messaging.status.${status}`);
  return translated === `proximate.messaging.status.${status}` ? status : translated;
}

/**
 * Deep-link to the record a message is about, so the OB can act on a reply
 * without hunting for it. Returns null for kinds with no detail page —
 * the caller then renders the label as plain text rather than a dead link.
 */
export function subjectHref(kind: string | null, id: number | null): string | null {
  if (!kind || !id) return null;
  switch (kind) {
    case 'disbursement':
      return `/proximate/disbursements/${id}`;
    case 'partner':
      // Partner detail genuinely lives under /proximate/endorse/<id> — that
      // page carries payment routes, bank verification and interventions.
      // There is no /proximate/admin/partners/<id>; the register links here
      // too (see the note in admin/partners/page.tsx).
      return `/proximate/endorse/${id}`;
    case 'round':
      return `/proximate/rounds/${id}`;
    default:
      return null;
  }
}
