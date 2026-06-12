'use client';

/**
 * Phase 71 — Voice-to-report.
 *
 * NGO program officer records a 5-minute voice memo about what happened
 * this period (in any of the 6 supported languages), the browser
 * transcribes it via Web Speech API, and Claude maps the transcript
 * onto the donor&apos;s reporting requirements. The NGO becomes an editor,
 * not an author.
 *
 * Why this matters: the 4-hour Excel-and-PDF dance to write a quarterly
 * report is the single biggest reason reports are late or skipped in the
 * Global South. A 5-minute voice memo + AI structuring drops the effort
 * by roughly 90%.
 *
 * Network resilience: the transcript is held in state. If the user loses
 * connectivity mid-recording, the text is still there. The "Use this
 * draft" submit happens against a server endpoint that merges with any
 * existing draft content rather than overwriting (so a half-formed
 * voice draft + a typed paragraph compose, instead of fighting).
 *
 * Languages: Web Speech API supports BCP-47 locales. We expose the six
 * platform languages explicitly so the NGO can choose, and pass the
 * choice on to Claude for prompt phrasing preservation.
 */

import { useState, useRef, useEffect } from 'react';
import {
  Mic, MicOff, Sparkles, Loader2, CheckCircle2, AlertTriangle,
  Languages, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';

// --------------------------------------------------------------------------
// Locale set — six platform languages with BCP-47 codes that the Web Speech
// API understands. The "label" is in-language so the chooser is recognisable
// without translation work.
// --------------------------------------------------------------------------

const LANGS = [
  { code: 'en-US', label: 'English',  short: 'en' },
  { code: 'fr-FR', label: 'Français', short: 'fr' },
  { code: 'ar-SA', label: 'العربية',  short: 'ar' },
  { code: 'sw-KE', label: 'Kiswahili', short: 'sw' },
  { code: 'so-SO', label: 'Soomaali', short: 'so' },
  { code: 'es-ES', label: 'Español',  short: 'es' },
];

interface CoverageItem {
  key: string;
  label: string;
  status: 'covered' | 'partial' | 'missing';
  hint?: string;
}

interface StructureResp {
  success: boolean;
  content?: Record<string, string>;
  coverage?: CoverageItem[];
  summary?: string;
  missing?: string[];
  ai_used?: boolean;
  error?: string;
}

interface Props {
  reportId: number;
  onApplied?: () => void;
  className?: string;
}

// Browser-side Web Speech detection — only Chromium browsers ship this
// today; gracefully degrades into typed input on Firefox / Safari iOS.
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((ev: { resultIndex: number; results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean; length: number }> }) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
}

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function VoiceReportComposer({ reportId, onApplied, className = '' }: Props) {
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState(LANGS[0]);
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<StructureResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recogRef = useRef<SpeechRecognitionLike | null>(null);
  const sttSupported = !!getSpeechRecognition();

  // Stop any in-flight recognition if the component unmounts.
  useEffect(() => {
    return () => {
      try { recogRef.current?.stop(); } catch { /* ignore */ }
    };
  }, []);

  function startRecording() {
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      toast.error('Your browser does not support voice input. Please type your memo into the box below.');
      return;
    }
    const r = new Ctor();
    r.lang = lang.code;
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (ev) => {
      let finalChunk = '';
      let interimChunk = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i];
        const txt = res[0].transcript;
        if (res.isFinal) finalChunk += txt + ' ';
        else interimChunk += txt;
      }
      if (finalChunk) {
        setTranscript((prev) => (prev + ' ' + finalChunk).trim());
      }
      setInterim(interimChunk);
    };
    r.onerror = (ev) => {
      // 'no-speech' fires on natural pauses and is harmless; suppress.
      if (ev.error !== 'no-speech' && ev.error !== 'aborted') {
        toast.error(`Voice input error: ${ev.error}. You can keep typing instead.`);
      }
    };
    r.onend = () => setRecording(false);
    try {
      r.start();
      setRecording(true);
      recogRef.current = r;
    } catch (e) {
      toast.error((e as Error).message || 'Could not start the microphone.');
    }
  }

  function stopRecording() {
    try { recogRef.current?.stop(); } catch { /* ignore */ }
    setRecording(false);
    setInterim('');
  }

  async function structure() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const resp = await api.post<StructureResp>(
        `/reports/${reportId}/structure-from-voice`,
        { transcript: transcript.trim(), language: lang.short },
      );
      if (!resp.success) {
        setError(resp.error || 'AI structuring failed.');
      } else {
        setResult(resp);
        onApplied?.();
        toast.success(resp.ai_used
          ? 'Voice memo structured into your report. Review each section below.'
          : 'Transcript saved into your report draft.');
      }
    } catch (e) {
      setError((e as Error).message || 'Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setTranscript('');
    setInterim('');
    setResult(null);
    setError(null);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--kuja-clay))]/30 bg-[hsl(var(--kuja-clay))]/5 px-3 py-1.5 text-xs font-medium text-[hsl(var(--kuja-clay))] hover:bg-[hsl(var(--kuja-clay))]/10 ${className}`}
        title="Record a voice memo and let Kuja structure it into the donor&apos;s reporting framework."
      >
        <Mic className="h-3.5 w-3.5" /> Voice draft (Phase 71)
      </button>
    );
  }

  // Tone helpers shared with status-copy semantics.
  const STATUS_TONE: Record<CoverageItem['status'], string> = {
    covered: 'border-[hsl(var(--kuja-grow))]/30 bg-[hsl(var(--kuja-grow))]/10 text-[hsl(var(--kuja-grow))]',
    partial: 'border-[hsl(var(--kuja-sun))]/30 bg-[hsl(var(--kuja-sun))]/10 text-[hsl(var(--kuja-sun))]',
    missing: 'border-destructive/30 bg-destructive/10 text-destructive',
  };

  return (
    <div className={`rounded-lg border border-[hsl(var(--kuja-clay))]/30 bg-card p-4 space-y-3 ${className}`}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Mic className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
          Voice draft — talk for 5 minutes, let Kuja write
        </h3>
        <button type="button" onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground" aria-label="Close voice composer">
          <X className="w-4 h-4" />
        </button>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        Tell us what happened this period — beneficiaries, activities, money spent,
        challenges. Speak in your own language. Kuja will organise your words into the
        donor&apos;s report sections. You&apos;ll review and edit before submitting.
      </p>

      {/* Language chooser — explicit, in-language labels. */}
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <Languages className="w-3.5 h-3.5 text-muted-foreground" />
        {LANGS.map((L) => (
          <button
            key={L.code}
            type="button"
            onClick={() => setLang(L)}
            disabled={recording}
            className={
              'px-2 py-0.5 rounded-full border text-[11px] ' +
              (L.code === lang.code
                ? 'border-[hsl(var(--kuja-clay))] bg-[hsl(var(--kuja-clay))]/15 text-[hsl(var(--kuja-clay))] font-semibold'
                : 'border-border text-muted-foreground hover:text-foreground')
            }
          >
            {L.label}
          </button>
        ))}
      </div>

      {!sttSupported && (
        <div className="border border-[hsl(var(--kuja-sun))]/30 bg-[hsl(var(--kuja-sun))]/10 text-[hsl(var(--kuja-sun))] rounded-md px-3 py-2 text-xs">
          Your browser doesn&apos;t support voice input. You can still type your memo below
          and Kuja will structure it. (Chrome and Edge support voice input.)
        </div>
      )}

      {/* Record / stop controls */}
      {sttSupported && (
        <div className="flex items-center gap-2">
          {!recording ? (
            <button
              type="button"
              onClick={startRecording}
              className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--kuja-clay))] text-white text-xs font-semibold px-3 py-1.5 hover:opacity-90"
            >
              <Mic className="w-3.5 h-3.5" /> Start recording
            </button>
          ) : (
            <button
              type="button"
              onClick={stopRecording}
              className="inline-flex items-center gap-1.5 rounded-md bg-destructive text-white text-xs font-semibold px-3 py-1.5 hover:opacity-90 animate-pulse"
            >
              <MicOff className="w-3.5 h-3.5" /> Stop recording
            </button>
          )}
          {recording && (
            <span className="text-[11px] text-muted-foreground">
              Speak naturally. Pauses are fine. Tap Stop when you&apos;re done.
            </span>
          )}
        </div>
      )}

      {/* Editable transcript — user can correct what speech recognition heard,
          or paste from elsewhere. */}
      <div>
        <label className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold block mb-1">
          What you said (you can edit before sending)
        </label>
        <textarea
          value={transcript + (interim ? ' ' + interim : '')}
          onChange={(e) => { setTranscript(e.target.value); setInterim(''); }}
          rows={6}
          placeholder="e.g. We trained 47 women in maize processing in Garissa County over three months. Three trainers were involved. We spent 580,000 KES. Two women had to drop out because of family obligations."
          className="w-full text-sm border border-input rounded-md p-2 bg-background"
        />
        <div className="text-[10px] text-muted-foreground mt-1">
          {transcript.length} characters · max 12,000 sent to AI
        </div>
      </div>

      {/* Action row */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={structure}
          disabled={busy || transcript.trim().length < 10}
          className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--kuja-spark))] text-white text-xs font-semibold px-3 py-1.5 hover:opacity-90 disabled:opacity-50"
        >
          {busy
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Structuring with Kuja…</>
            : <><Sparkles className="w-3.5 h-3.5" /> Structure into donor&apos;s sections</>}
        </button>
        {transcript && (
          <button type="button" onClick={reset} className="text-[11px] text-muted-foreground hover:text-foreground underline">
            Clear and start over
          </button>
        )}
      </div>

      {error && (
        <div className="border border-destructive/30 bg-destructive/10 text-destructive rounded-md px-3 py-2 text-xs flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Coverage report — surface what was captured and what still needs
          a follow-up sentence. This is the "coach" moment: instead of just
          saving a draft, we tell the NGO what's still thin and ask one
          plain-language follow-up per gap. */}
      {result && result.success && (
        <div className="space-y-3 border-t border-border pt-3">
          {result.summary && (
            <div className="text-xs leading-relaxed border border-[hsl(var(--kuja-spark-soft))] bg-[hsl(var(--kuja-spark-soft))] rounded-md px-3 py-2">
              <div className="font-semibold mb-1 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-[hsl(var(--kuja-spark))]" /> Saved to your draft
              </div>
              {result.summary}
            </div>
          )}
          {(result.coverage || []).length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                Section-by-section coverage
              </div>
              <ul className="space-y-1.5">
                {result.coverage!.map((c) => (
                  <li key={c.key} className={`border rounded-md px-3 py-2 text-xs flex items-start justify-between gap-2 ${STATUS_TONE[c.status]}`}>
                    <div className="min-w-0">
                      <div className="font-semibold">{c.label}</div>
                      {c.hint && (
                        <div className="mt-0.5 text-foreground/70 leading-relaxed">
                          {c.hint}
                        </div>
                      )}
                    </div>
                    <span className="capitalize text-[10px] shrink-0 font-semibold">
                      {c.status}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!result.ai_used && (
            <div className="text-[11px] text-muted-foreground italic">
              AI structuring wasn&apos;t available, so your transcript was saved into the first section. You can copy parts of it into the right sections by hand.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
