'use client';

/**
 * NativeShareButton — Phase 24D (May 2026).
 *
 * Uses navigator.share() where available (mobile + Edge/Safari desktop)
 * and falls back to a clipboard copy + toast confirmation. Shipped so
 * donor + NGO public profile URLs are one tap from sharing to email,
 * WhatsApp, Slack, etc. — the channels Global South partners actually
 * use, where the old "copy link" friction loses people.
 */

import { useState } from 'react';
import { Share2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type Variant = 'default' | 'ghost' | 'outline';

interface Props {
  url: string;
  title: string;
  text?: string;
  label?: string;
  className?: string;
  variant?: Variant;
}

export function NativeShareButton({
  url, title, text, label = 'Share',
  className, variant = 'outline',
}: Props) {
  const [justCopied, setJustCopied] = useState(false);

  const share = async () => {
    // Native share dialog (mobile + supporting desktop)
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await (navigator as Navigator & { share: (d: ShareData) => Promise<void> })
          .share({ url, title, text });
        return;
      } catch (e) {
        // AbortError = user closed the sheet; don't fall through to clipboard
        if ((e as Error).name === 'AbortError') return;
      }
    }
    // Fallback: clipboard
    try {
      await navigator.clipboard.writeText(url);
      setJustCopied(true);
      toast.success('Link copied');
      window.setTimeout(() => setJustCopied(false), 1800);
    } catch {
      toast.error('Could not copy link');
    }
  };

  return (
    <Button
      type="button"
      size="sm"
      variant={variant}
      onClick={share}
      className={cn('gap-1.5', className)}
    >
      {justCopied
        ? <Check className="h-3.5 w-3.5" />
        : <Share2 className="h-3.5 w-3.5" />
      }
      {justCopied ? 'Copied' : label}
    </Button>
  );
}
