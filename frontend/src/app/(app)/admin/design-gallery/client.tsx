'use client';

/**
 * /admin/design-gallery — Phase 98 design backlog component gallery.
 *
 * Dev-facing inventory of the shared/* components shipped under the
 * Phase 98 design review. Each panel renders the component with
 * realistic sample data so QA + designers can verify visual fidelity
 * without having to navigate to every page where the component is wired.
 *
 * Not user-facing. Admin-only. Loaded only on request.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sparkles, Send, FileText, Building2 } from 'lucide-react';
import { PageShell, PageBack, PageHeader, PageMain } from '@/components/layout/page-shell';

import { WaitingFor, type Actor } from '@/components/shared/waiting-for';
import { TimeEstimate } from '@/components/shared/time-estimate';
import { AiDiff } from '@/components/shared/ai-diff';
import { OneNumberCard } from '@/components/shared/one-number-card';
import { StickyMobileCta } from '@/components/shared/sticky-mobile-cta';
import { WhyThisMatch } from '@/components/shared/why-this-match';
import { PreSubmitPreview, type Fix } from '@/components/shared/pre-submit-preview';
import { PredictiveNudge } from '@/components/shared/predictive-nudge';
import { CollapseSection } from '@/components/shared/collapse-section';
import { PrimaryAiBar } from '@/components/shared/primary-ai-bar';

const SAMPLE_ACTORS: Actor[] = [
  { name: 'Amina Diallo', status: 'done', at: '2026-06-19T10:14:00Z', role: 'OB Co-chair' },
  { name: 'Peter Kamau', status: 'pending', role: 'Programs Lead' },
  { name: 'Hawa Sesay', status: 'declined', role: 'Finance Lead' },
];

const SAMPLE_ORIGINAL =
  'we needed water tanks because the community ran out of clean water and people got sick.';

const SAMPLE_PROPOSED =
  'The community required additional water tanks to address an acute shortage of clean drinking water that had begun causing waterborne illness among residents.';

const SAMPLE_FIXES: Fix[] = [
  { label: 'Add a budget line for travel to remote sites', estimatedMinutes: 3, fieldId: 'budget-travel' },
  { label: 'Attach a logframe — the rubric weights it 25%', estimatedMinutes: 6, fieldId: 'logframe' },
];

function Section({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) {
  return (
    <section className="border border-border rounded-lg bg-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        {hint && <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{hint}</span>}
      </div>
      <div data-gallery-slot>{children}</div>
    </section>
  );
}

export default function DesignGalleryClient() {
  const [aiState, setAiState] = useState<'idle' | 'loading' | 'done'>('idle');
  const [diffShown, setDiffShown] = useState(true);
  const [diffOriginal, setDiffOriginal] = useState(SAMPLE_ORIGINAL);
  const [preSubmitState, setPreSubmitState] = useState<'loading' | 'ready' | 'low-conf'>('ready');
  const [acceptedFix, setAcceptedFix] = useState<string | null>(null);

  return (
    <PageShell>
      <PageBack href="/admin" label="Back to admin" />
      <PageHeader
        title="Design Gallery"
        icon={Sparkles}
        meta={[
          { label: 'Phase 98 components' },
          { label: 'Admin-only · dev surface', icon: Building2 },
        ]}
      />

      <PageMain>
        <p className="text-xs text-muted-foreground">
          Each panel below renders a component shipped under the Phase 98 design backlog
          with realistic sample data. Use to verify visual fidelity; production wirings
          live on the pages noted in each panel&apos;s hint.
        </p>

        <Section title="WaitingFor" hint="wired on /admin/declarations/[id]">
          <WaitingFor what="2 signatures" actors={SAMPLE_ACTORS} />
        </Section>

        <Section title="TimeEstimate" hint="wired on /reports/[id]">
          <div className="flex gap-2 flex-wrap">
            <TimeEstimate minutes={6} progress={{ done: 3, total: 5 }} />
            <TimeEstimate minutes={45} trailingLabel="to first draft" />
            <TimeEstimate minutes={null} progress={{ done: 4, total: 4 }} />
            <TimeEstimate minutes={90} size="md" trailingLabel="left" />
          </div>
        </Section>

        <Section title="OneNumberCard" hint="wired on /ngo/[id]">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <OneNumberCard
              label="On-time reporting"
              value="84%"
              comparison="Peer median 71%"
              trend="up"
              tone="success"
              nextAction="Catch up on 2 overdue"
              nextActionHref="#"
            />
            <OneNumberCard
              label="Pipeline value"
              value="$1.4M"
              comparison="vs $1.1M last quarter"
              trend="up"
              tone="neutral"
              icon={FileText}
            />
            <OneNumberCard
              label="Overdue"
              value="3"
              tone="danger"
              comparison="Most overdue: 12 days"
              nextAction="Send a nudge"
            />
          </div>
        </Section>

        <Section title="WhyThisMatch" hint="wired on /grants/[id] (NGO view)">
          <WhyThisMatch
            reasons={[
              { facet: 'sector', value: 'WASH' },
              { facet: 'country', value: 'Kenya' },
              { facet: 'readiness' },
            ]}
            caveat="Match is automated. Eligibility decisions are made by the donor."
          />
        </Section>

        <Section title="PrimaryAiBar" hint="universal AI verb pattern">
          <PrimaryAiBar
            verb="Draft this for me"
            hint="Uses your Trust Profile + the donor's call language"
            state={aiState}
            onPrimary={() => {
              setAiState('loading');
              setTimeout(() => setAiState('done'), 1200);
            }}
            secondary={[
              { label: 'Check before I submit', hint: 'Predicted score + top fixes', onClick: () => setPreSubmitState('ready') },
              { label: 'Translate to my language', hint: 'EN → SW/AR/SO/FR/ES', onClick: () => alert('translate clicked') },
              { label: 'Explain this flag', hint: 'Plain-language compliance', onClick: () => alert('explain clicked') },
            ]}
            surface="gallery-primary-ai-bar"
          />
        </Section>

        <Section title="AiDiff" hint="universal Propose → Diff → Accept">
          {diffShown ? (
            <AiDiff
              original={diffOriginal}
              proposed={SAMPLE_PROPOSED}
              surface="gallery-ai-diff"
              caption="grammar + clarity"
              onAccept={() => {
                setDiffOriginal(SAMPLE_PROPOSED);
                setDiffShown(false);
              }}
              onReject={() => setDiffShown(false)}
              onBlend={(t) => { setDiffOriginal(t); setDiffShown(false); }}
            />
          ) : (
            <div className="text-xs text-muted-foreground">
              Resolved: <span className="font-medium text-foreground">{diffOriginal.slice(0, 80)}{diffOriginal.length > 80 ? '…' : ''}</span>
              <button
                type="button"
                onClick={() => { setDiffOriginal(SAMPLE_ORIGINAL); setDiffShown(true); }}
                className="ml-3 underline text-[hsl(var(--kuja-clay))]"
              >
                Reset gallery example
              </button>
            </div>
          )}
        </Section>

        <Section title="PreSubmitPreview" hint="wave 3 — wired on apply page next">
          <div className="flex gap-2 mb-2">
            <Button size="sm" variant="outline" onClick={() => setPreSubmitState('loading')}>Loading state</Button>
            <Button size="sm" variant="outline" onClick={() => setPreSubmitState('ready')}>Ready state</Button>
            <Button size="sm" variant="outline" onClick={() => setPreSubmitState('low-conf')}>Low-confidence state</Button>
          </div>
          <PreSubmitPreview
            status={preSubmitState}
            predictedBand="Likely strong (top 25%)"
            confidence="medium"
            fixes={SAMPLE_FIXES}
            onFixIt={(f) => setAcceptedFix(f.label)}
            onSubmitAnyway={() => alert('Submit anyway clicked')}
          />
          {acceptedFix && (
            <p className="mt-2 text-[11px] text-emerald-700">
              Last fix clicked: {acceptedFix}
            </p>
          )}
        </Section>

        <Section title="PredictiveNudge" hint="wave 3 — proactive coaching">
          <PredictiveNudge
            percentDone={80}
            minutesLeft={6}
            fieldsLeft={2}
            fieldsTotal={10}
            nextTapLabel="Save and continue"
            nextTapHref="#"
            deadlineISO={new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString()}
          />
        </Section>

        <Section title="CollapseSection" hint="wired on /reports/[id]">
          <CollapseSection title="Audit detail" caption="9 events" defaultOpen={false} storageKey="gallery-audit">
            <p className="text-xs text-muted-foreground">
              This is collapsed by default. The state persists per-user in localStorage so
              the user&apos;s choice survives reload. Use for secondary detail the user
              <em> sometimes</em> needs — never primary content.
            </p>
          </CollapseSection>
          <CollapseSection title="Compliance breakdown" caption="3 flags" defaultOpen={true} className="mt-2">
            <p className="text-xs text-muted-foreground">
              This one starts open. Identical primitive — caller decides the default
              based on whether the user is likely to need this on every visit.
            </p>
          </CollapseSection>
        </Section>

        <Section title="StickyMobileCta" hint="bottom of long mobile forms">
          <p className="text-xs text-muted-foreground">
            On phones, the primary action below pins to the bottom of the viewport.
            On tablet+, it falls back to inline. Resize the window to see the switch.
          </p>
          <div className="rounded border border-dashed border-border p-3 mt-2">
            <p className="text-xs text-muted-foreground mb-2">— form fields above this CTA —</p>
            <StickyMobileCta
              hint={<TimeEstimate minutes={6} progress={{ done: 3, total: 5 }} />}
            >
              <Button size="sm">
                <Send className="mr-1 h-3 w-3" /> Submit application
              </Button>
            </StickyMobileCta>
          </div>
        </Section>
      </PageMain>
    </PageShell>
  );
}
