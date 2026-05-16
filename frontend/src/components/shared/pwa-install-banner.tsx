'use client';

/**
 * PWAInstallBanner — Phase 24D (May 2026).
 *
 * Promotes the "install to home screen" affordance when the browser
 * fires `beforeinstallprompt`. We capture the event so the browser's
 * own bar disappears, then surface a Kuja-styled banner the user can
 * accept or dismiss.
 *
 * Discipline:
 *   - Only ever shows once per user. Dismissal persists in localStorage.
 *   - Auto-hides on iOS (no `beforeinstallprompt` there) — Apple just
 *     ignores the API. iOS users get an inline hint via the manifest's
 *     standalone display when they tap "Add to Home Screen" manually.
 *   - Auto-hides if the app is already running standalone (display-mode:
 *     standalone media query) so we don't ask installed users to install.
 */

import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const DISMISS_KEY = 'kuja_pwa_install_dismissed_v1';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export function PWAInstallBanner() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Already installed → never show
    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      // iOS Safari quirk
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return;

    // Previously dismissed → never show again
    try {
      if (window.localStorage.getItem(DISMISS_KEY)) return;
    } catch {
      /* localStorage blocked → just show the banner */
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);

    const onInstalled = () => {
      setVisible(false);
      try { window.localStorage.setItem(DISMISS_KEY, '1'); } catch { /* noop */ }
    };
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const dismiss = () => {
    setVisible(false);
    try { window.localStorage.setItem(DISMISS_KEY, '1'); } catch { /* noop */ }
  };

  const install = async () => {
    if (!deferred) return dismiss();
    try {
      await deferred.prompt();
      await deferred.userChoice; // either way: hide
    } catch {
      /* user closed dialog — same result */
    }
    setDeferred(null);
    setVisible(false);
    try { window.localStorage.setItem(DISMISS_KEY, '1'); } catch { /* noop */ }
  };

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-4 left-4 right-4 z-50 sm:bottom-6 sm:left-auto sm:right-6 sm:max-w-sm"
      role="dialog"
      aria-label="Install Kuja app"
    >
      <Card className="p-3 sm:p-4 shadow-lg border-[hsl(var(--kuja-clay))]/30">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-[hsl(var(--kuja-clay))]/10 p-2 shrink-0">
            <Download className="h-4 w-4 text-[hsl(var(--kuja-clay))]" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold">Install Kuja for faster access</div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Adds an icon to your home screen. Opens straight to today&apos;s priorities,
              works briefly offline.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <Button
                size="sm"
                onClick={install}
                className="bg-[hsl(var(--kuja-clay))] hover:bg-[hsl(var(--kuja-clay))]/90 text-white h-8"
              >
                Install
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={dismiss}
                className="text-muted-foreground h-8"
              >
                Not now
              </Button>
            </div>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss install banner"
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </Card>
    </div>
  );
}
