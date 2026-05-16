'use client';

/**
 * ResponsiveTable — desktop table + mobile card fallback in one component.
 *
 * Pattern (from PMO transfer): NGO field staff are on phones; data-dense
 * tables horizontal-scroll badly. So every table that matters renders
 * as a `<table>` on `md+` and as a stacked card list on smaller screens.
 *
 * Usage:
 *   <ResponsiveTable
 *     columns={[
 *       { key: 'title', header: 'Title', cell: r => r.title },
 *       { key: 'status', header: 'Status', cell: r => <StatusBadge ... /> },
 *     ]}
 *     rows={items}
 *     getRowKey={r => r.id}
 *     getRowHref={r => `/grants/${r.id}`}   // optional
 *     mobileTitle={r => r.title}
 *     mobileSubtitle={r => r.donor_org_name}
 *   />
 *
 * On mobile: the first column is the title, second is the subtitle (if
 * `mobileTitle`/`mobileSubtitle` are not provided), and the rest stack
 * as labelled rows.
 */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { ChevronRight } from 'lucide-react';

interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Hide on the mobile card view */
  hideOnMobile?: boolean;
  className?: string;
  thClassName?: string;
  align?: 'left' | 'right' | 'center';
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  getRowKey: (row: T) => string | number;
  getRowHref?: (row: T) => string | undefined;
  onRowClick?: (row: T) => void;
  mobileTitle?: (row: T) => ReactNode;
  mobileSubtitle?: (row: T) => ReactNode;
  emptyState?: ReactNode;
  className?: string;
  ariaLabel?: string;
}

const ALIGN: Record<string, string> = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
};

export function ResponsiveTable<T>({
  columns, rows, getRowKey, getRowHref, onRowClick,
  mobileTitle, mobileSubtitle, emptyState, className, ariaLabel,
}: Props<T>) {

  if (rows.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  const desktopColumns = columns;
  const mobileColumns = columns.filter(c => !c.hideOnMobile);

  return (
    <>
      {/* DESKTOP: table */}
      <div className={cn('hidden md:block rounded-xl border border-[hsl(var(--border))] bg-background overflow-hidden', className)}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" aria-label={ariaLabel}>
            <thead>
              <tr className="border-b border-[hsl(var(--border))] bg-[hsl(var(--kuja-quartz))] text-left">
                {desktopColumns.map((c) => (
                  <th key={c.key} scope="col" className={cn(
                    'px-4 py-3 font-medium text-[hsl(var(--kuja-ink-soft))] text-xs uppercase tracking-wider',
                    ALIGN[c.align ?? 'left'],
                    c.thClassName,
                  )}>{c.header}</th>
                ))}
                {(getRowHref || onRowClick) && <th scope="col" className="w-8" />}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const key = getRowKey(row);
                const href = getRowHref?.(row);
                const rowProps = href || onRowClick
                  ? {
                      onClick: () => { if (onRowClick) onRowClick(row); else if (href) window.location.href = href; },
                      className: 'border-b border-[hsl(var(--border))] last:border-b-0 hover:bg-[hsl(var(--kuja-sand-50))] cursor-pointer transition-colors',
                    }
                  : { className: 'border-b border-[hsl(var(--border))] last:border-b-0' };
                return (
                  <tr key={key} {...rowProps}>
                    {desktopColumns.map((c) => (
                      <td key={c.key} className={cn('px-4 py-3', ALIGN[c.align ?? 'left'], c.className)}>
                        {c.cell(row)}
                      </td>
                    ))}
                    {(getRowHref || onRowClick) && (
                      <td className="pr-3 text-[hsl(var(--kuja-ink-soft))]">
                        <ChevronRight className="w-4 h-4" aria-hidden />
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* MOBILE: card stack */}
      <ul className={cn('md:hidden space-y-2', className)} aria-label={ariaLabel}>
        {rows.map((row) => {
          const key = getRowKey(row);
          const href = getRowHref?.(row);
          const titleNode = mobileTitle?.(row) ?? mobileColumns[0]?.cell(row);
          const subtitleNode = mobileSubtitle?.(row) ?? (mobileColumns[1] ? mobileColumns[1].cell(row) : null);
          const otherCols = mobileColumns.slice(mobileTitle || mobileSubtitle ? 0 : 2);
          const inner = (
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-[hsl(var(--kuja-ink))]">{titleNode}</div>
                {subtitleNode && (
                  <div className="text-xs text-[hsl(var(--kuja-ink-soft))] mt-0.5">{subtitleNode}</div>
                )}
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                  {otherCols.map((c) => (
                    <div key={c.key} className="contents">
                      <dt className="text-[10px] uppercase tracking-wider text-[hsl(var(--kuja-ink-soft))] font-semibold self-center">
                        {c.header}
                      </dt>
                      <dd className="text-[hsl(var(--kuja-ink))]">{c.cell(row)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              {(href || onRowClick) && (
                <ChevronRight className="w-4 h-4 text-[hsl(var(--kuja-ink-soft))] shrink-0 mt-1" aria-hidden />
              )}
            </div>
          );
          if (href) {
            return (
              <li key={key}>
                <a href={href} className="block rounded-xl border border-[hsl(var(--border))] bg-background p-3 hover:border-[hsl(var(--kuja-clay))] hover:shadow-sm transition-all">
                  {inner}
                </a>
              </li>
            );
          }
          if (onRowClick) {
            return (
              <li key={key}>
                <button type="button" onClick={() => onRowClick(row)} className="w-full text-left rounded-xl border border-[hsl(var(--border))] bg-background p-3 hover:border-[hsl(var(--kuja-clay))] hover:shadow-sm transition-all">
                  {inner}
                </button>
              </li>
            );
          }
          return (
            <li key={key} className="rounded-xl border border-[hsl(var(--border))] bg-background p-3">
              {inner}
            </li>
          );
        })}
      </ul>
    </>
  );
}
