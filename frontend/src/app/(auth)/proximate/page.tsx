'use client';

/**
 * Public transparency page — Phase 716e (July 2026).
 *
 * Trust-building surface for future donors and the public at
 * /proximate. No auth. Reads the daily-cached
 * /api/proximate/public/transparency aggregates: envelope moved this
 * year, partner counts by locality, sustained-outcome rate, active
 * rounds (title + trigger only). No PII, no per-disbursement detail —
 * the endpoint enforces that; this page just renders it.
 *
 * Bilingual AR-first hardcoded copy (public audience, no app locale).
 */

import { useEffect, useState } from 'react';
import { Loader2, HandCoins, Users, TrendingUp, Radio } from 'lucide-react';
import { Card } from '@/components/ui/card';

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || '').replace(/\/$/, '');

interface Transparency {
  year: number;
  total_moved_usd: number;
  disbursement_count: number;
  partner_count: number;
  partners_by_locality: Record<string, number>;
  sustained_outcome_rate_pct: number | null;
  outcomes_attested: number;
  active_rounds: { title: string; trigger_type: string }[];
  generated_at: string;
}

export default function ProximateTransparencyPage() {
  const [data, setData] = useState<Transparency | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/proximate/public/transparency`, {
      headers: { 'X-Network-Override': 'proximate' },
    })
      .then(async (r) => {
        const body = await r.json();
        if (r.ok && body.success) setData(body.transparency);
        else setError(true);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 lg:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Adeso · Proximate Fund
          </p>
          <h1 className="text-3xl kuja-display" dir="rtl">صندوق بروكسيمت — الشفافية</h1>
          <h2 className="text-2xl text-muted-foreground">Transparency</h2>
          <p className="text-sm text-muted-foreground" dir="rtl">
            تمويل مباشر للمجموعات المجتمعية في السودان — بأمانة كاملة أمام
            المجتمع والمانحين. هذه الأرقام تُحدَّث يومياً.
          </p>
          <p className="text-sm text-muted-foreground">
            Direct funding to community groups in Sudan — fully accountable to
            the community and to donors. These figures refresh daily.
          </p>
        </header>

        {error || !data ? (
          <Card className="p-8 text-sm text-center text-muted-foreground">
            Data is temporarily unavailable. Please check back later.
          </Card>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <Card className="p-5 space-y-1">
                <HandCoins className="w-5 h-5 text-emerald-600" />
                <p className="text-2xl font-semibold">
                  ${Math.round(data.total_moved_usd).toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">
                  moved in {data.year} · {data.disbursement_count} disbursements
                </p>
                <p className="text-xs text-muted-foreground" dir="rtl">
                  المبالغ المحوّلة في {data.year}
                </p>
              </Card>
              <Card className="p-5 space-y-1">
                <Users className="w-5 h-5 text-blue-600" />
                <p className="text-2xl font-semibold">{data.partner_count}</p>
                <p className="text-xs text-muted-foreground">
                  community partners in the pipeline
                </p>
                <p className="text-xs text-muted-foreground" dir="rtl">
                  شركاء مجتمعيون
                </p>
              </Card>
              <Card className="p-5 space-y-1">
                <TrendingUp className="w-5 h-5 text-violet-600" />
                <p className="text-2xl font-semibold">
                  {data.sustained_outcome_rate_pct != null
                    ? `${data.sustained_outcome_rate_pct}%`
                    : '—'}
                </p>
                <p className="text-xs text-muted-foreground">
                  outcomes verified as sustained at 90 days
                  {data.outcomes_attested > 0 && ` (${data.outcomes_attested} attested)`}
                </p>
                <p className="text-xs text-muted-foreground" dir="rtl">
                  نتائج مستدامة بعد ٩٠ يوماً
                </p>
              </Card>
            </div>

            <section className="space-y-3">
              <h3 className="text-lg font-medium">
                Partners by locality <span className="text-muted-foreground font-normal" dir="rtl">· الشركاء حسب المنطقة</span>
              </h3>
              <Card className="p-4">
                {Object.keys(data.partners_by_locality).length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-3">—</p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {Object.entries(data.partners_by_locality)
                      .sort((a, b) => b[1] - a[1])
                      .map(([loc, n]) => (
                        <div key={loc} className="flex justify-between text-sm border-b last:border-0 py-1.5">
                          <span dir="auto">{loc}</span>
                          <span className="font-medium">{n}</span>
                        </div>
                      ))}
                  </div>
                )}
              </Card>
            </section>

            <section className="space-y-3">
              <h3 className="text-lg font-medium">
                Active funding rounds <span className="text-muted-foreground font-normal" dir="rtl">· جولات التمويل النشطة</span>
              </h3>
              {data.active_rounds.length === 0 ? (
                <Card className="p-5 text-sm text-center text-muted-foreground">
                  No rounds are currently active. · <span dir="rtl">لا توجد جولات نشطة حالياً</span>
                </Card>
              ) : (
                data.active_rounds.map((r, i) => (
                  <Card key={i} className="p-4 flex items-center gap-3">
                    <Radio className="w-4 h-4 text-emerald-600 shrink-0" />
                    <div>
                      <p className="text-sm font-medium" dir="auto">{r.title}</p>
                      <p className="text-xs text-muted-foreground">
                        trigger: {r.trigger_type}
                      </p>
                    </div>
                  </Card>
                ))
              )}
            </section>

            <footer className="text-xs text-muted-foreground border-t pt-4 space-y-2">
              <p dir="rtl">
                لا تعرض هذه الصفحة أي بيانات شخصية أو تفاصيل صرف فردية.
                لديك ملاحظة أو مخاوف؟{' '}
                <a href="/proximate-grievance" className="text-blue-600 hover:underline">
                  أبلغ عنها هنا
                </a>
                .
              </p>
              <p>
                This page shows no personal data and no per-disbursement
                detail. Questions or concerns?{' '}
                <a href="/proximate-grievance" className="text-blue-600 hover:underline">
                  Report them here
                </a>
                . Community groups can{' '}
                <a href="/proximate-nominate" className="text-blue-600 hover:underline">
                  put themselves forward
                </a>
                .
              </p>
              <p className="text-muted-foreground/70">
                Last refreshed {new Date(data.generated_at).toLocaleString()}
              </p>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
