'use client';

/**
 * 90-day outcome attestation page — Phase 679 (June 2026).
 *
 * Partner returns here ~90 days after a disbursement closed:
 *   /proximate-outcome?t=<token>
 *
 * Token-credentialed, same dual-auth pattern as Phase 652
 * /proximate-report. Three short questions designed to capture
 * SUSTAINED impact, not narrative — Adeso wants to measure whether
 * the money actually helped 3 months out, not produce another report.
 */

import { useEffect, useRef, useState } from 'react';
import { Loader2, CheckCircle2, Send, Camera, Mic, X } from 'lucide-react';
import { useTranslation } from '@/lib/hooks/use-translation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  OfflineFallbackCard,
  ReassuranceNote,
  VoicePlayback,
  EffortBadges,
  DraftRestoredNote,
  useLocalDraft,
} from '@/components/proximate/token-page-support';

// NOTE: AssistedByField is deliberately NOT used here. The outcome
// endpoint has no assisted_by column and ignores unknown keys, so the
// field would collect a name and silently drop it — the exact failure
// mode this codebase has shipped twice. Add the column first.

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || '').replace(/\/$/, '');

interface OutcomeMeta {
  id: number;
  // PRX-OUTCOME-002 — true while the parent report is flagged; the
  // attestation form is replaced by a "paused" notice and the server
  // rejects submissions (409).
  paused?: boolean;
  status: string;
  due_at: string | null;
  spawned_at: string | null;
  submitted_at: string | null;
  answers: Record<string, unknown>;
  voice_transcript: string | null;
  ack_message: string | null;
  ack_message_at: string | null;
  partner_name: string | null;
  disbursement_amount_usd: number | null;
  disbursement_sent_at: string | null;
  disbursement_purpose: string | null;
}

export default function ProximateOutcomePage() {
  const { t } = useTranslation();
  const [token, setToken] = useState<string | null>(null);
  const [meta, setMeta] = useState<OutcomeMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [stillInState, setStillInState] = useState('');
  const [totalIntended, setTotalIntended] = useState('');
  const [sustained, setSustained] = useState('');
  const [notSustained, setNotSustained] = useState('');
  const [counterfactual, setCounterfactual] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const [photoDocId, setPhotoDocId] = useState<number | null>(null);
  const [voiceDocId, setVoiceDocId] = useState<number | null>(null);
  // Local copy of the recording so the partner can hear it back before
  // sending. Never submitted — voiceDocId is what the payload carries.
  const [voiceFile, setVoiceFile] = useState<File | null>(null);
  const [uploadingKind, setUploadingKind] = useState<'photo' | 'voice' | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const voiceInputRef = useRef<HTMLInputElement>(null);

  // Keyed on the attestation id, never the token. Without this the
  // "you can come back later" line in ReassuranceNote would be a lie —
  // this form has no server-side draft.
  const draftKey = meta?.id != null ? `outcome:${meta.id}` : null;
  const { restored, clear: clearDraft } = useLocalDraft(
    draftKey,
    { stillInState, totalIntended, sustained, notSustained, counterfactual,
      photoDocId, voiceDocId },
    (saved) => {
      if (saved.stillInState !== undefined) setStillInState(saved.stillInState);
      if (saved.totalIntended !== undefined) setTotalIntended(saved.totalIntended);
      if (saved.sustained !== undefined) setSustained(saved.sustained);
      if (saved.notSustained !== undefined) setNotSustained(saved.notSustained);
      if (saved.counterfactual !== undefined) setCounterfactual(saved.counterfactual);
      if (saved.photoDocId !== undefined) setPhotoDocId(saved.photoDocId);
      if (saved.voiceDocId !== undefined) setVoiceDocId(saved.voiceDocId);
    },
  );

  useEffect(() => {
    const url = new URL(window.location.href);
    const tk = url.searchParams.get('t');
    if (!tk) {
      setLoadError(t('proximate.outcome.missing_token'));
      setLoading(false);
      return;
    }
    setToken(tk);
    fetch(`${API_BASE}/api/proximate/outcome-attestations/${encodeURIComponent(tk)}`, {
      headers: { 'X-Network-Override': 'proximate' },
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok || !data.success) {
          setLoadError(data.error || t('proximate.outcome.load_failed'));
        } else {
          setMeta(data.outcome);
          if (data.outcome?.submitted_at) setSubmitted(true);
        }
      })
      .catch(() => setLoadError(t('proximate.outcome.load_failed')))
      .finally(() => setLoading(false));
  }, [t]);

  async function uploadAttachment(kind: 'photo' | 'voice', file: File) {
    setUploadError(null);
    setUploadingKind(kind);
    try {
      const fd = new FormData();
      fd.append('kind', kind);
      fd.append('file', file);
      const res = await fetch(
        `${API_BASE}/api/proximate/outcome-attestations/${encodeURIComponent(token!)}/attachment`,
        {
          method: 'POST',
          headers: { 'X-Network-Override': 'proximate' },
          body: fd,
        }
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        setUploadError(data.error || t('proximate.outcome.upload_failed'));
      } else if (kind === 'photo') {
        setPhotoDocId(data.document_id);
      } else {
        setVoiceDocId(data.document_id);
      }
    } catch {
      setUploadError(t('proximate.outcome.upload_failed'));
    } finally {
      setUploadingKind(null);
    }
  }

  async function submit() {
    setSubmitError(null);
    setSubmitting(true);
    try {
      const r = await fetch(
        `${API_BASE}/api/proximate/outcome-attestations/${encodeURIComponent(token!)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Network-Override': 'proximate',
          },
          body: JSON.stringify({
            still_in_state_n: stillInState ? parseInt(stillInState, 10) : null,
            total_intended_n: totalIntended ? parseInt(totalIntended, 10) : null,
            sustained: sustained.trim() || null,
            not_sustained: notSustained.trim() || null,
            counterfactual_reflection: counterfactual.trim() || null,
            voice_doc_id: voiceDocId,
            photo_doc_id: photoDocId,
          }),
        }
      );
      const data = await r.json();
      if (!r.ok || !data.success) {
        setSubmitError(data.error || t('proximate.outcome.submit_failed'));
      } else {
        // Only once the server has it — a draft cleared on a failed send
        // loses the answers the partner is about to retry.
        clearDraft();
        setSubmitted(true);
      }
    } catch {
      setSubmitError(t('proximate.outcome.submit_failed'));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-4 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-background p-4 sm:p-6 lg:p-8">
        <div className="max-w-2xl mx-auto">
          <Card className="p-6 text-center">
            <p className="text-sm text-red-600">{loadError}</p>
          </Card>
        </div>
      </div>
    );
  }

  if (meta?.paused && !submitted) {
    return (
      <div className="min-h-screen bg-background p-4 sm:p-6 lg:p-8">
        <div className="max-w-2xl mx-auto">
          <Card className="p-8 text-center border-amber-300 bg-amber-50 dark:bg-amber-950/30">
            <h1 className="text-xl kuja-display mb-2 text-amber-900 dark:text-amber-200">
              {t('proximate.outcome.paused_title')}
            </h1>
            <p className="text-sm text-amber-800 dark:text-amber-300">
              {t('proximate.outcome.paused_body')}
            </p>
          </Card>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-background p-4 sm:p-6 lg:p-8">
        <div className="max-w-2xl mx-auto space-y-4">
          <Card className="p-8 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto mb-4" />
            <h1 className="text-2xl kuja-display mb-2">
              {t('proximate.outcome.thanks_title')}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t('proximate.outcome.thanks_body')}
            </p>
          </Card>
          {meta?.ack_message && (
            <Card className="p-5 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800">
              <h2 className="text-sm font-medium mb-2">
                {t('proximate.outcome.ack_from_adeso')}
              </h2>
              <p className="text-sm whitespace-pre-wrap">{meta.ack_message}</p>
              {meta.ack_message_at && (
                <p className="text-xs text-muted-foreground mt-2">
                  {new Date(meta.ack_message_at).toLocaleString()}
                </p>
              )}
            </Card>
          )}
          {/* Still useful after sending: the reference the partner quotes
              if they need to ask us anything about this attestation. */}
          {meta?.id != null && <OfflineFallbackCard code={`OA-${meta.id}`} />}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 lg:p-8">
      <div className="max-w-2xl mx-auto space-y-4">
        <header>
          <h1 className="text-2xl kuja-display mb-1">
            {t('proximate.outcome.title')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('proximate.outcome.subtitle')}
          </p>
          {meta && (
            <p className="text-sm text-muted-foreground mt-2">
              {meta.partner_name && <span>{meta.partner_name} · </span>}
              {meta.disbursement_amount_usd && (
                <span>${meta.disbursement_amount_usd.toLocaleString()}</span>
              )}
              {meta.disbursement_sent_at && (
                <span>
                  {' '}
                  · {t('proximate.outcome.disbursed_on')}{' '}
                  {new Date(meta.disbursement_sent_at).toLocaleDateString()}
                </span>
              )}
            </p>
          )}
          <EffortBadges className="mt-3" />
          {restored && <DraftRestoredNote className="mt-2" />}
        </header>

        <Card className="p-6 space-y-5">
          {/* Q1 — still in the same state today */}
          <div>
            <label className="block text-sm font-medium mb-2">
              1. {t('proximate.outcome.q1_still_in_state')}
            </label>
            <p className="text-xs text-muted-foreground mb-2">
              {t('proximate.outcome.q1_hint')}
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="number"
                min={0}
                value={stillInState}
                onChange={(e) => setStillInState(e.target.value)}
                className="w-28 h-10 px-3 text-sm bg-background border border-border rounded-md"
                placeholder="0"
                aria-label={t('proximate.outcome.q1_still_in_state')}
              />
              <span className="text-sm text-muted-foreground">
                {t('proximate.outcome.q1_of')}
              </span>
              <input
                type="number"
                min={0}
                value={totalIntended}
                onChange={(e) => setTotalIntended(e.target.value)}
                className="w-28 h-10 px-3 text-sm bg-background border border-border rounded-md"
                placeholder="0"
                aria-label={t('proximate.outcome.q1_total_intended')}
              />
            </div>
          </div>

          {/* Q2 — what sustained */}
          <div>
            <label className="block text-sm font-medium mb-2">
              2. {t('proximate.outcome.q2_sustained')}
            </label>
            <textarea
              value={sustained}
              onChange={(e) => setSustained(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md"
              rows={3}
              maxLength={5000}
              placeholder={t('proximate.outcome.q2_placeholder')}
            />
          </div>

          {/* Q3 — what did NOT sustain */}
          <div>
            <label className="block text-sm font-medium mb-2">
              3. {t('proximate.outcome.q3_not_sustained')}
            </label>
            <textarea
              value={notSustained}
              onChange={(e) => setNotSustained(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md"
              rows={3}
              maxLength={5000}
              placeholder={t('proximate.outcome.q3_placeholder')}
            />
          </div>

          {/* Q4 — counterfactual reflection (optional but valuable) */}
          <div>
            <label className="block text-sm font-medium mb-2">
              4. {t('proximate.outcome.q4_counterfactual')} {t('proximate.outcome.optional')}
            </label>
            <p className="text-xs text-muted-foreground mb-2">
              {t('proximate.outcome.q4_counterfactual_hint')}
            </p>
            <textarea
              value={counterfactual}
              onChange={(e) => setCounterfactual(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md"
              rows={3}
              maxLength={5000}
              placeholder={t('proximate.outcome.q4_counterfactual_placeholder')}
            />
          </div>

          {/* Q5 — Photo + voice (optional) */}
          <div>
            <label className="block text-sm font-medium mb-2">
              5. {t('proximate.outcome.q4_evidence')} {t('proximate.outcome.optional')}
            </label>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadAttachment('photo', f);
                e.target.value = '';
              }}
            />
            <input
              ref={voiceInputRef}
              type="file"
              accept="audio/*"
              capture="user"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setVoiceFile(f);
                  uploadAttachment('voice', f);
                }
                e.target.value = '';
              }}
            />
            <div className="flex gap-2 flex-wrap">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => photoInputRef.current?.click()}
                disabled={uploadingKind !== null}
              >
                {uploadingKind === 'photo' ? (
                  <Loader2 className="w-4 h-4 me-1 animate-spin" />
                ) : (
                  <Camera className="w-4 h-4 me-1" />
                )}
                {photoDocId
                  ? t('proximate.outcome.q4_photo_replace')
                  : t('proximate.outcome.q4_photo_add')}
              </Button>
              {photoDocId !== null && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setPhotoDocId(null)}
                >
                  <X className="w-3.5 h-3.5 me-1" />
                  {t('proximate.outcome.q4_remove')}
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => voiceInputRef.current?.click()}
                disabled={uploadingKind !== null}
              >
                {uploadingKind === 'voice' ? (
                  <Loader2 className="w-4 h-4 me-1 animate-spin" />
                ) : (
                  <Mic className="w-4 h-4 me-1" />
                )}
                {voiceDocId
                  ? t('proximate.outcome.q4_voice_replace')
                  : t('proximate.outcome.q4_voice_add')}
              </Button>
              {voiceDocId !== null && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setVoiceDocId(null);
                    setVoiceFile(null);
                  }}
                >
                  <X className="w-3.5 h-3.5 me-1" />
                  {t('proximate.outcome.q4_remove')}
                </Button>
              )}
            </div>

            {/* Hear it back before sending — plays the local file. */}
            <VoicePlayback file={voiceFile} />

            {uploadError && (
              <p className="text-xs text-red-600 mt-2">{uploadError}</p>
            )}
          </div>

          {submitError && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {submitError}
            </div>
          )}

          <Button onClick={submit} disabled={submitting} className="w-full">
            {submitting ? (
              <Loader2 className="w-4 h-4 me-2 animate-spin" />
            ) : (
              <Send className="w-4 h-4 me-2" />
            )}
            {t('proximate.outcome.submit')}
          </Button>
        </Card>

        <ReassuranceNote variant="outcome" />
        {meta?.id != null && <OfflineFallbackCard code={`OA-${meta.id}`} />}
      </div>
    </div>
  );
}
