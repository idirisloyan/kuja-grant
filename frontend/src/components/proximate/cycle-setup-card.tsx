'use client';

/**
 * Cycle setup — where a Proximate round actually starts.
 *
 * The cycle begins with a place and a grant size, not with a partner.
 * Two things here earn their space:
 *
 *  - The money split. The donor envelope is not what partners can
 *    receive; salaries, technology and administration come out of it
 *    first. The remainder is computed and shown, because awards are
 *    checked against it and a secretariat that cannot see the number
 *    cannot plan against it.
 *
 *  - Target dates that warn rather than block. Cycles in Sudan slip
 *    because a road closed, not because anyone forgot.
 */

import { useEffect, useState } from 'react';
import { Loader2, MapPin, Banknote, CalendarClock, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const AREA_SOURCES: { key: string; label: string }[] = [
  { key: 'local_networks', label: 'Trusted local networks' },
  { key: 'community_information', label: 'Community / grassroots information' },
  { key: 'humanitarian_reports', label: 'Humanitarian or development reports' },
  { key: 'internal_analysis', label: 'Internal research / context analysis' },
  { key: 'targeted_mapping', label: 'Targeted mapping' },
];

interface Money {
  envelope_usd: number;
  admin_overhead_usd: number;
  disbursable_usd: number;
  awarded_usd: number;
  uncommitted_usd: number;
  grant_size_usd: number | null;
}

interface Setup {
  id: number;
  phase: string;
  target_region: string | null;
  target_locality: string | null;
  area_rationale: string | null;
  area_sources: string[];
  security_note: string | null;
  market_risk_note: string | null;
  conflict_sensitivity_note: string | null;
  feasibility_note: string | null;
  money: Money;
  target_award_date: string | null;
  target_disbursement_date: string | null;
  target_report_date: string | null;
  date_warnings: { kind: string; message: string; days_late: number }[];
}

function usd(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function CycleSetupCard({ roundId, canEdit }: { roundId: number; canEdit: boolean }) {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState<Record<string, string>>({});
  const [sources, setSources] = useState<string[]>([]);

  async function load() {
    setLoading(true);
    try {
      // The setup payload is returned by the PATCH; for the initial read
      // we ask for it with an empty patch so there is one shape to
      // maintain rather than two.
      const r = await api.patch<{ success: boolean; round: Setup }>(
        `/api/proximate/rounds/${roundId}/setup`, {},
      );
      if (r?.success) {
        setSetup(r.round);
        setSources(r.round.area_sources || []);
        setForm({
          target_region: r.round.target_region || '',
          target_locality: r.round.target_locality || '',
          area_rationale: r.round.area_rationale || '',
          security_note: r.round.security_note || '',
          market_risk_note: r.round.market_risk_note || '',
          conflict_sensitivity_note: r.round.conflict_sensitivity_note || '',
          feasibility_note: r.round.feasibility_note || '',
          grant_size_usd: r.round.money.grant_size_usd?.toString() || '',
          envelope_usd: r.round.money.envelope_usd?.toString() || '',
          admin_overhead_usd: r.round.money.admin_overhead_usd?.toString() || '',
          target_award_date: r.round.target_award_date || '',
          target_disbursement_date: r.round.target_disbursement_date || '',
          target_report_date: r.round.target_report_date || '',
        });
      }
    } catch { /* leave the card empty; the round page still renders */ }
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [roundId]);

  async function save() {
    setSaving(true);
    setError('');
    try {
      const r = await api.patch<{ success: boolean; round: Setup; error?: string }>(
        `/api/proximate/rounds/${roundId}/setup`,
        { ...form, area_sources: sources },
      );
      if (r?.success) {
        setSetup(r.round);
        setEditing(false);
      } else {
        setError(r?.error || 'Could not save.');
      }
    } catch (e) {
      setError((e as { message?: string })?.message || 'Could not save.');
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <Card className="p-5 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading cycle setup…
      </Card>
    );
  }
  if (!setup) return null;

  const m = setup.money;
  const overCommitted = m.uncommitted_usd < 0;

  return (
    <div className="space-y-4">
      {setup.date_warnings.length > 0 && (
        <Card className="p-4 border-amber-300 bg-amber-50 dark:bg-amber-950/30">
          <div className="flex gap-2">
            <CalendarClock className="w-4 h-4 text-amber-700 dark:text-amber-300 shrink-0 mt-0.5" />
            <div className="space-y-1">
              {setup.date_warnings.map((w) => (
                <p key={w.kind} className="text-sm text-amber-900 dark:text-amber-200">
                  {w.message}
                </p>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* ---- Money ---------------------------------------------------- */}
      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2">
            <Banknote className="w-4 h-4 text-muted-foreground" />
            Funding for this cycle
          </h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Donor envelope" value={usd(m.envelope_usd)} />
          <Stat label="Administration" value={usd(m.admin_overhead_usd)} />
          <Stat
            label="Available for partners"
            value={usd(m.disbursable_usd)}
            emphasis
          />
          <Stat
            label="Not yet committed"
            value={usd(m.uncommitted_usd)}
            tone={overCommitted ? 'bad' : undefined}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {usd(m.awarded_usd)} awarded so far.
          {m.grant_size_usd
            ? ` This cycle is built around grants of about ${usd(m.grant_size_usd)}.`
            : ''}
        </p>
        {overCommitted && (
          <p className="text-xs text-red-700 dark:text-red-400 flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            Awards exceed what is available for partners in this cycle.
          </p>
        )}
      </Card>

      {/* ---- Area ----------------------------------------------------- */}
      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2">
            <MapPin className="w-4 h-4 text-muted-foreground" />
            Area and rationale
          </h3>
          {canEdit && !editing && (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              Edit setup
            </Button>
          )}
        </div>

        {!editing ? (
          <div className="space-y-3 text-sm">
            <div>
              <span className="text-muted-foreground">Where: </span>
              {[setup.target_locality, setup.target_region].filter(Boolean).join(', ') || '—'}
            </div>
            <div>
              <span className="text-muted-foreground">Why this area: </span>
              {setup.area_rationale || <span className="text-muted-foreground">Not recorded yet.</span>}
            </div>
            {setup.area_sources.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {setup.area_sources.map((s) => (
                  <span
                    key={s}
                    className="text-xs rounded-full border border-border px-2 py-0.5 text-muted-foreground"
                  >
                    {AREA_SOURCES.find((x) => x.key === s)?.label || s}
                  </span>
                ))}
              </div>
            )}
            <Notes setup={setup} />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Region / state" v={form.target_region}
                     on={(x) => setForm({ ...form, target_region: x })} />
              <Field label="Locality" v={form.target_locality}
                     on={(x) => setForm({ ...form, target_locality: x })} />
              <Field label="Grant size for this cycle (USD)" v={form.grant_size_usd}
                     on={(x) => setForm({ ...form, grant_size_usd: x })} />
              <Field label="Donor envelope (USD)" v={form.envelope_usd}
                     on={(x) => setForm({ ...form, envelope_usd: x })} />
              <Field
                label="Administration & overhead (USD)"
                hint="Salaries, technology, admin. Subtracted from the envelope; the rest is what partners can be awarded."
                v={form.admin_overhead_usd}
                on={(x) => setForm({ ...form, admin_overhead_usd: x })}
              />
            </div>

            <Area label="Why this area was selected" v={form.area_rationale}
                  on={(x) => setForm({ ...form, area_rationale: x })} />

            <div>
              <p className="text-xs text-muted-foreground mb-1.5">
                What the selection is based on
              </p>
              <div className="flex flex-wrap gap-2">
                {AREA_SOURCES.map((s) => {
                  const on = sources.includes(s.key);
                  return (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => setSources(
                        on ? sources.filter((x) => x !== s.key) : [...sources, s.key],
                      )}
                      className={`text-xs rounded-full px-2.5 py-1 border transition-colors ${
                        on
                          ? 'border-[hsl(var(--kuja-clay))] bg-[hsl(var(--kuja-clay))]/10 text-foreground'
                          : 'border-border text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <Area label="Security and access" v={form.security_note}
                    on={(x) => setForm({ ...form, security_note: x })} />
              <Area label="Market risk" v={form.market_risk_note}
                    on={(x) => setForm({ ...form, market_risk_note: x })} />
              <Area label="Conflict sensitivity" v={form.conflict_sensitivity_note}
                    on={(x) => setForm({ ...form, conflict_sensitivity_note: x })} />
              <Area label="Implementation feasibility" v={form.feasibility_note}
                    on={(x) => setForm({ ...form, feasibility_note: x })} />
            </div>

            <div className="grid sm:grid-cols-3 gap-3">
              <Field label="Target award date" type="date" v={form.target_award_date}
                     on={(x) => setForm({ ...form, target_award_date: x })} />
              <Field label="Target disbursement date" type="date" v={form.target_disbursement_date}
                     on={(x) => setForm({ ...form, target_disbursement_date: x })} />
              <Field label="Target reporting date" type="date" v={form.target_report_date}
                     on={(x) => setForm({ ...form, target_report_date: x })} />
            </div>
            <p className="text-xs text-muted-foreground">
              Target dates raise a note when they pass. They never stop you
              continuing — ground conditions delay cycles, and that is not a
              reason for the system to refuse the next step.
            </p>

            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="outline" onClick={() => { setEditing(false); setError(''); }}>
                Cancel
              </Button>
              <Button size="sm" onClick={save} disabled={saving}>
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save setup'}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function Notes({ setup }: { setup: Setup }) {
  const rows = [
    ['Security and access', setup.security_note],
    ['Market risk', setup.market_risk_note],
    ['Conflict sensitivity', setup.conflict_sensitivity_note],
    ['Implementation feasibility', setup.feasibility_note],
  ].filter(([, v]) => v);
  if (!rows.length) return null;
  return (
    <dl className="grid sm:grid-cols-2 gap-3 pt-2 border-t border-border">
      {rows.map(([k, v]) => (
        <div key={k as string}>
          <dt className="text-xs text-muted-foreground">{k}</dt>
          <dd className="text-sm">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Stat({ label, value, emphasis, tone }: {
  label: string; value: string; emphasis?: boolean; tone?: 'bad';
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`tabular-nums ${
        tone === 'bad' ? 'text-red-600 dark:text-red-400 font-semibold'
          : emphasis ? 'font-semibold text-base' : ''
      }`}>
        {value}
      </p>
    </div>
  );
}

function Field({ label, v, on, type = 'text', hint }: {
  label: string; v: string; on: (x: string) => void; type?: string; hint?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="text-xs text-muted-foreground">{label}</span>
      <input
        type={type}
        value={v || ''}
        onChange={(e) => on(e.target.value)}
        className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
      />
      {hint && <span className="block mt-1 text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

function Area({ label, v, on }: { label: string; v: string; on: (x: string) => void }) {
  return (
    <label className="block text-sm">
      <span className="text-xs text-muted-foreground">{label}</span>
      <textarea
        rows={2}
        value={v || ''}
        onChange={(e) => on(e.target.value)}
        className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
      />
    </label>
  );
}
