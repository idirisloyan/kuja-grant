/**
 * useAiJob — Phase 13.42 frontend client for async AI calls.
 *
 * Pairs with `app/services/ai_jobs.py` on the backend. Pattern:
 *
 *   const { run, result, status, error } = useAiJob<MyResult>();
 *   await run('/copilot/insight-narrate', { chart_type, data });
 *   // result populates when the background job finishes.
 *
 * Behavior:
 *   1. POSTs to `${path}?async=true` with the supplied body.
 *   2. On 202, captures the job_id and polls `/ai/jobs/<id>` with
 *      exponential backoff (250ms, 500ms, 1s, 1.5s, 2s — capped at 2s).
 *   3. On 200 (sync fallback — older endpoints not yet migrated), uses
 *      the response body directly. So any caller can opt-in safely;
 *      endpoints that don't support async still work the old way.
 *   4. On unmount or new run(), the in-flight poll is cancelled.
 *
 * Why polling and not WebSocket / SSE: the existing `task_runner` is
 * polled by `/api/admin/task-status/<id>` already; adding a new
 * pub/sub channel just for AI jobs is more infra than necessary for
 * a 2-10s wait.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';

export type AiJobStatus = 'idle' | 'running' | 'completed' | 'failed';

interface JobPollResponse<T> {
  success: boolean;
  status: 'running' | 'completed' | 'failed' | 'unknown';
  result?: T;
  error?: string;
  job_id?: string;
}

interface EnqueueResponse {
  ok?: boolean;
  job_id?: string;
  status?: string;
}

const POLL_BACKOFFS_MS = [250, 500, 1000, 1500, 2000];

export function useAiJob<TResult = unknown>() {
  const [status, setStatus] = useState<AiJobStatus>('idle');
  const [result, setResult] = useState<TResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);

  // Cancellation token — incremented on new run() / unmount; the active
  // poll loop checks the ref's value matches the run it started on.
  const runIdRef = useRef(0);

  useEffect(() => {
    return () => { runIdRef.current += 1; };  // cancel on unmount
  }, []);

  const run = useCallback(async (
    path: string,
    body: Record<string, unknown>,
  ): Promise<TResult | null> => {
    runIdRef.current += 1;
    const myRun = runIdRef.current;

    setStatus('running');
    setResult(null);
    setError(null);
    setJobId(null);

    // Append ?async=true. Path may already have a query string.
    const url = path + (path.includes('?') ? '&' : '?') + 'async=true';

    try {
      const enqueue = await api.post<EnqueueResponse | TResult>(url, body);

      // Sync fallback — endpoint hasn't been migrated to async yet, or
      // the request didn't include async_mode body field. Either way,
      // the response body IS the result.
      const enqueueDict = enqueue as EnqueueResponse;
      if (!enqueueDict || typeof enqueueDict !== 'object'
          || !('job_id' in enqueueDict) || !enqueueDict.job_id) {
        if (myRun !== runIdRef.current) return null;  // cancelled
        setResult(enqueue as TResult);
        setStatus('completed');
        return enqueue as TResult;
      }

      const id = enqueueDict.job_id;
      setJobId(id);

      // Poll loop with exponential backoff. Caps at 2s + 30 attempts (~50s
      // total wait). After that, surface a failure — most AI calls finish
      // within 10s, so 50s is generous.
      let attempt = 0;
      while (myRun === runIdRef.current && attempt < 30) {
        const delay = POLL_BACKOFFS_MS[Math.min(attempt, POLL_BACKOFFS_MS.length - 1)];
        await new Promise((resolve) => setTimeout(resolve, delay));
        if (myRun !== runIdRef.current) return null;  // cancelled

        const poll = await api.get<JobPollResponse<TResult>>(`/ai/jobs/${id}`);
        if (myRun !== runIdRef.current) return null;

        if (poll.status === 'completed') {
          setResult((poll.result ?? null) as TResult);
          setStatus('completed');
          return (poll.result ?? null) as TResult;
        }
        if (poll.status === 'failed') {
          setError(poll.error || 'AI call failed');
          setStatus('failed');
          return null;
        }
        // 'running' or 'unknown' — keep polling.
        attempt += 1;
      }
      if (myRun === runIdRef.current) {
        setError('Timed out waiting for AI');
        setStatus('failed');
      }
      return null;
    } catch (e) {
      if (myRun !== runIdRef.current) return null;
      const msg = e instanceof ApiError ? e.message : (e as Error).message;
      setError(msg || 'Request failed');
      setStatus('failed');
      return null;
    }
  }, []);

  const reset = useCallback(() => {
    runIdRef.current += 1;
    setStatus('idle');
    setResult(null);
    setError(null);
    setJobId(null);
  }, []);

  return { run, status, result, error, jobId, reset };
}
