'use client';

/**
 * NameChip — deterministic-color label chip (PMO transfer pattern).
 *
 * Hash the name to one of a fixed palette so the same name always
 * renders in the same color — across every page, every row, every
 * user. Zero manual color assignment, instant visual recognition.
 *
 * Use for: tags, grant types, donor types, sectors, countries, any
 * controlled vocabulary that's stable enough that a consistent color
 * is information.
 *
 * The palette uses Kuja design tokens so chips harmonise with the rest
 * of the app. Each pair is { bg, fg, ring } chosen for accessibility.
 */

import { cn } from '@/lib/utils';

interface Props {
  name: string;
  /** Optional onClick. If present, renders as a button. */
  onClick?: () => void;
  /** Optional override for size. Default 'sm'. */
  size?: 'xs' | 'sm' | 'md';
  className?: string;
  /** Optional title attribute (defaults to the name). */
  title?: string;
}

// 12 deterministic chip styles — tested for WCAG AA on white backgrounds.
// Each entry is [bg, fg, ring] HSL strings consumed via inline style so
// they survive purge.
const PALETTE: Array<{ bg: string; fg: string; ring: string }> = [
  { bg: 'hsl(15 90% 95%)',  fg: 'hsl(15 80% 30%)',  ring: 'hsl(15 70% 60%)'  },
  { bg: 'hsl(40 95% 92%)',  fg: 'hsl(35 70% 28%)',  ring: 'hsl(35 70% 55%)'  },
  { bg: 'hsl(160 60% 92%)', fg: 'hsl(160 60% 22%)', ring: 'hsl(160 50% 50%)' },
  { bg: 'hsl(210 70% 93%)', fg: 'hsl(212 60% 28%)', ring: 'hsl(212 60% 55%)' },
  { bg: 'hsl(265 60% 94%)', fg: 'hsl(265 50% 32%)', ring: 'hsl(265 50% 60%)' },
  { bg: 'hsl(330 65% 94%)', fg: 'hsl(330 55% 32%)', ring: 'hsl(330 55% 60%)' },
  { bg: 'hsl(190 65% 92%)', fg: 'hsl(195 60% 24%)', ring: 'hsl(195 55% 50%)' },
  { bg: 'hsl(50 80% 90%)',  fg: 'hsl(40 60% 28%)',  ring: 'hsl(40 60% 50%)'  },
  { bg: 'hsl(85 50% 92%)',  fg: 'hsl(95 50% 25%)',  ring: 'hsl(95 50% 50%)'  },
  { bg: 'hsl(0 65% 95%)',   fg: 'hsl(0 60% 32%)',   ring: 'hsl(0 60% 55%)'   },
  { bg: 'hsl(240 50% 95%)', fg: 'hsl(240 45% 30%)', ring: 'hsl(240 45% 60%)' },
  { bg: 'hsl(135 45% 92%)', fg: 'hsl(135 50% 24%)', ring: 'hsl(135 45% 48%)' },
];

/**
 * Cheap deterministic hash. djb2 is good enough for palette indexing
 * (we only need 12 buckets) — not for cryptography. Stable across
 * platforms.
 */
function hashIndex(s: string, mod: number): number {
  let h = 5381;
  const trimmed = s.trim().toLowerCase();
  for (let i = 0; i < trimmed.length; i++) {
    h = ((h << 5) + h) + trimmed.charCodeAt(i);
    h = h | 0; // force int32
  }
  return Math.abs(h) % mod;
}

export function nameChipStyle(name: string): React.CSSProperties {
  const p = PALETTE[hashIndex(name || '?', PALETTE.length)];
  return {
    backgroundColor: p.bg,
    color: p.fg,
    borderColor: p.ring,
  };
}

const SIZE_CLASS: Record<string, string> = {
  xs: 'text-[10px] px-1.5 py-0.5',
  sm: 'text-xs px-2 py-0.5',
  md: 'text-sm px-2.5 py-1',
};

export function NameChip({ name, onClick, size = 'sm', className, title }: Props) {
  const style = nameChipStyle(name);
  const cls = cn(
    'inline-flex items-center rounded-full border font-medium whitespace-nowrap transition-colors',
    SIZE_CLASS[size],
    onClick && 'cursor-pointer hover:brightness-95',
    className,
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        style={style}
        className={cls}
        title={title || name}
      >
        {name}
      </button>
    );
  }
  return (
    <span style={style} className={cls} title={title || name}>
      {name}
    </span>
  );
}
