'use client';

/**
 * GrantBriefPrompt — Phase 2.2
 *
 * Donor types a 1-2 line prompt ("$500k for women-led climate adaptation in
 * coastal Kenya"); AI returns a complete grant scaffold (title, description,
 * criteria with weights, eligibility, doc requirements, reporting cadence,
 * burden score, recommended deadline). The wizard fills in everything; the
 * donor edits before publishing.
 *
 * Sits above the upload dropzone in Step 0 as the second path into the
 * wizard. Three entry points now: upload an existing grant agreement,
 * design with AI from a prompt, or skip and enter manually.
 */

import { useState } from 'react';
import { Sparkles, Loader2, Wand2, AlertTriangle } from 'lucide-react';
import { useTranslation } from '@/lib/hooks/use-translation';
import { useApiError } from '@/lib/hooks/use-api-error';
import { useFlag } from '@/lib/hooks/use-feature-flags';
import { fetchGrantBrief, type GeneratedGrantBrief } from '@/lib/copilot-api';
import { toast } from 'sonner';

interface Props {
  onApplied: (brief: GeneratedGrantBrief) => void;
  className?: string;
}

export function GrantBriefPrompt({ onApplied, className = '' }: Props) {
  const { t } = useTranslation();
  const formatError = useApiError();
  const { enabled, ready } = useFlag('ai.grant_brief_generator');
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const max = 500;

  if (!ready || !enabled) return null;

  const run = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetchGrantBrief({ prompt: prompt.trim() });
      if (!res.ok) {
        setErrorMsg(res.message);
        return;
      }
      const brief = res.data.brief;
      onApplied(brief);
      toast.success(
        t('grant_brief.toast.applied', {
          criteria: brief.criteria?.length || 0,
        }),
      );
      setOpen(false);
      setPrompt('');
    } catch (e) {
      setErrorMsg(formatError(e).message);
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--kuja-spark-soft))] bg-[hsl(var(--kuja-spark-soft))] px-3 py-1.5 text-xs font-medium text-[hsl(var(--kuja-spark))] hover:opacity-90 ${className}`}
      >
        <Wand2 className="h-3.5 w-3.5" />
        {t('grant_brief.cta.open')}
      </button>
    );
  }

  return (
    <div
      className={`w-full max-w-[560px] rounded-[12px] border border-[hsl(var(--kuja-spark-soft))] bg-[hsl(var(--kuja-spark-soft))]/40 p-4 ${className}`}
    >
      <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-[hsl(var(--kuja-spark))]">
        <Sparkles className="h-4 w-4" />
        {t('grant_brief.heading')}
      </div>
      <p className="mb-3 text-xs leading-relaxed text-foreground/80">
        {t('grant_brief.subtitle')}
      </p>

      <textarea
        rows={3}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value.slice(0, max))}
        placeholder={t('grant_brief.placeholder')}
        disabled={loading}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--kuja-clay))] disabled:opacity-60"
      />
      <div className="mt-0.5 flex justify-end text-[10px] text-muted-foreground">
        {prompt.length}/{max}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setPrompt('');
            setErrorMsg(null);
          }}
          disabled={loading}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          onClick={run}
          disabled={loading || !prompt.trim()}
          className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--kuja-clay))] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {loading ? t('grant_brief.cta.designing') : t('grant_brief.cta.design')}
        </button>
      </div>

      {errorMsg && (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
    </div>
  );
}
