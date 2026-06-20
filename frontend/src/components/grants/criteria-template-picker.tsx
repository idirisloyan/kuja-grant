'use client';

/**
 * Phase 193 — Apply a saved criteria template (Phase 189) to a grant
 * form. Donors load their library, pick a template, and the criteria
 * slot in.
 *
 *   <CriteriaTemplatePicker
 *     onApply={(criteria) => setCriteria(criteria)}
 *   />
 *
 * Self-gates: if the library is empty, the picker renders nothing.
 */

import { useEffect, useState } from 'react';
import { Bookmark, Loader2, X } from 'lucide-react';
import { api } from '@/lib/api';

interface Template {
  id: number;
  name: string;
  description?: string | null;
  criteria: unknown[];
  criteria_count: number;
}

type AnyCriterion = Record<string, unknown>;

interface Props {
  onApply: (criteria: AnyCriterion[]) => void;
  label?: string;
}

export function CriteriaTemplatePicker({ onApply, label = 'Apply template' }: Props) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    if (loaded || loading) return;
    setLoading(true);
    try {
      const r = await api.get<{ templates: Template[] }>('/api/grants/criteria-templates');
      setTemplates(r.templates ?? []);
      setLoaded(true);
    } catch {
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  };

  if (loaded && templates.length === 0) {
    // Hide entirely when there's no library to choose from.
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { setOpen(true); void load(); }}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted"
      >
        <Bookmark className="h-3.5 w-3.5" /> {label}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-card border border-border rounded-lg shadow-xl w-full max-w-md max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between border-b border-border p-3">
              <h3 className="text-sm font-semibold inline-flex items-center gap-1.5">
                <Bookmark className="h-4 w-4 text-[hsl(var(--kuja-clay))]" />
                Apply criteria template
              </h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {loading && (
                <div className="text-sm text-muted-foreground py-6 text-center">
                  <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                  Loading library…
                </div>
              )}
              {!loading && loaded && templates.length === 0 && (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  No saved templates yet.
                </p>
              )}
              {templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    onApply(t.criteria as AnyCriterion[]);
                    setOpen(false);
                  }}
                  className="w-full text-left rounded-md border border-border p-3 hover:bg-muted/40"
                >
                  <div className="text-sm font-medium">{t.name}</div>
                  {t.description && (
                    <div className="text-[11px] text-muted-foreground mt-0.5">{t.description}</div>
                  )}
                  <div className="text-[11px] text-muted-foreground mt-1">
                    {t.criteria_count} criterion{t.criteria_count === 1 ? '' : 'a'}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
