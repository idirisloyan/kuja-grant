'use client';

/**
 * OfflineBanner — top-of-app indicator when the browser loses network.
 *
 * Phase 100: extended to surface the offline-outbox queue depth.
 *
 *   - Offline: amber banner with WiFi-off icon. If there are queued
 *     mutations, shows the count ("3 changes saved on this device").
 *   - Online + flash: green "Back online — sending 3 changes" if there
 *     was a pending queue; "Back online" if the queue was empty.
 *   - Online + steady state: hidden.
 *
 * On mount we install the auto-drain hook so that as soon as the device
 * reconnects, queued mutations replay against the server. Browsers
 * supporting Background Sync also get OS-level wake-ups.
 */

import { useEffect, useState } from 'react';
import { WifiOff, Wifi, CloudUpload } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  installAutoDrain, onDrainResult, countPending,
} from '@/lib/offline-outbox';

export function OfflineBanner() {
  const [online, setOnline] = useState<boolean>(true);
  const [showBackOnline, setShowBackOnline] = useState(false);
  const [queueSize, setQueueSize] = useState<number>(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    setOnline(navigator.onLine);

    // Refresh queue size on mount.
    countPending().then(setQueueSize).catch(() => undefined);

    const goOffline = () => {
      setOnline(false);
      countPending().then(setQueueSize).catch(() => undefined);
    };
    const goOnline = () => {
      setOnline(true);
      setShowBackOnline(true);
      window.setTimeout(() => setShowBackOnline(false), 3500);
    };

    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    const teardown = installAutoDrain();
    const unsubscribe = onDrainResult(() => {
      countPending().then(setQueueSize).catch(() => undefined);
    });

    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
      teardown();
      unsubscribe();
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
          queueSize > 0 ? (
            <><CloudUpload className="w-3.5 h-3.5" /> Back online — sending {queueSize} queued change{queueSize === 1 ? '' : 's'}.</>
          ) : (
            <><Wifi className="w-3.5 h-3.5" /> Back online — refreshing.</>
          )
        ) : (
          queueSize > 0 ? (
            <><WifiOff className="w-3.5 h-3.5" /> You&apos;re offline. {queueSize} change{queueSize === 1 ? '' : 's'} saved on this device, will send when reconnected.</>
          ) : (
            <><WifiOff className="w-3.5 h-3.5" /> You&apos;re offline. Drafts will save locally; new actions will retry when reconnected.</>
          )
        )}
      </span>
    </div>
  );
}
