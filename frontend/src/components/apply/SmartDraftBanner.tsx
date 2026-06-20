'use client';

/**
 * Phase 75 — Smart draft banner (apply page).
 *
 * One discoverable CTA on the apply form: "Pre-fill from my assessment +
 * history." Calls /api/applications/<id>/ai-draft which grounds the
 * draft in the org's latest capacity assessment, last 2 submitted
 * applications, and the grant's rubric. The NGO becomes editor, not
 * author.
 *
 * Distinct from the per-criterion "Draft this section" + "Strengthen"
 * already present: this is the bulk-prefill entry point, the very first
 * thing the NGO sees so they don't stare at 15 empty textareas.
 */

import { useState } from 'react';
import { Sparkles, Loader2, CheckCircle2, AlertTriangle, ChevronRight, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { AIStatusNotice } from '@/components/shared/ai-status-notice';
import { useAiStatus } from '@/lib/hooks/use-ai-status';
import { AIConfidenceBadge, confidenceFromScore } from '@/components/shared/ai-confidence-badge';

interface AiDraftResp {
  success: boolean;
  responses?: Record<string, string>;
  rationale?: Record<string, string>;
  gaps?: string[];
  confidence?: number;
  ai_used?: boolean;
  merged?: boolean;
  error?: string;
}

interface Props {
  applicationId: number;
  // The NGO's currently-typed responses; we use this to decide whether
  // the banner should show (only when EVERY field is empty).
  currentResponses: Record<string, string>;
  onMerged?: (responses: Record<string, string>) => void;
  className?: string;
}

export function SmartDraftBanner({
  applicationId, currentResponses, onMerged, className = '',
}: Props) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<AiDraftResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const aiStatus = useAiStatus();

  // Hide when NGO already has substantive content — pre-fill makes no sense.
  const anyTyped = Object.values(currentResponses || {})
    .some((v) => (v || '').trim().length > 30);

  if (hidden || anyTyped) return null;

  // Phase 95 — when AI is known-down, replace the banner with a quiet
  // notice instead of showing a button that won't work.
  if (aiStatus.ready && aiStatus.isUnavailable) {
    return (
      <AIStatusNotice
        className={className}
        kind="unavailable"
        title="AI drafting is temporarily unavailable"
        body="You'll need to write each section by hand for now. Your work autosaves as you type, so you can pause and come back. Try the AI draft again later."
      />
    );
  }

  async function runPreview() {
    setBusy(true); setError(null); setPreview(null);
    try {
      const resp = await api.post<AiDraftResp>(
        `/applications/${applicationId}/ai-draft`,
        { merge: false },
      );
      if (!resp.success) {
        setError(resp.error || 'AI drafting failed.');
      } else {
        setPreview(resp);
      }
    } catch (e) {
      setError((e as Error).message || 'Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  async function commitMerge() {
    setBusy(true); setError(null);
    try {
      const resp = await api.post<AiDraftResp>(
        `/applications/${applicationId}/ai-draft`,
        { merge: true },
      );
      if (!resp.success) {
        setError(resp.error || 'AI drafting failed.');
      } else {
        toast.success(`Pre-filled ${Object.keys(resp.responses ?? {}).length} sections. Edit each one — the AI may have missed nuance.`);
        onMerged?.(resp.responses ?? {});
        setHidden(true);
      }
    } catch (e) {
      setError((e as Error).message || 'Could not save the pre-filled draft.');
    } finally {
      setBusy(false);
    }
  }

  // Pre-preview banner
  if (!preview) {
    return (
      <div className={`relative border border-[hsl(var(--kuja-spark))]/30 bg-[hsl(var(--kuja-spark-soft))] rounded-lg p-4 ${className}`}>
        <button
          type="button"
          onClick={() => setHidden(true)}
          aria-label="Dismiss"
          className="absolute top-2 right-2 text-muted-foreground hover:text-foreground"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="flex items-start gap-3 pr-8">
          <Sparkles className="w-5 h-5 text-[hsl(var(--kuja-spark))] mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1 space-y-2">
            <h3 className="font-semibold text-sm">
              Don&apos;t start from blank — let Kuja draft this for you
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Kuja will read your capacity assessment, your last 2 applications, and
              this grant&apos;s rubric, then write a first draft for every question.
              You edit each section. <strong>You stay in control of what gets submitted.</strong>
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={runPreview}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--kuja-spark))] text-white text-xs font-semibold px-3 py-1.5 hover:opacity-90 disabled:opacity-50"
              >
                {busy
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Drafting…</>
                  : <><Sparkles className="w-3.5 h-3.5" /> Draft this application for me</>}
              </button>
              <span className="text-[11px] text-muted-foreground">
                You can edit before saving · Takes 20–40 seconds
              </span>
            </div>
          </div>
        </div>
        {error && (
          <div className="mt-3 border border-destructive/30 bg-destructive/10 text-destructive rounded-md px-3 py-2 text-xs flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> <span>{error}</span>
          </div>
        )}
      </div>
    );
  }

  // Preview ready — show summary + confirm merge
  const respCount = Object.keys(preview.responses ?? {}).length;
  const gapCount = (preview.gaps ?? []).length;
  return (
    <div className={`relative border border-[hsl(var(--kuja-spark))]/30 bg-card rounded-lg p-4 ${className}`}>
      <div className="flex items-start gap-3">
        <CheckCircle2 className="w-5 h-5 text-[hsl(var(--kuja-grow))] mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1 space-y-2">
          <h3 className="font-semibold text-sm">
            Draft ready · {respCount} section{respCount === 1 ? '' : 's'} drafted
            {preview.confidence != null && (
              <AIConfidenceBadge
                confidence={confidenceFromScore(preview.confidence)}
                variant="inline"
                className="ml-2"
                title={`AI confidence on this draft: ${preview.confidence}/100. Higher = more grounded in your existing data.`}
              />
            )}
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Kuja drafted every question it had context for. You&apos;ll see the
            drafts in each section below — edit, polish, or replace freely.
          </p>

          {/* Phase 93 — limited-context warning. If the AI is reporting
              <50% confidence OR more than half of sections are gaps,
              the NGO is a cold-start case and the draft will be generic.
              Be honest about it. */}
          {(preview.confidence != null && preview.confidence < 50) || (respCount > 0 && gapCount > respCount) ? (
            <AIStatusNotice
              kind="limited_context"
              title="Limited information about your org — the draft may be generic"
              body="Kuja drafts best when you have a completed capacity assessment + 1-2 prior applications. Without those, the AI draft is a starting structure, not your application. Plan to edit every section substantially."
            />
          ) : null}

          {gapCount > 0 && (
            <div className="border border-[hsl(var(--kuja-sun))]/30 bg-[hsl(var(--kuja-sun))]/10 text-[hsl(var(--kuja-sun))] rounded-md px-3 py-2 text-xs">
              <div className="font-semibold mb-1">
                {gapCount} section{gapCount === 1 ? '' : 's'} need{gapCount === 1 ? 's' : ''} your input
              </div>
              <div className="text-foreground/80">
                Kuja didn&apos;t have enough information about your org to draft:
                {' '}{(preview.gaps ?? []).slice(0, 6).map(g => g.replace(/_/g, ' ')).join(' · ')}
                {gapCount > 6 ? ` · +${gapCount - 6} more` : ''}
              </div>
            </div>
          )}

          {/* Rationale tease — show one example, link to expand */}
          {preview.rationale && Object.keys(preview.rationale).length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground select-none">
                Show source attributions
              </summary>
              <ul className="mt-2 space-y-1 text-[11px]">
                {Object.entries(preview.rationale).slice(0, 8).map(([k, why]) => (
                  <li key={k} className="border border-border rounded-md px-2 py-1.5">
                    <span className="font-semibold capitalize">{k.replace(/_/g, ' ')}</span>:
                    <span className="text-muted-foreground ml-1">{why}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={commitMerge}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--kuja-clay))] text-white text-xs font-semibold px-3 py-1.5 hover:opacity-90 disabled:opacity-50"
            >
              {busy
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</>
                : <><ChevronRight className="w-3.5 h-3.5" /> Use this draft</>}
            </button>
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="text-[11px] text-muted-foreground hover:text-foreground underline"
            >
              Discard and start over
            </button>
          </div>
        </div>
      </div>
      {error && (
        <div className="mt-3 border border-destructive/30 bg-destructive/10 text-destructive rounded-md px-3 py-2 text-xs flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> <span>{error}</span>
        </div>
      )}
    </div>
  );
}
