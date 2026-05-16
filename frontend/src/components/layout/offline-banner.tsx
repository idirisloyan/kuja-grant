'use client';

/**
 * OfflineBanner — top-of-app indicator when the browser loses network.
 *
 * Pure client; no server interaction. Listens to navigator.onLine + the
 * window 'online' / 'offline' events. When offline, shows a slim amber
 * banner; when reconnected, briefly flashes a green "back online" toast.
 *
 * Why this matters for the Global South audience: NGO field staff on
 * rural connections need clear feedback that the app isn't dead — they're
 * just disconnected. Without this, every spinner looks like a bug.
 */

import { useEffect, useState } from 'react';
import { WifiOff, Wifi } from 'lucide-react';
import { cn } from '@/lib/utils';

export function OfflineBanner() {
  const [online, setOnline] = useState<boolean>(true);
  const [showBackOnline, setShowBackOnline] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    setOnline(navigator.onLine);

    const goOffline = () => setOnline(false);
    const goOnline = () => {
      setOnline(true);
      setShowBackOnline(true);
      window.setTimeout(() => setShowBackOnline(false), 3500);
    };

    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  if (online && !showBackOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'fixed top-0 inset-x-0 z-[2000] py-2 px-3 text-sm font-semibold text-center transition-all duration-300',
        online
          ? 'bg-[hsl(var(--kuja-grow))] text-white'
          : 'bg-[hsl(var(--kuja-sun))] text-[hsl(var(--kuja-ink))]',
      )}
    >
      <span className="inline-flex items-center gap-2">
        {online ? (
          <><Wifi className="w-3.5 h-3.5" /> Back online — refreshing.</>
        ) : (
          <><WifiOff className="w-3.5 h-3.5" /> You&apos;re offline. Drafts will save locally; new actions will retry when reconnected.</>
        )}
      </span>
    </div>
  );
}
