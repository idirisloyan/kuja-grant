"use client";

/**
 * VoiceQuestionInput — Phase 640 (June 2026).
 *
 * Sits next to each Y/N question in the Proximate endorsement wizard.
 * Low-literacy endorsers can tap "Record" and speak their reasoning
 * in Arabic / Sudanese Arabic; we POST the audio blob to
 * /api/whisper/transcribe and place the returned text into the
 * (always-visible) transcript box. The transcript travels with the
 * endorsement submission as q1_transcript / q2_transcript / etc.
 *
 * Stays usable without voice — the textarea is editable, and on
 * locked-down devices (no MediaRecorder) the record button just
 * doesn't render.
 *
 * Design notes:
 *  - Recording acquires the mic only when the button is tapped.
 *    Stream is released the moment the recorder stops.
 *  - We do NOT auto-stop. The user taps stop. Short voice notes are
 *    cheap; auto-stopping at silence is too lossy in noisy contexts.
 *  - Audio is NEVER stored — we only ship the transcript text. If the
 *    OB later needs the audio they can ask the endorser to re-record.
 */

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/hooks/use-translation";

type Props = {
  // 'q1' | 'q2' | 'q3' — used only for ARIA labelling.
  questionId: string;
  transcript: string;
  onTranscriptChange: (text: string) => void;
  // BCP-47 short code: 'ar' for Arabic, 'en' for English.
  language?: string;
};

export function VoiceQuestionInput({
  questionId,
  transcript,
  onTranscriptChange,
  language = "ar",
}: Props) {
  const { t } = useTranslation();
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canRecord, setCanRecord] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const supported =
      !!navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === "function" &&
      typeof window.MediaRecorder !== "undefined";
    setCanRecord(supported);
  }, []);

  // Release the mic if the component unmounts mid-recording.
  useEffect(() => {
    return () => {
      try {
        mediaRecorderRef.current?.stop();
      } catch {
        /* ignore */
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mr = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        if (blob.size === 0) return;
        await transcribe(blob);
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setIsRecording(true);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : t("proximate.voice.mic_error"),
      );
    }
  }

  function stop() {
    try {
      mediaRecorderRef.current?.stop();
    } catch {
      /* ignore */
    }
    setIsRecording(false);
  }

  async function transcribe(blob: Blob) {
    setIsTranscribing(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", blob, "voice-note.webm");
      fd.append("language", language);
      const resp = await api.upload<{
        success: boolean;
        text?: string;
        error?: string;
      }>("/whisper/transcribe", fd);
      if (resp.success && resp.text && resp.text.trim()) {
        // Append rather than replace — endorser may have started typing
        // before recording.
        const next = transcript.trim()
          ? `${transcript.trim()}\n${resp.text.trim()}`
          : resp.text.trim();
        onTranscriptChange(next);
      } else {
        setError(resp.error || t("proximate.voice.transcribe_failed"));
      }
    } catch {
      setError(t("proximate.voice.transcribe_failed"));
    } finally {
      setIsTranscribing(false);
    }
  }

  const recordLabel = isRecording
    ? t("proximate.voice.stop")
    : t("proximate.voice.record");

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        {canRecord && (
          <Button
            type="button"
            size="sm"
            variant={isRecording ? "destructive" : "outline"}
            onClick={isRecording ? stop : start}
            disabled={isTranscribing}
            aria-label={`${recordLabel} — ${questionId}`}
          >
            {isRecording ? (
              <span className="flex items-center gap-2">
                <span
                  className="inline-block h-2 w-2 rounded-full bg-current animate-pulse"
                  aria-hidden
                />
                {recordLabel}
              </span>
            ) : (
              <span>🎤 {recordLabel}</span>
            )}
          </Button>
        )}
        {isTranscribing && (
          <span className="text-xs text-muted-foreground">
            {t("proximate.voice.transcribing")}
          </span>
        )}
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
      <textarea
        className="w-full text-sm rounded-md border bg-background p-2 min-h-[64px]"
        placeholder={t("proximate.voice.placeholder")}
        value={transcript}
        onChange={(e) => onTranscriptChange(e.target.value)}
        rows={3}
        aria-label={`${t("proximate.voice.transcript")} — ${questionId}`}
      />
    </div>
  );
}
