'use client';

/**
 * /network/join — Phase 33 (May 2026).
 *
 * Minimal NGO-facing membership application page. Renders the network's
 * eligibility questionnaire + required-doc checklist + submit button.
 *
 * Doc upload + capacity-assessment integration are deliberately scoped
 * to follow-up phases — this page is the structural surface that proves
 * the backend works end-to-end. Users complete docs + assessment via the
 * existing flows; this page reads their status and gates submission.
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import {
  useMembershipConfig,
  useMyMemberships,
  type Membership,
} from '@/lib/hooks/use-api';
import { useAuthStore } from '@/stores/auth-store';
import { CheckCircle2, AlertCircle, Loader2, ArrowRight } from 'lucide-react';

export default function JoinNetworkPage() {
  const router = useRouter();
  const viewer = useAuthStore((s) => s.user);
  const { data: cfg, isLoading: cfgLoading } = useMembershipConfig();
  const { data: mineData, mutate: refetchMine } = useMyMemberships();

  // Find the existing membership for THIS network (if any).
  const existing: Membership | undefined = (mineData?.memberships ?? []).find(
    (m) => m.network_id === cfg?.network?.id,
  );

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [country, setCountry] = useState('');
  const [region, setRegion] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Hydrate from existing draft if any.
  useEffect(() => {
    if (existing) {
      setAnswers(existing.eligibility_answers || {});
      setCountry(existing.country || '');
      setRegion(existing.region || '');
    }
  }, [existing?.id]);  // eslint-disable-line react-hooks/exhaustive-deps

  if (cfgLoading) {
    return (
      <div className="space-y-3">
        <div className="kuja-shimmer h-8 w-72 rounded" />
        <div className="kuja-shimmer h-32 rounded" />
        <div className="kuja-shimmer h-48 rounded" />
      </div>
    );
  }

  if (!cfg?.success) {
    return (
      <div className="p-6 text-sm">
        <p className="text-destructive">Couldn&rsquo;t load network configuration.</p>
      </div>
    );
  }

  if (viewer?.role && viewer.role !== 'ngo') {
    return (
      <div className="p-6 max-w-xl">
        <h1 className="kuja-display text-3xl mb-2">Join {cfg.network.name}</h1>
        <p className="text-sm text-muted-foreground">
          Only NGO accounts can apply for network membership. You are signed
          in as <strong>{viewer.role}</strong>.
        </p>
      </div>
    );
  }

  const allAnswered = cfg.eligibility_questions
    .filter((q) => q.required)
    .every((q) => (answers[q.key] || '').toLowerCase() === 'yes');

  async function saveDraft() {
    setSubmitting(true);
    try {
      const res = await api.post<{ success: boolean; membership: Membership }>(
        '/network/membership/apply',
        {
          eligibility_answers: answers,
          country: country || undefined,
          region: region || undefined,
        },
      );
      if (res.success) {
        toast.success('Application saved as draft.');
        await refetchMine();
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Failed to save.';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  async function submitForReview() {
    if (!existing) {
      toast.error('Save your draft first.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post<{ success: boolean; membership: Membership }>(
        `/network/membership/${existing.id}/submit`,
      );
      if (res.success) {
        toast.success('Submitted for review.');
        await refetchMine();
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Failed to submit.';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="kuja-display text-3xl">Join {cfg.network.name}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Apply for membership in the {cfg.network.name} network.
          Review takes up to {cfg.membership_review_days} days.
        </p>
      </div>

      {/* Status banner */}
      {existing && (
        <StatusBanner m={existing} />
      )}

      {/* Eligibility questionnaire */}
      <section className="border border-border rounded-lg bg-card p-5 space-y-3">
        <h2 className="font-semibold text-base">Eligibility</h2>
        <p className="text-xs text-muted-foreground">
          Answer all required questions truthfully. Misrepresentation results
          in automatic rejection and a cooldown period.
        </p>
        <ul className="space-y-2">
          {cfg.eligibility_questions.map((q) => (
            <li key={q.key} className="flex items-center justify-between gap-3 py-1 border-b border-border last:border-b-0">
              <span className="text-sm">
                {q.label}
                {q.required && <span className="text-destructive ml-1">*</span>}
              </span>
              <div className="flex gap-1 shrink-0">
                {(['yes', 'no'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={(answers[q.key] || '').toLowerCase() === v}
                    onClick={() =>
                      setAnswers((prev) => ({ ...prev, [q.key]: v }))
                    }
                    disabled={existing?.status === 'under_review' || existing?.status === 'active'}
                    className={
                      'px-3 py-1 rounded-md text-xs font-semibold border ' +
                      ((answers[q.key] || '').toLowerCase() === v
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-border hover:bg-muted')
                    }
                  >
                    {v.toUpperCase()}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <label className="text-xs space-y-1">
            <span className="text-muted-foreground">Country</span>
            <input
              type="text"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              disabled={existing?.status === 'under_review' || existing?.status === 'active'}
              className="w-full px-3 py-1.5 rounded-md border border-border bg-background text-sm"
              placeholder="e.g. Kenya"
            />
          </label>
          <label className="text-xs space-y-1">
            <span className="text-muted-foreground">Region</span>
            <input
              type="text"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              disabled={existing?.status === 'under_review' || existing?.status === 'active'}
              className="w-full px-3 py-1.5 rounded-md border border-border bg-background text-sm"
              placeholder="e.g. East Africa"
            />
          </label>
        </div>
      </section>

      {/* Required documents (read-only checklist for now) */}
      <section className="border border-border rounded-lg bg-card p-5 space-y-3">
        <h2 className="font-semibold text-base">Required documents</h2>
        <p className="text-xs text-muted-foreground">
          Upload these via the <button
            type="button"
            onClick={() => router.push('/applications')}
            className="underline hover:text-foreground">documents page</button>.
          Each document is linked to your membership application.
        </p>
        <ul className="space-y-1.5 text-sm">
          {cfg.required_documents.map((d) => {
            const status = (existing?.required_documents_status?.[d.key] as
              | { uploaded?: boolean }
              | undefined);
            const uploaded = !!status?.uploaded;
            return (
              <li key={d.key} className="flex items-center gap-2">
                {uploaded ? (
                  <CheckCircle2 className="w-4 h-4 text-[hsl(var(--kuja-grow))]" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-muted-foreground" />
                )}
                <span className={uploaded ? '' : 'text-muted-foreground'}>
                  {d.label}
                  {d.required && <span className="text-destructive ml-1">*</span>}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Capacity assessment */}
      <section className="border border-border rounded-lg bg-card p-5 space-y-3">
        <h2 className="font-semibold text-base">
          Capacity assessment
          {cfg.network.assessment_framework_display && (
            <span className="text-muted-foreground font-normal text-xs ml-2">
              ({cfg.network.assessment_framework_display})
            </span>
          )}
        </h2>
        <p className="text-xs text-muted-foreground">
          You must complete a capacity self-assessment before submitting your
          application. This becomes your <em>capacity passport</em> within the
          network and is refreshed every {' '}
          {/* refresh cadence isn't in the config response yet; default copy */}
          24 months.
        </p>
        <div className="flex items-center gap-2 text-sm">
          {existing?.capacity_assessment_id ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-[hsl(var(--kuja-grow))]" />
              <span>Assessment #{existing.capacity_assessment_id} linked</span>
            </>
          ) : (
            <>
              <AlertCircle className="w-4 h-4 text-muted-foreground" />
              <button
                type="button"
                onClick={() => router.push('/assessments/wizard')}
                className="underline hover:text-foreground"
              >
                Start capacity assessment →
              </button>
            </>
          )}
        </div>
      </section>

      {/* Actions */}
      <div className="flex flex-wrap gap-3 pt-2">
        <button
          type="button"
          onClick={saveDraft}
          disabled={submitting || existing?.status === 'under_review' || existing?.status === 'active'}
          className="px-4 py-2 rounded-md border border-border text-sm font-semibold hover:bg-muted disabled:opacity-50"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin inline" /> : 'Save draft'}
        </button>
        <button
          type="button"
          onClick={submitForReview}
          disabled={
            submitting ||
            !existing ||
            !allAnswered ||
            !existing?.capacity_assessment_id ||
            existing.status !== 'pending'
          }
          className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1.5"
          title={
            !existing
              ? 'Save your draft first'
              : !allAnswered
              ? 'Answer all required questions Yes'
              : !existing.capacity_assessment_id
              ? 'Complete the capacity assessment first'
              : existing.status !== 'pending'
              ? `Cannot submit from status '${existing.status}'`
              : ''
          }
        >
          Submit for OB review <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function StatusBanner({ m }: { m: Membership }) {
  const tone =
    m.status === 'active' ? 'bg-[hsl(var(--kuja-grow))]/10 border-[hsl(var(--kuja-grow))]/30'
    : m.status === 'rejected' ? 'bg-destructive/10 border-destructive/30'
    : m.status === 'under_review' ? 'bg-[hsl(var(--kuja-sun))]/10 border-[hsl(var(--kuja-sun))]/30'
    : 'bg-muted/50 border-border';
  return (
    <div className={`border rounded-lg px-4 py-3 text-sm ${tone}`}>
      <div className="font-semibold capitalize">{m.status.replace('_', ' ')}</div>
      {m.status_reason && (
        <div className="text-xs text-muted-foreground mt-0.5">{m.status_reason}</div>
      )}
      {m.cooldown_until && m.status === 'rejected' && (
        <div className="text-xs text-muted-foreground mt-0.5">
          You may reapply after {new Date(m.cooldown_until).toLocaleDateString()}.
        </div>
      )}
    </div>
  );
}
