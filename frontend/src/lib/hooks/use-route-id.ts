'use client';

/**
 * useRouteId — rescue the dynamic id segment for static-export pages.
 *
 * Next.js static export only prerenders the placeholder route
 * (e.g. /admin/declarations/0/), so `useParams().id` hydrates as the
 * literal '0' for every other URL. Without a fallback the page reads
 * id=0, fetches nothing, and the shimmer never goes away — the team
 * reports this as the dashboard tile drill-in hang.
 *
 * This hook does what every detail page was doing inline (and the
 * applications/[id] page was the first to get right): read the actual
 * pathname, parse the segment after `<segmentName>/`, and prefer that
 * over the params value when it's not '0'. SSR-safe: returns null when
 * window is not available so callers can render a loading state.
 *
 * Usage:
 *   const id = useRouteId('declarations');  // /admin/declarations/111 -> 111
 *   const { data } = useDeclaration(id);
 */

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

export function useRouteId(segmentName: string): number | null {
  const params = useParams();
  const [id, setId] = useState<number | null>(() => {
    if (typeof window !== 'undefined') {
      // Match the segment AFTER the named one in the URL. Allow trailing
      // characters because some pages have nested segments (e.g.
      // /admin/windows/<id>/report).
      const re = new RegExp(`/${segmentName}/(\\d+)(?:/|$)`);
      const m = window.location.pathname.match(re);
      if (m && m[1] !== '0') return Number(m[1]);
    }
    const fromParams = Number(params?.id);
    return Number.isFinite(fromParams) && fromParams > 0 ? fromParams : null;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const re = new RegExp(`/${segmentName}/(\\d+)(?:/|$)`);
    const m = window.location.pathname.match(re);
    if (m && m[1] !== '0') {
      const n = Number(m[1]);
      if (n !== id) setId(n);
      return;
    }
    const fromParams = Number(params?.id);
    if (Number.isFinite(fromParams) && fromParams > 0 && fromParams !== id) {
      setId(fromParams);
    }
  }, [params?.id, id, segmentName]);

  return id;
}
