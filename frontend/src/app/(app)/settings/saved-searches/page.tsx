'use client';

/**
 * Phase 219 — Saved searches management page.
 *
 * Lists every saved search the user has stashed across scopes
 * (grants, applications, organizations). Deletes are one-click.
 * Create still happens inline via SavedSearchesBar — this is the
 * "later I want to clean up" surface.
 */

import { useEffect, useState } from 'react';
import { Bookmark, Trash2, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { PageShell, PageHeader, PageMain } from '@/components/layout/page-shell';

interface SavedSearch {
  id: number;
  scope: string;
  name: string;
  filter_json?: Record<string, unknown> | string | null;
  created_at?: string | null;
}

interface Resp {
  searches: SavedSearch[];
}

export default function SavedSearchesPage() {
  const [rows, setRows] = useState<SavedSearch[] | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const r = await api.get<Resp>('/api/saved-searches/');
      setRows(Array.isArray(r?.searches) ? r.searches : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function remove(id: number) {
    if (!confirm('Delete this saved search?')) return;
    try {
      await api.delete(`/api/saved-searches/${id}`);
      setRows((cur) => (cur ?? []).filter((r) => r.id !== id));
    } catch {
      alert('Could not delete.');
    }
  }

  const grouped = (rows ?? []).reduce((acc, r) => {
    (acc[r.scope] ||= []).push(r);
    return acc;
  }, {} as Record<string, SavedSearch[]>);

  return (
    <PageShell>
      <PageHeader
        title="Saved searches"
        icon={Bookmark}
        subtitle="Manage saved filters you've created across grants, applications, and organizations."
      />
      <PageMain>
        {loading && (
          <div className="text-sm text-muted-foreground py-6 text-center">
            <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Loading…
          </div>
        )}
        {rows && rows.length === 0 && (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            No saved searches yet. Open the grants, applications, or organizations
            list and click "Save this search" to stash a filter.
          </Card>
        )}
        {rows && rows.length > 0 && (
          <div className="space-y-4">
            {Object.entries(grouped).map(([scope, items]) => (
              <Card key={scope} className="p-4 space-y-2">
                <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                  {scope}
                </div>
                {items.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between rounded-md border border-border bg-card p-2 text-sm"
                  >
                    <span className="font-medium truncate mr-2">{s.name}</span>
                    <button
                      type="button"
                      onClick={() => remove(s.id)}
                      className="inline-flex items-center gap-1 text-xs text-rose-600 hover:text-rose-700"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  </div>
                ))}
              </Card>
            ))}
          </div>
        )}
      </PageMain>
    </PageShell>
  );
}
