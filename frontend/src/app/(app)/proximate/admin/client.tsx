'use client';

/**
 * Proximate — Oversight Body console ("Fund operations").
 *
 * A decision-first surface: what needs an OB decision today, the partner
 * readiness pipeline, a live attention queue, and the audit chain — all from
 * /api/proximate/overview. Styled with the Proximate design system (see the
 * [data-tenant="proximate"] block in globals.css). Navigation only; every
 * mutation lives on the partner / round detail pages.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Plus, ArrowRight, AlertTriangle, ShieldCheck, FileText, Users, Coins,
  Banknote, UserPlus, Flame, ShieldAlert,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useTranslation } from '@/lib/hooks/use-translation';
import { useProximatePersona } from '@/lib/hooks/use-proximate-persona';
import { labelForProximateAction } from '@/lib/proximate-audit-labels';

interface Overview {
  success: boolean;
  partners_by_status: Record<string, number>;
  partners_total: number;
  interventions: { open: number; expired: number; escalated: number; total: number };
  endorsers_pending: number;
  monitoring_due_this_month: number;
  fsps_registered: number;
  month: string;
  recent_audit: Array<{
    seq: number; action: string; actor_email: string;
    subject_kind: string; subject_id: number; created_at: string | null;
  }>;
}

// Map an audit action to a timeline tone.
function auditTone(action: string): 'good' | 'acc' | 'warn' | '' {
  const a = action.toLowerCase();
  if (/(sign|verif|clear|approv|complete|disburse)/.test(a)) return 'good';
  if (/(open|creat|nominat|register|start)/.test(a)) return 'acc';
  if (/(expire|escalat|suspend|flag|reject|block)/.test(a)) return 'warn';
  return '';
}

export function ProximateAdminClient() {
  const { t } = useTranslation();
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { persona, isLoading: personaLoading } = useProximatePersona();

  useEffect(() => {
    if (personaLoading) return;
    if (persona === 'donor' && typeof window !== 'undefined') {
      window.location.replace('/proximate/donor');
    }
  }, [persona, personaLoading]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.get<Overview>('/api/proximate/overview')
      .then((r) => { if (!cancelled) setData(r); })
      .catch(() => { if (!cancelled) setError(t('proximate.admin.overview_failed')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const head = (
    <div className="flex items-end justify-between gap-6 flex-wrap">
      <div>
        <div className="prox-eyebrow">{t('proximate.admin.title')}</div>
        <h1 className="kuja-display mt-1.5 mb-1" style={{ fontSize: 27, lineHeight: 1.1 }}>
          {t('proximate.admin.ob_hero')}
        </h1>
        <p className="text-sm" style={{ color: 'var(--prox-muted)', maxWidth: '54ch' }}>
          {t('proximate.admin.ob_hero_sub')}
        </p>
      </div>
      <Link href="/proximate/rounds/new" className="prox-btn primary">
        <Plus className="h-4 w-4" strokeWidth={2.4} /> {t('proximate.admin.new_round')}
      </Link>
    </div>
  );

  if (loading) {
    return (
      <div className="space-y-6">
        {head}
        <div className="grid gap-3.5 md:grid-cols-3">
          {[0, 1, 2].map((i) => <div key={i} className="prox-panel" style={{ height: 122 }} />)}
        </div>
        <div className="prox-panel kuja-shimmer" style={{ height: 150 }} />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="space-y-6">
        {head}
        <div className="prox-panel" style={{ padding: 40, textAlign: 'center', color: 'var(--prox-muted)' }}>
          {error || t('proximate.admin.overview_failed')}
        </div>
      </div>
    );
  }

  const pb = data.partners_by_status;
  const intake = pb.intake ?? 0;
  const ddPending = pb.dd_pending ?? 0;
  const cleared = pb.dd_clear ?? 0;
  const suspended = pb.suspended ?? 0;
  const total = data.partners_total;
  const pct = (n: number) => `${Math.max(2, Math.round((n / Math.max(1, total)) * 100))}%`;

  const iv = data.interventions;

  // Decision cards — the three counts that most often need OB action.
  const decisions = [
    {
      kind: t('proximate.admin.open_interventions'),
      count: iv.total,
      tone: iv.expired > 0 ? 'danger' : iv.open > 0 ? 'warn' : 'slate',
      pill: iv.expired > 0
        ? { c: 'danger', tx: `${iv.expired} ${t('proximate.admin.expired_response')}` }
        : { c: iv.open > 0 ? 'warn' : 'good', tx: t('proximate.admin.all_within_window') },
      href: '/proximate/admin/partners',
    },
    {
      kind: t('proximate.admin.endorsers_pending'),
      count: data.endorsers_pending,
      tone: data.endorsers_pending > 0 ? 'acc' : 'slate',
      pill: { c: data.endorsers_pending > 0 ? 'acc' : 'good', tx: t('proximate.admin.kyc_review_needed') },
      href: '/proximate/admin/endorsers',
    },
    {
      kind: t('proximate.admin.monitoring_due'),
      count: data.monitoring_due_this_month,
      tone: data.monitoring_due_this_month > 0 ? 'warn' : 'slate',
      pill: { c: 'slate', tx: data.month },
      href: '/proximate/admin/partners',
    },
  ];

  // Live attention queue — only the signals that are actually non-zero.
  type Sig = { label: string; sub: string; pill: string; pillTx: string; href: string };
  const signals: Sig[] = [];
  if (iv.expired > 0) signals.push({ label: t('proximate.admin.expired_response'), sub: t('proximate.admin.open_interventions'), pill: 'danger', pillTx: String(iv.expired), href: '/proximate/admin/partners' });
  if (iv.open > 0) signals.push({ label: t('proximate.admin.open_interventions'), sub: t('proximate.admin.title'), pill: 'warn', pillTx: String(iv.open), href: '/proximate/admin/partners' });
  if (data.endorsers_pending > 0) signals.push({ label: t('proximate.admin.endorsers_pending'), sub: t('proximate.admin.kyc_review_needed'), pill: 'acc', pillTx: String(data.endorsers_pending), href: '/proximate/admin/endorsers' });
  if (ddPending > 0) signals.push({ label: t('proximate.admin.pipe_dd'), sub: t('proximate.admin.partners'), pill: 'warn', pillTx: String(ddPending), href: '/proximate/admin/partners' });
  if (data.monitoring_due_this_month > 0) signals.push({ label: t('proximate.admin.monitoring_due'), sub: data.month, pill: 'slate', pillTx: String(data.monitoring_due_this_month), href: '/proximate/admin/partners' });
  if (intake > 0) signals.push({ label: t('proximate.admin.pipe_intake'), sub: t('proximate.admin.partners'), pill: 'slate', pillTx: String(intake), href: '/proximate/admin/partners' });

  const workflow = [
    { icon: Coins, label: t('proximate.admin.tile_rounds'), href: '/proximate/rounds' },
    { icon: Banknote, label: t('proximate.admin.tile_disbursements'), href: '/proximate/disbursements' },
    { icon: UserPlus, label: t('proximate.admin.tile_nominate_partner') || 'Nominate a partner', href: '/proximate/admin/partners/new' },
    { icon: Flame, label: t('proximate.admin.tile_crisis_selector'), href: '/proximate/crisis-selector' },
    { icon: ShieldAlert, label: t('proximate.grievance_queue.title'), href: '/proximate/admin/grievances' },
    { icon: Banknote, label: t('proximate.admin.tile_register_fsp') || 'Providers', href: '/proximate/admin/fsps' },
    { icon: FileText, label: t('proximate.admin.tile_messages') || 'Messages', href: '/proximate/admin/messages' },
    { icon: Users, label: t('proximate.admin.partners'), href: '/proximate/admin/partners' },
  ];

  const arrow = <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.4} />;

  return (
    <div className="space-y-6">
      {head}

      {/* DECISION STRIP */}
      <div className="grid gap-3.5 md:grid-cols-3">
        {decisions.map((d, i) => (
          <Link key={i} href={d.href} className={`prox-decision ${d.tone}`}>
            <span className="kind">{d.kind}</span>
            <div className="big prox-num">{d.count}</div>
            <div className="flex items-center justify-between gap-2" style={{ marginTop: 'auto' }}>
              <span className={`prox-pill ${d.pill.c}`}>{d.pill.tx}</span>
              <span className="inline-flex items-center gap-1 text-[13px] font-semibold" style={{ color: 'var(--prox-accent)' }}>
                {t('proximate.admin.open_link')} {arrow}
              </span>
            </div>
          </Link>
        ))}
      </div>

      {/* PARTNER PIPELINE */}
      <div className="prox-panel">
        <div className="prox-phead">
          <h2>{t('proximate.admin.pipeline')}</h2>
          <Link href="/proximate/admin/partners" className="prox-link">{t('proximate.admin.view_all')} →</Link>
        </div>
        <div style={{ padding: '20px 18px 22px' }}>
          <div className="prox-pipe" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
            <div className="prox-stage"><span className="lab">{t('proximate.admin.partners')}</span><div className="val prox-num">{total}</div><span className="meta">{t('proximate.admin.pipe_all')}</span></div>
            <div className="prox-stage"><span className="lab">{t('proximate.admin.pipe_intake')}</span><div className="val prox-num">{intake}</div><span className="meta">{t('proximate.admin.pipe_intake_sub')}</span></div>
            <div className="prox-stage"><span className="lab">{t('proximate.admin.pipe_dd')}</span><div className="val prox-num">{ddPending}</div><span className="meta">{t('proximate.admin.pipe_dd_sub')}</span></div>
            <div className="prox-stage"><span className="lab" style={{ color: 'var(--prox-good)' }}>{t('proximate.admin.pipe_cleared')}</span><div className="val prox-num">{cleared}</div><span className="meta">{t('proximate.admin.pipe_cleared_sub')}</span></div>
          </div>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', gap: 0, marginTop: 16 }}>
            <div className="prox-bar" style={{ margin: '0 14px 0 0' }}><i style={{ width: '100%' }} /></div>
            <div className="prox-bar" style={{ margin: '0 14px' }}><i style={{ width: pct(intake) }} /></div>
            <div className="prox-bar" style={{ margin: '0 14px' }}><i style={{ width: pct(ddPending) }} /></div>
            <div className="prox-bar good" style={{ margin: '0 0 0 14px' }}><i style={{ width: pct(cleared) }} /></div>
          </div>
          {suspended > 0 && (
            <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="prox-pill danger">{suspended}</span>
              <span className="text-[12.5px]" style={{ color: 'var(--prox-muted)' }}>{t('proximate.admin.pipe_suspended')}</span>
            </div>
          )}
        </div>
      </div>

      {/* QUEUE + AUDIT */}
      <div className="grid gap-4 items-start" style={{ gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr)' }}>
        <div className="prox-panel">
          <div className="prox-phead">
            <h2>{t('proximate.admin.needs_attention')}</h2>
            <span className={`prox-pill ${signals.length ? 'acc' : 'good'}`}>
              {signals.length ? `${signals.length} ${t('proximate.admin.open_count')}` : t('proximate.admin.all_clear')}
            </span>
          </div>
          {signals.length === 0 ? (
            <div style={{ padding: '28px 18px', textAlign: 'center', color: 'var(--prox-muted)', fontSize: 13.5 }}>
              <ShieldCheck className="h-6 w-6 mx-auto mb-2" style={{ color: 'var(--prox-good)' }} />
              {t('proximate.admin.all_within_window')}
            </div>
          ) : signals.map((s, i) => (
            <Link key={i} href={s.href} className="prox-qrow">
              <div style={{ minWidth: 0 }}>
                <strong>{s.label}</strong>
                <small>{s.sub}</small>
              </div>
              <span className={`prox-pill ${s.pill}`}>{s.pillTx}</span>
              <ArrowRight className="h-4 w-4" style={{ color: 'var(--prox-muted)' }} />
            </Link>
          ))}
        </div>

        <div className="prox-panel">
          <div className="prox-phead">
            <h2>{t('proximate.admin.audit')}</h2>
            <Link href="/proximate/admin/audit-chain" className="prox-link">{t('proximate.admin.view_all')} →</Link>
          </div>
          <div style={{ padding: '6px 18px 12px' }}>
            {data.recent_audit.length === 0 ? (
              <p className="text-[12.5px] py-3" style={{ color: 'var(--prox-muted)' }}>{t('proximate.admin.no_activity')}</p>
            ) : data.recent_audit.slice(0, 6).map((row) => {
              const tone = auditTone(row.action);
              return (
                <div key={row.seq} className={`prox-aitem ${tone}`}>
                  <div className="node"><span className="d" /><span className="l" /></div>
                  <div>
                    <p>{labelForProximateAction(row.action, t)}</p>
                    <div className="prox-amon">
                      {row.actor_email?.split('@')[0]}
                      <span className="prox-hash prox-mono">#{row.seq}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* WORKFLOW QUICK LINKS */}
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))' }}>
        {workflow.map((w, i) => {
          const Icon = w.icon;
          return (
            <Link key={i} href={w.href} className="prox-stat" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 15px' }}>
              <span style={{ width: 34, height: 34, borderRadius: 9, display: 'grid', placeItems: 'center', background: 'var(--prox-accent-tint)', color: 'var(--prox-accent-deep)', flex: '0 0 auto' }}>
                <Icon className="h-4 w-4" />
              </span>
              <span className="text-[13.5px] font-semibold" style={{ color: 'var(--prox-ink)' }}>{w.label}</span>
              <ArrowRight className="h-4 w-4 ms-auto" style={{ color: 'var(--prox-muted)' }} />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
