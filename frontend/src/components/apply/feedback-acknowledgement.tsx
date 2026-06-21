'use client';

/**
 * Phase 285 — NGO post-decision feedback acknowledgement.
 * Phase 290 — Donor "reach out" follow-up action.
 *
 * - When the applicant NGO loads a decided application AND
 *   applicant_viewed_feedback_at is null, fire a one-shot POST to
 *   /api/applications/<id>/feedback-viewed.
 * - When the donor / admin views the same application, render a small
 *   footer line: ack status + (on declines only) a "Reach out" button
 *   that POSTs /api/applications/<id>/donor-outreach.
 */

import { useEffect, useState } from 'react';
import { CheckCircle, Clock, Send } from 'lucide-react';
import { api } from '@/lib/api';

interface Props {
  applicationId: number;
  isOwnerNgo: boolean;
  isReviewerSide: boolean;
  decisionRecordedAt: string | null;
  applicantViewedAt: string | null;
  status?: string;
  outreachInitiatedAt?: string | null;
}

export function FeedbackAcknowledgement({
  applicationId,
  isOwnerNgo,
  isReviewerSide,
  decisionRecordedAt,
  applicantViewedAt,
  status,
  outreachInitiatedAt,
}: Props) {
  const [outreachAt, setOutreachAt] = useState<string | null>(outreachInitiatedAt ?? null);
  const [reachingOut, setReachingOut] = useState(false);

  useEffect(() => {
    if (!isOwnerNgo) return;
    if (!decisionRecordedAt) return;
    if (applicantViewedAt) return;
    let aborted = false;
    api.post(`/api/applications/${applicationId}/feedback-viewed`, {})
      .catch(() => { /* swallow */ });
    return () => { aborted = true; void aborted; };
  }, [applicationId, isOwnerNgo, decisionRecordedAt, applicantViewedAt]);

  if (!decisionRecordedAt) return null;
  if (!isReviewerSide) return null;

  const text = applicantViewedAt
    ? `Applicant viewed this feedback on ${new Date(applicantViewedAt).toLocaleDateString()}.`
    : 'Applicant has not viewed this feedback yet.';

  const isDeclined = status === 'declined' || status === 'rejected';

  async function startOutreach() {
    setReachingOut(true);
    try {
      const r = await api.post<{ outreach_initiated_at?: string }>(
        `/api/applications/${applicationId}/donor-outreach`, {}
      );
      if (r?.outreach_initiated_at) setOutreachAt(r.outreach_initiated_at);
    } catch {
      // swallow — user can retry
    } finally {
      setReachingOut(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 px-1">
      <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
        {applicantViewedAt ? (
          <CheckCircle className="w-3 h-3 text-emerald-600" />
        ) : (
          <Clock className="w-3 h-3 text-amber-600" />
        )}
        {text}
      </p>
      {isDeclined && (
        outreachAt ? (
          <p className="text-xs text-emerald-700 inline-flex items-center gap-1.5">
            <Send className="w-3 h-3" />
            Outreach started {new Date(outreachAt).toLocaleDateString()}
          </p>
        ) : (
          <button
            type="button"
            onClick={startOutreach}
            disabled={reachingOut}
            className="text-xs inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-[hsl(var(--kuja-clay))] text-[hsl(var(--kuja-clay))] hover:bg-[hsl(var(--kuja-clay))]/10 disabled:opacity-50"
          >
            <Send className="w-3 h-3" />
            {reachingOut ? 'Sending…' : 'Reach out personally'}
          </button>
        )
      )}
    </div>
  );
}
