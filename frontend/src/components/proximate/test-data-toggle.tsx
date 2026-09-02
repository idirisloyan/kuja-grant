'use client';

/**
 * One "Show test data" control for every Proximate register.
 *
 * Bound to the single persisted flag in the UI store, so switching it on in
 * Rounds also reveals fixtures in Grants, Partners, Messages and
 * Disbursements, and the choice survives navigation. Renders nothing when
 * there is nothing to reveal — a register with no fixtures should not
 * advertise the concept. Replaces three independent, unpersisted, differently
 * styled per-page toggles (PFX-SEP02-GLOBAL-004). Classification lives in
 * lib/test-records.ts.
 */

import { FlaskConical } from 'lucide-react';
import { useUIStore } from '@/stores/ui-store';
import { useTranslation } from '@/lib/hooks/use-translation';

export function TestDataToggle({
  count,
  className,
}: {
  /** How many fixture rows this register is holding back. */
  count: number;
  className?: string;
}) {
  const { t } = useTranslation();
  const showTest = useUIStore((s) => s.showTestData);
  const toggle = useUIStore((s) => s.toggleShowTestData);
  if (count <= 0) return null;
  return (
    <div className={`flex justify-end ${className ?? ''}`}>
      <button
        type="button"
        onClick={toggle}
        aria-pressed={showTest}
        title={t('common.test_data_hint')}
        className="inline-flex items-center gap-1.5 text-xs px-3 rounded-full border border-dashed transition-colors"
        style={{
          minHeight: 36,
          ...(showTest
            ? { background: 'var(--prox-slate)', color: '#fff', borderColor: 'transparent' }
            : { background: 'var(--prox-surface)', color: 'var(--prox-muted)', borderColor: 'var(--prox-line-2)' }),
        }}
      >
        <FlaskConical className="w-3.5 h-3.5" aria-hidden="true" />
        {showTest
          ? t('common.hide_test_data', { n: count })
          : t('common.show_test_data', { n: count })}
      </button>
    </div>
  );
}
