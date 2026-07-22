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
 *
 *   EffortBadges / StepProgress / WizardNav — the one-question-per-screen
 *     shell. Big targets, visible progress, and the three facts people
 *     ask before they start: how long, do I need an account, can I speak
 *     instead of type.
 *
 *   useLocalDraft — makes the "your answers are saved" promise in
 *     ReassuranceNote actually true on pages that have no server-side
 *     draft. Pages that must NOT leave a trace on a shared phone
 *     (grievance) deliberately skip it and pass showResume={false}.
 *
 *   BilingualShare — every share/copy control on these pages emits a
 *     full AR+EN message, never a bare link or bare code. Half of these
 *     links are forwarded through a third person; a naked URL in a
 *     WhatsApp thread tells them nothing about what to do with it.
 */

import { useEffect, useRef, useState } from 'react';
import {
  Copy, Check, ShieldCheck, Volume2, MessageCircle, Clock, UserX, Mic,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { useTranslation } from '@/lib/hooks/use-translation';

/* ------------------------------------------------------------------ */
/* Bilingual share plumbing                                            */
/* ------------------------------------------------------------------ */

export interface BilingualText {
  ar: string;
  en: string;
}

/**
 * Sub-phrases lifted verbatim from app/services/proximate_messaging.py
 * TEMPLATES, so the OB's automated WhatsApp send and anything a partner
 * copies off these pages use the same words.
 *
 * Duplicated rather than fetched from the API on purpose: these pages
 * are used on connections that drop, and a share button that needs a
 * round-trip is a share button that fails in the field. If TEMPLATES
 * changes over there, change these too.
 */
export const TEMPLATE_PHRASES = {
  /** from disbursement_notify */
  voice_no_account: {
    en: 'You can answer by voice — no account needed.',
    ar: 'يمكنكم الإجابة صوتياً — دون الحاجة إلى حساب.',
  },
  /** from endorsement_invite */
  three_minutes: {
    en: 'It takes about 3 minutes and you can answer by voice.',
    ar: 'يستغرق الأمر نحو ٣ دقائق ويمكنكم الإجابة صوتياً.',
  },
  /** from endorsement_invite */
  name_never_shown: {
    en: 'Your name is never shown to the organisation.',
    ar: 'لا يظهر اسمكم للمنظمة أبداً.',
  },
} satisfies Record<string, BilingualText>;

/**
 * The page origin, available only AFTER mount.
 *
 * These routes are statically prerendered (`output: 'export'`), so an
 * inline `typeof window !== 'undefined' ? window.location.origin : ''`
 * evaluates to the empty branch at build time and — because nothing
 * re-renders on hydration — stays empty forever. That silently shipped
 * a "share this page" button whose message carried no link. Reading it
 * in an effect forces the one re-render that fills it in.
 */
export function useOrigin(): string | undefined {
  const [origin, setOrigin] = useState<string | undefined>(undefined);
  useEffect(() => setOrigin(window.location.origin), []);
  return origin;
}

/** Arabic first — the majority of these recipients read Arabic. */
export function composeBilingual(message: BilingualText, link?: string): string {
  return [message.ar, message.en, link].filter(Boolean).join('\n\n');
}

/**
 * wa.me deep link. No phone number: the sender picks the recipient in
 * WhatsApp itself — we deliberately never guess who a partner should
 * be talking to.
 */
export function whatsappHref(body: string): string {
  return `https://wa.me/?text=${encodeURIComponent(body)}`;
}

export function BilingualShare({
  message,
  link,
  className = '',
}: {
  /** Already-bilingual copy. NOT run through t(): the person receiving
   *  this message has no locale set anywhere we can read. */
  message: BilingualText;
  /** Optional public URL. Never a token — see OfflineFallbackCard. */
  link?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const body = composeBilingual(message, link);

  async function copy() {
    try {
      await navigator.clipboard.writeText(body);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the WhatsApp button is the other path */
    }
  }

  return (
    <div className={`flex items-center gap-2 flex-wrap ${className}`}>
      <a
        href={whatsappHref(body)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 h-10 px-3 text-xs font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700"
      >
        <MessageCircle className="w-3.5 h-3.5" />
        {t('proximate.token.share_whatsapp')}
      </a>
      <button
        type="button"
        onClick={copy}
        className="inline-flex items-center gap-1.5 h-10 px-3 text-xs font-medium rounded-md border border-border hover:bg-muted"
      >
        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        {copied
          ? t('proximate.token.message_copied')
          : t('proximate.token.copy_message')}
      </button>
    </div>
  );
}

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

  // The message a stranded partner sends Adeso. Deliberately vague about
  // WHICH form they were on — this card ships on report, outcome,
  // endorse, verify and package pages, and the code already says which.
  const message: BilingualText = {
    ar: `السلام عليكم. لم تفتح صفحة أديسو معي. رقم المرجع: ${code}`,
    en: `Assalaamu alaikum. The Adeso page did not open for me. My reference number is: ${code}`,
  };

  return (
    <div
      className={`rounded-lg border border-border bg-muted/40 px-4 py-3 ${className}`}
    >
      <p className="text-xs text-muted-foreground mb-2">
        {t('proximate.token.offline_fallback')}
      </p>
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <code className="text-base font-semibold tracking-wider bg-background border border-border rounded px-2.5 py-1">
          {code}
        </code>
      </div>
      {/* No link argument: the token must never be transcribed into a
          WhatsApp thread, and the code alone is enough for the OB. */}
      <BilingualShare message={message} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * 'concern' is the grievance form with the anonymous box UNticked: the
 * reporter has chosen to give a name, so neither the anonymity line nor
 * the "an honest answer about what went wrong" framing applies. It
 * carries the safety line alone.
 */
export type ReassuranceVariant =
  | 'report' | 'endorse' | 'outcome' | 'anonymous' | 'concern';

export function ReassuranceNote({
  variant,
  showResume = true,
  className = '',
}: {
  variant: ReassuranceVariant;
  /**
   * Pass false on any page that does NOT actually keep the answers
   * (today: the grievance form, which deliberately leaves no draft on
   * what may be a shared phone). The resume line is a promise; only
   * make it where useLocalDraft or a server-side draft backs it.
   */
  showResume?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();

  // Every variant gets safety. Only the flows where the submitter's
  // identity is genuinely hidden claim anonymity — promising it where it
  // isn't true would be worse than saying nothing.
  const lines = [t('proximate.token.reassure_safety')];
  if (showResume) {
    lines.push(t('proximate.token.reassure_resume'));
  }
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

/* ------------------------------------------------------------------ */
/* One-question-per-screen wizard shell                                */
/* ------------------------------------------------------------------ */

/**
 * The three things people ask before they will start: how long, do I
 * need an account, must I write. Wording tracks TEMPLATE_PHRASES so the
 * page repeats the promise the invitation message already made.
 */
export function EffortBadges({
  minutes,
  showVoice = true,
  className = '',
}: {
  /** Omit when we genuinely don't know — renders "a few minutes". */
  minutes?: number;
  /**
   * Pass false on pages with no voice affordance at all (the ballot,
   * the verifier verdict, the yes/no invite). Advertising "answer by
   * voice" on a page with no microphone path is a small lie that costs
   * us the next promise too.
   */
  showVoice?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const items = [
    {
      icon: Clock,
      label: minutes
        ? t('proximate.token.effort_minutes', { n: minutes })
        : t('proximate.token.effort_minutes_few'),
    },
    { icon: UserX, label: t('proximate.token.effort_no_account') },
    ...(showVoice ? [{ icon: Mic, label: t('proximate.token.effort_voice') }] : []),
  ];
  return (
    <ul className={`flex flex-wrap gap-2 ${className}`}>
      {items.map(({ icon: Icon, label }) => (
        <li
          key={label}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/60 border border-border rounded-full px-2.5 py-1"
        >
          <Icon className="w-3.5 h-3.5 shrink-0" />
          {label}
        </li>
      ))}
    </ul>
  );
}

export function StepProgress({
  step,
  total,
  label,
  className = '',
}: {
  /** 1-based. */
  step: number;
  total: number;
  /** Short title for the current screen, shown above the bar. */
  label?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const pct = Math.round((Math.min(step, total) / total) * 100);
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <p className="text-xs font-medium text-muted-foreground">
          {t('proximate.token.step_of', { n: step, total })}
        </p>
        {label && (
          <p className="text-xs text-muted-foreground truncate">{label}</p>
        )}
      </div>
      <div
        className="h-2 w-full rounded-full bg-muted overflow-hidden"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t('proximate.token.progress_label')}
      >
        <div
          className="h-full bg-emerald-600 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Back / Next pair. h-14 targets: these are used one-handed, outdoors,
 * often by someone who is not the person the phone belongs to.
 */
export function WizardNav({
  onBack,
  onNext,
  nextLabel,
  nextDisabled = false,
  backDisabled = false,
  className = '',
}: {
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  backDisabled?: boolean;
  className?: string;
}) {
  const { t, isRTL } = useTranslation();
  const BackIcon = isRTL ? ChevronRight : ChevronLeft;
  return (
    <div className={`flex gap-3 ${className}`}>
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          disabled={backDisabled}
          className="h-14 px-5 rounded-lg border border-border text-base font-medium hover:bg-muted disabled:opacity-40 inline-flex items-center gap-1.5"
        >
          <BackIcon className="w-5 h-5" />
          {t('proximate.token.back')}
        </button>
      )}
      <button
        type="button"
        onClick={onNext}
        disabled={nextDisabled}
        className="h-14 flex-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-base font-semibold disabled:bg-muted disabled:text-muted-foreground"
      >
        {nextLabel || t('proximate.token.next')}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Local draft persistence                                             */
/* ------------------------------------------------------------------ */

const DRAFT_PREFIX = 'proximate_draft:';

/**
 * Keeps an in-progress form in localStorage so a dropped connection, a
 * closed tab or a dead battery does not cost the partner their answers
 * — which is what ReassuranceNote's resume line promises.
 *
 * `draftKey` MUST be derived from the record id, never the token: the
 * token is a credential and localStorage on a shared phone is readable
 * by whoever holds it next.
 *
 * Never throws. Draft persistence is a bonus; private-browsing or a
 * full quota must not take the form down with it.
 */
export function useLocalDraft<T extends Record<string, unknown>>(
  draftKey: string | null,
  value: T,
  onRestore: (saved: Partial<T>) => void,
): { restored: boolean; clear: () => void } {
  const [ready, setReady] = useState(false);
  const [restored, setRestored] = useState(false);
  // Held in a ref so a caller passing an inline closure doesn't re-run
  // the restore pass on every render.
  const onRestoreRef = useRef(onRestore);
  onRestoreRef.current = onRestore;
  // onRestore's setState lands on the NEXT render, but effects all run in
  // this one — so without this the save effect would immediately write
  // the still-empty form back over the draft we just read.
  const skipNextSave = useRef(false);

  useEffect(() => {
    if (!draftKey) return;
    setRestored(false);
    try {
      const raw = window.localStorage.getItem(DRAFT_PREFIX + draftKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          onRestoreRef.current(parsed as Partial<T>);
          setRestored(true);
          skipNextSave.current = true;
        }
      }
    } catch {
      /* unreadable or corrupt draft — start clean, never block the form */
    }
    // Only start WRITING after the restore pass has had its chance.
    setReady(true);
  }, [draftKey]);

  const serialized = JSON.stringify(value);
  useEffect(() => {
    if (!draftKey || !ready) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    try {
      window.localStorage.setItem(DRAFT_PREFIX + draftKey, serialized);
    } catch {
      /* quota / private mode — the form still works, just not resumable */
    }
  }, [draftKey, ready, serialized]);

  function clear() {
    if (!draftKey) return;
    try {
      window.localStorage.removeItem(DRAFT_PREFIX + draftKey);
    } catch {
      /* nothing we can do, and nothing depends on it */
    }
  }

  return { restored, clear };
}

/** Shown once when a draft came back, so the restored text isn't a surprise. */
export function DraftRestoredNote({ className = '' }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <p className={`text-xs text-muted-foreground ${className}`}>
      {t('proximate.token.draft_restored')}
    </p>
  );
}
