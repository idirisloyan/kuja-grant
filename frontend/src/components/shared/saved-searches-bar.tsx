'use client';

/**
 * SavedSearchesBar — Phase 13.36.
 *
 * Drop-in component for any list page (grants / applications / reports /
 * organizations / reviews / risks). Renders the user's saved searches
 * for that scope as a row of chips. Click a chip → applies the saved
 * filter via `onApply`. Each chip exposes ↑/↓ to reorder (calls the
 * `/api/saved-searches/reorder` endpoint) and × to delete. A "+ Save
 * current" button captures the current filter object.
 *
 * No DnD library — up/down arrow controls are accessible (keyboard
 * navigable, screen-reader-friendly), zero new deps, and fast to ship.
 *
 * Usage:
 *
 *   const [filter, setFilter] = useState<MyFilter>({ status: 'open' });
 *   <SavedSearchesBar
 *     scope="grants"
 *     currentFilter={filter}
 *     onApply={(f) => setFilter(f as MyFilter)}
 *   />
 */

import { useCallback, useEffect, useState } from 'react';
import { ChevronUp, ChevronDown, X, Bookmark, Plus } from 'lucide-react';
import { api } from '@/lib/api';

export type SavedSearchScope =
  | 'grants' | 'applications' | 'reports'
  | 'organizations' | 'reviews' | 'risks';

interface SavedSearch {
  id: number;
  scope: SavedSearchScope;
  name: string;
  filter: Record<string, unknown>;
  sort_order: number;
}

interface ListResponse {
  success: boolean;
  searches: SavedSearch[];
}

interface SavedSearchesBarProps {
  scope: SavedSearchScope;
  currentFilter: Record<string, unknown>;
  onApply: (filter: Record<string, unknown>, name: string) => void;
  className?: string;
}

export function SavedSearchesBar({
  scope, currentFilter, onApply, className = '',
}: SavedSearchesBarProps) {
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingName, setSavingName] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await api.get<ListResponse>(`/saved-searches/?scope=${scope}`);
      setSearches(res.searches || []);
    } catch {
      // Permission errors / 401 are handled upstream; silently no-op here.
    }
  }, [scope]);

  useEffect(() => { refresh(); }, [refresh]);

  const reorderTo = useCallback(async (idx: number, dir: -1 | 1) => {
    const next = [...searches];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setSearches(next);  // optimistic
    try {
      await api.post('/saved-searches/reorder', {
        scope,
        ids: next.map((s) => s.id),
      });
    } catch {
      // Revert on failure
      refresh();
    }
  }, [searches, scope, refresh]);

  const remove = useCallback(async (id: number) => {
    setSearches((prev) => prev.filter((s) => s.id !== id));  // optimistic
    try {
      await api.delete(`/saved-searches/${id}`);
    } catch {
      refresh();
    }
  }, [refresh]);

  const save = useCallback(async () => {
    const name = (savingName || '').trim();
    if (!name) return;
    setLoading(true);
    try {
      await api.post('/saved-searches/', {
        scope,
        name,
        filter: currentFilter,
      });
      setSavingName(null);
      await refresh();
    } catch {
      // Show no error UI — the user can retry.
    } finally {
      setLoading(false);
    }
  }, [savingName, scope, currentFilter, refresh]);

  return (
    <div
      data-testid={`saved-searches-bar-${scope}`}
      className={`flex flex-wrap items-center gap-2 py-2 ${className}`}
    >
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground mr-1">
        <Bookmark className="h-3 w-3" aria-hidden />
        Saved
      </span>
      {searches.map((s, idx) => (
        <span
          key={s.id}
          className="inline-flex items-center gap-1 rounded-full border border-border bg-background pl-2 pr-1 h-7 text-xs"
        >
          <button
            type="button"
            className="font-medium text-foreground hover:text-[hsl(var(--kuja-clay))] truncate max-w-[160px]"
            title={s.name}
            onClick={() => onApply(s.filter || {}, s.name)}
          >
            {s.name}
          </button>
          <span className="ml-1 inline-flex items-center">
            <button
              type="button"
              aria-label={`Move ${s.name} earlier`}
              disabled={idx === 0}
              onClick={() => reorderTo(idx, -1)}
              className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronUp className="h-3 w-3" />
            </button>
            <button
              type="button"
              aria-label={`Move ${s.name} later`}
              disabled={idx === searches.length - 1}
              onClick={() => reorderTo(idx, 1)}
              className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronDown className="h-3 w-3" />
            </button>
            <button
              type="button"
              aria-label={`Delete ${s.name}`}
              onClick={() => remove(s.id)}
              className="p-0.5 text-muted-foreground hover:text-red-600 ml-0.5"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        </span>
      ))}
      {savingName === null ? (
        <button
          type="button"
          onClick={() => setSavingName('')}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 h-7 text-xs text-muted-foreground hover:text-foreground hover:border-foreground"
        >
          <Plus className="h-3 w-3" aria-hidden />
          Save current
        </button>
      ) : (
        <span className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--kuja-clay))] bg-background pl-2 pr-1 h-7 text-xs">
          <input
            type="text"
            autoFocus
            value={savingName}
            onChange={(e) => setSavingName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
              if (e.key === 'Escape') setSavingName(null);
            }}
            placeholder="Name this filter…"
            className="bg-transparent outline-none w-32 text-xs"
            disabled={loading}
            maxLength={120}
          />
          <button
            type="button"
            onClick={save}
            disabled={loading || !savingName.trim()}
            data-testid="saved-search-confirm-save"
            className="px-1.5 text-[hsl(var(--kuja-clay))] hover:text-[hsl(var(--kuja-clay-dark))] disabled:opacity-50"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setSavingName(null)}
            className="p-0.5 text-muted-foreground hover:text-foreground"
            aria-label="Cancel"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      )}
    </div>
  );
}
