'use client';

/**
 * Organizational Memory page — Phase 10.5
 *
 * NGOs view, edit, and add reusable knowledge items the AI co-author
 * pulls from when drafting applications and reports. Auto-extracted
 * items appear here automatically (lineage shown via `source` chip).
 * Manual items are highest-confidence by default.
 *
 * Surface:
 *   - filter by kind (fact / narrative / evidence / partner / etc.)
 *   - inline create with kind+content+label+tags
 *   - edit / archive / delete per row
 *   - usage signal (last_used_at + usage_count) so the user sees
 *     which items the AI actually pulls
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Brain, Plus, Trash2, Archive, ArchiveRestore, Edit3, Save, X, Sparkles,
  Loader2,
} from 'lucide-react';
import { useTranslation } from '@/lib/hooks/use-translation';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { useFlag } from '@/lib/hooks/use-feature-flags';
import { cn } from '@/lib/utils';

type MemoryKind = 'fact' | 'narrative' | 'evidence' | 'document' | 'metric' | 'partner';

interface MemoryItem {
  id: number;
  org_id: number;
  kind: MemoryKind;
  label: string | null;
  content: string;
  metadata: Record<string, unknown> | null;
  source: string | null;
  tags: string[];
  confidence: string | null;
  archived: boolean;
  last_used_at: string | null;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

const KIND_OPTIONS: { value: MemoryKind; labelKey: string }[] = [
  { value: 'fact',      labelKey: 'org_memory.kind.fact' },
  { value: 'narrative', labelKey: 'org_memory.kind.narrative' },
  { value: 'evidence',  labelKey: 'org_memory.kind.evidence' },
  { value: 'partner',   labelKey: 'org_memory.kind.partner' },
  { value: 'metric',    labelKey: 'org_memory.kind.metric' },
  { value: 'document',  labelKey: 'org_memory.kind.document' },
];

const kindTone: Record<MemoryKind, string> = {
  fact:      'bg-blue-50 text-blue-700 border-blue-200',
  narrative: 'bg-[hsl(var(--kuja-clay))]/10 text-[hsl(var(--kuja-clay))] border-[hsl(var(--kuja-clay))]/30',
  evidence:  'bg-[hsl(var(--kuja-grow))]/10 text-[hsl(var(--kuja-grow))] border-[hsl(var(--kuja-grow))]/30',
  partner:   'bg-[hsl(var(--kuja-spark))]/10 text-[hsl(var(--kuja-spark))] border-[hsl(var(--kuja-spark))]/30',
  metric:    'bg-[hsl(var(--kuja-sun))]/10 text-[hsl(var(--kuja-sun))] border-[hsl(var(--kuja-sun))]/30',
  document:  'bg-muted text-muted-foreground border-border',
};

export default function OrgMemoryPage() {
  const { t } = useTranslation();
  const { enabled, ready } = useFlag('ai.org_memory');
  const [items, setItems] = useState<MemoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<MemoryKind | 'all' | 'archived'>('all');

  const [creating, setCreating] = useState(false);
  const [newKind, setNewKind] = useState<MemoryKind>('fact');
  const [newLabel, setNewLabel] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newTags, setNewTags] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editLabel, setEditLabel] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = filter === 'archived' ? '?archived=true' : '';
      const res = await api.get<{ items: MemoryItem[] }>(`/org-memory/${qs}`);
      let data = res.items ?? [];
      if (filter !== 'all' && filter !== 'archived') {
        data = data.filter((i) => i.kind === filter);
      }
      setItems(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load memory');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    if (ready && enabled) void load();
    else if (ready) setLoading(false);
  }, [ready, enabled, load]);

  const handleCreate = async () => {
    if (!newContent.trim()) return;
    setSubmitting(true);
    try {
      await api.post('/org-memory/', {
        kind: newKind,
        label: newLabel.trim() || undefined,
        content: newContent.trim(),
        tags: newTags.split(',').map((s) => s.trim()).filter(Boolean),
      });
      toast.success(t('org_memory.created_toast'));
      setNewLabel('');
      setNewContent('');
      setNewTags('');
      setCreating(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveEdit = async (id: number) => {
    try {
      await api.patch(`/org-memory/${id}`, { label: editLabel, content: editContent });
      setEditingId(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    }
  };

  const handleArchive = async (item: MemoryItem) => {
    try {
      await api.patch(`/org-memory/${item.id}`, { archived: !item.archived });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Archive failed');
    }
  };

  const handleDelete = async (item: MemoryItem) => {
    if (!confirm(t('org_memory.delete_confirm'))) return;
    try {
      await api.delete(`/org-memory/${item.id}`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  if (!ready) {
    return <div className="kuja-shimmer h-32 rounded-xl" />;
  }

  if (!enabled) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-background p-10 text-center">
        <Brain className="mx-auto h-10 w-10 text-muted-foreground/40 mb-2" />
        <p className="kuja-display text-lg">{t('org_memory.disabled_title')}</p>
        <p className="mt-2 text-sm text-muted-foreground">{t('org_memory.disabled_body')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="kuja-display text-2xl flex items-center gap-2">
            <Brain className="h-6 w-6 text-[hsl(var(--kuja-clay))]" />
            {t('org_memory.title')}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('org_memory.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--kuja-clay))] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          {t('org_memory.add')}
        </button>
      </div>

      {/* Filter row */}
      <div className="flex items-center gap-1.5 flex-wrap border-b border-border pb-2">
        {(['all', 'archived', ...KIND_OPTIONS.map((k) => k.value)] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              'inline-flex items-center rounded-md px-3 py-1 text-xs font-medium',
              filter === f
                ? 'bg-[hsl(var(--kuja-clay))] text-white'
                : 'border border-border bg-background text-foreground hover:bg-muted',
            )}
          >
            {f === 'all'
              ? t('org_memory.filter.all')
              : f === 'archived'
              ? t('org_memory.filter.archived')
              : t(`org_memory.kind.${f}`)}
          </button>
        ))}
      </div>

      {/* Create form */}
      {creating && (
        <div className="rounded-xl border border-[hsl(var(--kuja-clay))]/30 bg-[hsl(var(--kuja-clay))]/5 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">{t('org_memory.new_item')}</h3>
            <button onClick={() => setCreating(false)} className="rounded p-1 hover:bg-muted">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <select
              value={newKind}
              onChange={(e) => setNewKind(e.target.value as MemoryKind)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {KIND_OPTIONS.map((k) => (
                <option key={k.value} value={k.value}>
                  {t(k.labelKey)}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder={t('org_memory.field.label')}
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <textarea
            rows={3}
            placeholder={t('org_memory.field.content_placeholder')}
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <input
            type="text"
            placeholder={t('org_memory.field.tags_placeholder')}
            value={newTags}
            onChange={(e) => setNewTags(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setCreating(false)}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-muted"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleCreate}
              disabled={!newContent.trim() || submitting}
              className="inline-flex items-center gap-1 rounded-md bg-[hsl(var(--kuja-clay))] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {t('common.save')}
            </button>
          </div>
        </div>
      )}

      {loading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="kuja-shimmer h-16 rounded-md" />)}
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-background p-8 text-center">
          <Sparkles className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">{t('org_memory.empty')}</p>
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className="space-y-2">
          {items.map((item) => {
            const isEditing = editingId === item.id;
            return (
              <div
                key={item.id}
                className="rounded-md border border-border bg-background p-3"
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={cn(
                        'inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                        kindTone[item.kind],
                      )}
                    >
                      {t(`org_memory.kind.${item.kind}`)}
                    </span>
                    {isEditing ? (
                      <input
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        className="text-sm font-semibold rounded-md border border-input bg-background px-2 py-0.5"
                      />
                    ) : (
                      <span className="text-sm font-semibold">{item.label || '—'}</span>
                    )}
                    {item.usage_count > 0 && (
                      <span className="text-[10px] text-muted-foreground">
                        ({t('org_memory.usage_count', { n: item.usage_count })})
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {isEditing ? (
                      <>
                        <button
                          onClick={() => handleSaveEdit(item.id)}
                          className="rounded p-1 hover:bg-muted"
                          aria-label={t('common.save')}
                        >
                          <Save className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="rounded p-1 hover:bg-muted"
                          aria-label={t('common.cancel')}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            setEditingId(item.id);
                            setEditLabel(item.label ?? '');
                            setEditContent(item.content);
                          }}
                          className="rounded p-1 hover:bg-muted"
                          aria-label={t('common.edit')}
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleArchive(item)}
                          className="rounded p-1 hover:bg-muted"
                          aria-label={item.archived ? t('org_memory.unarchive') : t('org_memory.archive')}
                        >
                          {item.archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          onClick={() => handleDelete(item)}
                          className="rounded p-1 text-[hsl(var(--kuja-flag))] hover:bg-[hsl(0_85%_96%)]"
                          aria-label={t('common.delete')}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {isEditing ? (
                  <textarea
                    rows={3}
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                ) : (
                  <p className="text-sm text-foreground whitespace-pre-line">{item.content}</p>
                )}

                <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
                  {item.tags.length > 0 && (
                    <span>
                      {item.tags.map((tag) => `#${tag}`).join(' ')}
                    </span>
                  )}
                  {item.source && (
                    <span className="italic">
                      {t('org_memory.source')}: {item.source}
                    </span>
                  )}
                  {item.confidence && (
                    <span>
                      {t('org_memory.confidence')}: {item.confidence}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
