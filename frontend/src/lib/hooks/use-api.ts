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

export function useReviews() {
  return useSWR<{ pending?: Review[]; completed?: Review[] }>(
    '/reviews/',
    fetcher,
  );
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
