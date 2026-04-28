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

  const res = await fetch(`/api${path}`, opts);

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
