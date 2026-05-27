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
