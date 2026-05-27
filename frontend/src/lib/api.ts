// ============================================================================
// Kuja Grant Management System - Centralized API Client
// Wraps fetch with auth handling, error parsing, and typed helpers.
// ============================================================================

/**
 * Custom error class for API responses with non-2xx status codes.
 *
 * The new error response shape (Phase 0.3) returns:
 *   { success: false, error: '<machine-code>', message: '<localized human>' }
 *
 * Legacy shape: { error: '<message>' } — message and code conflated.
 *
 * ApiError carries both so consumers can:
 *   - branch on `error.code` (machine, stable, English)
 *   - render `error.message` (already localized by the server)
 *   - or fall back to `error.message` === human message in either shape
 */
export class ApiError extends Error {
  /** Stable, machine-readable error code (English). May equal message in legacy responses. */
  public code: string;

  constructor(
    public status: number,
    message: string,
    code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code || message;
  }
}

/**
 * Low-level fetch wrapper that handles:
 * - JSON serialisation / FormData passthrough
 * - 401 redirect to /login
 * - Structured error extraction from JSON error bodies
 */
async function apiFetch<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {
    // Required by Flask CSRF middleware for all mutating API requests
    'X-Requested-With': 'XMLHttpRequest',
  };

  // Phase 32 demo override: if the admin has set a network override
  // via ?network=<slug> (persisted to localStorage), forward it as the
  // X-Network-Override header. Server enforces admin-only honour.
  if (typeof window !== 'undefined') {
    try {
      const override = window.localStorage.getItem('kuja_network_override');
      if (override) headers['X-Network-Override'] = override;
    } catch {
      // localStorage unavailable (private mode, etc.) — skip silently.
    }
  }

  const opts: RequestInit = {
    method,
    credentials: 'include',
    headers,
  };

  if (body instanceof FormData) {
    // Let the browser set the multipart boundary automatically
    // Remove X-Requested-With for multipart (Flask skips CSRF check for uploads)
    delete headers['X-Requested-With'];
    opts.body = body;
  } else if (body !== undefined && body !== null) {
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }

  // Tolerate both conventions: callers may pass either '/api/foo' (full)
  // or '/foo' (path-only). Prior to this normalization, '/api/foo' was
  // double-prefixed to '/api/api/foo' and silently 404'd — the team's
  // 2026-05-16 browser sweep flagged this on donor profile, trust
  // profile, report detail, audit chain, dashboard hero cards, and the
  // chat composer's thread-open call.
  const normalizedPath = path.startsWith('/api/') ? path.slice(4) : path;

  // Phase 13.23 + 13.38 — retry transient 5xx on idempotent GETs.
  // Railway's edge / Gunicorn worker recycle occasionally produces a
  // single 502/503/504 that resolves on the next attempt. Retry up to
  // TWICE with exponential backoff (250ms, then 750ms). Two retries
  // covers two transient hops without significantly delaying real
  // failures — a stuck backend will still surface within ~1s.
  // Mutating verbs (POST/PUT/PATCH/DELETE) are NEVER retried —
  // potential double-write risk.
  let res = await fetch(`/api${normalizedPath}`, opts);
  if (method === 'GET') {
    const backoffs = [250, 750];
    for (const delay of backoffs) {
      if (res.status !== 502 && res.status !== 503 && res.status !== 504) break;
      await new Promise((resolve) => setTimeout(resolve, delay));
      res = await fetch(`/api${normalizedPath}`, opts);
    }
  }

  // Redirect to login on 401 (except for the session-check endpoint)
  if (res.status === 401) {
    if (typeof window !== 'undefined' && !path.includes('/auth/me')) {
      window.location.href = '/login';
    }
    throw new ApiError(401, 'Unauthorized');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    const body = err as { error?: string; message?: string };
    // New shape: { error: 'code', message: 'localized human text' }
    // Legacy shape: { error: 'human text' } — message field absent.
    const message = body.message || body.error || `HTTP ${res.status}`;
    const code = body.message ? body.error : message;
    throw new ApiError(res.status, message, code);
  }

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Public API surface
// ---------------------------------------------------------------------------

export const api = {
  /** HTTP GET */
  get: <T>(path: string) => apiFetch<T>('GET', path),

  /** HTTP POST (JSON body) */
  post: <T>(path: string, body?: unknown) => apiFetch<T>('POST', path, body),

  /** HTTP PUT (JSON body) */
  put: <T>(path: string, body?: unknown) => apiFetch<T>('PUT', path, body),

  /** HTTP PATCH (JSON body) */
  patch: <T>(path: string, body?: unknown) => apiFetch<T>('PATCH', path, body),

  /** HTTP DELETE */
  delete: <T>(path: string) => apiFetch<T>('DELETE', path),

  /** HTTP POST with FormData (file uploads) */
  upload: <T>(path: string, formData: FormData) =>
    apiFetch<T>('POST', path, formData),
};
