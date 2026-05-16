'use client';

/**
 * TagsEditor — Phase 15E (PMO transfer: inline find-or-create).
 *
 * Single component for tagging any kind of entity (grant, application,
 * organization). Type a name, press Enter, it's either found in the
 * org's library OR created on the fly + applied in one round-trip.
 *
 * Uses NameChip (deterministic name-hash palette) so the same tag is
 * always the same color across every page.
 *
 * Read-only mode: pass `editable={false}` to render just the chips
 * (used in list rows where you don't want input UX).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Plus, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { NameChip, nameChipStyle } from '@/components/shared/name-chip';
import { cn } from '@/lib/utils';

interface Tag {
  id: number;
  org_id: number;
  name: string;
  description?: string | null;
}

interface Props {
  targetKind: 'grant' | 'organization' | 'application';
  targetId: number;
  editable?: boolean;
  className?: string;
  /** Show heading + caption above the chips */
  withHeader?: boolean;
}

export function TagsEditor({
  targetKind, targetId, editable = true, className, withHeader = false,
}: Props) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [library, setLibrary] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function loadTagsForTarget() {
    try {
      const r = await api.get<{ success: boolean; tags: Tag[] }>(
        `/api/tags/by-target?kind=${targetKind}&id=${targetId}`
      );
      if (r.success) setTags(r.tags);
    } catch {/* quiet */}
  }

  async function loadLibrary() {
    try {
      const r = await api.get<{ success: boolean; tags: Tag[] }>('/api/tags');
      if (r.success) setLibrary(r.tags);
    } catch {/* quiet */}
  }

  useEffect(() => {
    if (!targetId) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([loadTagsForTarget(), editable ? loadLibrary() : Promise.resolve()])
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKind, targetId, editable]);

  const appliedIds = useMemo(() => new Set(tags.map((t) => t.id)), [tags]);

  // Suggestions from library, filtered by input + excluding already-applied
  const suggestions = useMemo(() => {
    const q = input.trim().toLowerCase();
    return library
      .filter((t) => !appliedIds.has(t.id))
      .filter((t) => !q || t.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [library, appliedIds, input]);

  async function applyByName(name: string) {
    const value = name.trim();
    if (!value) return;
    setBusy(value);
    try {
      const r = await api.post<{ success: boolean; tag: Tag; created: boolean }>(
        '/api/tags/apply-by-name',
        { name: value, target_kind: targetKind, target_id: targetId },
      );
      if (r.success && r.tag) {
        setTags((prev) => prev.find((t) => t.id === r.tag.id) ? prev : [...prev, r.tag]);
        if (r.created) {
          setLibrary((prev) => prev.find((t) => t.id === r.tag.id) ? prev : [...prev, r.tag]);
        }
        setInput('');
      }
    } catch {/* quiet */}
    finally { setBusy(null); }
  }

  async function removeTag(tag: Tag) {
    setBusy(tag.name);
    // Optimistic remove
    const prev = tags;
    setTags(tags.filter((t) => t.id !== tag.id));
    try {
      await api.delete<{ success: boolean }>('/api/tags/assign');
      // The above call doesn't accept a body via api.delete; do it via fetch
    } catch {/* fall through */}
    try {
      const resp = await fetch('/api/tags/assign', {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({
          tag_id: tag.id,
          target_kind: targetKind,
          target_id: targetId,
        }),
      });
      if (!resp.ok) {
        // Rollback
        setTags(prev);
      }
    } catch {
      setTags(prev);
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className={cn('flex items-center gap-2 text-xs text-muted-foreground', className)}>
        <Loader2 className="h-3 w-3 animate-spin" /> Loading tags…
      </div>
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      {withHeader && (
        <div>
          <div className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
            Tags
          </div>
          {editable && (
            <p className="text-[10px] text-muted-foreground">
              Type and press Enter to create or apply. Removes don&apos;t delete the tag itself.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {tags.length === 0 && !editable && (
          <span className="text-xs text-muted-foreground italic">No tags</span>
        )}
        {tags.map((tag) => (
          <span
            key={tag.id}
            style={nameChipStyle(tag.name)}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5',
              'text-xs font-medium whitespace-nowrap',
            )}
          >
            {tag.name}
            {editable && (
              <button
                type="button"
                onClick={() => removeTag(tag)}
                disabled={busy === tag.name}
                aria-label={`Remove tag ${tag.name}`}
                className="ml-0.5 -mr-0.5 rounded-full p-0.5 hover:bg-black/10"
              >
                {busy === tag.name
                  ? <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  : <X className="h-2.5 w-2.5" />}
              </button>
            )}
          </span>
        ))}

        {editable && (
          <div className="relative inline-flex items-center gap-1">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  applyByName(input);
                }
                if (e.key === ',') {
                  e.preventDefault();
                  applyByName(input);
                }
              }}
              placeholder="add tag…"
              maxLength={60}
              className={cn(
                'h-6 w-28 rounded-full border border-dashed border-[hsl(var(--border))] bg-transparent',
                'px-2 text-xs placeholder:text-muted-foreground focus:border-[hsl(var(--kuja-clay))] focus:outline-none',
              )}
            />
            {input.trim() && (
              <button
                type="button"
                onClick={() => applyByName(input)}
                disabled={busy === input.trim()}
                aria-label="Apply tag"
                className="rounded-full p-0.5 text-[hsl(var(--kuja-clay))] hover:bg-[hsl(var(--kuja-sand))]/40"
              >
                {busy === input.trim()
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <Plus className="h-3 w-3" />}
              </button>
            )}
          </div>
        )}
      </div>

      {editable && suggestions.length > 0 && input.trim() && (
        <div className="flex flex-wrap items-center gap-1 pt-1 border-t border-dashed border-[hsl(var(--border))]">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground mr-1">
            in your library
          </span>
          {suggestions.map((tag) => (
            <NameChip
              key={tag.id}
              name={tag.name}
              size="xs"
              onClick={() => applyByName(tag.name)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
