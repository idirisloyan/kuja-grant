'use client';

/**
 * Bottom sheet — the mobile surface the 4 Sep QA pack asks for wherever a
 * phone page used to grow a second row of chrome (PFX-04SEP-MOBILE-004/007/011).
 *
 * One primitive, used by: the Partners Status and "More" controls, the
 * Rounds status filter, and the Audit "expand" action. It is deliberately
 * small: an overlay, a panel anchored to the bottom edge that respects the
 * home-indicator inset, a titled header with a close control, Escape and
 * backdrop dismissal, focus moved into the panel on open and body scroll
 * locked while it is up. Nothing here reaches the server — it only shows what
 * the page already has, so no workflow or permission behaviour changes.
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { X, Check } from 'lucide-react';
import { useTranslation } from '@/lib/hooks/use-translation';

export function BottomSheet({
  open, onClose, title, children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      restoreRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60]" data-testid="bottom-sheet">
      <button
        type="button"
        aria-label={t('common.close')}
        className="absolute inset-0 bg-black/40 w-full h-full cursor-default"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-border bg-background text-foreground shadow-2xl max-h-[80vh] overflow-y-auto outline-none"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="sticky top-0 bg-background flex items-center justify-between px-4 pt-3 pb-2 border-b border-border">
          <div className="text-sm font-semibold">{title}</div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="inline-flex items-center justify-center w-9 h-9 -me-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
        <div className="p-2">{children}</div>
      </div>
    </div>
  );
}

/**
 * One tappable row inside a sheet. `selected` renders a check mark and sets
 * aria-pressed so screen readers announce the current choice.
 */
export function SheetOption({
  selected = false, onClick, children, trailing, href,
}: {
  selected?: boolean;
  onClick?: () => void;
  children: ReactNode;
  trailing?: ReactNode;
  href?: string;
}) {
  const cls = 'w-full flex items-center justify-between gap-3 rounded-lg px-3 py-3 text-sm text-start hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring outline-none';
  const body = (
    <>
      <span className="flex items-center gap-2 min-w-0">
        {selected
          ? <Check className="w-4 h-4 shrink-0" aria-hidden="true" />
          : <span className="w-4 h-4 shrink-0" aria-hidden="true" />}
        <span className="truncate">{children}</span>
      </span>
      {trailing != null && (
        <span className="text-xs text-muted-foreground shrink-0">{trailing}</span>
      )}
    </>
  );
  if (href) {
    return <a href={href} className={cls} onClick={onClick}>{body}</a>;
  }
  return (
    <button type="button" className={cls} onClick={onClick} aria-pressed={selected}>
      {body}
    </button>
  );
}
