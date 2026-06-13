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
import { AIStatusNotice } from '@/components/shared/ai-status-notice';

// Phase 94 — same language quality metadata as VoiceReportComposer.
const LANGS: Array<{
  code: string; label: string;
  speechQuality: 'good' | 'fair' | 'unsupported';
}> = [
  { code: 'en-US', label: 'English',   speechQuality: 'good' },
  { code: 'fr-FR', label: 'Français',  speechQuality: 'good' },
  { code: 'es-ES', label: 'Español',   speechQuality: 'good' },
  { code: 'ar-SA', label: 'العربية',   speechQuality: 'fair' },
  { code: 'sw-KE', label: 'Kiswahili', speechQuality: 'fair' },
  { code: 'so-SO', label: 'Soomaali',  speechQuality: 'unsupported' },
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

  // Phase 94 — MediaRecorder audio backup (same pattern as
  // VoiceReportComposer). Captures the raw audio in parallel with
  // speech recognition so Somali / Firefox / Safari iOS users still
  // get a recording they can listen back and type from.
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [audioBlobUrl, setAudioBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => { try { recogRef.current?.stop(); } catch { /* ignore */ } };
  }, []);

  async function startAudioBackup(): Promise<boolean> {
    // Phase 94 — returns true only when MediaRecorder actually started.
    // Lets the caller stop pretending we're recording when the mic is
    // unavailable.
    if (typeof window === 'undefined' || !navigator.mediaDevices) return false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlobUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
      };
      mr.start();
      mediaRecorderRef.current = mr;
      return true;
    } catch {
      return false;
    }
  }

  async function startRecording() {
    const micOk = await startAudioBackup();

    const Ctor = getSpeechRecognition();
    if (!Ctor || lang.speechQuality === 'unsupported') {
      if (!micOk) {
        toast.error(
          'Microphone is not available — please grant mic permission, or type your declaration directly below.',
        );
        return;
      }
      toast.message(
        lang.speechQuality === 'unsupported'
          ? `Voice transcription isn't supported for ${lang.label} in this browser. Your audio is being recorded — listen back and type below.`
          : 'Voice transcription isn\'t supported on this browser. Your audio is being recorded — listen back and type below.',
      );
      setRecording(true);
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
      if (!micOk) {
        toast.error((e as Error).message || 'Microphone is not available — please grant permission or type below.');
        return;
      }
      toast.message(
        'Live transcription unavailable — your audio is still recording. Listen back and type below.',
      );
      setRecording(true);
    }
  }

  function stopRecording() {
    try { recogRef.current?.stop(); } catch { /* ignore */ }
    try { mediaRecorderRef.current?.stop(); } catch { /* ignore */ }
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

        {/* Phase 94 — proactive language warnings + audio backup. Same
            treatment as Phase 71's voice-to-report. */}
        {!sttSupported && (
          <AIStatusNotice
            kind="unsupported_input"
            title="Voice transcription isn't available in this browser"
            body="Your browser doesn't support live voice transcription. Type your description below — or tap Record to capture audio you can listen back to."
          />
        )}
        {sttSupported && lang.speechQuality === 'unsupported' && (
          <AIStatusNotice
            kind="unsupported_input"
            title={`Voice transcription isn't supported for ${lang.label}`}
            body="Audio will still be recorded — listen back and type below, or switch to English / French / Arabic for live transcription."
          />
        )}
        {sttSupported && lang.speechQuality === 'fair' && (
          <AIStatusNotice
            kind="experimental"
            title={`Voice transcription for ${lang.label} is experimental`}
            body="Quality varies. Speak slowly and clearly. Audio is recorded as backup so you can verify what was captured."
          />
        )}

        {/* Record toggle — always shown so the audio-backup path works
            even when speech recognition is unsupported. */}
        <div className="flex items-center gap-2">
          {!recording ? (
            <button
              type="button"
              onClick={startRecording}
              className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--kuja-clay))] text-white text-xs font-semibold px-3 py-1.5 hover:opacity-90"
            >
              <Mic className="w-3.5 h-3.5" /> {lang.speechQuality === 'unsupported' || !sttSupported ? 'Record audio (manual transcribe)' : 'Speak instead'}
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

        {/* Phase 94 — audio playback so the OB member can listen back
            and type for unsupported languages. */}
        {audioBlobUrl && !recording && (
          <div className="border border-border bg-muted/30 rounded-md p-2 space-y-1">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
              Your recording (replay to type from)
            </div>
            <audio src={audioBlobUrl} controls className="w-full" />
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
