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
    /** Phase 11.6 — specific entity ID for deep-linking. */
    target_id?: number | null;
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
  /** Phase 11.2 — IDs of memory items the AI drew from. */
  memory_used?: number[];
  source: 'claude' | 'template';
}

/** Phase 11.2 — full memory item info for the "used in this draft" signal. */
export interface MemoryUsedItem {
  id: number;
  kind: string;
  label: string | null;
  content: string;
  source: string | null;
  tags: string[];
  confidence: string | null;
  usage_count: number;
}

export interface DraftApplicationResult {
  draft: ApplicationDraft;
  application_id: number | null;
  provenance_saved: number;
  /** Phase 11.2 — full memory items the AI drew from. */
  memory_used?: MemoryUsedItem[];
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
// 12a. Donor median-NGO preview (Phase 2.1)
// ---------------------------------------------------------------------------

export interface MedianNGOPreview {
  preview_responses: Record<string, string>;
  discrimination_score: Record<string, 'high' | 'medium' | 'low'>;
  common_pitfalls: Array<{
    criterion_key: string;
    issue: string;
    suggestion: string;
  }>;
  tightenings: Array<{
    criterion_key: string;
    current_problem: string;
    rewrite_hint: string;
  }>;
  overall_health: 'strong' | 'mixed' | 'weak';
  rationale: string;
  source: 'claude' | 'template';
}

export function fetchMedianNGOPreview(input: {
  grant_id?: number;
  grant?: {
    title?: string;
    description?: string;
    criteria?: Array<{ key: string; label: string; weight: number; description?: string }>;
    eligibility?: Array<{ key: string; label: string; details?: string }>;
  };
}) {
  return safeCall<{ preview: MedianNGOPreview }>(() =>
    api.post<CopilotResult<{ preview: MedianNGOPreview }>>(
      '/ai/median-ngo-preview',
      input,
    ),
  );
}

// ---------------------------------------------------------------------------
// 12b. Donor grant-brief generator (Phase 2.2)
// ---------------------------------------------------------------------------

export interface GeneratedGrantBrief {
  title: string;
  description: string;
  criteria: Array<{
    key: string;
    label: string;
    weight: number;
    description?: string;
    instructions?: string;
    max_words?: number;
  }>;
  eligibility: Array<{
    key: string;
    label: string;
    details?: string;
    weight?: number;
    required?: boolean;
  }>;
  doc_requirements: Array<{
    key: string;
    label: string;
    required?: boolean;
    specific_requirements?: string;
    icon?: string;
  }>;
  reporting_frequency?: string;
  reporting_requirements?: Array<{ title: string; frequency: string; detail: string }>;
  burden?: { score?: 'low' | 'medium' | 'high'; drivers?: string[]; simplifications?: string[] };
  recommended_deadline_days?: number;
  rationale?: string;
  source: 'claude' | 'template';
}

export function fetchGrantBrief(input: {
  prompt: string;
  thematic?: string;
  geography?: string;
  budget_usd?: number;
}) {
  return safeCall<{ brief: GeneratedGrantBrief }>(() =>
    api.post<CopilotResult<{ brief: GeneratedGrantBrief }>>('/ai/grant-brief', input),
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
// 13b. Match engine (Phase 3.1+3.2+3.3)
// ---------------------------------------------------------------------------

export interface MatchComponents {
  eligibility?: number;
  sector?: number;
  geography?: number;
  capacity?: number;
  track_record?: number;
}

export interface MatchForOrg {
  grant_id: number;
  score: number;
  components: MatchComponents;
  top_strength: string | null;
  top_blocker: string | null;
  computed_at: string | null;
  grant: {
    id: number;
    title: string;
    description: string | null;
    deadline: string | null;
    total_funding: number | null;
    currency: string | null;
    donor_org_id: number;
  };
}

export interface MatchForGrant {
  org_id: number;
  score: number;
  components: MatchComponents;
  top_strength: string | null;
  top_blocker: string | null;
  org: {
    id: number;
    name: string;
    sectors: string[] | null;
    countries: string[] | null;
  };
}

export function fetchMatchesForMe(opts: { limit?: number; recompute?: boolean } = {}) {
  const qs = new URLSearchParams();
  if (opts.limit) qs.set('limit', String(opts.limit));
  if (opts.recompute) qs.set('recompute', '1');
  return safeCall<{ matches: MatchForOrg[]; flag: 'on' | 'off' }>(() =>
    api.get<CopilotResult<{ matches: MatchForOrg[]; flag: 'on' | 'off' }>>(
      `/match/for-me${qs.toString() ? `?${qs.toString()}` : ''}`,
    ),
  );
}

export function fetchMatchesForGrant(grantId: number, limit = 10) {
  return safeCall<{ matches: MatchForGrant[]; flag: 'on' | 'off' }>(() =>
    api.get<CopilotResult<{ matches: MatchForGrant[]; flag: 'on' | 'off' }>>(
      `/match/for-grant/${grantId}?limit=${limit}`,
    ),
  );
}

export function postRecomputeMatches(input: {
  grant_id?: number;
  org_id?: number;
  all?: boolean;
}) {
  return safeCall<{ recomputed: number; scope: string }>(() =>
    api.post<CopilotResult<{ recomputed: number; scope: string }>>(
      '/match/recompute',
      input,
    ),
  );
}

// ---------------------------------------------------------------------------
// 13b. Compliance pre-emption — Phase 8.2
// ---------------------------------------------------------------------------

export interface CompliancePreempt {
  risk_level: 'low' | 'medium' | 'high';
  flags: Array<{
    kind: 'eligibility' | 'documents' | 'finance' | 'narrative' | 'data' | string;
    severity: 'info' | 'warning' | 'critical';
    issue: string;
    fix: string;
    related_field?: string | null;
  }>;
  pre_clear: string[];
  rationale: string;
  source: 'claude' | 'template';
}

export function fetchCompliancePreempt(applicationId: number) {
  return safeCall<{ preempt: CompliancePreempt }>(() =>
    api.post<CopilotResult<{ preempt: CompliancePreempt }>>(
      '/ai/compliance-preempt',
      { application_id: applicationId },
    ),
  );
}

// ---------------------------------------------------------------------------
// 13b. Submission Readiness — Phase 10.1 (NGO pre-submit AI gap analysis)
// ---------------------------------------------------------------------------

export type ReadinessVerdict = 'ready' | 'needs_work' | 'not_ready';
export type GapSeverity = 'blocker' | 'weak' | 'polish';

export interface ReadinessGap {
  criterion_key: string;
  severity: GapSeverity;
  issue: string;
  suggestion: string;
  rewrite?: string;
}

export interface ReadinessMissingEvidence {
  criterion_key: string;
  evidence_type: 'data' | 'document' | 'narrative';
  what: string;
  where_to_find: string;
}

export interface ReadinessOverclaim {
  criterion_key: string;
  claim: string;
  why: string;
  softer: string;
}

export interface ReadinessGenericAnswer {
  criterion_key: string;
  issue: string;
  concrete_alternative: string;
}

export interface SubmissionReadiness {
  readiness_score: number;
  verdict: ReadinessVerdict;
  summary: string;
  gaps: ReadinessGap[];
  missing_evidence: ReadinessMissingEvidence[];
  overclaims: ReadinessOverclaim[];
  generic_answers: ReadinessGenericAnswer[];
  strengths: string[];
  source: 'claude' | 'fallback';
}

export function fetchSubmissionReadiness(applicationId: number) {
  return safeCall<{ readiness: SubmissionReadiness }>(() =>
    api.post<CopilotResult<{ readiness: SubmissionReadiness }>>(
      '/ai/submission-readiness',
      { application_id: applicationId },
    ),
  );
}

// ---------------------------------------------------------------------------
// 13b'. Report Pre-Flight — Phase 10.2 (donor-perspective check)
// ---------------------------------------------------------------------------

export interface ReportDonorConcern {
  section: string;
  concern: string;
  why: string;
  suggestion: string;
}

export interface ReportMissingEvidence {
  section: string;
  evidence_type: 'data' | 'document' | 'narrative';
  what: string;
  where_to_find: string;
  /** Phase 11.4 — which donor concern this fix resolves. */
  addresses?: string;
}

export interface ReportVagueClaim {
  section: string;
  claim: string;
  sharper: string;
  /** Phase 11.4 — which donor concern this fix resolves. */
  addresses?: string;
}

export interface ReportBudgetVarianceUnexplained {
  line: string;
  variance: string;
  suggestion: string;
  /** Phase 11.4 — which donor concern this fix resolves. */
  addresses?: string;
}

export interface ReportReadiness {
  readiness_score: number;
  verdict: ReadinessVerdict;
  summary: string;
  donor_concerns: ReportDonorConcern[];
  missing_evidence: ReportMissingEvidence[];
  vague_claims: ReportVagueClaim[];
  budget_variance_unexplained: ReportBudgetVarianceUnexplained[];
  strengths: string[];
  source: 'claude' | 'fallback';
}

export function fetchReportReadiness(reportId: number) {
  return safeCall<{ readiness: ReportReadiness }>(() =>
    api.post<CopilotResult<{ readiness: ReportReadiness }>>(
      '/ai/report-readiness',
      { report_id: reportId },
    ),
  );
}

// ---------------------------------------------------------------------------
// 13c. Reviewer One-Screen Summary — Phase 10.3
// ---------------------------------------------------------------------------

export type ReviewerJudgment = 'strong' | 'adequate' | 'thin';

export interface ReviewerEvidenceQuote {
  quote: string;
  why: string;
}

export interface ReviewerCriterionEvidence {
  criterion_key: string;
  criterion_label: string;
  evidence_for: ReviewerEvidenceQuote[];
  evidence_against: ReviewerEvidenceQuote[];
  judgment: ReviewerJudgment;
}

export interface ReviewerSummary {
  one_screen_summary: string;
  who_is_the_ngo: string;
  what_they_propose: string;
  why_strong: string[];
  why_weak: string[];
  evidence_per_criterion: ReviewerCriterionEvidence[];
  draft_rationale: string;
  /** Phase 11.3 — per-criterion rationale paste targets. */
  per_criterion_rationale: Record<string, string>;
  /** Phase 11.3 — what would meaningfully shift the score. */
  decision_changers: string[];
  comparable_signal: string;
  red_flags: string[];
  source: 'claude' | 'fallback';
}

export function fetchReviewerSummary(applicationId: number) {
  return safeCall<{ summary: ReviewerSummary }>(() =>
    api.post<CopilotResult<{ summary: ReviewerSummary }>>(
      '/ai/reviewer-summary',
      { application_id: applicationId },
    ),
  );
}

// ---------------------------------------------------------------------------
// 13d. Donor Burden Estimator — Phase 10.4
// ---------------------------------------------------------------------------

export type BurdenVerdict = 'low' | 'moderate' | 'high';

export interface BurdenVagueCriterion {
  key: string;
  label: string;
  issue: string;
  sharper: string;
}

export interface BurdenTooBurdensome {
  key: string;
  label: string;
  ask: string;
  why_burdensome: string;
  alternative: string;
}

export interface BurdenSimplification {
  area: 'criteria' | 'documents' | 'reporting' | 'eligibility';
  current: string;
  proposed: string;
  why: string;
}

export interface BurdenEligibilityConcern {
  kind: 'too_narrow' | 'too_loose' | 'ambiguous';
  detail: string;
  suggestion: string;
}

export interface BurdenEstimate {
  burden_score: number;
  verdict: BurdenVerdict;
  summary: string;
  vague_criteria: BurdenVagueCriterion[];
  too_burdensome: BurdenTooBurdensome[];
  simplifications: BurdenSimplification[];
  predicted_quality_issues: string[];
  eligibility_concerns: BurdenEligibilityConcern[];
  recommended_deadline_extension_days: number;
  source: 'claude' | 'fallback';
}

export function fetchBurdenEstimate(input: {
  grantId?: number;
  draft?: Record<string, unknown>;
}) {
  return safeCall<{ burden: BurdenEstimate }>(() =>
    api.post<CopilotResult<{ burden: BurdenEstimate }>>(
      '/ai/burden-estimate',
      input.grantId ? { grant_id: input.grantId } : { draft: input.draft },
    ),
  );
}

// ---------------------------------------------------------------------------
// 13c. Grant Q&A — Phase 4.3 (NGO ↔ donor inline questions)
// ---------------------------------------------------------------------------

export interface GrantQuestion {
  id: number;
  grant_id: number;
  ngo_org_id?: number;
  asked_by_user_id?: number;
  anchor_kind: string | null;
  anchor_key: string | null;
  question: string;
  answer: string | null;
  answered_by_user_id?: number;
  answered_at: string | null;
  status: 'pending' | 'answered' | 'moderated';
  created_at: string;
  updated_at: string;
}

export function fetchGrantQuestions(grantId: number) {
  return safeCall<{ questions: GrantQuestion[] }>(() =>
    api.get<CopilotResult<{ questions: GrantQuestion[] }>>(
      `/grants/${grantId}/questions`,
    ),
  );
}

export function postGrantQuestion(input: {
  grant_id: number;
  question: string;
  anchor_kind?: 'criterion' | 'eligibility' | 'document';
  anchor_key?: string;
}) {
  const { grant_id, ...body } = input;
  return safeCall<{ question: GrantQuestion }>(() =>
    api.post<CopilotResult<{ question: GrantQuestion }>>(
      `/grants/${grant_id}/questions`,
      body,
    ),
  );
}

export function answerGrantQuestion(grantId: number, qid: number, answer: string) {
  return safeCall<{ question: GrantQuestion }>(() =>
    api.post<CopilotResult<{ question: GrantQuestion }>>(
      `/grants/${grantId}/questions/${qid}/answer`,
      { answer },
    ),
  );
}

export function moderateGrantQuestion(grantId: number, qid: number, reason?: string) {
  return safeCall<{ question: GrantQuestion }>(() =>
    api.post<CopilotResult<{ question: GrantQuestion }>>(
      `/grants/${grantId}/questions/${qid}/moderate`,
      reason ? { reason } : {},
    ),
  );
}

// ---------------------------------------------------------------------------
// 13e. Application activity timeline — Phase 5.3
// ---------------------------------------------------------------------------

export interface ActivityEvent {
  ts: string;
  kind: 'lifecycle' | 'ai_call' | 'provenance' | 'review' | 'document' | string;
  label: string; // i18n key
  detail?: Record<string, unknown>;
}

export function fetchApplicationActivity(applicationId: number) {
  return safeCall<{ events: ActivityEvent[]; application_id: number }>(() =>
    api.get<CopilotResult<{ events: ActivityEvent[]; application_id: number }>>(
      `/applications/${applicationId}/activity`,
    ),
  );
}

// ---------------------------------------------------------------------------
// 13f. Donor portfolio diagnostics — Phase 2.3
// ---------------------------------------------------------------------------

export interface PortfolioDiagnostics {
  aggregate: {
    total_grants: number;
    total_submissions: number;
    total_awarded: number;
    total_rejected: number;
    avg_ai_score_pct: number | null;
  };
  per_grant: Array<{
    grant_id: number;
    title: string;
    submissions: number;
    awarded: number;
    rejected: number;
    avg_ai_score: number | null;
    min_ai_score: number | null;
    max_ai_score: number | null;
    score_spread: number | null;
  }>;
  anomalies: Array<{
    kind: 'low_interest' | 'low_discrimination' | 'criteria_too_easy' | 'high_decline' | string;
    grant_id: number;
    title: string;
    detail_key: string;
    submissions?: number;
    spread?: number;
    avg_score?: number;
    decline_rate_pct?: number;
  }>;
}

export function fetchPortfolioDiagnostics() {
  return safeCall<PortfolioDiagnostics>(() =>
    api.get<CopilotResult<PortfolioDiagnostics>>(
      '/grants/portfolio-diagnostics',
    ),
  );
}

// ---------------------------------------------------------------------------
// 13d. Live drafters — Phase 4.2
// ---------------------------------------------------------------------------

export function fetchGrantDrafters(grantId: number) {
  return safeCall<{ count: number; window_days: number }>(() =>
    api.get<CopilotResult<{ count: number; window_days: number }>>(
      `/grants/${grantId}/drafters`,
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
