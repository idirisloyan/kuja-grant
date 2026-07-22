'use client';

/**
 * Shared field-resilience pieces for the public token pages
 * (report, report package, endorse, endorse-invite, outcome, vote,
 * grievance, nominate).
 *
 * These exist because of how these pages are actually used: a partner or
 * an elder in Sudan, on a phone, on a connection that may drop mid-form,
 * often opening a link that was forwarded through two people first.
 *
 *   OfflineFallbackCard — the page may simply not load next time. Give
 *     them a short reference they can send to Adeso by SMS/WhatsApp so
 *     the OB can find the record without the link. Deliberately derived
 *     from the RECORD ID, never from the token: the token is a
 *     credential and must not be transcribed into a WhatsApp thread.
 *
 *   ReassuranceNote — people hesitate to submit when they don't know
 *     whether it costs them something. Says the three things they
 *     actually worry about: safety, resumability, anonymity.
 *
 *   VoicePlayback — lets someone hear their own recording before they
 *     send it. Plays the LOCAL file via an object URL, so it needs no
 *     round-trip and works on a dead connection.
 */

import { useEffect, useRef, useState } from 'react';
import { Copy, Check, ShieldCheck, Volume2 } from 'lucide-react';
import { useTranslation } from '@/lib/hooks/use-translation';

/* ------------------------------------------------------------------ */

export function OfflineFallbackCard({
  code,
  className = '',
}: {
  /** Short human-quotable reference, e.g. "PR-24". Never the token. */
  code: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the code is on screen to read out anyway */
    }
  }

  return (
    <div
      className={`rounded-lg border border-border bg-muted/40 px-4 py-3 ${className}`}
    >
      <p className="text-xs text-muted-foreground mb-2">
        {t('proximate.token.offline_fallback')}
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        <code className="text-base font-semibold tracking-wider bg-background border border-border rounded px-2.5 py-1">
          {code}
        </code>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3" />
              {t('proximate.token.copied')}
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              {t('proximate.token.copy_code')}
            </>
          )}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export type ReassuranceVariant = 'report' | 'endorse' | 'outcome' | 'anonymous';

export function ReassuranceNote({
  variant,
  className = '',
}: {
  variant: ReassuranceVariant;
  className?: string;
}) {
  const { t } = useTranslation();

  // Every variant gets safety + resumability. Only the flows where the
  // submitter's identity is genuinely hidden claim anonymity — promising
  // it where it isn't true would be worse than saying nothing.
  const lines = [
    t('proximate.token.reassure_safety'),
    t('proximate.token.reassure_resume'),
  ];
  if (variant === 'anonymous') {
    lines.push(t('proximate.token.reassure_anonymous'));
  }
  if (variant === 'endorse') {
    lines.push(t('proximate.token.reassure_endorser_private'));
  }
  if (variant === 'report' || variant === 'outcome') {
    lines.push(t('proximate.token.reassure_honest'));
  }

  return (
    <div
      className={`rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50/70 dark:bg-emerald-950/20 px-4 py-3 ${className}`}
    >
      <div className="flex gap-2">
        <ShieldCheck className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
        <ul className="space-y-1">
          {lines.map((l) => (
            <li key={l} className="text-xs text-emerald-900 dark:text-emerald-200">
              {l}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function VoicePlayback({
  file,
  className = '',
}: {
  /** The locally-selected recording. Null hides the player entirely. */
  file: File | null;
  className?: string;
}) {
  const { t } = useTranslation();
  const [url, setUrl] = useState<string | null>(null);
  const lastUrl = useRef<string | null>(null);

  useEffect(() => {
    // Revoke the previous object URL before minting a new one, otherwise
    // re-recording repeatedly leaks blobs on a low-memory phone.
    if (lastUrl.current) {
      URL.revokeObjectURL(lastUrl.current);
      lastUrl.current = null;
    }
    if (!file) {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(file);
    lastUrl.current = next;
    setUrl(next);
    return () => {
      if (lastUrl.current) {
        URL.revokeObjectURL(lastUrl.current);
        lastUrl.current = null;
      }
    };
  }, [file]);

  if (!url) return null;

  return (
    <div className={`mt-2 ${className}`}>
      <p className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
        <Volume2 className="w-3.5 h-3.5" />
        {t('proximate.token.voice_check')}
      </p>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption -- user's own recording */}
      <audio controls src={url} className="w-full max-w-sm h-10" />
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function AssistedByField({
  value,
  onChange,
  className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(Boolean(value));

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 ${className}`}
      >
        {t('proximate.token.assisted_prompt')}
      </button>
    );
  }

  return (
    <div className={className}>
      <label className="block text-xs font-medium mb-1.5">
        {t('proximate.token.assisted_label')}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={120}
        placeholder={t('proximate.token.assisted_placeholder')}
        className="w-full h-11 px-3 text-sm bg-background border border-border rounded-md"
      />
      <p className="text-xs text-muted-foreground mt-1">
        {t('proximate.token.assisted_hint')}
      </p>
    </div>
  );
}
