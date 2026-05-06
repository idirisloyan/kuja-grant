'use client';

/**
 * EditableExtractionList — Phase 13.25
 *
 * The team's May 6 ask: when AI extracts items from a user-uploaded
 * document (donor grant doc, NGO compliance doc), the user must be
 * able to update / modify / add items, not just see them as
 * read-only output. PMO's "AI generates structure, humans refine and
 * approve" pattern.
 *
 * Drop-in primitive. Each item has:
 *   - editable string fields (configured via `fields` prop)
 *   - source tag (ai-extracted | added-manually | edited)
 *   - delete button
 *   - plus an "Add item" button at the bottom
 *
 * Provenance discipline: items the AI extracted carry a
 * `source: 'ai_extracted'` tag. Manual additions are tagged
 * `'manual'`. AI items the user edited are tagged `'ai_edited'`.
 * The donor / reviewer can see at a glance what was AI vs human.
 *
 * Save semantics: the parent passes `onSave(items)` which is called
 * on debounce (1s after last edit) AND on explicit blur. The parent
 * persists via whatever endpoint owns the data shape.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { Plus, Trash2, Sparkles, Pencil, Check } from 'lucide-react';
import { useTranslation } from '@/lib/hooks/use-translation';
import { cn } from '@/lib/utils';

export type ExtractionSource = 'ai_extracted' | 'ai_edited' | 'manual';

export interface ExtractionItem {
  /** Stable id for keying; generated client-side for new items. */
  _key?: string;
  /** Provenance source — drives the badge color. */
  source?: ExtractionSource;
  /** Free-form fields keyed by name. */
  [field: string]: string | ExtractionSource | undefined;
}

export interface FieldConfig {
  /** The data key on each item (e.g. 'title', 'description', 'frequency'). */
  name: string;
  /** Human label for the editor row. */
  label: string;
  /** 'text' = single line, 'textarea' = multi-line, 'select' = dropdown. */
  kind?: 'text' | 'textarea' | 'select';
  /** When kind='select', the options. */
  options?: { value: string; label: string }[];
  /** Optional placeholder. */
  placeholder?: string;
  /** Optional max length (default 500). */
  maxLen?: number;
}

interface Props<T extends ExtractionItem> {
  items: T[];
  /** Field schema — drives row layout. First field is the "headline." */
  fields: FieldConfig[];
  /** Default values for a newly-added item. */
  defaultItem: () => Partial<T>;
  /** Called with the full updated array after every successful change. */
  onChange: (items: T[]) => void;
  /** Optional persist hook — called with items 1s after last edit. */
  onSave?: (items: T[]) => Promise<void> | void;
  /** Heading + subtitle for the section. */
  title: string;
  subtitle?: string;
  /** When true, hide the add button (read-only after publish). */
  readOnly?: boolean;
  className?: string;
}

const sourceTone: Record<ExtractionSource, { bg: string; text: string; label: string }> = {
  ai_extracted: { bg: 'bg-[hsl(var(--kuja-spark-soft))]', text: 'text-[hsl(var(--kuja-spark))]', label: 'AI' },
  ai_edited:    { bg: 'bg-[hsl(var(--kuja-clay))]/10',    text: 'text-[hsl(var(--kuja-clay))]',  label: 'AI · edited' },
  manual:       { bg: 'bg-[hsl(var(--kuja-grow))]/10',    text: 'text-[hsl(var(--kuja-grow))]', label: 'You' },
};

function genKey(): string {
  return 'item_' + Math.random().toString(36).slice(2, 10);
}

export function EditableExtractionList<T extends ExtractionItem>({
  items, fields, defaultItem, onChange, onSave, title, subtitle, readOnly, className,
}: Props<T>) {
  const { t } = useTranslation();
  const [local, setLocal] = useState<T[]>(() =>
    items.map((it) => ({ ...it, _key: it._key ?? genKey() })),
  );
  const debounceRef = useRef<number | null>(null);

  // Sync from props when the parent replaces the array (e.g. after a re-extraction).
  useEffect(() => {
    setLocal(items.map((it) => ({ ...it, _key: it._key ?? genKey() })));
  }, [items]);

  const scheduleSave = useCallback((next: T[]) => {
    onChange(next);
    if (!onSave) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      void onSave(next);
    }, 1000) as unknown as number;
  }, [onChange, onSave]);

  const updateField = useCallback((idx: number, fieldName: string, value: string) => {
    setLocal((prev) => {
      const next = [...prev];
      const item = { ...next[idx], [fieldName]: value };
      // Mark AI-extracted items as "edited" once a field changes.
      if (item.source === 'ai_extracted') item.source = 'ai_edited';
      next[idx] = item as T;
      scheduleSave(next);
      return next;
    });
  }, [scheduleSave]);

  const removeItem = useCallback((idx: number) => {
    setLocal((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      scheduleSave(next);
      return next;
    });
  }, [scheduleSave]);

  const addItem = useCallback(() => {
    setLocal((prev) => {
      const seed = defaultItem() as T;
      const next = [...prev, { ...seed, _key: genKey(), source: 'manual' as ExtractionSource } as T];
      scheduleSave(next);
      return next;
    });
  }, [defaultItem, scheduleSave]);

  return (
    <section className={cn('space-y-2', className)}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-[hsl(var(--kuja-spark))]" />
            {title}
            <span className="text-[10px] font-normal text-muted-foreground">
              ({local.length})
            </span>
          </h3>
          {subtitle && (
            <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {!readOnly && (
          <button
            type="button"
            onClick={addItem}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted"
          >
            <Plus className="h-3 w-3" />
            {t('extraction.add_item')}
          </button>
        )}
      </div>

      {local.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-muted/20 p-4 text-center text-xs text-muted-foreground">
          {t('extraction.empty')}
        </div>
      ) : (
        <ol className="space-y-2">
          {local.map((item, i) => {
            const source = (item.source as ExtractionSource) || 'manual';
            const tone = sourceTone[source];
            return (
              <li
                key={item._key as string}
                className="rounded-md border border-border bg-background p-3 space-y-2"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-mono text-muted-foreground">{i + 1}.</span>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider',
                      tone.bg,
                      tone.text,
                    )}
                    title={t(`extraction.source.${source}`)}
                  >
                    {source === 'manual' ? <Pencil className="h-2.5 w-2.5" /> : <Sparkles className="h-2.5 w-2.5" />}
                    {tone.label}
                  </span>
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => removeItem(i)}
                      className="ml-auto rounded p-1 text-[hsl(var(--kuja-flag))] hover:bg-[hsl(0_85%_96%)]"
                      aria-label={t('common.delete')}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <div className="grid gap-2">
                  {fields.map((field) => {
                    const value = (item[field.name] as string | undefined) ?? '';
                    const id = `${item._key}_${field.name}`;
                    if (field.kind === 'select' && field.options) {
                      return (
                        <div key={field.name}>
                          <label htmlFor={id} className="mb-0.5 block text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                            {field.label}
                          </label>
                          <select
                            id={id}
                            value={value}
                            onChange={(e) => updateField(i, field.name, e.target.value)}
                            disabled={readOnly}
                            className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--kuja-clay))] disabled:opacity-60"
                          >
                            <option value="">—</option>
                            {field.options.map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        </div>
                      );
                    }
                    if (field.kind === 'textarea') {
                      return (
                        <div key={field.name}>
                          <label htmlFor={id} className="mb-0.5 block text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                            {field.label}
                          </label>
                          <textarea
                            id={id}
                            value={value}
                            onChange={(e) => updateField(i, field.name, e.target.value)}
                            placeholder={field.placeholder}
                            maxLength={field.maxLen ?? 500}
                            rows={2}
                            disabled={readOnly}
                            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--kuja-clay))] disabled:opacity-60"
                          />
                        </div>
                      );
                    }
                    return (
                      <div key={field.name}>
                        <label htmlFor={id} className="mb-0.5 block text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                          {field.label}
                        </label>
                        <input
                          id={id}
                          type="text"
                          value={value}
                          onChange={(e) => updateField(i, field.name, e.target.value)}
                          placeholder={field.placeholder}
                          maxLength={field.maxLen ?? 280}
                          disabled={readOnly}
                          className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--kuja-clay))] disabled:opacity-60"
                        />
                      </div>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
