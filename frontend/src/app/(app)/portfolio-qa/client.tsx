'use client';

/**
 * Phase 107 — Donor "ask about my grantees".
 *
 * Free-form Q&A grounded in the donor's own portfolio. Backend pulls
 * only this donor's grants/applications/reports into the prompt so
 * there's no cross-tenant leakage. Every claim the AI makes is cited
 * to a specific row the donor can click through.
 */

import { useState } from 'react';
import Link from 'next/link';
import { Sparkles, Send, Loader2, ExternalLink, MessageSquare } from 'lucide-react';
import {
  PageShell, PageBack, PageHeader, PageMain,
} from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { AIFallbackNotice } from '@/components/shared/ai-fallback-notice';

interface Citation {
  kind: 'grant' | 'application' | 'report';
  id: number;
  claim: string;
  label: string;
}
interface QAResp {
  success: boolean;
  answer: string;
  citations: Citation[];
  meta?: { model?: string | null; fallback_used?: boolean; tokens_in?: number; tokens_out?: number; duration_ms?: number };
}

const SUGGESTED: string[] = [
  'Which of my grantees look at-risk right now?',
  'Which grants closed last month with no applications?',
  'Show me the strongest reports submitted this quarter.',
  'Are there any applications missing key responses?',
];

export default function PortfolioQaClient() {
  const user = useAuthStore((s) => s.user);
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState<QAResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (user && user.role !== 'donor') {
    return (
      <PageShell>
        <PageHeader title="Portfolio Q&A" subtitle="Donor accounts only." />
      </PageShell>
    );
  }

  const ask = async (q: string) => {
    if (!q.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.post<QAResp>('/donor/portfolio-qa', { question: q.trim() });
      if (!res.success) {
        setError('AI was unable to answer right now.');
      } else {
        setResult(res);
      }
    } catch (e) {
      setError((e as Error).message || 'Network error.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageShell>
      <PageBack href="/dashboard" label="Back to dashboard" />
      <PageHeader
        title="Ask about your grantees"
        subtitle="Free-form questions about your portfolio. Cited to the specific application, grant, or report."
      />

      <PageMain>
        <Card className="p-4 space-y-3 mb-4">
          <label className="text-sm font-semibold flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-[hsl(var(--kuja-clay))]" /> Your question
          </label>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={3}
            placeholder="e.g. Which of my grantees look at-risk this quarter?"
            className="w-full text-sm rounded-md border border-border bg-card p-3 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--kuja-clay)/0.3)]"
          />
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex flex-wrap gap-1">
              {SUGGESTED.map((s) => (
                <button
                  type="button"
                  key={s}
                  onClick={() => { setQuestion(s); void ask(s); }}
                  className="text-[11px] rounded-full border border-border px-2 py-1 hover:bg-muted text-muted-foreground"
                >{s}</button>
              ))}
            </div>
            <Button onClick={() => void ask(question)} disabled={!question.trim() || loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Send className="w-4 h-4 mr-1" />}
              Ask
            </Button>
          </div>
        </Card>

        {error && (
          <div className="border-l-4 border-[hsl(var(--kuja-flag))] bg-[hsl(var(--kuja-flag)/0.05)] rounded-md p-3 text-xs mb-4">
            {error}
          </div>
        )}

        {result?.success && (
          <Card className="p-5 space-y-4">
            <div className="flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-[hsl(var(--kuja-clay))] mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-sm mb-2">Answer</h2>
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{result.answer}</p>
                {result.meta?.fallback_used && (
                  <div className="mt-3">
                    <AIFallbackNotice meta={result.meta} />
                  </div>
                )}
              </div>
            </div>

            {result.citations.length > 0 && (
              <section className="border-t border-border pt-3 space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Citations ({result.citations.length})
                </h3>
                <ul className="space-y-1.5">
                  {result.citations.map((c, i) => {
                    const href =
                      c.kind === 'grant' ? `/grants/${c.id}` :
                        c.kind === 'application' ? `/applications/${c.id}` :
                          `/reports/${c.id}`;
                    return (
                      <li key={`${c.kind}-${c.id}-${i}`} className="text-xs">
                        <Link
                          href={href}
                          className="inline-flex items-center gap-1 font-semibold text-[hsl(var(--kuja-clay))] hover:underline"
                        >
                          {c.label} <ExternalLink className="w-3 h-3" />
                        </Link>
                        {c.claim && (
                          <span className="ml-2 text-muted-foreground italic">— {c.claim}</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            <p className="text-[10px] text-muted-foreground border-t border-border pt-2">
              Grounded only in your portfolio. {result.meta?.model && <>Model: <code>{result.meta.model}</code>.</>} {result.meta?.tokens_out && <>{result.meta.tokens_out} output tokens.</>}
            </p>
          </Card>
        )}
      </PageMain>
    </PageShell>
  );
}
