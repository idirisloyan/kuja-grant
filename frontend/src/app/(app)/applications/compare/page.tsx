'use client';

/**
 * Phase 203 — Donor side-by-side application compare.
 *
 * Donors paste IDs (or arrive via deep-link with ?ids=1,2,3) and see
 * each criterion as a row + each application as a column. Faster than
 * tab-flipping when there are 3-4 finalists for one grant.
 */

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Columns, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import {
  PageShell, PageHeader, PageMain,
} from '@/components/layout/page-shell';

interface Criterion { key: string | null; label: string | null; weight: number | null }
interface AppRow {
  id: number;
  org_name: string;
  org_country: string | null;
  status: string;
  ai_score: number | null;
  human_score: number | null;
  responses: Record<string, string>;
  submitted_at: string | null;
}
interface Resp { criteria: Criterion[]; applications: AppRow[] }

export default function CompareApplicationsPage() {
  const search = useSearchParams();
  const initialIds = search.get('ids') || '';
  const [ids, setIds] = useState(initialIds);
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(idsStr: string) {
    if (!idsStr.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const r = await api.get<Resp>(`/api/applications/compare?ids=${encodeURIComponent(idsStr.trim())}`);
      setData(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (initialIds) load(initialIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <PageShell>
      <PageHeader
        title="Compare applications"
        icon={Columns}
        subtitle="Side-by-side criterion responses for 2–4 applications on the same grant"
      />
      <PageMain>
        <Card className="p-4 space-y-3">
          <label className="block space-y-1">
            <span className="text-sm font-medium">Application IDs (comma-separated)</span>
            <div className="flex gap-2">
              <input
                type="text"
                value={ids}
                onChange={(e) => setIds(e.target.value)}
                placeholder="e.g. 12, 14, 17"
                className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              />
              <button
                type="button"
                onClick={() => load(ids)}
                disabled={loading || !ids.trim()}
                className="rounded-md bg-[hsl(var(--kuja-clay))] text-white px-3 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-60"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin inline" /> : 'Compare'}
              </button>
            </div>
          </label>
          {error && <p className="text-sm text-rose-600">{error}</p>}
        </Card>

        {data && data.applications.length > 0 && (
          <Card className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted-foreground bg-muted/40">
                <tr>
                  <th className="px-3 py-2 text-left w-44">Criterion</th>
                  {data.applications.map((a) => (
                    <th key={a.id} className="px-3 py-2 text-left align-bottom min-w-[240px]">
                      <Link href={`/applications/${a.id}`} className="font-semibold hover:underline">
                        {a.org_name}
                      </Link>
                      <div className="text-[10px] font-normal text-muted-foreground">
                        {a.org_country ?? '—'} · #{a.id}
                      </div>
                      <div className="mt-1 text-[10px] font-normal">
                        Status: <code className="text-[10px]">{a.status}</code>
                        {a.ai_score != null && <> · AI {Math.round(a.ai_score)}</>}
                        {a.human_score != null && <> · Human {Math.round(a.human_score)}</>}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.criteria.length === 0 && (
                  <tr>
                    <td colSpan={data.applications.length + 1} className="px-3 py-6 text-center text-muted-foreground">
                      No criteria on this grant — nothing to compare row-wise.
                    </td>
                  </tr>
                )}
                {data.criteria.map((c) => (
                  <tr key={c.key ?? c.label ?? ''} className="border-t border-border align-top">
                    <td className="px-3 py-3 font-medium text-xs">
                      {c.label ?? c.key ?? ''}
                      {c.weight != null && (
                        <div className="text-[10px] font-normal text-muted-foreground">
                          weight {c.weight}
                        </div>
                      )}
                    </td>
                    {data.applications.map((a) => (
                      <td key={a.id} className="px-3 py-3 text-xs whitespace-pre-line text-foreground/90">
                        {(c.key && a.responses[c.key]) || (
                          <span className="text-muted-foreground italic">—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </PageMain>
    </PageShell>
  );
}
