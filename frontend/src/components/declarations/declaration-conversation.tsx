'use client';

/**
 * Phase 79 — Declaration-as-conversation.
 *
 * Alternative entry mode for the DeclarationWizard. The OB member
 * describes what's happening in their own words (typed OR voice memo
 * via Web Speech API) and Claude parses it into the structured
 * declaration shape, suggests a committee, and shows a confirmation
 * preview. The member can edit before submitting.
 *
 * Why: OB members in real crisis response are not form fillers.
 * They're operators reacting to a situation. Letting them describe
 * the situation in plain language and have the system structure it
 * matches how they actually think about the work.
 */

import { useEffect, useRef, useState } from 'react';
import {
  Mic, MicOff, Sparkles, Loader2, AlertTriangle, CheckCircle2,
  ChevronRight, Languages, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';

const LANGS = [
  { code: 'en-US', label: 'English' },
  { code: 'fr-FR', label: 'Français' },
  { code: 'ar-SA', label: 'العربية' },
  { code: 'sw-KE', label: 'Kiswahili' },
  { code: 'so-SO', label: 'Soomaali' },
  { code: 'es-ES', label: 'Español' },
];

interface ParsedDeclaration {
  success: boolean;
  title?: string;
  crisis_type?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  country?: string;
  proposed_total_amount?: number | null;
  currency?: string;
  summary?: string;
  suggested_committee?: number[];
  rationale?: string;
  confidence?: number;
  warnings?: string[];
  ai_used?: boolean;
}

interface Props {
  onParsed: (parsed: ParsedDeclaration) => void;
  onCancel: () => void;
  className?: string;
}

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

export function DeclarationConversation({ onParsed, onCancel, className = '' }: Props) {
  const [text, setText] = useState('');
  const [interim, setInterim] = useState('');
  const [lang, setLang] = useState(LANGS[0]);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ParsedDeclaration | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recogRef = useRef<SpeechRecognitionLike | null>(null);
  const sttSupported = !!getSpeechRecognition();

  useEffect(() => {
    return () => { try { recogRef.current?.stop(); } catch { /* ignore */ } };
  }, []);

  function startRecording() {
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      toast.error('Voice input not supported on this browser. Type your description instead.');
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
        const t = res[0].transcript;
        if (res.isFinal) finalChunk += t + ' ';
        else interimChunk += t;
      }
      if (finalChunk) setText((p) => (p + ' ' + finalChunk).trim());
      setInterim(interimChunk);
    };
    r.onerror = (ev) => {
      if (ev.error !== 'no-speech' && ev.error !== 'aborted') {
        toast.error(`Voice input error: ${ev.error}.`);
      }
    };
    r.onend = () => setRecording(false);
    try {
      r.start();
      recogRef.current = r;
      setRecording(true);
    } catch (e) {
      toast.error((e as Error).message || 'Could not start the microphone.');
    }
  }

  function stopRecording() {
    try { recogRef.current?.stop(); } catch { /* ignore */ }
    setRecording(false);
    setInterim('');
  }

  async function parse() {
    setBusy(true); setError(null); setResult(null);
    try {
      const resp = await api.post<ParsedDeclaration>(
        '/declarations/parse-narrative',
        { narrative: text.trim() },
      );
      if (!resp.success) {
        setError(((resp as unknown) as { error?: string }).error || 'Parse failed.');
      } else {
        setResult(resp);
      }
    } catch (e) {
      setError((e as Error).message || 'Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="border border-[hsl(var(--kuja-clay))]/30 bg-[hsl(var(--kuja-clay))]/5 rounded-lg p-4 space-y-3">
        <div className="flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-[hsl(var(--kuja-clay))] mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-sm">Describe what&apos;s happening — Kuja will structure it</h3>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              No forms to fill. Speak or type what you know. Kuja will pull out the
              crisis type, severity, country, proposed amount, and suggest an OB
              committee. You confirm before submitting.
            </p>
          </div>
          {onCancel && (
            <button type="button" onClick={onCancel} className="text-muted-foreground hover:text-foreground" aria-label="Close">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Language picker */}
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

        {/* Record toggle */}
        {sttSupported && (
          <div className="flex items-center gap-2">
            {!recording ? (
              <button
                type="button"
                onClick={startRecording}
                className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--kuja-clay))] text-white text-xs font-semibold px-3 py-1.5 hover:opacity-90"
              >
                <Mic className="w-3.5 h-3.5" /> Speak instead
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
              <span className="text-[11px] text-muted-foreground">Speak naturally. Tap Stop when done.</span>
            )}
          </div>
        )}

        <textarea
          rows={5}
          value={text + (interim ? ' ' + interim : '')}
          onChange={(e) => { setText(e.target.value); setInterim(''); }}
          placeholder="e.g. There is a severe drought unfolding in Turkana County. Three sub-counties are affected. We are estimating ~$500,000 USD to respond over the next 3 months. The affected population is mostly pastoralist; livestock losses are already significant."
          className="w-full text-sm border border-input rounded-md p-2 bg-background"
        />
        <div className="text-[10px] text-muted-foreground">
          {text.length} characters · max 6,000 sent to AI
        </div>

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={parse}
            disabled={busy || text.trim().length < 15}
            className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--kuja-spark))] text-white text-xs font-semibold px-3 py-1.5 hover:opacity-90 disabled:opacity-50"
          >
            {busy
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Parsing…</>
              : <><Sparkles className="w-3.5 h-3.5" /> Parse into declaration</>}
          </button>
        </div>

        {error && (
          <div className="border border-destructive/30 bg-destructive/10 text-destructive rounded-md px-3 py-2 text-xs flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Result preview */}
      {result?.success && (
        <div className="border border-[hsl(var(--kuja-grow))]/30 bg-card rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[hsl(var(--kuja-grow))]" />
              Parsed draft · confidence {result.confidence ?? 0}/100
            </h3>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
            <Field label="Title" value={result.title} />
            <Field label="Crisis type" value={result.crisis_type} />
            <Field label="Severity" value={result.severity} />
            <Field label="Country" value={result.country} />
            <Field
              label="Proposed amount"
              value={
                result.proposed_total_amount != null
                  ? `${(result.proposed_total_amount).toLocaleString()} ${result.currency ?? ''}`.trim()
                  : '—'
              }
            />
            <Field
              label="Suggested committee"
              value={result.suggested_committee?.length
                ? `${result.suggested_committee.length} member${result.suggested_committee.length === 1 ? '' : 's'}`
                : '—'}
            />
          </div>

          {result.summary && (
            <div className="text-xs leading-relaxed border-l-2 border-[hsl(var(--kuja-clay))] pl-3 text-foreground">
              {result.summary}
            </div>
          )}

          {result.rationale && (
            <div className="text-[11px] text-muted-foreground italic">
              <strong className="text-foreground">Committee rationale:</strong> {result.rationale}
            </div>
          )}

          {(result.warnings ?? []).length > 0 && (
            <ul className="text-[11px] border border-[hsl(var(--kuja-sun))]/30 bg-[hsl(var(--kuja-sun))]/10 rounded-md px-3 py-2 space-y-0.5">
              {result.warnings!.map((w, i) => (
                <li key={i} className="text-[hsl(var(--kuja-sun))]">⚠︎ {w}</li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={() => onParsed(result)}
              className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--kuja-clay))] text-white text-xs font-semibold px-3 py-1.5 hover:opacity-90"
            >
              <ChevronRight className="w-3.5 h-3.5" /> Use this draft — go to Confirm
            </button>
            <button
              type="button"
              onClick={() => { setResult(null); }}
              className="text-[11px] text-muted-foreground hover:text-foreground underline"
            >
              Edit description and re-parse
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="border border-border rounded-md p-2">
      <div className="text-[9px] uppercase tracking-wide text-muted-foreground font-semibold">{label}</div>
      <div className="font-semibold text-sm mt-0.5 capitalize">{value || '—'}</div>
    </div>
  );
}
