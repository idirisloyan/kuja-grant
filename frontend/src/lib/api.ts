// ============================================================================
// Kuja Grant Management System - Centralized API Client
// Wraps fetch with auth handling, error parsing, and typed helpers.
// ============================================================================

/**
 * Custom error class for API responses with non-2xx status codes.
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
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
  const headers: Record<string, string> = {};

  const opts: RequestInit = {
    method,
    credentials: 'include',
    headers,
  };

  if (body instanceof FormData) {
    // Let the browser set the multipart boundary automatically
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
    throw new ApiError(
      res.status,
      (err as { error?: string }).error || `HTTP ${res.status}`,
    );
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

  /** HTTP DELETE */
  delete: <T>(path: string) => apiFetch<T>('DELETE', path),

  /** HTTP POST with FormData (file uploads) */
  upload: <T>(path: string, formData: FormData) =>
    apiFetch<T>('POST', path, formData),
};
