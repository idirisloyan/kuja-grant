'use client';

/**
 * Sticky mobile context bar — PFX-04SEP-MOBILE-001 (level 2 of the mobile
 * navigation model).
 *
 * The global header (level 1) carries the workspace identity and never
 * changes; once a page heading scrolls away a phone user had no way to tell
 * Partners from Disbursements. This bar sits directly under the header,
 * stays put while scrolling, and answers: which module am I in, which
 * filter is applied, and — on a detail page — what did I come from and how
 * do I get back without the browser's Back button.
 *
 *   top level:   Partners
 *   filtered:    Partners · In review
 *   detail:      ‹ Partners            (link)
 *                East Gedaref Volunteers
 *
 * Fed by the UI store: PageHeader publishes title + last breadcrumb,
 * PageBack publishes the parent, pages with filters publish the filter.
 * Rendered only where the sidebar is a drawer (below lg).
 */

import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { useUIStore } from '@/stores/ui-store';

export const MOBILE_CONTEXT_BAR_HEIGHT = 44;

export function MobileContextBar() {
  const ctx = useUIStore((s) => s.mobileContext);
  if (!ctx || (!ctx.title && !ctx.parent)) return null;
  return (
    <nav
      className="lg:hidden sticky top-16 z-20 border-b border-border bg-background/95 backdrop-blur px-4 flex flex-col justify-center"
      style={{ minHeight: MOBILE_CONTEXT_BAR_HEIGHT }}
      aria-label="Current location"
    >
      {ctx.parent ? (
        <>
          <Link
            href={ctx.parent.href}
            className="inline-flex items-center gap-0.5 text-[11px] leading-4 text-muted-foreground hover:text-foreground -ms-1"
          >
            <ChevronLeft className="w-3.5 h-3.5 rtl:rotate-180" aria-hidden="true" />
            {ctx.parent.label}
          </Link>
          {ctx.title && (
            <div className="text-sm font-semibold leading-5 truncate" aria-current="page">
              {ctx.title}
            </div>
          )}
        </>
      ) : (
        <div className="text-sm font-semibold leading-5 truncate" aria-current="page">
          {ctx.title}
          {ctx.filter && (
            <span className="font-normal text-muted-foreground"> · {ctx.filter}</span>
          )}
        </div>
      )}
    </nav>
  );
}
