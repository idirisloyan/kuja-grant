'use client';

/**
 * Phase 285 — NGO post-decision feedback acknowledgement.
 *
 * - When the applicant NGO loads a decided application AND
 *   applicant_viewed_feedback_at is null, fire a one-shot POST to
 *   /api/applications/<id>/feedback-viewed and refresh the parent
 *   cache so the donor's view picks it up next render.
 * - When the donor / admin views the same application, render a tiny
 *   line confirming whether the applicant has seen the feedback.
 *
 * This is intentionally not a card — it's a single footer line so the
 * page stays calm. Hidden when there's nothing to say.
 */

import { useEffect } from 'react';
import { CheckCircle, Clock } from 'lucide-react';
import { api } from '@/lib/api';

interface Props {
  applicationId: number;
  isOwnerNgo: boolean;
  isReviewerSide: boolean;
  decisionRecordedAt: string | null;
  applicantViewedAt: string | null;
  onAck?: () => void;
}

export function FeedbackAcknowledgement({
  applicationId,
  isOwnerNgo,
  isReviewerSide,
  decisionRecordedAt,
  applicantViewedAt,
  onAck,
}: Props) {
  // Fire the ack POST exactly once per mount when applicable.
  useEffect(() => {
    if (!isOwnerNgo) return;
    if (!decisionRecordedAt) return;
    if (applicantViewedAt) return;
    let aborted = false;
    api.post<{ changed: boolean }>(`/api/applications/${applicationId}/feedback-viewed`, {})
      .then((r) => {
        if (!aborted && r?.changed) onAck?.();
      })
      .catch(() => { /* swallow */ });
    return () => { aborted = true; };
  }, [applicationId, isOwnerNgo, decisionRecordedAt, applicantViewedAt, onAck]);

  if (!decisionRecordedAt) return null;
  if (!isReviewerSide) return null;

  const text = applicantViewedAt
    ? `Applicant viewed this feedback on ${new Date(applicantViewedAt).toLocaleDateString()}.`
    : 'Applicant has not viewed this feedback yet.';

  return (
    <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5 px-1">
      {applicantViewedAt ? (
        <CheckCircle className="w-3 h-3 text-emerald-600" />
      ) : (
        <Clock className="w-3 h-3 text-amber-600" />
      )}
      {text}
    </p>
  );
}
