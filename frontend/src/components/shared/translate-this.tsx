'use client';

/**
 * Phase 78 — Inline translate widget.
 *
 * Wrap any free-text block. Renders the original by default; clicking
 * the small "Translate" link asks /api/translate and swaps the display
 * to the user's UI language. The original is always preserved and
 * a "Show original" toggle reveals it again.
 *
 * Useful contexts:
 *   • Reviewer notes on a report (donor wrote in English; NGO reads
 *     in Somali)
 *   • Application responses (donor reads NGO's Swahili in English)
 *   • Declaration narratives (member network in Arabic; secretariat
 *     reads in French)
 *
 * Cost-conscious: the AI call only fires when the user clicks. Result
 * is cached in component state for the session.
 */

import { useState } from 'react';
import { Languages, Loader2, AlertTriangle } from 'lucide-react';
import { useTranslation } from '@/lib/hooks/use-translation';
import { api } from '@/lib/api';
import { AIStatusNotice } from '@/components/shared/ai-status-notice';

interface TranslateResp {
  success: boolean;
  translated?: string;
  source_language?: string;
  target_language?: string;
  fidelity?: number;
  notes?: string;
  ai_used?: boolean;
  error?: string;
}

interface Props {
  text: string;
  /** Optional override; defaults to the user's UI language */
  targetLanguage?: string;
  /** Domain hints translation jargon: grant | report | declaration */
  domain?: 'grant' | 'report' | 'declaration';
  className?: string;
}

export function TranslateThis({
  text, targetLanguage, domain = 'grant', className = '',
}: Props) {
  const { lang: uiLang } = useTranslation();
  const target = (targetLanguage || uiLang || 'en').slice(0, 2);

  const [busy, setBusy] = useState(false);
  const [translated, setTranslated] = useState<string | null>(null);
  const [meta, setMeta] = useState<TranslateResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showing, setShowing] = useState<'original' | 'translation'>('original');

  if (!text || !text.trim()) return null;

  async function run() {
    if (translated) {
      setShowing('translation');
      return;
    }
    setBusy(true); setError(null);
    try {
      const resp = await api.post<TranslateResp>('/translate', {
        text, target_language: target, domain,
      });
      if (!resp.success) {
        setError(resp.error || 'Translation failed.');
      } else {
        setTranslated(resp.translated || text);
        setMeta(resp);
        setShowing('translation');
      }
    } catch (e) {
      setError((e as Error).message || 'Could not reach the translator.');
    } finally {
      setBusy(false);
    }
  }

  const showOriginal = showing === 'original';
  const display = showOriginal ? text : (translated || text);

  // Pre-translate state — show original + small link
  return (
    <div className={className}>
      <div className="whitespace-pre-wrap leading-relaxed">{display}</div>
      <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
        {!translated ? (
          <button
            type="button"
            onClick={run}
            disabled={busy}
            className="inline-flex items-center gap-1 hover:text-foreground disabled:opacity-50"
          >
            {busy
              ? <><Loader2 className="w-3 h-3 animate-spin" /> Translating…</>
              : <><Languages className="w-3 h-3" /> Translate to {target.toUpperCase()}</>}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setShowing((s) => (s === 'original' ? 'translation' : 'original'))}
              className="inline-flex items-center gap-1 hover:text-foreground"
            >
              <Languages className="w-3 h-3" />
              {showOriginal ? `Show ${target.toUpperCase()} translation` : 'Show original'}
            </button>
            {meta?.source_language && (
              <span>
                · source: {meta.source_language.toUpperCase()}
              </span>
            )}
            {meta?.fidelity != null && meta.fidelity > 0 && (
              <span>· fidelity {meta.fidelity}/100</span>
            )}
          </>
        )}
        {error && (
          <span className="inline-flex items-center gap-1 text-destructive">
            <AlertTriangle className="w-3 h-3" /> {error}
          </span>
        )}
      </div>
      {!showOriginal && meta?.notes && (
        <div className="mt-1 text-[10px] text-muted-foreground italic">
          Translator note: {meta.notes}
        </div>
      )}
      {/* Phase 93 — prominent low-fidelity callout. Claude is weak on
          Somali and approximate on Swahili; the user should know before
          they act on a translated message. */}
      {!showOriginal && meta?.fidelity != null && meta.fidelity > 0 && meta.fidelity < 65 && (
        <AIStatusNotice
          className="mt-2"
          kind="low_confidence"
          title="This translation may be approximate"
          body={`Fidelity is ${meta.fidelity}/100 — Claude has limited coverage of this language pair. For anything important (legal, financial, deadlines), verify against the original (toggle above) or ask a fluent colleague.`}
        />
      )}
    </div>
  );
}
