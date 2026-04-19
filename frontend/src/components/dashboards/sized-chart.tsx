'use client';

/**
 * SizedChart — measures its own container and passes concrete pixel
 * dimensions down to the Recharts component.
 *
 * Why: Recharts v3's <ResponsiveContainer width="100%" height="100%"> logs
 * "The width(-1) and height(-1) of chart should be greater than 0"
 * whenever the parent's computed width is 0 on the very first paint (a
 * common case inside CSS grid cells with `minmax(0, 1fr)`). Even
 * minWidth/minHeight props don't fully silence it because Recharts
 * validates dimensions before applying those fallbacks.
 *
 * SizedChart avoids the issue entirely by only rendering the chart after
 * a ResizeObserver reports a positive width. No ResponsiveContainer
 * involved — we hand BarChart/LineChart/etc. literal pixel numbers.
 */

import { useEffect, useRef, useState, type ReactElement, cloneElement } from 'react';

interface Props {
  /** Fixed pixel height for the chart. */
  height: number;
  /**
   * The Recharts chart element, e.g. <BarChart data={...}>...</BarChart>.
   * `width` and `height` props are injected by SizedChart — do NOT set
   * them on the child.
   */
  children: ReactElement<{ width?: number; height?: number }>;
  className?: string;
}

export function SizedChart({ height, children, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Seed with whatever the browser reports right now — often non-zero
    // after hydration completes.
    const initial = el.getBoundingClientRect().width;
    if (initial > 0) setWidth(Math.floor(initial));

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        if (w > 0) setWidth(Math.floor(w));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: '100%', height, minWidth: 1, minHeight: 1 }}
    >
      {width > 0
        ? cloneElement(children, { width, height })
        : null}
    </div>
  );
}
