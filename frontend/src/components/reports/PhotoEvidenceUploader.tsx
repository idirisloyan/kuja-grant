'use client';

/**
 * Phase 72 — Photo-as-evidence.
 *
 * NGO uploads a phone photo (attendance sheet, receipt, training session,
 * site visit) and Claude vision extracts structured data into the report.
 *
 * The capture="environment" attribute on the file input opens the phone's
 * rear camera directly on mobile browsers — so the field officer can
 * point-and-shoot from inside the app, no separate camera roll → upload
 * shuffle.
 *
 * Each photo_type sends a slightly different prompt server-side so the
 * extracted fields fit what that kind of photo actually contains.
 */

import { useState, useRef } from 'react';
import {
  Camera, FileImage, Loader2, AlertTriangle, CheckCircle2, X,
  Sparkles, Receipt, Users, MapPin, ClipboardList, ImagePlus,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { AIStatusNotice } from '@/components/shared/ai-status-notice';
import { useAiStatus } from '@/lib/hooks/use-ai-status';

type PhotoKind = 'attendance' | 'receipt' | 'training' | 'site_visit' | 'other';

const KINDS: { value: PhotoKind; label: string; hint: string; icon: typeof Camera }[] = [
  { value: 'attendance', label: 'Attendance sheet', hint: 'List of who came',         icon: Users },
  { value: 'receipt',    label: 'Receipt / invoice', hint: 'Money spent',              icon: Receipt },
  { value: 'training',   label: 'Training photo',    hint: 'Workshop, demo, classroom', icon: ClipboardList },
  { value: 'site_visit', label: 'Site visit',        hint: 'A place you visited',       icon: MapPin },
  { value: 'other',      label: 'Other',             hint: 'Something else worth recording', icon: ImagePlus },
];

interface ExtractionResp {
  success: boolean;
  document_id?: number;
  extraction?: {
    kind: PhotoKind;
    extracted: Record<string, unknown>;
    narrative: string;
    confidence: number;
    warnings: string[];
    ai_used: boolean;
  };
  narrative?: string;
  confidence?: number;
  warnings?: string[];
  ai_used?: boolean;
  error?: string;
}

interface Props {
  reportId: number;
  onApplied?: () => void;
  className?: string;
}

export function PhotoEvidenceUploader({ reportId, onApplied, className = '' }: Props) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<PhotoKind>('attendance');
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ExtractionResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const aiStatus = useAiStatus();

  function onPick(f: File | null) {
    if (!f) return;
    if (!f.type.startsWith('image/')) {
      toast.error('Please pick a photo (jpg, png, webp).');
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      toast.error('Photo is larger than 5 MB. Try a lower-resolution shot.');
      return;
    }
    setFile(f);
    const url = URL.createObjectURL(f);
    setPreview(url);
    setResult(null);
    setError(null);
  }

  async function upload() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('photo_type', kind);
      const resp = await api.upload<ExtractionResp>(
        `/reports/${reportId}/photo-evidence`,
        fd,
      );
      if (!resp.success) {
        setError(resp.error || 'Upload failed.');
      } else {
        setResult(resp);
        onApplied?.();
        toast.success(
          resp.ai_used
            ? `Photo extracted (confidence ${resp.confidence ?? 0}/100). Review below.`
            : 'Photo attached.',
        );
      }
    } catch (e) {
      setError((e as Error).message || 'Could not upload.');
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--kuja-grow))]/30 bg-[hsl(var(--kuja-grow))]/5 px-3 py-1.5 text-xs font-medium text-[hsl(var(--kuja-grow))] hover:bg-[hsl(var(--kuja-grow))]/10 ${className}`}
        title="Take a photo of an attendance sheet, receipt, or training session — Kuja extracts the details."
      >
        <Camera className="h-3.5 w-3.5" /> Add photo evidence (Phase 72)
      </button>
    );
  }

  const ex = result?.extraction;

  return (
    <div className={`rounded-lg border border-[hsl(var(--kuja-grow))]/30 bg-card p-4 space-y-3 ${className}`}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Camera className="w-4 h-4 text-[hsl(var(--kuja-grow))]" />
          Photo evidence — point your phone, Kuja extracts the details
        </h3>
        <button type="button" onClick={() => { setOpen(false); reset(); }} className="text-muted-foreground hover:text-foreground" aria-label="Close photo composer">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Phase 95 — global AI service availability. Photo upload still
          works (file gets saved + attached), but the extraction step
          won't work until AI is back. */}
      {aiStatus.ready && aiStatus.isUnavailable && (
        <AIStatusNotice
          kind="unavailable"
          title="AI extraction is temporarily unavailable"
          body="You can still upload the photo — it'll be attached to your report as-is. You'll just need to type the details from the photo by hand. Try the extraction again later."
        />
      )}

      {/* Kind picker — chips */}
      <div className="flex flex-wrap gap-1.5">
        {KINDS.map((K) => {
          const Icon = K.icon;
          const active = K.value === kind;
          return (
            <button
              key={K.value}
              type="button"
              onClick={() => setKind(K.value)}
              className={
                'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] ' +
                (active
                  ? 'border-[hsl(var(--kuja-grow))] bg-[hsl(var(--kuja-grow))]/15 text-[hsl(var(--kuja-grow))] font-semibold'
                  : 'border-border text-muted-foreground hover:text-foreground')
              }
            >
              <Icon className="w-3 h-3" /> {K.label}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground">
        {KINDS.find((K) => K.value === kind)?.hint}
      </p>

      {/* File picker — capture="environment" opens phone rear camera */}
      <div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          onChange={(e) => onPick(e.target.files?.[0] ?? null)}
          className="block w-full text-xs text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-[hsl(var(--kuja-grow))]/10 file:text-[hsl(var(--kuja-grow))] file:font-semibold file:px-3 file:py-1.5 hover:file:bg-[hsl(var(--kuja-grow))]/20 cursor-pointer"
        />
        <div className="text-[10px] text-muted-foreground mt-1">
          Max 5 MB. On a phone, this opens the camera directly.
        </div>
      </div>

      {/* Preview */}
      {preview && (
        <div className="border border-border rounded-md p-2 bg-muted/30">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Preview" className="max-h-64 mx-auto rounded" />
        </div>
      )}

      {/* Actions */}
      {file && !result && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={upload}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--kuja-spark))] text-white text-xs font-semibold px-3 py-1.5 hover:opacity-90 disabled:opacity-50"
          >
            {busy
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Extracting…</>
              : <><Sparkles className="w-3.5 h-3.5" /> Extract details</>}
          </button>
          <button type="button" onClick={reset} className="text-[11px] text-muted-foreground hover:text-foreground underline">
            Pick a different photo
          </button>
        </div>
      )}

      {error && (
        <div className="border border-destructive/30 bg-destructive/10 text-destructive rounded-md px-3 py-2 text-xs flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Extracted data preview */}
      {result?.success && ex && (
        <div className="space-y-3 border-t border-border pt-3">
          {/* Phase 93 — prominent low-confidence callout when extraction
              is unreliable. Handwritten attendance sheets + low-quality
              photos typically score < 50; the user must manually verify
              every field. The photo itself is always attached even if
              extraction fails entirely. */}
          {ex.confidence < 50 && (
            <AIStatusNotice
              kind="low_confidence"
              title="AI couldn't read this photo clearly"
              body={`Confidence is ${ex.confidence}/100 — common for handwritten sheets, photos with glare, or angled shots. The photo IS saved and attached to your report. Type the details by hand into your report sections, or retake the photo with better light.`}
            />
          )}
          {ex.confidence >= 50 && ex.confidence < 70 && (
            <AIStatusNotice
              kind="experimental"
              title={`AI read this with ${ex.confidence}/100 confidence`}
              body="Some fields may be approximate. Review the extracted fields below and edit anything that looks wrong before adding to your report."
            />
          )}
          {!ex.ai_used && (
            <AIStatusNotice
              kind="unavailable"
              title="AI extraction wasn't available"
              body="The photo is saved and attached to your report. To get fields extracted, type them by hand or retry when AI is available again."
            />
          )}

          {ex.narrative && (
            <div className="text-xs leading-relaxed border border-[hsl(var(--kuja-spark-soft))] bg-[hsl(var(--kuja-spark-soft))] rounded-md px-3 py-2">
              <div className="font-semibold mb-1 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-[hsl(var(--kuja-spark))]" /> Saved + attached
              </div>
              <div className="whitespace-pre-wrap">{ex.narrative}</div>
              <div className="mt-1.5 text-[10px] text-muted-foreground">
                Confidence: {ex.confidence}/100
              </div>
            </div>
          )}

          {/* Pretty-printed extracted fields */}
          {ex.extracted && Object.keys(ex.extracted).length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground select-none">
                Extracted fields (click to expand)
              </summary>
              <pre className="mt-2 text-[10px] leading-snug bg-muted/50 p-2 rounded overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(ex.extracted, null, 2)}
              </pre>
            </details>
          )}

          {/* Warnings (legibility / unread fields) */}
          {(ex.warnings || []).length > 0 && (
            <div className="border border-[hsl(var(--kuja-sun))]/30 bg-[hsl(var(--kuja-sun))]/10 text-[hsl(var(--kuja-sun))] rounded-md px-3 py-2 text-xs">
              <div className="font-semibold mb-1">Things to double-check:</div>
              <ul className="list-disc ml-4 space-y-0.5">
                {ex.warnings.slice(0, 5).map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}

          <button type="button" onClick={reset} className="text-[11px] text-muted-foreground hover:text-foreground underline">
            Add another photo
          </button>
        </div>
      )}
    </div>
  );
}
