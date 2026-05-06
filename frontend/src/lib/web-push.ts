/**
 * Web push client helpers — Phase 13.34.
 *
 * Tiny, no-dependency utilities for browser-side enrollment. Pulls the
 * VAPID public key from /api/push/config and subscribes the active
 * service worker. Idempotent: re-running picks up any prior subscription.
 *
 * Usage from a button:
 *
 *   import { enablePushNotifications, isPushSupported } from '@/lib/web-push';
 *
 *   if (isPushSupported() && Notification.permission === 'default') {
 *     <button onClick={enablePushNotifications}>Enable notifications</button>
 *   }
 */

import { api } from '@/lib/api';

export function isPushSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

interface PushConfig {
  configured: boolean;
  public_key: string | null;
}

export async function getPushConfig(): Promise<PushConfig | null> {
  try {
    const res = await api.get<PushConfig & { success: boolean }>('/push/config');
    return res;
  } catch {
    return null;
  }
}

/** Returns 'subscribed' | 'denied' | 'unsupported' | 'not-configured' | 'error'. */
export async function enablePushNotifications(): Promise<string> {
  if (!isPushSupported()) return 'unsupported';
  const config = await getPushConfig();
  if (!config || !config.configured || !config.public_key) return 'not-configured';

  try {
    // Ask the browser for permission.
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'error';

    // Register the worker (idempotent — returns the existing one if already registered).
    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;

    // Already subscribed?
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      // BufferSource cast — Uint8Array IS a BufferSource at runtime, but
      // some TS lib versions narrow the typing. Explicit cast keeps the
      // call portable across DOM lib variants.
      const key = urlBase64ToUint8Array(config.public_key) as BufferSource;
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key,
      });
    }

    // Send to backend.
    const json = sub.toJSON();
    await api.post('/push/subscribe', {
      endpoint: json.endpoint,
      keys: json.keys,
    });
    return 'subscribed';
  } catch {
    return 'error';
  }
}

export async function disablePushNotifications(): Promise<boolean> {
  try {
    if (!('serviceWorker' in navigator)) return false;
    const reg = await navigator.serviceWorker.getRegistration('/sw.js');
    if (!reg) return false;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return true;
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    await api.post('/push/unsubscribe', { endpoint });
    return true;
  } catch {
    return false;
  }
}
