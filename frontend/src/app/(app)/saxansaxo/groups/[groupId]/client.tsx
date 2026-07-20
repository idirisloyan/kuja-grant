'use client';

/**
 * Saxansaxo group detail — the whole SCLR journey on one page (v0).
 *
 * Each of the 8 steps is a card that either shows its record (done) or
 * offers the one action that moves the group forward. The page never
 * polices spending: after disbursement the only asks are the
 * community's own report (via token link) and the outcome tag.
 *
 * Static-export-safe: the real group id is read from the URL at
 * runtime (generateStaticParams only emits the "0" placeholder).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  Loader2, Users, Check, Copy, Link2, Timer, ShieldQuestion,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  PageShell, PageHeader, PageMain,
} from '@/components/layout/page-shell';
import {
  SAX_JOURNEY, SAX_STAGE_LABELS, SAX_STAGE_TONES,
} from '@/lib/saxansaxo';

interface Permission {
  granted_by_name: string;
  granted_by_role: string;
  note: string | null;
  granted_at: string | null;
}

interface Inquiry {
  answers: Record<string, string>;
  activity_90d_score: number | null;
  note: string | null;
  done_at: string | null;
}

interface Proposal {
  answers: Record<string, string>;
  issued_at: string | null;
  submitted_at: string | null;
  token?: string;
}

interface Vetting {
  scores: Record<string, number>;
  decision: string;
  note: string | null;
  decided_at: string | null;
}

interface GrantReport {
  answers: Record<string, string>;
  submitted_at: string | null;
}

interface Grant {
  id: number;
  fund_id: number;
  amount_usd: number;
  signatory_name: string;
  signatory_screening: string;
  selected_at: string | null;
  disbursed_at: string | null;
  sla_days: number | null;
  sla_breached: boolean;
  outcome_tag: string | null;
  outcome_lesson: string | null;
  co_contribution: string | null;
  has_report: boolean;
  report?: GrantReport;
  report_token?: string;
}

interface Group {
  id: number;
  name: string;
  name_so: string | null;
  locality: string;
  region: string | null;
  description: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  stage: string;
  permission: Permission | null;
  inquiry: Inquiry | null;
  proposal: Proposal | null;
  vetting: Vetting | null;
  grants: Grant[];
}

interface Fund {
  id: number;
  name: string;
  remaining_usd: number;
  total_usd: number;
}

// v0 SCLR vetting criteria — placeholder set until the team shares the
// official list (flagged in the design doc's pre-build asks).
const VETTING_CRITERIA: { key: string; label: string }[] = [
  { key: 'already_active', label: 'Already active with own resources' },
  { key: 'community_backing', label: 'Broad community backing' },
  { key: 'feasible', label: 'Plan is feasible at this scale' },
  { key: 'inclusive', label: 'Benefits reach the wider community' },
];

const INQUIRY_QUESTIONS: { key: string; label: string }[] = [
  { key: 'q_doing', label: 'What is the group already doing?' },
  { key: 'q_members', label: 'Who are the members and how do they organize?' },
  { key: 'q_resources', label: 'What resources have they used from their own means?' },
];

const OUTCOME_OPTIONS: { tag: string; label: string; hint: string }[] = [
  { tag: 'delivered', label: 'Delivered', hint: 'The group did what it set out to do' },
  { tag: 'partial', label: 'Partially delivered', hint: 'Some of the plan happened' },
  { tag: 'learning_loss', label: 'Learning loss', hint: 'It did not work — we record the lesson, not blame' },
];

const SCREENING_LABELS: Record<string, string> = {
  clear: 'Sanctions screen: clear',
  review: 'Sanctions screen: needs review',
  unavailable: 'Sanctions screen: unavailable',
  pending: 'Sanctions screen: pending',
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

export function SaxGroupDetailClient() {
  const pathname = usePathname();
  const groupId = useMemo(() => {
    const m = (pathname || '').match(/\/saxansaxo\/groups\/(\d+)/);
    return m ? parseInt(m[1], 10) : null;
  }, [pathname]);

  const [group, setGroup] = useState<Group | null>(null);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Step forms
  const [inqAnswers, setInqAnswers] = useState<Record<string, string>>({});
  const [inqScore, setInqScore] = useState<number>(0);
  const [vetScores, setVetScores] = useState<Record<string, number>>({});
  const [vetNote, setVetNote] = useState('');
  const [grantFundId, setGrantFundId] = useState<string>('');
  const [grantAmount, setGrantAmount] = useState('5000');
  const [grantSignatory, setGrantSignatory] = useState('');
  const [outcomeLesson, setOutcomeLesson] = useState('');

  const load = useCallback(async () => {
    if (groupId == null) return;
    try {
      const [g, f] = await Promise.all([
        api.get<{ group: Group }>(`/saxansaxo/groups/${groupId}`),
        api.get<{ funds: Fund[] }>('/saxansaxo/funds'),
      ]);
      setGroup(g.group);
      setFunds(f.funds);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load group');
    }
  }, [groupId]);

  useEffect(() => { load(); }, [load]);

  const run = async (fn: () => Promise<unknown>, doneMsg?: string) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      if (doneMsg) setNotice(doneMsg);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async (path: string) => {
    const url = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
      setNotice('Link copied — share it over WhatsApp or SMS.');
    } catch {
      setNotice(url);
    }
  };

  if (groupId == null || (!group && !error)) {
    return (
      <PageShell>
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
        </div>
      </PageShell>
    );
  }

  if (!group) {
    return (
      <PageShell>
        <Card className="p-6 text-sm text-red-600 dark:text-red-400">{error}</Card>
      </PageShell>
    );
  }

  const latestGrant = group.grants.length
    ? group.grants[group.grants.length - 1] : null;
  const journeyIdx = SAX_JOURNEY.indexOf(
    group.stage as (typeof SAX_JOURNEY)[number],
  );

  return (
    <PageShell>
      <PageHeader
        title={group.name}
        subtitle={[group.name_so, group.locality, group.region]
          .filter(Boolean).join(' · ')}
        icon={Users}
        status={{ label: SAX_STAGE_LABELS[group.stage] || group.stage, tone: 'info' }}
        breadcrumbs={[
          { label: 'Saxansaxo', href: '/saxansaxo/admin' },
          { label: 'Community groups', href: '/saxansaxo/groups' },
        ]}
      />
      <PageMain>
        <div className="space-y-4">
          {error && (
            <Card className="p-3 text-sm text-red-600 dark:text-red-400">{error}</Card>
          )}
          {notice && (
            <Card className="p-3 text-sm text-emerald-700 dark:text-emerald-400 break-all">
              {notice}
            </Card>
          )}

          {/* Journey strip */}
          <Card className="p-4 overflow-x-auto">
            <div className="flex items-center gap-1 min-w-max">
              {SAX_JOURNEY.map((s, i) => {
                const done = journeyIdx >= 0 ? i <= journeyIdx
                  : group.stage === 'not_selected' && i <= 3;
                return (
                  <div key={s} className="flex items-center">
                    {i > 0 && <div className="w-5 h-px bg-border mx-1" />}
                    <span
                      className={`text-[11px] font-medium px-2 py-1 rounded-full whitespace-nowrap ${
                        done ? SAX_STAGE_TONES[s]
                          : 'bg-muted text-muted-foreground/60'
                      }`}
                    >
                      {done && <Check className="inline w-3 h-3 mr-0.5 -mt-px" />}
                      {SAX_STAGE_LABELS[s]}
                    </span>
                  </div>
                );
              })}
              {group.stage === 'not_selected' && (
                <span className={`ml-2 text-[11px] font-medium px-2 py-1 rounded-full ${SAX_STAGE_TONES.not_selected}`}>
                  Not selected (can be re-vetted)
                </span>
              )}
            </div>
          </Card>

          {/* Step 1 — Permission (always exists: intake requires it) */}
          <Card className="p-4">
            <div className="text-sm font-semibold mb-2">1 · Permission</div>
            {group.permission ? (
              <p className="text-sm text-muted-foreground">
                Granted by <span className="text-foreground font-medium">
                  {group.permission.granted_by_name}</span> ({group.permission.granted_by_role})
                on {fmtDate(group.permission.granted_at)}.
                {group.permission.note && <> Note: {group.permission.note}</>}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">No permission record.</p>
            )}
          </Card>

          {/* Step 2 — Inquiry */}
          <Card className="p-4">
            <div className="text-sm font-semibold mb-2">2 · Inquiry — what are they already doing?</div>
            {group.inquiry ? (
              <div className="space-y-2 text-sm">
                {INQUIRY_QUESTIONS.map((q) => (
                  group.inquiry?.answers[q.key] ? (
                    <div key={q.key}>
                      <div className="text-xs text-muted-foreground">{q.label}</div>
                      <div>{group.inquiry.answers[q.key]}</div>
                    </div>
                  ) : null
                ))}
                <p className="text-xs text-muted-foreground">
                  Activity in the last 90 days: score {group.inquiry.activity_90d_score ?? '—'} / 3
                  · recorded {fmtDate(group.inquiry.done_at)}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {INQUIRY_QUESTIONS.map((q) => (
                  <div key={q.key}>
                    <div className="text-xs text-muted-foreground mb-1">{q.label}</div>
                    <Textarea
                      rows={2}
                      value={inqAnswers[q.key] || ''}
                      onChange={(e) => setInqAnswers((a) => ({ ...a, [q.key]: e.target.value }))}
                    />
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Activity score (90 days):</span>
                  {[0, 1, 2, 3].map((n) => (
                    <Button
                      key={n}
                      variant={inqScore === n ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setInqScore(n)}
                    >
                      {n}
                    </Button>
                  ))}
                </div>
                <Button
                  size="sm" disabled={busy}
                  onClick={() => run(() => api.post(`/saxansaxo/groups/${group.id}/inquiry`, {
                    answers: inqAnswers, activity_90d_score: inqScore,
                  }), 'Inquiry recorded.')}
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Record inquiry'}
                </Button>
              </div>
            )}
          </Card>

          {/* Step 3 — Proposal (community-owned, token link) */}
          <Card className="p-4">
            <div className="text-sm font-semibold mb-2">3 · Proposal — the community&apos;s own words</div>
            {group.proposal ? (
              <div className="space-y-2 text-sm">
                {group.proposal.submitted_at ? (
                  <>
                    <p className="text-xs text-muted-foreground">
                      Submitted {fmtDate(group.proposal.submitted_at)}
                    </p>
                    {Object.entries(group.proposal.answers).map(([k, v]) => (
                      v ? <div key={k} className="whitespace-pre-wrap">{v}</div> : null
                    ))}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Link issued {fmtDate(group.proposal.issued_at)} — waiting for the group to fill it in.
                  </p>
                )}
                {group.proposal.token && (
                  <Button
                    variant="outline" size="sm"
                    onClick={() => copyLink(`/sax-proposal/?token=${group.proposal!.token}`)}
                  >
                    <Copy className="w-3.5 h-3.5 mr-1" /> Copy proposal link
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Issue a no-login link the group can open on any phone. Ownership of the
                  proposal stays with them.
                </p>
                <Button
                  size="sm" disabled={busy}
                  onClick={() => run(() => api.post(`/saxansaxo/groups/${group.id}/proposal-link`),
                    'Proposal link issued.')}
                >
                  <Link2 className="w-3.5 h-3.5 mr-1" /> Issue proposal link
                </Button>
              </div>
            )}
          </Card>

          {/* Step 4 — Vetting */}
          <Card className="p-4">
            <div className="text-sm font-semibold mb-2">4 · Vetting — the dated decision record</div>
            {group.vetting ? (
              <div className="space-y-1 text-sm">
                <p>
                  Decision: <span className="font-medium capitalize">
                    {group.vetting.decision.replace('_', ' ')}</span>
                  {' '}on {fmtDate(group.vetting.decided_at)}
                </p>
                <div className="flex flex-wrap gap-2">
                  {VETTING_CRITERIA.map((c) => (
                    group.vetting?.scores[c.key] != null ? (
                      <span key={c.key} className="text-xs rounded-md border border-border px-2 py-0.5">
                        {c.label}: {group.vetting.scores[c.key]}/3
                      </span>
                    ) : null
                  ))}
                </div>
                {group.vetting.note && (
                  <p className="text-xs text-muted-foreground">{group.vetting.note}</p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {VETTING_CRITERIA.map((c) => (
                  <div key={c.key} className="flex items-center justify-between gap-2">
                    <span className="text-sm">{c.label}</span>
                    <div className="flex gap-1">
                      {[0, 1, 2, 3].map((n) => (
                        <Button
                          key={n}
                          variant={vetScores[c.key] === n ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setVetScores((s) => ({ ...s, [c.key]: n }))}
                        >
                          {n}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
                <Input
                  placeholder="Decision note (optional)"
                  value={vetNote}
                  onChange={(e) => setVetNote(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm" disabled={busy}
                    onClick={() => run(() => api.post(`/saxansaxo/groups/${group.id}/vetting`, {
                      decision: 'selected', scores: vetScores, note: vetNote || undefined,
                    }), 'Vetting recorded: selected.')}
                  >
                    Select
                  </Button>
                  <Button
                    variant="outline" size="sm" disabled={busy}
                    onClick={() => run(() => api.post(`/saxansaxo/groups/${group.id}/vetting`, {
                      decision: 'not_selected', scores: vetScores, note: vetNote || undefined,
                    }), 'Vetting recorded: not selected.')}
                  >
                    Not selected
                  </Button>
                  <Button
                    variant="outline" size="sm" disabled={busy}
                    onClick={() => run(() => api.post(`/saxansaxo/groups/${group.id}/vetting`, {
                      decision: 'deferred', scores: vetScores, note: vetNote || undefined,
                    }), 'Vetting recorded: deferred.')}
                  >
                    Defer
                  </Button>
                </div>
              </div>
            )}
          </Card>

          {/* Steps 5-8 — Grant lifecycle */}
          <Card className="p-4">
            <div className="text-sm font-semibold mb-2">5–8 · Grant, disbursement, report, outcome</div>
            {latestGrant ? (
              <div className="space-y-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">
                    ${latestGrant.amount_usd.toLocaleString()}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    signatory {latestGrant.signatory_name}
                  </span>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${
                    latestGrant.signatory_screening === 'review'
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                  }`}>
                    <ShieldQuestion className="inline w-3 h-3 mr-0.5 -mt-px" />
                    {SCREENING_LABELS[latestGrant.signatory_screening] || latestGrant.signatory_screening}
                  </span>
                </div>

                {latestGrant.disbursed_at ? (
                  <p className="text-xs text-muted-foreground">
                    Selected {fmtDate(latestGrant.selected_at)} · disbursed
                    {' '}{fmtDate(latestGrant.disbursed_at)} —
                    {' '}{latestGrant.sla_days} day{latestGrant.sla_days === 1 ? '' : 's'}
                    {latestGrant.sla_breached && (
                      <span className="text-amber-600 dark:text-amber-400"> (over the 10-day promise)</span>
                    )}
                  </p>
                ) : (
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                      <Timer className="inline w-3 h-3 mr-0.5 -mt-px" />
                      day {latestGrant.sla_days ?? 0} of 10
                    </span>
                    <Button
                      size="sm" disabled={busy}
                      onClick={() => run(() => api.post(`/saxansaxo/grants/${latestGrant.id}/disburse`),
                        'Disbursement recorded — the report link is ready to share.')}
                    >
                      Money delivered
                    </Button>
                  </div>
                )}

                {latestGrant.disbursed_at && latestGrant.report_token && (
                  <div>
                    {latestGrant.has_report && latestGrant.report ? (
                      <div className="rounded-md border border-border p-3 space-y-1">
                        <div className="text-xs font-semibold text-muted-foreground">
                          Community report · {fmtDate(latestGrant.report.submitted_at)}
                        </div>
                        {Object.entries(latestGrant.report.answers).map(([k, v]) => (
                          v ? <div key={k} className="whitespace-pre-wrap text-sm">{v}</div> : null
                        ))}
                      </div>
                    ) : (
                      <Button
                        variant="outline" size="sm"
                        onClick={() => copyLink(`/sax-report/?token=${latestGrant.report_token}`)}
                      >
                        <Copy className="w-3.5 h-3.5 mr-1" /> Copy report link
                      </Button>
                    )}
                  </div>
                )}

                {latestGrant.disbursed_at && !latestGrant.outcome_tag && (
                  <div className="rounded-md border border-border p-3 space-y-2">
                    <div className="text-xs font-semibold text-muted-foreground">
                      Close with an outcome tag (non-punitive — the lesson matters, not blame)
                    </div>
                    <Textarea
                      rows={2}
                      placeholder="What did we learn? (optional)"
                      value={outcomeLesson}
                      onChange={(e) => setOutcomeLesson(e.target.value)}
                    />
                    <div className="flex flex-wrap gap-2">
                      {OUTCOME_OPTIONS.map((o) => (
                        <Button
                          key={o.tag} variant="outline" size="sm" disabled={busy}
                          title={o.hint}
                          onClick={() => run(() => api.post(`/saxansaxo/grants/${latestGrant.id}/outcome`, {
                            outcome_tag: o.tag,
                            outcome_lesson: outcomeLesson || undefined,
                          }), `Outcome recorded: ${o.label}.`)}
                        >
                          {o.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {latestGrant.outcome_tag && (
                  <div className="rounded-md border border-border p-3 text-sm">
                    <span className="font-medium">
                      {OUTCOME_OPTIONS.find((o) => o.tag === latestGrant.outcome_tag)?.label
                        || latestGrant.outcome_tag}
                    </span>
                    {latestGrant.outcome_lesson && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Lesson: {latestGrant.outcome_lesson}
                      </p>
                    )}
                    {latestGrant.co_contribution && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Community added: {latestGrant.co_contribution}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ) : group.vetting?.decision === 'selected' ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Selection starts the visible 10-day clock to money in hand.
                </p>
                <div className="grid gap-2 md:grid-cols-3">
                  <select
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                    value={grantFundId}
                    onChange={(e) => setGrantFundId(e.target.value)}
                  >
                    <option value="">Choose fund…</option>
                    {funds.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name} (${f.remaining_usd.toLocaleString()} left)
                      </option>
                    ))}
                  </select>
                  <Input
                    type="number" placeholder="Amount USD"
                    value={grantAmount}
                    onChange={(e) => setGrantAmount(e.target.value)}
                  />
                  <Input
                    placeholder="Signatory (who receives) *"
                    value={grantSignatory}
                    onChange={(e) => setGrantSignatory(e.target.value)}
                  />
                </div>
                <Button
                  size="sm"
                  disabled={busy || !grantFundId || !grantSignatory.trim()}
                  onClick={() => run(() => api.post(`/saxansaxo/groups/${group.id}/grant`, {
                    fund_id: parseInt(grantFundId, 10),
                    amount_usd: parseFloat(grantAmount || '0'),
                    signatory_name: grantSignatory.trim(),
                  }), 'Grant recorded — the 10-day clock is running.')}
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Issue grant'}
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                A grant becomes possible once vetting records a &quot;selected&quot; decision.
              </p>
            )}
          </Card>
        </div>
      </PageMain>
    </PageShell>
  );
}
