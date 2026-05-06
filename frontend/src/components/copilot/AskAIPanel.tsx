'use client';

/**
 * AskAIPanel — Phase 13.9
 *
 * PMO's data-assistant pattern. User types a question; agent runs the
 * read-only tool registry; we render the natural-language answer plus
 * the structured data each tool returned (so users can drill into IDs).
 *
 * Drop into any portal as a slide-over or inline panel. Uses the
 * standard chat shape (input + recent messages) but each turn carries
 * tools_used + data for transparency.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { Sparkles, Loader2, Send, FileText, AlertTriangle } from 'lucide-react';
import { useTranslation } from '@/lib/hooks/use-translation';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface AskTurn {
  query: string;
  answer: string;
  tools_used: string[];
  data: Record<string, unknown>;
  source: 'claude' | 'fallback';
  error?: string;
}

export function AskAIPanel({ className }: { className?: string }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [turns, setTurns] = useState<AskTurn[]>([]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [turns, loading]);

  const ask = useCallback(async () => {
    const q = query.trim();
    if (!q || loading) return;
    setLoading(true);
    setQuery('');
    try {
      const res = await api.post<{
        success: boolean;
        answer: string;
        tools_used: string[];
        data: Record<string, unknown>;
        source: 'claude' | 'fallback';
      }>('/ai/ask', { query: q });
      setTurns((prev) => [...prev, {
        query: q,
        answer: res.answer ?? '',
        tools_used: res.tools_used ?? [],
        data: res.data ?? {},
        source: res.source ?? 'claude',
      }]);
    } catch (err) {
      setTurns((prev) => [...prev, {
        query: q, answer: '', tools_used: [], data: {},
        source: 'fallback',
        error: err instanceof Error ? err.message : 'Request failed',
      }]);
    } finally {
      setLoading(false);
    }
  }, [query, loading]);

  return (
    <div className={cn('rounded-xl border-2 border-[hsl(var(--kuja-spark))]/40 bg-gradient-to-br from-[hsl(var(--kuja-spark-soft))]/40 to-background', className)}>
      <div className="flex items-center gap-2 p-3 border-b border-border">
        <Sparkles className="h-5 w-5 text-[hsl(var(--kuja-spark))]" />
        <h3 className="kuja-display text-base text-[hsl(var(--kuja-spark))]">
          {t('ask_ai.title')}
        </h3>
      </div>

      <div ref={scrollRef} className="max-h-[420px] overflow-y-auto p-3 space-y-3">
        {turns.length === 0 && !loading && (
          <div className="rounded-md border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
            <div className="font-medium text-foreground mb-2">{t('ask_ai.try_examples')}</div>
            <ul className="space-y-1 text-xs list-disc ml-4">
              <li>{t('ask_ai.example_1')}</li>
              <li>{t('ask_ai.example_2')}</li>
              <li>{t('ask_ai.example_3')}</li>
            </ul>
          </div>
        )}

        {turns.map((t, i) => (
          <div key={i} className="space-y-2">
            <div className="rounded-md bg-muted/40 px-3 py-2 text-sm">
              <span className="font-semibold mr-1">You:</span>{t.query}
            </div>
            {t.error && (
              <div className="rounded-md border border-[hsl(var(--kuja-flag))]/30 bg-[hsl(0_85%_97%)] p-2 text-xs text-[hsl(var(--kuja-flag))]">
                <AlertTriangle className="inline h-3 w-3 mr-1" />
                {t.error}
              </div>
            )}
            {!t.error && (
              <>
                <div className="rounded-md bg-[hsl(var(--kuja-spark-soft))]/40 border border-[hsl(var(--kuja-spark))]/20 px-3 py-2 text-sm">
                  <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-[hsl(var(--kuja-spark))] mb-1">
                    <Sparkles className="h-3 w-3" />
                    Kuja
                    {t.source === 'fallback' && (
                      <span className="ml-1 text-muted-foreground">(offline)</span>
                    )}
                  </div>
                  <p className="whitespace-pre-line text-foreground">{t.answer}</p>
                </div>
                {t.tools_used.length > 0 && (
                  <div className="text-[10px] text-muted-foreground italic flex items-center gap-1.5 px-1">
                    <FileText className="h-3 w-3" />
                    {t.tools_used.join(', ')}
                  </div>
                )}
              </>
            )}
          </div>
        ))}

        {loading && (
          <div className="rounded-md bg-[hsl(var(--kuja-spark-soft))]/40 border border-[hsl(var(--kuja-spark))]/20 px-3 py-2 text-sm flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-[hsl(var(--kuja-spark))]" />
            <span className="text-muted-foreground">{t('ask_ai.thinking')}</span>
          </div>
        )}
      </div>

      <div className="border-t border-border p-3">
        <form
          onSubmit={(e) => { e.preventDefault(); ask(); }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('ask_ai.placeholder')}
            disabled={loading}
            className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--kuja-spark))] disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--kuja-spark))] px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
