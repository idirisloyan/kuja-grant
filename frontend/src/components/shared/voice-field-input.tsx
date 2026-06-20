'use client';

/**
 * Phase 110 — Generic voice input for any long text field.
 *
 * Phase 71 voice-to-report covered the reports surface. This generalises
 * the recording / language-picker / transcript-stream logic into a
 * field-level component that any textarea can sit next to:
 *
 *   <VoiceFieldInput
 *     value={text}
 *     onChange={setText}
 *     fieldLabel="Your project overview"
 *     placeholder="Tap the mic and describe…"
 *   />
 *
 * Self-gated: hides itself entirely when the Web Speech API is absent
 * (Firefox desktop in many configurations). The user still gets the
 * regular textarea — voice is purely additive.
 *
 * Languages: six BCP-47 locales matching Phase 71. Picker chip in the
 * top-right of the recording surface.
 *
 * Composition: voice appends to the existing text by default with a
 * newline separator. Pass `replace` to overwrite on each session.
 */

import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Languages, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LangSpec {
  code: string;
  label: string;
  short: string;
  speechQuality: 'good' | 'fair' | 'unsupported';
}
const LANGS: LangSpec[] = [
  { code: 'en-US', label: 'English',   short: 'en', speechQuality: 'good' },
  { code: 'fr-FR', label: 'Français',  short: 'fr', speechQuality: 'good' },
  { code: 'es-ES', label: 'Español',   short: 'es', speechQuality: 'good' },
  { code: 'ar-SA', label: 'العربية',   short: 'ar', speechQuality: 'fair' },
  { code: 'sw-KE', label: 'Kiswahili', short: 'sw', speechQuality: 'fair' },
  { code: 'so-SO', label: 'Soomaali',  short: 'so', speechQuality: 'unsupported' },
];

interface Props {
  value: string;
  onChange: (next: string) => void;
  /** Human label shown in the recording panel header. */
  fieldLabel?: string;
  /** Override default language. Defaults to en-US. */
  defaultLang?: string;
  /** If true, each new session REPLACES the text. Default appends. */
  replace?: boolean;
  className?: string;
  /** Render mode: 'chip' (inline icon button), 'expanded' (always-visible panel). */
  variant?: 'chip' | 'expanded';
}

type SpeechRecognitionLike = {
  start: () => void;
  stop: () => void;
  abort: () => void;
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string; isFinal?: boolean }>> }) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

function getRecognitionCtor(): { new (): SpeechRecognitionLike } | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: { new (): SpeechRecognitionLike };
    webkitSpeechRecognition?: { new (): SpeechRecognitionLike };
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function VoiceFieldInput({
  value, onChange, fieldLabel, defaultLang = 'en-US',
  replace = false, className, variant = 'chip',
}: Props) {
  const [recording, setRecording] = useState(false);
  const [open, setOpen] = useState(variant === 'expanded');
  const [lang, setLang] = useState<string>(defaultLang);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const startedValueRef = useRef<string>('');

  // Hide entirely when the browser can't do speech recognition.
  const supported = typeof window !== 'undefined' && getRecognitionCtor() !== null;
  const langSpec = LANGS.find((l) => l.code === lang) ?? LANGS[0];

  useEffect(() => {
    return () => { recRef.current?.abort(); };
  }, []);

  if (!supported) return null;

  const start = () => {
    setError(null);
    setInterim('');
    if (langSpec.speechQuality === 'unsupported') {
      setError(`${langSpec.label} isn't supported by browser speech recognition. Type or switch language.`);
      return;
    }
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = lang;
    r.continuous = true;
    r.interimResults = true;
    startedValueRef.current = value;
    let finalText = '';
    r.onresult = (e) => {
      let live = '';
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i];
        const alt = res[0];
        if (!alt) continue;
        if (alt.isFinal) {
          finalText += (finalText ? ' ' : '') + alt.transcript;
        } else {
          live += alt.transcript;
        }
      }
      setInterim(live);
      const base = replace ? '' : (startedValueRef.current ? startedValueRef.current + '\n\n' : '');
      onChange(base + finalText + (live ? ' ' + live : ''));
    };
    r.onerror = (ev) => {
      setError(ev.error || 'Speech recognition error.');
    };
    r.onend = () => {
      setRecording(false);
      setInterim('');
    };
    try {
      r.start();
      recRef.current = r;
      setRecording(true);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const stop = () => {
    recRef.current?.stop();
    setRecording(false);
  };

  // CHIP variant: small mic button in the corner of the textarea
  if (variant === 'chip' && !open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Speak this field instead of typing"
        className={cn(
          'inline-flex items-center gap-1 rounded-full border border-border bg-card text-[10px] font-semibold px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground',
          className,
        )}
      >
        <Mic className="w-3 h-3" />
        Speak
      </button>
    );
  }

  return (
    <div
      role="region"
      aria-label={fieldLabel ? `Voice input for ${fieldLabel}` : 'Voice input'}
      className={cn(
        'border border-[hsl(var(--kuja-clay)/0.3)] bg-[hsl(var(--kuja-sand-50))] dark:bg-[hsl(var(--kuja-clay)/0.05)] rounded-md p-3 space-y-2',
        className,
      )}
    >
      <header className="flex items-center justify-between gap-2 flex-wrap text-xs">
        <span className="font-semibold inline-flex items-center gap-1.5">
          <Mic className="w-3.5 h-3.5 text-[hsl(var(--kuja-clay))]" />
          Speak {fieldLabel ? <>«{fieldLabel}»</> : 'this field'}
        </span>
        <div className="flex items-center gap-1.5">
          <Languages className="w-3 h-3 text-muted-foreground" />
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            className="text-[11px] rounded border border-border bg-card px-1 py-0.5"
            disabled={recording}
          >
            {LANGS.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}{l.speechQuality === 'unsupported' ? ' (typed only)' : ''}
              </option>
            ))}
          </select>
          {variant === 'chip' && (
            <button
              type="button"
              onClick={() => { stop(); setOpen(false); }}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Hide voice input"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </header>

      <div className="flex items-center gap-2">
        {recording ? (
          <button
            type="button"
            onClick={stop}
            className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--kuja-flag))] text-white text-xs font-semibold px-3 py-1.5 hover:opacity-90"
          >
            <MicOff className="w-3.5 h-3.5" />
            Stop
          </button>
        ) : (
          <button
            type="button"
            onClick={start}
            className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--kuja-clay))] text-white text-xs font-semibold px-3 py-1.5 hover:opacity-90"
          >
            <Mic className="w-3.5 h-3.5" />
            Start speaking
          </button>
        )}
        {recording && (
          <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[hsl(var(--kuja-flag))] animate-pulse" />
            Listening — your words append to the field
          </span>
        )}
        {interim && (
          <span className="text-[11px] text-muted-foreground italic truncate">
            …{interim}
          </span>
        )}
      </div>

      {error && (
        <div className="text-[11px] text-[hsl(var(--kuja-flag))]">{error}</div>
      )}
      <p className="text-[10px] text-muted-foreground">
        Browser speech recognition. Stays on-device for English / French / Spanish /
        Arabic / Swahili; Somali falls back to typed input.
      </p>
    </div>
  );
}
