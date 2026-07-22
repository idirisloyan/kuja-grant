'use client';

/**
 * Public per-disbursement report page — Phase 652 (June 2026).
 *
 * Partner lands here via a signed link sent by SMS/WhatsApp:
 *   /proximate-report?t=<token>
 *
 * No login required — the token IS the credential. The same form
 * works for an authenticated session too (backend accepts either),
 * so down the road a logged-in partner inbox can route through here.
 *
 * 5-question minimum form per spec:
 *   Q1 did the activity happen? (Y/N)
 *   Q2 how many people did it help? (number)
 *   Q3 any issues? (free text)
 *   Q4 photo OR voice
 *   Q5 optional: how the money was spent (free text)
 *
 * July 2026 — the five questions became five SCREENS. Field feedback
 * was that a single long form on a 4" phone reads as "a lot of work"
 * and gets abandoned at the top. One question per screen with a visible
 * bar is the same five questions but finishable.
 *
 * What deliberately did NOT change: the submitted payload, the upload
 * endpoint, and the order the answers are collected in. Someone who is
 * mid-form when this deploys keeps every answer they have given, and an
 * OB reading old and new reports side by side sees identical records.
 *
 * Routes static-export-safe: token is read from window.location at
 * runtime, no dynamic params.
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
  AssistedByField,
  EffortBadges,
  StepProgress,
  WizardNav,
  DraftRestoredNote,
  useLocalDraft,
} from '@/components/proximate/token-page-support';

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || '').replace(/\/$/, '');

/** Five questions, then a review screen. */
const TOTAL_STEPS = 6;
const REVIEW_STEP = 6;

interface DisbursementMeta {
  id: number;
  partner_name: string | null;
  amount_usd: number | null;
  purpose: string | null;
  sent_at: string | null;
  report_due_at: string | null;
  status: string;
  has_report: boolean;
  ack_message?: string | null;
  ack_message_at?: string | null;
}

/** Exactly what survives a closed tab. Files can't be serialised, so the
 *  voice PLAYBACK is lost on resume while the uploaded doc id is kept —
 *  the recording itself is already safely on the server by then. */
// `type`, not `interface`: only type aliases get the implicit index
// signature that useLocalDraft's Record<string, unknown> bound needs.
type ReportDraft = {
  happened: boolean | null;
  peopleHelped: string;
  issues: string;
  spendSummary: string;
  assistedBy: string;
  photoDocId: number | null;
  voiceDocId: number | null;
  step: number;
};

export default function ProximateReportPage() {
  const { t } = useTranslation();
  const [token, setToken] = useState<string | null>(null);
  const [meta, setMeta] = useState<DisbursementMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Form
  const [happened, setHappened] = useState<boolean | null>(null);
  const [peopleHelped, setPeopleHelped] = useState('');
  const [issues, setIssues] = useState('');
  const [spendSummary, setSpendSummary] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  // Phase 655 — photo + voice attachments
  const [photoDocId, setPhotoDocId] = useState<number | null>(null);
  const [voiceDocId, setVoiceDocId] = useState<number | null>(null);
  // Kept alongside voiceDocId purely so the partner can hear their own
  // recording before sending — played from the local blob, no round-trip.
  const [voiceFile, setVoiceFile] = useState<File | null>(null);
  // Optional: who helped fill this in (enumerator / elder-assisted).
  const [assistedBy, setAssistedBy] = useState('');
  const [uploadingKind, setUploadingKind] = useState<'photo' | 'voice' | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const voiceInputRef = useRef<HTMLInputElement>(null);

  // Wizard position, 1-based.
  const [step, setStep] = useState(1);

  // Draft key is the disbursement id, never the token (see useLocalDraft).
  // Null until the meta load resolves, which is also when we know there
  // is anything worth saving.
  const draftKey = meta?.id != null ? `report:${meta.id}` : null;
  const { restored, clear: clearDraft } = useLocalDraft<ReportDraft>(
    draftKey,
    { happened, peopleHelped, issues, spendSummary, assistedBy,
      photoDocId, voiceDocId, step },
    (saved) => {
      if (saved.happened !== undefined) setHappened(saved.happened);
      if (saved.peopleHelped !== undefined) setPeopleHelped(saved.peopleHelped);
      if (saved.issues !== undefined) setIssues(saved.issues);
      if (saved.spendSummary !== undefined) setSpendSummary(saved.spendSummary);
      if (saved.assistedBy !== undefined) setAssistedBy(saved.assistedBy);
      if (saved.photoDocId !== undefined) setPhotoDocId(saved.photoDocId);
      if (saved.voiceDocId !== undefined) setVoiceDocId(saved.voiceDocId);
      // Clamp: a draft written by an older/newer build must never strand
      // someone on a screen that no longer exists.
      if (typeof saved.step === 'number') {
        setStep(Math.min(Math.max(1, saved.step), TOTAL_STEPS));
      }
    },
  );

  useEffect(() => {
    const url = new URL(window.location.href);
    const tk = url.searchParams.get('t');
    if (!tk) {
      setLoadError(t('proximate.report.missing_token'));
      setLoading(false);
      return;
    }
    setToken(tk);
    fetch(`${API_BASE}/api/proximate/disbursement-reports/${encodeURIComponent(tk)}`, {
      headers: { 'X-Network-Override': 'proximate' },
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok || !data.success) {
          setLoadError(data.error || t('proximate.report.load_failed'));
        } else {
          setMeta(data.disbursement);
          if (data.disbursement?.has_report) setSubmitted(true);
        }
      })
      .catch(() => setLoadError(t('proximate.report.load_failed')))
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
        `${API_BASE}/api/proximate/disbursement-reports/${encodeURIComponent(token!)}/attachment`,
        {
          method: 'POST',
          headers: { 'X-Network-Override': 'proximate' },
          body: fd,
        }
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        setUploadError(data.error || t('proximate.report.upload_failed'));
      } else if (kind === 'photo') {
        setPhotoDocId(data.doc_id);
      } else {
        setVoiceDocId(data.doc_id);
      }
    } catch {
      setUploadError(t('proximate.report.upload_failed'));
    } finally {
      setUploadingKind(null);
    }
  }

  async function submit() {
    setSubmitError(null);
    if (happened === null) {
      setSubmitError(t('proximate.report.activity_required'));
      setStep(1); // send them back to the one question that is required
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch(
        `${API_BASE}/api/proximate/disbursement-reports/${encodeURIComponent(token!)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Network-Override': 'proximate',
          },
          body: JSON.stringify({
            activity_happened: happened,
            people_helped: peopleHelped ? parseInt(peopleHelped, 10) : null,
            issues: issues.trim() || null,
            spend_summary: spendSummary.trim() || null,
            report_photo_doc_id: photoDocId,
            report_voice_doc_id: voiceDocId,
            assisted_by: assistedBy.trim() || null,
          }),
        }
      );
      const data = await r.json();
      if (!r.ok || !data.success) {
        setSubmitError(data.error || t('proximate.report.submit_failed'));
      } else {
        // Only once the server has it. A draft cleared on a failed send
        // would lose the very answers the partner is about to retry.
        clearDraft();
        setSubmitted(true);
      }
    } catch {
      setSubmitError(t('proximate.report.submit_failed'));
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

  if (submitted) {
    return (
      <div className="min-h-screen bg-background p-4 sm:p-6 lg:p-8">
        <div className="max-w-2xl mx-auto space-y-4">
          <Card className="p-8 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto mb-4" />
            <h1 className="text-2xl kuja-display mb-2">
              {t('proximate.report.thanks_title')}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t('proximate.report.thanks_body')}
            </p>
          </Card>
          {meta?.ack_message && (
            <Card className="p-5 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800">
              <h2 className="text-sm font-medium mb-2">
                {t('proximate.report.ack_from_adeso')}
              </h2>
              <p className="text-sm whitespace-pre-wrap">{meta.ack_message}</p>
              {meta.ack_message_at && (
                <p className="text-xs text-muted-foreground mt-2">
                  {new Date(meta.ack_message_at).toLocaleString()}
                </p>
              )}
            </Card>
          )}
          {/* Still useful after sending: this is the reference the partner
              quotes if they need to ask us anything about the report. */}
          {meta?.id != null && <OfflineFallbackCard code={`PR-${meta.id}`} />}
        </div>
      </div>
    );
  }

  // Re-visit after submission with an ack from Adeso — show it before the form
  // collapses to the thanks-only screen.
  if (meta?.has_report && meta?.ack_message) {
    return (
      <div className="min-h-screen bg-background p-4 sm:p-6 lg:p-8">
        <div className="max-w-2xl mx-auto space-y-4">
          <Card className="p-8 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto mb-4" />
            <h1 className="text-2xl kuja-display mb-2">
              {t('proximate.report.already_submitted')}
            </h1>
          </Card>
          <Card className="p-5 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800">
            <h2 className="text-sm font-medium mb-2">
              {t('proximate.report.ack_from_adeso')}
            </h2>
            <p className="text-sm whitespace-pre-wrap">{meta.ack_message}</p>
            {meta.ack_message_at && (
              <p className="text-xs text-muted-foreground mt-2">
                {new Date(meta.ack_message_at).toLocaleString()}
              </p>
            )}
          </Card>
        </div>
      </div>
    );
  }

  const goNext = () => setStep((s) => Math.min(s + 1, TOTAL_STEPS));
  const goBack = () => setStep((s) => Math.max(s - 1, 1));

  const answerOrDash = (v: string) => v.trim() || t('proximate.report.not_answered');

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 lg:p-8">
      <div className="max-w-2xl mx-auto space-y-4">
        <header className="space-y-2">
          <h1 className="text-2xl kuja-display">
            {t('proximate.report.title')}
          </h1>
          {meta && (
            <p className="text-sm text-muted-foreground">
              {meta.partner_name && <span>{meta.partner_name} · </span>}
              {meta.amount_usd && (
                <span>${meta.amount_usd.toLocaleString()}</span>
              )}
              {meta.purpose && <span> · {meta.purpose}</span>}
            </p>
          )}
          {/* Only on the first screen — after that the progress bar is the
              orienting element and these chips are just noise. */}
          {step === 1 && <EffortBadges />}
          {restored && step === 1 && <DraftRestoredNote />}
        </header>

        {/* No label prop: every screen already carries its question as
            the heading directly below, and repeating it on a 375px
            viewport just pushes the answer buttons below the fold. */}
        <StepProgress step={step} total={TOTAL_STEPS} />

        <Card className="p-6 space-y-5">
          {/* Q1 */}
          {step === 1 && (
            <div>
              <label className="block text-lg font-medium mb-4">
                {t('proximate.report.q1_happened')}
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setHappened(true)}
                  aria-pressed={happened === true}
                  className={`h-16 rounded-lg text-lg font-bold border-2 ${
                    happened === true
                      ? 'bg-emerald-600 border-emerald-700 text-white'
                      : 'bg-card border-input hover:border-emerald-500'
                  }`}
                >
                  {t('proximate.report.yes')}
                </button>
                <button
                  type="button"
                  onClick={() => setHappened(false)}
                  aria-pressed={happened === false}
                  className={`h-16 rounded-lg text-lg font-bold border-2 ${
                    happened === false
                      ? 'bg-red-600 border-red-700 text-white'
                      : 'bg-card border-input hover:border-red-500'
                  }`}
                >
                  {t('proximate.report.no')}
                </button>
              </div>
            </div>
          )}

          {/* Q2 */}
          {step === 2 && (
            <div>
              <label className="block text-lg font-medium mb-4">
                {t('proximate.report.q2_people_helped')}
              </label>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={peopleHelped}
                onChange={(e) => setPeopleHelped(e.target.value)}
                className="w-40 h-14 px-3 text-xl bg-background border border-border rounded-md"
                placeholder="0"
              />
            </div>
          )}

          {/* Q3 */}
          {step === 3 && (
            <div>
              <label className="block text-lg font-medium mb-4">
                {t('proximate.report.q3_issues')}
              </label>
              <textarea
                value={issues}
                onChange={(e) => setIssues(e.target.value)}
                className="w-full px-3 py-2 text-base bg-background border border-border rounded-md"
                rows={5}
                maxLength={5000}
                placeholder={t('proximate.report.q3_placeholder')}
              />
            </div>
          )}

          {/* Q4 — photo + voice attachments */}
          {step === 4 && (
            <div>
              <label className="block text-lg font-medium mb-2">
                {t('proximate.report.q4_attachment')}
              </label>
              <p className="text-xs text-muted-foreground mb-3">
                {t('proximate.report.q4_attachment_hint')}
              </p>

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
                  onClick={() => photoInputRef.current?.click()}
                  disabled={uploadingKind !== null}
                  className="h-14 text-base"
                >
                  {uploadingKind === 'photo' ? (
                    <Loader2 className="w-5 h-5 me-2 animate-spin" />
                  ) : (
                    <Camera className="w-5 h-5 me-2" />
                  )}
                  {photoDocId
                    ? t('proximate.report.q4_photo_replace')
                    : t('proximate.report.q4_photo_add')}
                </Button>
                {photoDocId !== null && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setPhotoDocId(null)}
                    className="h-14"
                  >
                    <X className="w-4 h-4 me-1" />
                    {t('proximate.report.q4_remove')}
                  </Button>
                )}

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => voiceInputRef.current?.click()}
                  disabled={uploadingKind !== null}
                  className="h-14 text-base"
                >
                  {uploadingKind === 'voice' ? (
                    <Loader2 className="w-5 h-5 me-2 animate-spin" />
                  ) : (
                    <Mic className="w-5 h-5 me-2" />
                  )}
                  {voiceDocId
                    ? t('proximate.report.q4_voice_replace')
                    : t('proximate.report.q4_voice_add')}
                </Button>
                {voiceDocId !== null && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setVoiceDocId(null);
                      setVoiceFile(null);
                    }}
                    className="h-14"
                  >
                    <X className="w-4 h-4 me-1" />
                    {t('proximate.report.q4_remove')}
                  </Button>
                )}
              </div>

              {/* Hear it back before sending — plays the local file. */}
              <VoicePlayback file={voiceFile} />

              {(photoDocId !== null || voiceDocId !== null) && (
                <p className="text-xs text-emerald-700 mt-2">
                  {photoDocId !== null && voiceDocId !== null
                    ? t('proximate.report.q4_both_attached')
                    : photoDocId !== null
                      ? t('proximate.report.q4_photo_attached')
                      : t('proximate.report.q4_voice_attached')}
                </p>
              )}
              {uploadError && (
                <p className="text-xs text-red-600 mt-2">{uploadError}</p>
              )}
            </div>
          )}

          {/* Q5 */}
          {step === 5 && (
            <div className="space-y-5">
              <div>
                <label className="block text-lg font-medium mb-4">
                  {t('proximate.report.q5_spend')} {t('proximate.report.optional')}
                </label>
                <textarea
                  value={spendSummary}
                  onChange={(e) => setSpendSummary(e.target.value)}
                  className="w-full px-3 py-2 text-base bg-background border border-border rounded-md"
                  rows={5}
                  maxLength={5000}
                  placeholder={t('proximate.report.q5_placeholder')}
                />
              </div>
              <AssistedByField value={assistedBy} onChange={setAssistedBy} />
            </div>
          )}

          {/* Review — the whole report on one screen before it leaves. */}
          {step === REVIEW_STEP && (
            <div className="space-y-4">
              <h2 className="text-lg font-medium">
                {t('proximate.report.review_title')}
              </h2>
              <p className="text-xs text-muted-foreground">
                {t('proximate.report.review_hint')}
              </p>
              <dl className="space-y-3 text-sm">
                {[
                  {
                    n: 1,
                    q: t('proximate.report.q1_happened'),
                    a: happened === null
                      ? t('proximate.report.not_answered')
                      : happened
                        ? t('proximate.report.yes')
                        : t('proximate.report.no'),
                  },
                  { n: 2, q: t('proximate.report.q2_people_helped'), a: answerOrDash(peopleHelped) },
                  { n: 3, q: t('proximate.report.q3_issues'), a: answerOrDash(issues) },
                  {
                    n: 4,
                    q: t('proximate.report.q4_attachment'),
                    a: photoDocId !== null && voiceDocId !== null
                      ? t('proximate.report.q4_both_attached')
                      : photoDocId !== null
                        ? t('proximate.report.q4_photo_attached')
                        : voiceDocId !== null
                          ? t('proximate.report.q4_voice_attached')
                          : t('proximate.report.not_answered'),
                  },
                  { n: 5, q: t('proximate.report.q5_spend'), a: answerOrDash(spendSummary) },
                ].map((row) => (
                  <div
                    key={row.n}
                    className="flex items-start justify-between gap-3 border-b border-border pb-3 last:border-0"
                  >
                    <div className="min-w-0">
                      <dt className="text-xs text-muted-foreground">{row.q}</dt>
                      <dd className="whitespace-pre-wrap break-words">{row.a}</dd>
                    </div>
                    <button
                      type="button"
                      onClick={() => setStep(row.n)}
                      className="shrink-0 text-xs underline underline-offset-2 text-muted-foreground hover:text-foreground"
                    >
                      {t('proximate.report.change')}
                    </button>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {submitError && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {submitError}
            </div>
          )}

          {step === REVIEW_STEP ? (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={goBack}
                className="h-14 px-5 rounded-lg border border-border text-base font-medium hover:bg-muted"
              >
                {t('proximate.token.back')}
              </button>
              <Button
                onClick={submit}
                disabled={submitting}
                className="h-14 flex-1 text-base"
              >
                {submitting ? (
                  <Loader2 className="w-5 h-5 me-2 animate-spin" />
                ) : (
                  <Send className="w-5 h-5 me-2" />
                )}
                {t('proximate.report.submit')}
              </Button>
            </div>
          ) : (
            <WizardNav
              onBack={step > 1 ? goBack : undefined}
              onNext={goNext}
              // Q1 is the only answer the backend treats as mandatory, so
              // it is the only gate. Everything after it can be skipped.
              nextDisabled={step === 1 && happened === null}
              nextLabel={
                step === TOTAL_STEPS - 1
                  ? t('proximate.report.review_title')
                  : undefined
              }
            />
          )}
        </Card>

        <ReassuranceNote variant="report" />
        {meta?.id != null && <OfflineFallbackCard code={`PR-${meta.id}`} />}
      </div>
    </div>
  );
}
