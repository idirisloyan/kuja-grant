'use client';

/**
 * Phase 257 — NGO "share Trust Profile" CTA.
 *
 * Calls POST /api/passport/publish (or shows the current passport's
 * share URL). Single-click flow: generates the link + copies to
 * clipboard. Self-hides for non-NGO viewers.
 */

import { useState } from 'react';
import { Share2, Copy, Check } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface PublishResp {
  passport?: { share_slug?: string | null };
}

export function TrustShareCard() {
  const user = useAuthStore((s) => s.user);
  const [busy, setBusy] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (user?.role !== 'ngo') return null;

  async function publish() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await api.post<PublishResp>('/api/passport/publish', {});
      const slug = r?.passport?.share_slug;
      if (slug) {
        const url = `${window.location.origin}/trust/share/${slug}`;
        setShareUrl(url);
        try { await navigator.clipboard.writeText(url); setCopied(true); } catch {/* ignore */}
      }
    } catch {
      alert('Could not publish Trust Profile.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <Share2 className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
          Share your Trust Profile
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {!shareUrl ? (
          <>
            <p className="text-xs text-muted-foreground">
              Generates a public link donors can open without signing in.
            </p>
            <button
              type="button"
              onClick={publish}
              disabled={busy}
              className="rounded-md bg-[hsl(var(--kuja-clay))] text-white px-3 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-60"
            >
              {busy ? 'Generating…' : 'Generate share link'}
            </button>
          </>
        ) : (
          <div className="space-y-1.5">
            <code className="block text-xs bg-muted/40 rounded px-2 py-1 break-all">{shareUrl}</code>
            <button
              type="button"
              onClick={async () => {
                try { await navigator.clipboard.writeText(shareUrl); setCopied(true); } catch {/* ignore */}
              }}
              className="inline-flex items-center gap-1 text-xs text-[hsl(var(--kuja-clay))] hover:underline"
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copied ? 'Copied' : 'Copy link'}
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
