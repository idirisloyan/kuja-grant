'use client';

/**
 * Phase 285 — NGO post-decision feedback acknowledgement.
 * Phase 290 — Donor "reach out" follow-up action.
 * Phase 296 — Templated outreach message persisted + shown to applicant.
 *
 * Donor view:
 *   - "Reach out personally" opens a small compose dialog (templated body
 *     pre-filled). Submit → POST /api/applications/<id>/donor-outreach
 *     with the message text; backend stamps timestamps + notifies NGOs.
 * NGO view:
 *   - One-shot ack POST on first view (when applicant_viewed_feedback_at
 *     is null + decision is recorded).
 *   - If the donor has sent outreach, the message text shows inline in
 *     an amber callout.
 */

import { useEffect, useState } from 'react';
import { CheckCircle, Clock, Send, Mail } from 'lucide-react';
import { api } from '@/lib/api';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

interface Props {
  applicationId: number;
  isOwnerNgo: boolean;
  isReviewerSide: boolean;
  decisionRecordedAt: string | null;
  applicantViewedAt: string | null;
  status?: string;
  outreachInitiatedAt?: string | null;
  outreachMessageText?: string | null;
  grantTitle?: string | null;
}

export function FeedbackAcknowledgement({
  applicationId,
  isOwnerNgo,
  isReviewerSide,
  decisionRecordedAt,
  applicantViewedAt,
  status,
  outreachInitiatedAt,
  outreachMessageText,
  grantTitle,
}: Props) {
  const [outreachAt, setOutreachAt] = useState<string | null>(outreachInitiatedAt ?? null);
  const [outreachMsg, setOutreachMsg] = useState<string | null>(outreachMessageText ?? null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  // One-shot ack from owner NGO viewer.
  useEffect(() => {
    if (!isOwnerNgo) return;
    if (!decisionRecordedAt) return;
    if (applicantViewedAt) return;
    api.post(`/api/applications/${applicationId}/feedback-viewed`, {})
      .catch(() => { /* swallow */ });
  }, [applicationId, isOwnerNgo, decisionRecordedAt, applicantViewedAt]);

  // Pre-fill the donor compose dialog with a templated opener.
  useEffect(() => {
    if (!open) return;
    if (draft) return;
    setDraft(
      `Thank you for applying to "${grantTitle || 'this opportunity'}". ` +
      'Although we couldn\'t fund this application, we were impressed by ' +
      'your work and would like to stay in touch about future opportunities.'
    );
  }, [open, draft, grantTitle]);

  if (!decisionRecordedAt) return null;

  const isDeclined = status === 'declined' || status === 'rejected';
  const showInlineMsg = !!outreachMsg;

  async function send() {
    setSending(true);
    try {
      const r = await api.post<{ outreach_initiated_at?: string; outreach_message_text?: string }>(
        `/api/applications/${applicationId}/donor-outreach`,
        { message: draft }
      );
      if (r?.outreach_initiated_at) setOutreachAt(r.outreach_initiated_at);
      if (r?.outreach_message_text) setOutreachMsg(r.outreach_message_text);
      setOpen(false);
    } catch {
      // swallow — user can retry
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {/* NGO view of the outreach message (always visible to applicant when present). */}
      {showInlineMsg && isOwnerNgo && (
        <div className="rounded-md border border-amber-300 bg-amber-50/70 dark:bg-amber-950/20 p-3 text-sm">
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 mb-1 inline-flex items-center gap-1.5">
            <Mail className="w-3.5 h-3.5" />
            Message from donor
          </p>
          <p className="text-sm whitespace-pre-wrap">{outreachMsg}</p>
        </div>
      )}

      {/* Donor / admin / reviewer footer: ack status + outreach action. */}
      {isReviewerSide && (
        <div className="flex items-center justify-between gap-3 px-1">
          <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
            {applicantViewedAt ? (
              <CheckCircle className="w-3 h-3 text-emerald-600" />
            ) : (
              <Clock className="w-3 h-3 text-amber-600" />
            )}
            {applicantViewedAt
              ? `Applicant viewed this feedback on ${new Date(applicantViewedAt).toLocaleDateString()}.`
              : 'Applicant has not viewed this feedback yet.'}
          </p>
          {isDeclined && (
            outreachAt ? (
              <p className="text-xs text-emerald-700 inline-flex items-center gap-1.5">
                <Send className="w-3 h-3" />
                Outreach sent {new Date(outreachAt).toLocaleDateString()}
              </p>
            ) : (
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="text-xs inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-[hsl(var(--kuja-clay))] text-[hsl(var(--kuja-clay))] hover:bg-[hsl(var(--kuja-clay))]/10"
              >
                <Send className="w-3 h-3" />
                Reach out personally
              </button>
            )
          )}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reach out to the applicant</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              This message will land in the NGO&rsquo;s in-app inbox and on their application detail page.
            </p>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, 2000))}
              rows={6}
              className="w-full text-sm rounded-md border border-border bg-background p-2"
            />
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-xs px-3 py-1.5 rounded-md border border-border"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={send}
                disabled={sending || !draft.trim()}
                className="text-xs px-3 py-1.5 rounded-md bg-[hsl(var(--kuja-clay))] text-white hover:opacity-90 disabled:opacity-50"
              >
                {sending ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
