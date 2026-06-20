'use client';

/**
 * Phase 100 — Offline mutation outbox.
 *
 * When the user is offline and submits a write (POST / PUT / PATCH /
 * DELETE), we queue the request in IndexedDB instead of failing it. On
 * reconnect (browser `online` event OR Background Sync fire), the page
 * drains the queue back through the network.
 *
 * The outbox stores:
 *   - method, url, headers, body (serialized)
 *   - kind: a stable key per mutation type (e.g. 'application.save')
 *     used so the UI can show "1 application draft queued"
 *   - createdAt: client-side timestamp
 *   - lastAttemptAt: ISO timestamp of last replay attempt
 *   - attempts: count, used to back off / surface failures
 *   - localId: stable client-generated UUID so the page can match
 *     queued entries to UI state
 *
 * Conflict policy: last-write-wins. We replay in insertion order. If
 * the server rejects a queued mutation (4xx), we mark it `error` and
 * leave it in the queue for manual review via the OfflineSyncStatus
 * panel. 5xx / network failures stay queued for the next drain.
 *
 * Schema versioning: bumped via DB_VERSION below. On upgrade, we keep
 * existing queued entries — replacing the whole DB would silently
 * destroy users' offline work.
 */

const DB_NAME = 'kuja-offline-outbox';
const DB_VERSION = 1;
const STORE = 'outbox';

export type OutboxEntryStatus = 'pending' | 'replaying' | 'error';

export interface OutboxEntry {
  id?: number;
  localId: string;
  kind: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | null;     // already-serialized
  createdAt: string;        // ISO
  lastAttemptAt: string | null;
  attempts: number;
  status: OutboxEntryStatus;
  lastError: string | null;
}

let _dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB unavailable'));
  }
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('by_status', 'status');
        store.createIndex('by_kind', 'kind');
        store.createIndex('by_localId', 'localId', { unique: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

function genLocalId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface EnqueueArgs {
  kind: string;
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: BodyInit | null;
}

async function bodyToString(body: BodyInit | null | undefined): Promise<string | null> {
  if (body == null) return null;
  if (typeof body === 'string') return body;
  // Blob / Buffer / FormData / URLSearchParams / ArrayBuffer
  if (body instanceof Blob) return await body.text();
  if (body instanceof FormData) {
    const out: Record<string, string> = {};
    body.forEach((v, k) => { out[k] = typeof v === 'string' ? v : v.name; });
    return JSON.stringify({ __formdata: true, entries: out });
  }
  if (body instanceof URLSearchParams) return body.toString();
  if (body instanceof ArrayBuffer) {
    return new TextDecoder().decode(body);
  }
  // Plain object — caller usually passes JSON.stringify'd. Defensive.
  try { return JSON.stringify(body); } catch { return String(body); }
}

export async function enqueue(args: EnqueueArgs): Promise<OutboxEntry> {
  const db = await openDb();
  const bodyStr = await bodyToString(args.body ?? null);
  const entry: OutboxEntry = {
    localId: genLocalId(),
    kind: args.kind,
    method: args.method.toUpperCase(),
    url: args.url,
    headers: args.headers || {},
    body: bodyStr,
    createdAt: new Date().toISOString(),
    lastAttemptAt: null,
    attempts: 0,
    status: 'pending',
    lastError: null,
  };
  return new Promise<OutboxEntry>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).add(entry);
    req.onsuccess = () => {
      entry.id = req.result as number;
      resolve(entry);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function listPending(): Promise<OutboxEntry[]> {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(((req.result as OutboxEntry[]) || []).filter(e => e.status !== 'error'));
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function listAll(): Promise<OutboxEntry[]> {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve((req.result as OutboxEntry[]) || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function countPending(): Promise<number> {
  try {
    const list = await listPending();
    return list.length;
  } catch {
    return 0;
  }
}

async function updateEntry(id: number, patch: Partial<OutboxEntry>): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const cur = getReq.result as OutboxEntry | undefined;
      if (!cur) { resolve(); return; }
      const next = { ...cur, ...patch };
      const putReq = store.put(next);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

async function deleteEntry(id: number): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function clearAll(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export interface DrainResult {
  drained: number;
  failed: number;
  remaining: number;
}

/**
 * Replay every pending entry against the network. Returns counts.
 *
 * Replay order: oldest first. We stop the drain on the first 5xx /
 * network failure (assume connectivity dipped) so we don't burn the
 * battery hammering a flaky link. 4xx responses mark the entry `error`
 * but don't stop the drain — the user can inspect and clear those
 * later.
 */
export async function drain(): Promise<DrainResult> {
  const all = await listPending();
  // Sort oldest first
  all.sort((a, b) => (a.id || 0) - (b.id || 0));
  let drained = 0;
  let failed = 0;
  for (const entry of all) {
    if (entry.id == null) continue;
    try {
      await updateEntry(entry.id, { status: 'replaying', lastAttemptAt: new Date().toISOString(), attempts: entry.attempts + 1 });
      const res = await fetch(entry.url, {
        method: entry.method,
        headers: entry.headers,
        body: entry.body,
        credentials: 'include',
      });
      if (res.ok) {
        await deleteEntry(entry.id);
        drained++;
      } else if (res.status >= 400 && res.status < 500) {
        // Client error — surface it. The user must resolve.
        let msg = `Server rejected with ${res.status}`;
        try { msg = (await res.text()).slice(0, 240) || msg; } catch { /* ignore */ }
        await updateEntry(entry.id, { status: 'error', lastError: msg });
        failed++;
      } else {
        // 5xx — leave queued, abort drain.
        await updateEntry(entry.id, { status: 'pending', lastError: `Transient ${res.status}` });
        break;
      }
    } catch (e) {
      const msg = (e as Error).message || 'Network error';
      await updateEntry(entry.id, { status: 'pending', lastError: msg });
      break;
    }
  }
  const remaining = (await listAll()).filter(e => e.status === 'pending').length;
  return { drained, failed, remaining };
}

/**
 * Wire up automatic drain on browser `online` events and on SW
 * postMessage events. Idempotent — safe to call multiple times; the
 * second call short-circuits.
 *
 * Returns a teardown function for tests / hot-reload.
 */
let _autoDrainInstalled = false;
let _draining = false;
const _listeners = new Set<(r: DrainResult) => void>();

export function onDrainResult(fn: (r: DrainResult) => void): () => void {
  _listeners.add(fn);
  return () => { _listeners.delete(fn); };
}

async function _autoDrain() {
  if (_draining) return;
  _draining = true;
  try {
    const r = await drain();
    Array.from(_listeners).forEach((fn) => {
      try { fn(r); } catch { /* swallow */ }
    });
  } finally {
    _draining = false;
  }
}

export function installAutoDrain(): () => void {
  if (typeof window === 'undefined') return () => undefined;
  if (_autoDrainInstalled) return () => undefined;
  _autoDrainInstalled = true;

  const onOnline = () => { _autoDrain(); };
  window.addEventListener('online', onOnline);

  // Listen for SW background-sync wake-up message
  const swMessage = (e: MessageEvent) => {
    if (e.data && e.data.type === 'kuja-drain-outbox') _autoDrain();
  };
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', swMessage);
  }

  // If we're already online at install time, drain immediately.
  if (navigator.onLine) _autoDrain();

  // Register a background sync tag so OS-level wakeup also drains.
  // Wrapped in try/catch because SyncManager isn't universally
  // available (Firefox in particular).
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then((reg) => {
      const sm = (reg as ServiceWorkerRegistration & { sync?: { register: (tag: string) => Promise<void> } }).sync;
      if (sm) {
        sm.register('kuja-outbox-sync').catch(() => undefined);
      }
    }).catch(() => undefined);
  }

  return () => {
    window.removeEventListener('online', onOnline);
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.removeEventListener('message', swMessage);
    }
    _autoDrainInstalled = false;
  };
}
