'use client';

/**
 * ReviewerFollowupsPanel — "ask these 3 questions before deciding" (Phase 8).
 *
 * Drops into review and application detail pages. Reviewer / donor clicks
 * "Suggest follow-ups" → Claude reads the submission and returns 3-4
 * highest-leverage questions to ask the NGO before scoring.
 *
 * Each follow-up:
 *   - question (verbatim, ask-as-is)
 *   - why_it_matters (one sentence resolution)
 *   - what_strong_answer_looks_like (calibration hint)
 *   - covers_criterion (criterion key, if applicable)
 *
 * Copy button per question so reviewers can paste into email/Slack.
 */

import { useState } from 'react';
import {
  MessageCircleQuestion, Loader2, Sparkles, Copy, CheckCircle2, AlertCircle,
  Send,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface Followup {
  question: string;
  why_it_matters?: string;
  what_strong_answer_looks_like?: string;
  covers_criterion?: string;
}

interface FollowupResp {
  success: boolean;
  source: 'ai' | 'unavailable';
  followups: Followup[];
  computed_at: string;
  cached?: boolean;
}

export interface ReviewerFollowupsPanelProps {
  kind: 'application' | 'report';
  entityId: number;
  /** Optional title override */
  title?: string;
}

export function ReviewerFollowupsPanel({
  kind, entityId, title = 'Reviewer follow-ups',
}: ReviewerFollowupsPanelProps) {
  const [data, setData] = useState<FollowupResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  // Phase 14 — outbound dispatch: per-question selection + send-to-NGO
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get<FollowupResp>(`/api/reviewer/followups/${kind}/${entityId}`);
      setData(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const copy = async (text: string, i: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(i);
      setTimeout(() => setCopiedIdx(null), 1800);
    } catch {/* ignore */}
  };

  const toggleSelected = (i: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const sendSelected = async () => {
    if (!data || selected.size === 0) return;
    const questions = Array.from(selected).map((i) => data.followups[i]?.question).filter(Boolean) as string[];
    setSending(true);
    setSendResult(null);
    try {
      const r = await api.post<{ success: boolean; sent?: number; recipients?: number; notice?: string }>(
        `/api/reviewer/followups/${kind}/${entityId}/send`,
        { questions },
      );
      if (r.success) {
        const n = r.recipients ?? 0;
        setSendResult(`Sent to ${n} recipient${n === 1 ? '' : 's'}.`);
        setSelected(new Set());
      } else {
        setSendResult('Send failed.');
      }
    } catch (e: unknown) {
      setSendResult(e instanceof Error ? e.message : 'Send failed');
    } finally {
      setSending(false);
      setTimeout(() => setSendResult(null), 4000);
    }
  };

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-2 min-w-0">
          <div className="p-2 rounded-md bg-[hsl(var(--kuja-spark)/0.1)]">
            <MessageCircleQuestion className="w-5 h-5 text-[hsl(var(--kuja-spark))]" />
          </div>
          <div className="min-w-0">
            <div className="kuja-eyebrow flex items-center gap-1.5">
              {title}
              {data?.source === 'ai' && (
                <span className="kuja-ai-pill text-[9px]">
                  <Sparkles className="w-2.5 h-2.5" /> Claude-generated
                </span>
              )}
            </div>
            <h3 className="text-base font-semibold mt-0.5">
              The 3–4 questions most worth asking before you decide
            </h3>
            <p className="text-[11px] text-[hsl(var(--kuja-ink-soft))] mt-0.5">
              Each unlocks information you can&apos;t infer from the submission.
            </p>
          </div>
        </div>
        {!data && !loading && (
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--kuja-spark))] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
          >
            <Sparkles className="w-3.5 h-3.5" /> Suggest follow-ups
          </button>
        )}
        {data && (
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded-md border border-[hsl(var(--border))] px-2 py-1 text-[11px] font-semibold hover:bg-[hsl(var(--kuja-sand-50))]"
          >
            Re-run
          </button>
        )}
      </div>

      {loading && (
        <div className="mt-3 flex items-center gap-2 text-xs text-[hsl(var(--kuja-ink-soft))]">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Drafting follow-ups…
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-md border border-[hsl(var(--kuja-flag)/0.3)] bg-[hsl(var(--kuja-flag)/0.05)] p-2 text-xs text-[hsl(var(--kuja-flag))]">
          {error}
        </div>
      )}

      {data && data.source === 'unavailable' && (
        <div className="mt-3 flex items-start gap-2 text-xs text-[hsl(var(--kuja-ink-soft))]">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5" />
          AI not available right now — try again later.
        </div>
      )}

      {data && data.followups.length === 0 && data.source === 'ai' && (
        <div className="mt-3 rounded-md border border-[hsl(var(--kuja-grow)/0.3)] bg-[hsl(var(--kuja-grow)/0.05)] p-2 text-xs">
          <strong>No follow-ups suggested.</strong> The submission appears complete enough to score as-is.
        </div>
      )}

      {data && data.followups.length > 0 && (
        <ol className="mt-3 space-y-3">
          {data.followups.map((f, i) => (
            <li key={i} className="rounded-md border border-[hsl(var(--border))] p-3">
              <div className="flex items-start gap-2">
                {/* Phase 14 — select for outbound dispatch to NGO */}
                <input
                  type="checkbox"
                  checked={selected.has(i)}
                  onChange={() => toggleSelected(i)}
                  aria-label={`Select question ${i + 1} for sending`}
                  className="mt-1 h-3.5 w-3.5 accent-[hsl(var(--kuja-clay))]"
                />
                <Badge variant="outline" className="text-[10px] shrink-0 mt-0.5">{i + 1}</Badge>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[hsl(var(--kuja-ink))] leading-relaxed">{f.question}</p>
                  {f.why_it_matters && (
                    <p className="text-xs text-[hsl(var(--kuja-ink-soft))] mt-1.5">
                      <strong>Why it matters:</strong> {f.why_it_matters}
                    </p>
                  )}
                  {f.what_strong_answer_looks_like && (
                    <p className="text-xs text-[hsl(var(--kuja-ink-soft))] mt-1">
                      <strong>Strong answer looks like:</strong> {f.what_strong_answer_looks_like}
                    </p>
                  )}
                  {f.covers_criterion && (
                    <div className="mt-1.5">
                      <Badge variant="outline" className="text-[10px]">
                        targets: <code className="ml-1">{f.covers_criterion}</code>
                      </Badge>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => copy(f.question, i)}
                  className="shrink-0 inline-flex items-center gap-1 rounded-md border border-[hsl(var(--border))] px-2 py-1 text-[10px] font-semibold hover:bg-[hsl(var(--kuja-sand-50))]"
                  aria-label="Copy question"
                  title="Copy question"
                >
                  {copiedIdx === i ? <CheckCircle2 className="w-3 h-3 text-[hsl(var(--kuja-grow))]" /> : <Copy className="w-3 h-3" />}
                  {copiedIdx === i ? 'Copied' : 'Copy'}
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}

      {/* Phase 14 — outbound dispatch footer. Renders when there's at
          least one follow-up; disabled until something is selected. */}
      {data && data.followups.length > 0 && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-md border-t border-[hsl(var(--border))] pt-3">
          <span className="text-[11px] text-[hsl(var(--kuja-ink-soft))]">
            {selected.size > 0
              ? `${selected.size} selected — will fan out via the recipient's preferred channels.`
              : 'Tick the questions you want to forward, then send.'}
          </span>
          <div className="flex items-center gap-2">
            {sendResult && (
              <span className="text-[11px] text-[hsl(var(--kuja-grow))]">{sendResult}</span>
            )}
            <button
              type="button"
              onClick={sendSelected}
              disabled={sending || selected.size === 0}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold',
                'bg-[hsl(var(--kuja-clay))] text-white hover:opacity-90',
                'disabled:opacity-40 disabled:cursor-not-allowed',
              )}
            >
              {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Send to NGO
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
