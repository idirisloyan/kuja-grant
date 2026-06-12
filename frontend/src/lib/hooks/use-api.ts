// ============================================================================
// Kuja Grant Management System - SWR Data-Fetching Hooks
// Thin wrappers around SWR that call the api client for each endpoint.
// ============================================================================

import useSWR from 'swr';
import { api } from '../api';
import type {
  Application,
  Assessment,
  Document,
  FrameworkInfo,
  Grant,
  RegistrationVerification,
  Report,
  Review,
  User,
} from '../types';

// ---------------------------------------------------------------------------
// Generic fetcher used by every hook
// ---------------------------------------------------------------------------

function fetcher<T>(url: string): Promise<T> {
  return api.get<T>(url);
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export function useCurrentUser() {
  return useSWR<{ user: User }>('/auth/me', fetcher, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export function useDashboardStats() {
  return useSWR<{ stats: Record<string, unknown>; role: string }>(
    '/dashboard/stats',
    fetcher,
    { refreshInterval: 30_000 },
  );
}

// ---------------------------------------------------------------------------
// Grants
// ---------------------------------------------------------------------------

export function useGrants(params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return useSWR<{
    grants: Grant[];
    total: number;
    page: number;
    pages: number;
  }>(`/grants/${qs}`, fetcher);
}

export function useGrant(id: number | null) {
  return useSWR<{ grant: Grant }>(id ? `/grants/${id}` : null, fetcher);
}

// ---------------------------------------------------------------------------
// Applications
// ---------------------------------------------------------------------------

export function useApplications(params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return useSWR<{
    applications: Application[];
    total: number;
    page: number;
    pages: number;
  }>(`/applications/${qs}`, fetcher);
}

export function useApplication(id: number | null) {
  return useSWR<{ application: Application }>(
    id ? `/applications/${id}` : null,
    fetcher,
  );
}

// ---------------------------------------------------------------------------
// Assessments
// ---------------------------------------------------------------------------

export function useAssessments() {
  return useSWR<{ assessments: Assessment[]; total: number }>(
    '/assessments/',
    fetcher,
  );
}

export function useAssessmentFrameworks() {
  return useSWR<{ frameworks: Record<string, FrameworkInfo> }>(
    '/assessments/frameworks',
    fetcher,
  );
}

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

// API returns { reviews, total, page, pages }. Reviewer queue page needs
// pending/completed buckets — derive them client-side from review.status so
// the page works without a backend round-trip change.
export function useReviews() {
  const swr = useSWR<{ reviews: Review[]; total: number; page: number; pages: number }>(
    '/reviews/',
    fetcher,
  );
  const reviews = swr.data?.reviews ?? [];
  const completed = reviews.filter((r) => r.status === 'completed');
  const pending = reviews.filter((r) => r.status !== 'completed');
  return {
    ...swr,
    data: swr.data ? { ...swr.data, pending, completed } : undefined,
  } as typeof swr & { data?: { reviews: Review[]; pending: Review[]; completed: Review[]; total: number; page: number; pages: number } };
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export function useReports(params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return useSWR<{
    reports: Report[];
    total: number;
    page: number;
    pages: number;
  }>(`/reports/${qs}`, fetcher);
}

export function useUpcomingReports() {
  return useSWR<{
    upcoming_reports?: unknown[];
    overdue_count: number;
    total: number;
  }>('/reports/upcoming', fetcher);
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export function useDocuments() {
  return useSWR<{ documents: Document[]; success: boolean }>(
    '/documents/',
    fetcher,
  );
}

// ---------------------------------------------------------------------------
// Compliance
// ---------------------------------------------------------------------------

export function useComplianceChecks(orgId: number | null) {
  return useSWR(orgId ? `/compliance/${orgId}` : null, fetcher);
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

export function useVerifications() {
  return useSWR<{ organizations: RegistrationVerification[]; success: boolean }>(
    '/verification/all',
    fetcher,
  );
}

export function useRegistries() {
  return useSWR<{ registries: Record<string, unknown>; success: boolean }>(
    '/verification/registries',
    fetcher,
  );
}

// ---------------------------------------------------------------------------
// Network membership (Phase 33)
// ---------------------------------------------------------------------------

export interface EligibilityQuestion {
  key: string;
  label: string;
  required?: boolean;
}

export interface RequiredDocument {
  key: string;
  label: string;
  required?: boolean;
}

export interface MembershipConfig {
  success: boolean;
  network: { id: number; slug: string; name: string; assessment_framework_display: string | null };
  eligibility_questions: EligibilityQuestion[];
  required_documents: RequiredDocument[];
  membership_review_days: number;
}

export interface Membership {
  id: number;
  network_id: number;
  org_id: number;
  status: 'pending' | 'under_review' | 'active' | 'rejected' | 'suspended' | 'expelled';
  status_reason: string | null;
  member_tier: string;
  parent_membership_id: number | null;
  region: string | null;
  country: string | null;
  required_documents_status: Record<string, unknown>;
  eligibility_answers: Record<string, string>;
  capacity_assessment_id: number | null;
  applied_at: string | null;
  reviewed_at: string | null;
  joined_at: string | null;
  suspended_at: string | null;
  assessment_next_refresh_due_at: string | null;
  cooldown_until: string | null;
  is_assessment_fresh: boolean;
  created_at: string | null;
  org_name?: string;
  org?: { id: number; name: string; country: string | null };
}

export function useMembershipConfig() {
  return useSWR<MembershipConfig>('/network/membership/config', fetcher, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });
}

export function useMyMemberships() {
  return useSWR<{ success: boolean; memberships: Membership[] }>(
    '/network/membership/me',
    fetcher,
  );
}

/** Admin/OB: list pending memberships in the current network. */
export function usePendingMemberships(status: string = 'under_review') {
  return useSWR<{ success: boolean; memberships: Membership[] }>(
    `/network/membership/pending?status=${encodeURIComponent(status)}`,
    fetcher,
  );
}

export function useMembership(id: number | null) {
  return useSWR<{ success: boolean; membership: Membership }>(
    id ? `/network/membership/${id}` : null,
    fetcher,
  );
}

// ---------------------------------------------------------------------------
// Funds + Windows + Rubrics (Phase 34)
// ---------------------------------------------------------------------------

export interface Fund {
  id: number;
  network_id: number;
  slug: string;
  name: string;
  short_description: string | null;
  currency: string;
  total_pool_amount: number | null;
  disbursed_to_date: number | null;
  year_launched: number | null;
  oversight_role_key: string | null;
  status: string;
  is_default_for_emergency: boolean;
  created_at: string | null;
  window_count: number;
  windows?: FundWindow[];
}

export interface FundWindow {
  id: number;
  fund_id: number;
  slug: string;
  name: string;
  description: string | null;
  crisis_type: string | null;
  min_grant_amount: number | null;
  max_grant_amount: number | null;
  default_grant_duration_months: number | null;
  application_window_hours: number | null;
  decision_sla_days: number | null;
  expected_completion_minutes: number | null;
  direct_to_community_single_min_pct: number | null;
  direct_to_community_consortium_min_pct: number | null;
  status: string;
  is_public: boolean;
  application_template: unknown[];
  default_rubric?: WindowRubric | null;
}

export interface WindowRubric {
  id: number;
  window_id: number;
  name: string;
  description: string | null;
  is_default: boolean;
  criterion_count: number;
  criteria?: WindowCriterion[];
}

export interface WindowCriterion {
  id: number;
  rubric_id: number;
  area: string;
  name: string;
  description: string | null;
  weight: number;
  threshold_kind: 'hard_gate' | 'soft_score';
  threshold_value: number | null;
  threshold_meaning: string | null;
  ai_evaluator_key: string | null;
  display_order: number;
}

export function useFunds() {
  return useSWR<{ success: boolean; funds: Fund[] }>('/funds', fetcher);
}

export function useFund(id: number | null) {
  return useSWR<{ success: boolean; fund: Fund }>(
    id ? `/funds/${id}` : null,
    fetcher,
  );
}

export function useWindowRubric(windowId: number | null) {
  return useSWR<{ success: boolean; rubric: WindowRubric | null }>(
    windowId ? `/windows/${windowId}/rubric` : null,
    fetcher,
  );
}

// Phase 52 — per-window operational rollup. Leads with state, not config.
// Phase 56 — top_risks is now structured (rule-based synthesis), not strings.
// Phase 60 — optional AI narration via ?narrate=true.
export interface WindowRisk {
  kind: string;
  severity: 'low' | 'medium' | 'high';
  label: string;
  hint: string | null;
  count: number | null;
}

export interface WindowOperational {
  success: boolean;
  window_id: number;
  available_budget: number | null;
  currency: string | null;
  active_declaration_count: number;
  open_grant_count: number;
  due_report_count: number;
  overdue_report_count: number;
  top_risks: WindowRisk[];
  /** Present only when ?narrate=true was passed. True if AI narration succeeded. */
  narration_ok?: boolean;
}

export function useWindowOperational(
  windowId: number | null,
  opts?: { narrate?: boolean },
) {
  const narrate = opts?.narrate ? '?narrate=true' : '';
  return useSWR<WindowOperational>(
    windowId ? `/windows/${windowId}/operational${narrate}` : null,
    fetcher,
  );
}

// ---------------------------------------------------------------------------
// Crisis Monitoring (Phase 35)
// ---------------------------------------------------------------------------

export interface CrisisRow {
  id: number;
  report_id: number;
  country: string;
  region: string | null;
  event_type: string | null;
  event_title: string | null;
  hdi_band: string | null;
  gov_capacity_band: string | null;
  people_impacted_estimate: number | null;
  attention_band: string | null;
  composite_score: number | null;
  narrative: string | null;
  flagged_for_ob: boolean;
}

export interface CrisisReport {
  id: number;
  network_id: number;
  period_start: string;
  period_end: string;
  summary_md: string | null;
  status: string;
  generated_by: string;
  cron_anchor_audit_id: number | null;
  published_at: string | null;
  row_count: number;
  flagged_row_count: number;
  rows?: CrisisRow[];
}

export function useLatestCrisisReport() {
  return useSWR<{ success: boolean; report: CrisisReport | null }>(
    '/crisis/reports/latest/published',
    fetcher,
  );
}

export function useCrisisReports(status?: string) {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  return useSWR<{ success: boolean; reports: CrisisReport[] }>(
    `/crisis/reports${qs}`,
    fetcher,
  );
}

export function useCrisisReport(id: number | null) {
  return useSWR<{ success: boolean; report: CrisisReport & { rows: CrisisRow[] } }>(
    id ? `/crisis/reports/${id}` : null,
    fetcher,
  );
}

// ---------------------------------------------------------------------------
// Emergency Declarations (Phase 36)
// ---------------------------------------------------------------------------

export interface DeclarationSignature {
  id: number;
  declaration_id: number;
  signer_user_id: number;
  signer_name: string | null;
  signer_email: string | null;
  signer_org_name: string | null;
  required_order: number;
  status: 'pending' | 'signed' | 'recused' | 'rejected';
  signature_method: string | null;
  declared_no_coi: boolean | null;
  recusal_reason: string | null;
  rejection_reason: string | null;
  signed_at: string | null;
}

// Phase 45 — Oversight Body roster (used by declaration signer-picker).
export interface ObRosterMember {
  membership_id: number;
  org_id: number;
  org_name: string;
  country: string | null;
  user_id: number;
  user_name: string | null;
  user_email: string | null;
  user_role: string | null;
  ob_role_started_at: string | null;
}

export function useObRoster() {
  return useSWR<{ success: boolean; members: ObRosterMember[]; count: number }>(
    '/network/membership/ob-roster',
    fetcher,
  );
}

export interface DeclarationDocument {
  id: number;
  declaration_id: number;
  document_id: number | null;
  kind: string;
  note: string | null;
  created_at: string | null;
}

export interface EmergencyDeclaration {
  id: number;
  network_id: number;
  fund_id: number;
  window_id: number;
  evidence_row_id: number | null;
  evidence_report_id: number | null;
  title: string;
  crisis_type: string | null;
  region: string | null;
  country: string | null;
  severity: string | null;
  summary_md: string | null;
  proposed_total_amount: number | null;
  shortlisted_org_ids: number[];
  status: 'draft' | 'in_review' | 'signed_active' | 'cancelled' | 'closed';
  status_reason: string | null;
  declared_at: string | null;
  applications_open_at: string | null;
  applications_close_at: string | null;
  decision_at: string | null;
  applicants_notified_at: string | null;
  signed_active_audit_id: number | null;
  created_by_user_id: number | null;
  created_at: string | null;
  signed_count: number;
  rejected_count: number;
  recused_count: number;
  required_signer_count: number;
  signatures?: DeclarationSignature[];
  documents?: DeclarationDocument[];
}

export function useDeclarations(status?: string, opts?: { windowId?: number | null }) {
  // Phase 65 — optional window_id filter.
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (opts?.windowId != null) params.set('window_id', String(opts.windowId));
  const qs = params.toString();
  const url = qs ? `/declarations?${qs}` : '/declarations';
  return useSWR<{ success: boolean; declarations: EmergencyDeclaration[] }>(url, fetcher);
}

export function useDeclaration(id: number | null) {
  return useSWR<{ success: boolean; declaration: EmergencyDeclaration }>(
    id ? `/declarations/${id}` : null,
    fetcher,
  );
}

// ---------------------------------------------------------------------------
// Window report (Phase 37)
// ---------------------------------------------------------------------------

export interface WindowReportSignature {
  id: number;
  signer_user_id: number;
  status: string;
  signature_method: string | null;
  recusal_reason: string | null;
  rejection_reason: string | null;
  signed_at: string | null;
}

export interface WindowReportGrantBrief {
  id: number;
  title: string;
  amount: number | null;
  status: string | null;
  currency: string | null;
}

export interface WindowReportMonitoringVisit {
  id: number;
  visit_mode: string;
  visit_date: string;
  community_feedback_summary: string | null;
  observations_md: string | null;
}

export interface WindowReportDeclaration {
  id: number;
  title: string;
  status: string;
  crisis_type: string | null;
  country: string | null;
  severity: string | null;
  declared_at: string | null;
  applications_open_at: string | null;
  applications_close_at: string | null;
  decision_at: string | null;
  proposed_total_amount: number | null;
  evidence_row_id: number | null;
  signatures: WindowReportSignature[];
  signed_count: number;
  recused_count: number;
  rejected_count: number;
  signed_active_audit_id: number | null;
  grants: WindowReportGrantBrief[];
  monitoring_visits: WindowReportMonitoringVisit[];
}

export interface WindowReport {
  success: boolean;
  window: {
    id: number; fund_id: number; name: string; slug: string; status: string;
    crisis_type: string | null;
    max_grant_amount: number | null; decision_sla_days: number | null;
    application_window_hours: number | null;
    direct_to_community_single_min_pct: number | null;
    direct_to_community_consortium_min_pct: number | null;
  };
  fund: { id: number; name: string; slug: string; currency: string } | null;
  stats: {
    declarations_total: number;
    declarations_active: number;
    declarations_closed: number;
    declarations_cancelled: number;
    grants_total: number;
    ngos_reached: number;
    countries_covered: string[];
    countries_count: number;
    total_disbursed_estimate: number;
  };
  sla: {
    target_app_window_hours: number;
    target_decision_days: number;
    app_window_hits: number;
    app_window_misses: number;
    decision_hits: number;
    decision_misses: number;
  };
  declarations: WindowReportDeclaration[];
  audit_chain: { ok: boolean | null; total: number | null };
  generated_at: string;
}

export function useWindowReport(windowId: number | null) {
  return useSWR<WindowReport>(
    windowId ? `/windows/${windowId}/report` : null,
    fetcher,
  );
}
