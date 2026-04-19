// ============================================================================
// Kuja Co-pilot API client
// ----------------------------------------------------------------------------
// Typed helpers that talk to the Phase 2 /api/ai/* endpoints. Everything
// returns a discriminated union so UI code can render success or failure
// states cleanly — never a stuck loading state.
// ============================================================================

import { api, ApiError } from './api';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export type CopilotOk<T> = { ok: true; data: T; meta?: Record<string, unknown> };
export type CopilotErr = { ok: false; code: string; message: string };
export type CopilotResult<T> = CopilotOk<T> | CopilotErr;

// Normalize any API error into our typed union.
async function safeCall<T>(fn: () => Promise<CopilotResult<T>>): Promise<CopilotResult<T>> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ApiError) {
      return { ok: false, code: `HTTP_${e.status}`, message: e.message };
    }
    return { ok: false, code: 'NETWORK', message: (e as Error).message || 'Network error' };
  }
}

// ---------------------------------------------------------------------------
// 1. Donor portfolio insights
// ---------------------------------------------------------------------------

export interface DonorPortfolioInsights {
  headline: string;
  sections?: Array<{ title: string; body: string; severity?: string }>;
  next_decisions?: Array<{ title: string; detail: string; severity?: string }>;
}

export function fetchDonorPortfolioInsights() {
  return safeCall<DonorPortfolioInsights>(() =>
    api.post<CopilotResult<DonorPortfolioInsights>>('/ai/donor-portfolio-insights', {}),
  );
}

// ---------------------------------------------------------------------------
// 2. Donor grant co-pilot
// ---------------------------------------------------------------------------

export interface GrantScaffold {
  eligibility?: string[];
  scoring_rubric?: Array<{ criterion: string; weight: number; rationale?: string }>;
  reporting_requirements?: Array<{ title: string; frequency: string; detail: string }>;
  exclusions?: string[];
  guidance?: string;
}

export function fetchGrantScaffold(input: {
  goal: string;
  thematic?: string;
  geography?: string;
  budget_usd?: number | null;
  draft?: Record<string, unknown>;
}) {
  return safeCall<GrantScaffold>(() =>
    api.post<CopilotResult<GrantScaffold>>('/ai/donor-grant-copilot', input),
  );
}

// ---------------------------------------------------------------------------
// 3. NGO readiness
// ---------------------------------------------------------------------------

export interface NgoReadiness {
  readiness_score: number;
  headline?: string;
  subscores?: Record<string, number>;
  top_blockers?: Array<{ title: string; impact_pts?: number; severity?: string }>;
  next_actions?: Array<{ title: string; detail?: string; estimated_uplift_pts?: number; severity?: string }>;
}

export function fetchNgoReadiness() {
  return safeCall<NgoReadiness>(() =>
    api.post<CopilotResult<NgoReadiness>>('/ai/ngo-readiness', {}),
  );
}

// ---------------------------------------------------------------------------
// 4. Reviewer recommendation
// ---------------------------------------------------------------------------

export interface ReviewerRecommendation {
  ranked: Array<{
    application_id: number;
    rank: number;
    recommendation: 'fund' | 'clarify' | 'decline';
    rationale: string;
    key_strengths?: string[];
    key_weaknesses?: string[];
  }>;
  similarity_alerts?: Array<{ application_ids: number[]; reason: string }>;
  review_summary?: string;
}

export function fetchReviewerRecommendation(input: {
  application_ids: number[];
  rubric?: Array<{ criterion: string; weight: number }>;
}) {
  return safeCall<ReviewerRecommendation>(() =>
    api.post<CopilotResult<ReviewerRecommendation>>('/ai/reviewer-recommendation', input),
  );
}

// ---------------------------------------------------------------------------
// 5. Cross-grant patterns
// ---------------------------------------------------------------------------

export interface CrossGrantPatterns {
  patterns: Array<{
    pattern: string;
    prevalence_pct: number;
    evidence_examples?: string[];
    rfp_recommendation?: string;
  }>;
  summary?: string;
}

export function fetchCrossGrantPatterns() {
  return safeCall<CrossGrantPatterns>(() =>
    api.post<CopilotResult<CrossGrantPatterns>>('/ai/cross-grant-patterns', {}),
  );
}

// ---------------------------------------------------------------------------
// 6. Insight narration (universal chart caption)
// ---------------------------------------------------------------------------

export interface InsightCaption {
  caption: string;
}

export function fetchInsightCaption(input: {
  chart_type: string;
  data: unknown;
  context?: string;
}) {
  return safeCall<InsightCaption>(() =>
    api.post<CopilotResult<InsightCaption>>('/ai/insight-narrate', input),
  );
}

// ---------------------------------------------------------------------------
// 7. Page-aware suggestions (co-pilot "Now" tab)
// ---------------------------------------------------------------------------

export interface Suggestion {
  title: string;
  detail?: string;
  severity?: 'critical' | 'major' | 'minor' | 'info';
  action?: string;
}

export interface Suggestions {
  suggestions: Suggestion[];
  summary?: string;
}

export function fetchSuggestions(input: {
  role?: string;
  scope?: { kind: string; id?: number | string };
}) {
  return safeCall<Suggestions>(() =>
    api.post<CopilotResult<Suggestions>>('/ai/suggestions', input),
  );
}

// ---------------------------------------------------------------------------
// 8. Streaming chat — SSE via NDJSON
// ---------------------------------------------------------------------------

export interface StreamSource {
  doc_id: string;
  kind: string;
  title: string;
  reference: string;
  href: string;
  body?: string;
}

export interface StreamFrame {
  type: 'sources' | 'delta' | 'done' | 'error';
  items?: StreamSource[];
  text?: string;
  message?: string;
  input_tokens?: number;
  output_tokens?: number;
  model?: string;
  thread_id?: number;
}

export async function* streamChat(input: {
  question: string;
  scope?: { kind: string; id?: number | string };
  thread_id?: number | null;
  signal?: AbortSignal;
}): AsyncGenerator<StreamFrame, void, unknown> {
  const res = await fetch('/api/ai/chat-stream', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: JSON.stringify({
      question: input.question,
      scope: input.scope ?? { kind: 'global' },
      thread_id: input.thread_id ?? null,
    }),
    signal: input.signal,
  });

  if (!res.ok || !res.body) {
    yield {
      type: 'error',
      message: `HTTP ${res.status} ${res.statusText}`,
    };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      const s = line.trim();
      if (!s) continue;
      try {
        const frame = JSON.parse(s) as StreamFrame;
        yield frame;
      } catch {
        // ignore malformed lines
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 9. Threads
// ---------------------------------------------------------------------------

export interface ThreadSummary {
  id: number;
  user_id: number;
  scope_kind: string | null;
  scope_id: number | null;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface ThreadDetail extends ThreadSummary {
  messages: Array<{
    id: number;
    role: 'user' | 'assistant';
    content: string;
    created_at: string;
  }>;
}

export function fetchThreads() {
  return safeCall<{ threads: ThreadSummary[] }>(() =>
    api.get<CopilotResult<{ threads: ThreadSummary[] }>>('/ai/threads'),
  );
}

export function fetchThread(id: number) {
  return safeCall<ThreadDetail>(() =>
    api.get<CopilotResult<ThreadDetail>>(`/ai/threads/${id}`),
  );
}

// ---------------------------------------------------------------------------
// 10. AI health (admin only)
// ---------------------------------------------------------------------------

export interface AiHealth {
  window_hours: number;
  total_calls: number;
  success_rate_pct: number | null;
  by_endpoint: Record<string, { total: number; success: number; tokens_in: number; tokens_out: number }>;
}

export function fetchAiHealth() {
  return safeCall<AiHealth>(() =>
    api.get<CopilotResult<AiHealth>>('/ai/health'),
  );
}
