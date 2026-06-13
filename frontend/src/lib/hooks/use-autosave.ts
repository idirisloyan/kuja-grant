'use client';

/**
 * Phase 84 — useAutosave hook.
 *
 * Backstop against connection loss + crashes + accidental tab close.
 * Persists keyed work-in-progress to localStorage with a debounce, and
 * exposes a small registry so the resume banner can find any drafts
 * the user hasn't completed.
 *
 * Storage key shape: kuja_autosave:<kind>:<id>:<field>
 *   kind  = 'application' | 'report' | 'declaration'
 *   id    = entity id
 *   field = response key / textarea name
 *
 * Storage entry shape (JSON):
 *   {
 *     value: string,           // current text
 *     updated_at: ISO date,
 *     title: string | null,    // user-readable label for the resume banner
 *     href: string,            // deep-link back to this work
 *   }
 *
 * The hook ALSO calls onPersist with a debounce so the caller can sync
 * to the server in the same beat (saves a round trip if both fire at
 * once).
 */

import { useEffect, useRef } from 'react';

const STORAGE_PREFIX = 'kuja_autosave:';
const REGISTRY_KEY = 'kuja_autosave_registry_v1';

export interface AutosaveMeta {
  kind: 'application' | 'report' | 'declaration';
  id: number;
  field?: string;
  /** User-readable title for the resume banner — e.g. grant title */
  title?: string | null;
  /** Deep-link to the surface where the work was happening */
  href: string;
}

interface UseAutosaveOpts {
  value: string;
  meta: AutosaveMeta;
  /** Debounce in ms before persisting to localStorage. Default 800. */
  debounceMs?: number;
  /** Optional callback fired with the same debounce — wire your server save here. */
  onPersist?: (value: string) => void | Promise<void>;
  /** Skip persistence entirely (e.g. when value is empty or known to be saved). */
  disabled?: boolean;
}

function storageKey(meta: AutosaveMeta): string {
  return `${STORAGE_PREFIX}${meta.kind}:${meta.id}${meta.field ? ':' + meta.field : ''}`;
}

function readRegistry(): Record<string, AutosaveMeta> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(REGISTRY_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeRegistry(reg: Record<string, AutosaveMeta>): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(REGISTRY_KEY, JSON.stringify(reg)); }
  catch { /* quota full / disabled — silently skip */ }
}

export function useAutosave({
  value, meta, debounceMs = 800, onPersist, disabled = false,
}: UseAutosaveOpts) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedValue = useRef<string | null>(null);

  useEffect(() => {
    if (disabled || typeof window === 'undefined') return;
    if (value === lastSavedValue.current) return;

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      try {
        const key = storageKey(meta);
        if (!value || !value.trim()) {
          localStorage.removeItem(key);
          // Drop from registry if this was the last field for this entity.
          const reg = readRegistry();
          delete reg[key];
          writeRegistry(reg);
        } else {
          localStorage.setItem(key, JSON.stringify({
            value, updated_at: new Date().toISOString(),
            title: meta.title ?? null, href: meta.href,
          }));
          const reg = readRegistry();
          reg[key] = meta;
          writeRegistry(reg);
        }
        lastSavedValue.current = value;
        if (onPersist) void onPersist(value);
      } catch { /* quota / disabled */ }
    }, debounceMs);

    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [value, meta.kind, meta.id, meta.field, meta.title, meta.href, debounceMs, disabled, onPersist]);
}

/** Lookup the most recent stored value for a meta key (used on mount to
 *  pre-fill the textarea if the server returned nothing). */
export function readAutosaved(meta: AutosaveMeta): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(storageKey(meta));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed.value === 'string' ? parsed.value : null;
  } catch {
    return null;
  }
}

/** Wipe a single key — call after a successful submit so the resume
 *  banner doesn't keep suggesting completed work. */
export function clearAutosaved(meta: AutosaveMeta): void {
  if (typeof window === 'undefined') return;
  try {
    const key = storageKey(meta);
    localStorage.removeItem(key);
    const reg = readRegistry();
    delete reg[key];
    writeRegistry(reg);
  } catch { /* ignore */ }
}

/** List every active autosave entry. Newest first. Used by the resume
 *  banner on the dashboard. */
export function listAutosaved(): Array<{ key: string; meta: AutosaveMeta; updated_at: string; title: string | null; preview: string }> {
  if (typeof window === 'undefined') return [];
  const reg = readRegistry();
  const items: Array<{ key: string; meta: AutosaveMeta; updated_at: string; title: string | null; preview: string }> = [];
  for (const [key, meta] of Object.entries(reg)) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      items.push({
        key,
        meta: meta as AutosaveMeta,
        updated_at: parsed.updated_at,
        title: parsed.title ?? null,
        preview: (parsed.value || '').slice(0, 140),
      });
    } catch { /* skip malformed */ }
  }
  items.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
  return items;
}

/** Group by entity (kind+id) so the resume banner shows one entry per
 *  entity instead of one per field. */
export function listAutosavedGrouped(): Array<{ kind: AutosaveMeta['kind']; id: number; title: string | null; href: string; updated_at: string; field_count: number; preview: string }> {
  const flat = listAutosaved();
  const map = new Map<string, { kind: AutosaveMeta['kind']; id: number; title: string | null; href: string; updated_at: string; field_count: number; preview: string }>();
  for (const it of flat) {
    const k = `${it.meta.kind}:${it.meta.id}`;
    const existing = map.get(k);
    if (existing) {
      existing.field_count++;
      if (it.updated_at > existing.updated_at) {
        existing.updated_at = it.updated_at;
        existing.preview = it.preview;
      }
    } else {
      map.set(k, {
        kind: it.meta.kind, id: it.meta.id,
        title: it.title, href: it.meta.href,
        updated_at: it.updated_at, field_count: 1,
        preview: it.preview,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}
