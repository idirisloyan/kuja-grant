'use client';

/**
 * Proximate Rounds list — Phase 649 (June 2026).
 *
 * Lists every funding round in the tenant, newest first, with status
 * pill (draft / in_review / active / closed / cancelled). OB sees the
 * "New round" CTA; everyone else can browse.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Plus, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { useTranslation } from '@/lib/hooks/use-translation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  PageShell, PageHeader, PageMain,
} from '@/components/layout/page-shell';

interface Round {
  id: number;
  title: string;
  title_ar: string | null;
  trigger_type: string;
  donor_name: string | null;
  envelope_usd: number | null;
  status: string;
  drafted_at: string | null;
  activated_at: string | null;
  closed_at: string | null;
  signed_count: number;
  signers_required: number;
}

const STATUS_TONE: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  in_review: 'bg-amber-100 text-amber-800 border-amber-300',
  active: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  closed: 'bg-blue-100 text-blue-800 border-blue-300',
  cancelled: 'bg-red-100 text-red-800 border-red-300',
};

export default function ProximateRoundsPage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'admin';
  const [rounds, setRounds] = useState<Round[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.get<{ rounds: Round[] }>('/api/proximate/rounds')
      .then((r) => { if (!cancelled) setRounds(r.rounds || []); })
      .catch(() => { if (!cancelled) setRounds([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <PageShell>
      <PageHeader
        title={t('proximate.rounds.title')}
        subtitle={t('proximate.rounds.subtitle')}
        primaryAction={isAdmin ? (
          <Link href="/proximate/rounds/new">
            <Button size="sm">
              <Plus className="w-3.5 h-3.5 me-1" />
              {t('proximate.rounds.new')}
            </Button>
          </Link>
        ) : undefined}
      />
      <PageMain>
        {loading && (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin" />
            {t('proximate.rounds.loading')}
          </p>
        )}
        {rounds !== null && rounds.length === 0 && !loading && (
          <Card className="p-6 text-center">
            <p className="text-sm text-muted-foreground">
              {t('proximate.rounds.empty')}
            </p>
          </Card>
        )}
        {rounds !== null && rounds.length > 0 && (
          <ul className="space-y-2">
            {rounds.map((r) => (
              <li key={r.id}>
                <Link href={`/proximate/rounds/${r.id}`} className="block">
                  <Card className="p-4 hover:bg-muted/30 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-medium truncate">{r.title}</h3>
                          <Badge variant="outline" className={`text-[10px] ${STATUS_TONE[r.status] || ''}`}>
                            {r.status}
                          </Badge>
                          {r.status === 'in_review' && (
                            <span className="text-xs text-muted-foreground">
                              {r.signed_count}/{r.signers_required} signed
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mt-1">
                          <span>{r.trigger_type}</span>
                          {r.donor_name && <span>· {r.donor_name}</span>}
                          {r.envelope_usd && (
                            <span>· ${r.envelope_usd.toLocaleString()}</span>
                          )}
                          {r.drafted_at && (
                            <span>· {new Date(r.drafted_at).toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
                    </div>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PageMain>
    </PageShell>
  );
}
