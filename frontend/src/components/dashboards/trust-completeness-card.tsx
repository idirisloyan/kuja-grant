'use client';

/**
 * Phase 230 — NGO Trust Profile completeness coach.
 *
 * Reads /api/trust-profile/<org_id> and surfaces pillars/components
 * still flagged "missing" or "incomplete" so the NGO knows what to
 * fix. Hidden when everything is complete. Links to /trust.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ShieldCheck, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Component {
  key?: string;
  label?: string;
  status?: string;
}

interface Pillar {
  key?: string;
  label?: string;
  status?: string;
  components?: Component[];
}

interface Profile {
  pillars?: Pillar[];
}

interface Resp {
  profile?: Profile;
}

const MISSING_STATES = new Set(['missing', 'incomplete', 'pending', 'unknown']);

export function TrustCompletenessCard() {
  const user = useAuthStore((s) => s.user);
  const [gaps, setGaps] = useState<Array<{ label: string; pillar: string }>>([]);

  useEffect(() => {
    if (!user?.org_id) return;
    let cancelled = false;
    api.get<Resp>(`/api/trust-profile/${user.org_id}`).then((r) => {
      if (cancelled) return;
      const out: Array<{ label: string; pillar: string }> = [];
      for (const p of r?.profile?.pillars ?? []) {
        const pl = p.label ?? p.key ?? '';
        for (const c of p.components ?? []) {
          if (c.status && MISSING_STATES.has(c.status)) {
            out.push({ label: c.label ?? c.key ?? '(unnamed)', pillar: pl });
          }
        }
      }
      setGaps(out.slice(0, 6));
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, [user?.org_id]);

  if (gaps.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
          Trust Profile gaps ({gaps.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {gaps.map((g, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <AlertCircle className="w-3.5 h-3.5 text-rose-500 flex-shrink-0" />
            <span className="flex-1">{g.label}</span>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground whitespace-nowrap">{g.pillar}</span>
          </div>
        ))}
        <div className="pt-2 border-t border-border">
          <Link href="/trust" className="text-xs text-[hsl(var(--kuja-clay))] hover:underline">
            Open Trust Profile →
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
