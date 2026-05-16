'use client';

/**
 * StageLabelsEditor — Phase 15C (PMO transfer: customizable stage labels).
 *
 * Admin sees this on their dashboard; per-row save (PMO pattern). Each
 * label edit triggers PUT /api/organizations/<id>/settings independently
 * so one bad value doesn't block another. Empty value clears the
 * override for that key (falls back to default i18n).
 *
 * Targets the admin's own org by default; admin can switch org by
 * passing an explicit `orgId` prop (used by org profile page in the
 * future).
 */

import { useEffect, useState } from 'react';
import { Save, Loader2, RotateCcw, CheckCircle2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { cn } from '@/lib/utils';

interface Props {
  orgId?: number;
}

const STATUSES: { key: string; defaultLabel: string }[] = [
  { key: 'draft',        defaultLabel: 'Draft' },
  { key: 'submitted',    defaultLabel: 'Submitted' },
  { key: 'under_review', defaultLabel: 'Under review' },
  { key: 'scored',       defaultLabel: 'Scored' },
  { key: 'awarded',      defaultLabel: 'Awarded' },
  { key: 'rejected',     defaultLabel: 'Rejected' },
];

export function StageLabelsEditor({ orgId }: Props) {
  const user = useAuthStore((s) => s.user);
  const setStageLabels = useAuthStore.setState;
  const targetOrgId = orgId ?? user?.org_id ?? null;

  const [labels, setLabels] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!targetOrgId) return;
    let cancelled = false;
    api.get<{ success: boolean; settings: { stage_labels?: Record<string, string> } }>(
      `/api/organizations/${targetOrgId}/settings`
    )
      .then((r) => {
        if (!cancelled && r.success) setLabels(r.settings?.stage_labels ?? {});
      })
      .catch(() => {/* quiet */})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [targetOrgId]);

  async function saveRow(key: string, value: string) {
    if (!targetOrgId) return;
    setSavingKey(key);
    setError(null);
    // Compose the new labels dict (drop the key if cleared)
    const next = { ...labels };
    if (value.trim()) {
      next[key] = value.trim().slice(0, 60);
    } else {
      delete next[key];
    }
    try {
      const r = await api.put<{ success: boolean; settings: { stage_labels?: Record<string, string> } }>(
        `/api/organizations/${targetOrgId}/settings`,
        { settings: { stage_labels: next } },
      );
      if (r.success) {
        const fresh = r.settings?.stage_labels ?? {};
        setLabels(fresh);
        setSavedKey(key);
        // Push into auth store so other tabs/components see it immediately.
        setStageLabels((s) => ({ ...s, stageLabels: fresh }));
        setTimeout(() => setSavedKey(null), 2000);
      } else {
        setError('Save failed');
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSavingKey(null);
    }
  }

  if (!user || user.role !== 'admin' || !targetOrgId) return null;

  if (loading) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading stage labels…
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--kuja-clay))]">
          Customise vocabulary
        </div>
        <h3 className="kuja-display text-lg">Stage labels</h3>
        <p className="text-xs text-muted-foreground">
          Override how each application status renders for this org. Leave a row blank to use the default.
          Saves per-row.
        </p>
      </div>

      {error && (
        <div className="mb-2 rounded-md border border-[hsl(var(--kuja-flag)/0.3)] bg-[hsl(var(--kuja-flag)/0.05)] p-2 text-xs text-[hsl(var(--kuja-flag))]">
          {error}
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {STATUSES.map(({ key, defaultLabel }) => (
          <StageRow
            key={key}
            statusKey={key}
            defaultLabel={defaultLabel}
            current={labels[key] ?? ''}
            saving={savingKey === key}
            saved={savedKey === key}
            onSave={(v) => saveRow(key, v)}
          />
        ))}
      </div>
    </Card>
  );
}

function StageRow({
  statusKey, defaultLabel, current, saving, saved, onSave,
}: {
  statusKey: string;
  defaultLabel: string;
  current: string;
  saving: boolean;
  saved: boolean;
  onSave: (v: string) => void;
}) {
  const [value, setValue] = useState(current);
  useEffect(() => { setValue(current); }, [current]);
  const dirty = value !== current;

  return (
    <div className="rounded-md border border-[hsl(var(--border))] p-2 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          {statusKey}
        </span>
        <span className="text-[10px] text-muted-foreground italic">
          default: “{defaultLabel}”
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={defaultLabel}
          maxLength={60}
          className="h-8 text-sm"
        />
        {dirty && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setValue(current)}
            disabled={saving}
            aria-label="Revert"
            title="Revert"
            className="h-8 w-8 p-0"
          >
            <RotateCcw className="h-3 w-3" />
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          onClick={() => onSave(value)}
          disabled={saving || !dirty}
          className="h-8"
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> :
            saved ? <CheckCircle2 className="h-3 w-3 text-[hsl(var(--kuja-grow))]" /> :
            <Save className="h-3 w-3" />}
        </Button>
      </div>
    </div>
  );
}
