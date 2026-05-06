'use client';

/**
 * InlineStatusDropdown — Phase 13.6
 *
 * PMO's UAT-driven win: dropdowns directly on list rows for status
 * changes, instead of opening a modal. 1 click → toast → row refreshes.
 * Server actions are unchanged; this is purely a UX shortcut.
 *
 * Use on:
 *   - Donor's applications list (under_review → awarded/rejected)
 *   - Donor's reports list (submitted → accepted/revision_requested)
 *   - Admin's everywhere
 *
 * Props:
 *   value          current status (controlled)
 *   options        list of { value, label } selectable transitions
 *   endpoint       API path, e.g. `/applications/${id}/status`
 *   onChanged      called with the new status after success
 *   disabled       optional; renders read-only when true
 *   className      passthrough
 *
 * Behavior:
 *   - Renders a small select with the current value
 *   - On change, PATCHes the endpoint with { status }
 *   - Shows a toast on success/failure
 *   - Calls onChanged so the parent can refresh local state
 */

import { useState, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { useTranslation } from '@/lib/hooks/use-translation';
import { useApiError } from '@/lib/hooks/use-api-error';
import { cn } from '@/lib/utils';

interface Option {
  value: string;
  label: string;
}

interface Props {
  value: string;
  options: Option[];
  endpoint: string;
  onChanged?: (newValue: string) => void;
  disabled?: boolean;
  /** Toast message i18n key when the change succeeds. */
  successKey?: string;
  className?: string;
}

export function InlineStatusDropdown({
  value, options, endpoint, onChanged, disabled, successKey, className,
}: Props) {
  const { t } = useTranslation();
  const formatError = useApiError();
  const [pending, setPending] = useState(false);
  const [current, setCurrent] = useState(value);

  const handleChange = useCallback(
    async (e: React.ChangeEvent<HTMLSelectElement>) => {
      const next = e.target.value;
      if (next === current || pending) return;
      setPending(true);
      try {
        await api.patch<{ success: boolean; status: string }>(endpoint, { status: next });
        setCurrent(next);
        onChanged?.(next);
        toast.success(t(successKey ?? 'inline_status.changed'));
      } catch (err) {
        const norm = formatError(err);
        toast.error(norm.message);
      } finally {
        setPending(false);
      }
    },
    [current, pending, endpoint, onChanged, successKey, t, formatError],
  );

  return (
    <span className={cn('relative inline-flex items-center gap-1.5', className)}>
      <select
        value={current}
        onChange={handleChange}
        disabled={disabled || pending}
        className="rounded-md border border-input bg-background px-2 py-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--kuja-clay))] disabled:opacity-50"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
    </span>
  );
}
