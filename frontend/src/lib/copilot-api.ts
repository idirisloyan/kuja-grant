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

export type DonorActionType =
  | 'review_applications'
  | 'review_compliance'
  | 'review_reports'
  | 'create_grant'
  | 'manage_grants'
  | 'assign_reviewers'
  | 'other';

export interface DonorPortfolioInsights {
  headline: string;
  sections?: Array<{ title: string; body: string; severity?: string }>;
  next_decisions?: Array<{
    title: string;
    detail: string;
    severity?: string;
    action_type?: DonorActionType;
  }>;
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
  burden?: {
    score?: 'low' | 'medium' | 'high';
    drivers?: string[];
    simplifications?: string[];
  };
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

// action_type lets the readiness console route each next_action to the
// page that completes it, instead of just opening the co-pilot rail.
export type NgoActionType =
  | 'apply_grant'
  | 'submit_report'
  | 'complete_assessment'
  | 'upload_document'
  | 'update_profile'
  | 'improve_application'
  | 'other';

export interface NgoReadiness {
  readiness_score: number;
  headline?: string;
  subscores?: Record<string, number>;
  top_blockers?: Array<{ title: string; impact_pts?: number; severity?: string }>;
  next_actions?: Array<{
    title: string;
    detail?: string;
    estimated_uplift_pts?: number;
    severity?: string;
    action_type?: NgoActionType;
  }>;
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
// 10. Application co-author (Phase 1.1) — first-draft generation
// ---------------------------------------------------------------------------

export interface DraftClaimProvenance {
  criterion_key?: string;
  section_key?: string;
  claim: string;
  source_kind: 'profile' | 'document' | 'application' | 'report' | 'note' | 'ai_general';
  source_id?: number | null;
  source_locator?: string | null;
  source_excerpt?: string | null;
  confidence: 'high' | 'medium' | 'low';
}

export interface ApplicationDraft {
  responses: Record<string, string>;
  eligibility_responses?: Record<string, { met: boolean; evidence: string }>;
  confidence_per_criterion: Record<string, 'high' | 'medium' | 'low'>;
  claim_provenance: DraftClaimProvenance[];
  voice_note?: string;
  source: 'claude' | 'template';
}

export interface DraftApplicationResult {
  draft: ApplicationDraft;
  application_id: number | null;
  provenance_saved: number;
}

export function fetchDraftApplication(input: {
  grant_id: number;
  application_id?: number;
  brief?: string;
  replace_existing?: boolean;
  save?: boolean;
}) {
  return safeCall<DraftApplicationResult>(() =>
    api.post<CopilotResult<DraftApplicationResult>>('/ai/draft-application', input),
  );
}

// ---------------------------------------------------------------------------
// 11. Report co-author (Phase 1.3)
// ---------------------------------------------------------------------------

export interface ReportDraft {
  sections: Record<string, string>;
  gaps: Array<{ section_key: string; issue: string; what_to_provide: string }>;
  kpi_values: Record<string, number | null>;
  confidence_per_section: Record<string, 'high' | 'medium' | 'low'>;
  claim_provenance: DraftClaimProvenance[];
  source: 'claude' | 'template';
}

export interface DraftReportResult {
  draft: ReportDraft;
  report_id: number;
  provenance_saved: number;
}

export function fetchDraftReport(input: {
  report_id: number;
  notes?: string;
  replace_existing?: boolean;
}) {
  return safeCall<DraftReportResult>(() =>
    api.post<CopilotResult<DraftReportResult>>('/ai/draft-report', input),
  );
}

// ---------------------------------------------------------------------------
// 12. Provenance read (Phase 5.1)
// ---------------------------------------------------------------------------

export interface ProvenanceRow {
  id: number;
  ai_call_id: number | null;
  subject: { kind: string; id: number | null; field: string | null };
  claim: string;
  source: {
    kind: string;
    id: number | null;
    locator: string | null;
    excerpt: string | null;
  };
  confidence: 'high' | 'medium' | 'low' | string;
  created_at: string;
}

export function fetchProvenance(input: {
  subject_kind: 'application' | 'report' | 'grant';
  subject_id?: number;
  subject_field?: string;
}) {
  const qs = new URLSearchParams();
  qs.set('subject_kind', input.subject_kind);
  if (input.subject_id != null) qs.set('subject_id', String(input.subject_id));
  if (input.subject_field) qs.set('subject_field', input.subject_field);
  return safeCall<{ provenance: ProvenanceRow[] }>(() =>
    api.get<CopilotResult<{ provenance: ProvenanceRow[] }>>(
      `/ai/provenance?${qs.toString()}`,
    ),
  );
}

// ---------------------------------------------------------------------------
// 13. AI call helpfulness feedback (Phase 0.5 closer)
// ---------------------------------------------------------------------------

export function postAiHelpfulness(
  callId: number,
  helpfulness: 'used' | 'edited' | 'dismissed',
) {
  return safeCall<{ helpfulness: string }>(() =>
    api.post<CopilotResult<{ helpfulness: string }>>(
      `/ai/calls/${callId}/feedback`,
      { helpfulness },
    ),
  );
}

// ---------------------------------------------------------------------------
// 14. AI health (admin only)
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
