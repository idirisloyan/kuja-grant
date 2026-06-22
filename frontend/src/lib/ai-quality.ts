/**
 * ai-quality — Phase 98.10 (design backlog Wave 4 instrumentation)
 *
 * AI quality as a product metric.
 *
 * Two telemetry signals we capture per AI-touched submission:
 *   1. edit-distance — how much the user changed the AI draft before submit
 *   2. false-confidence — when the user accepted AI verbatim AND it later
 *      had to be revised by the recipient (donor, reviewer, OB)
 *
 * Both are computed client-side and posted as events. The backend (Phase
 * 97 AI telemetry) is the system of record; this module is the producer.
 *
 * Conscious choice: we do NOT compute "AI acceptance" alone, because
 * optimizing for acceptance without false-confidence rewards confident
 * wrong AI. Both metrics must be paired.
 */

import { editDistanceWords } from '@/components/shared/ai-diff';

export type AcceptanceMode = 'verbatim' | 'blended' | 'rejected';

export interface AiQualityEvent {
  surface: string;
  mode: AcceptanceMode;
  /** Word-level edit distance between the AI proposal and the final text. */
  editDistanceWords: number;
  /** Word count of the AI proposal. */
  proposedWords: number;
  /** Word count of the final user-submitted text. */
  finalWords: number;
  /** Normalised edit ratio (0=verbatim, 1=completely rewritten). */
  editRatio: number;
  /** Optional language code for per-language slice. */
  language?: string;
  /** Optional client-side latency to first-byte for the AI call. */
  latencyMs?: number;
  /** When the event occurred. */
  capturedAtISO: string;
}

const ENDPOINT = '/api/ai-telemetry/quality';

/**
 * Compute a quality event from the inputs and POST it. Failures are
 * swallowed silently — telemetry must not block the user.
 */
export function recordAiQuality({
  surface,
  mode,
  proposed,
  final,
  language,
  latencyMs,
}: {
  surface: string;
  mode: AcceptanceMode;
  proposed: string;
  final: string;
  language?: string;
  latencyMs?: number;
}): void {
  if (typeof window === 'undefined') return;
  const proposedWords = proposed.trim().split(/\s+/).filter(Boolean).length;
  const finalWords = final.trim().split(/\s+/).filter(Boolean).length;
  const dist = editDistanceWords(proposed, final);
  const denom = Math.max(proposedWords, finalWords, 1);
  const editRatio = Math.min(1, dist / denom);

  const event: AiQualityEvent = {
    surface,
    mode,
    editDistanceWords: dist,
    proposedWords,
    finalWords,
    editRatio: Number(editRatio.toFixed(3)),
    language,
    latencyMs,
    capturedAtISO: new Date().toISOString(),
  };

  // Fire-and-forget. Use keepalive so it survives navigation.
  try {
    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Don't break the user.
  }
}

/**
 * Mark a previously-accepted AI surface as having been later corrected by
 * the recipient (false-confidence signal). Backend rolls this up into the
 * "false confidence rate" metric per surface per language.
 *
 * Phase 620 — language is now forwarded so the admin AI-quality rollup
 * can compute per-locale calibration drift. Defaults to navigator
 * language if the caller doesn't pass one, but explicit is better when
 * the surface knows the locale of the rendered content.
 */
export function markFalseConfidence({
  surface,
  itemId,
  correctedBy,
  language,
}: {
  surface: string;
  itemId: string;
  correctedBy: 'donor' | 'reviewer' | 'ob' | 'system';
  language?: string;
}): void {
  if (typeof window === 'undefined') return;
  const lang = (language
    || (typeof navigator !== 'undefined' ? navigator.language : 'en')
    || 'en'
  ).slice(0, 8).toLowerCase();
  try {
    fetch('/api/ai-telemetry/false-confidence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        surface,
        itemId,
        correctedBy,
        language: lang,
        capturedAtISO: new Date().toISOString(),
      }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // ignore
  }
}
