// ============================================================================
// Kuja Trust Profile / Adverse Media / Bank Verification / Capacity Passport
// ----------------------------------------------------------------------------
// API client + types for the Phase 1 (truth-in-claims) trust layer.
// ============================================================================

import { api } from './api';

export type PillarStatus = 'clear' | 'review' | 'flagged' | 'incomplete';

export interface DiligenceComponent {
  key: string;
  label: string;
  status: PillarStatus;
  score: number;
  last_updated: string | null;
  detail: string;
  expires_at?: string | null;
}

export interface CapacityFrameworkRow {
  framework: string;
  label: string;
  status: string;
  score: number | null;
  last_updated: string | null;
  weight: number;
}

export interface CapacityPillar {
  score: number;
  status: PillarStatus;
  completion_pct: number;
  frameworks_completed: number;
  frameworks_total: number;
  breakdown: CapacityFrameworkRow[];
  strengths: string[];
  gaps: string[];
}

export interface DiligencePillar {
  score: number;
  status: PillarStatus;
  breakdown: DiligenceComponent[];
}

export interface TrustProfile {
  org_id: number;
  org_name: string;
  country: string | null;
  sector: string | null;
  verified_badge: boolean;
  overall: {
    score: number;
    status: PillarStatus;
    computed_at: string;
  };
  capacity: CapacityPillar;
  diligence: DiligencePillar;
}

export interface AdverseMediaFinding {
  subject: string;
  severity: 'high' | 'medium' | 'low';
  category: string;
  headline: string;
  summary: string;
  url: string;
  source: string;
  published_at: string;
  confidence: number;
}

export interface AdverseMediaScreening {
  id: number;
  org_id: number;
  org_name: string;
  lookback_months: number;
  subjects: string[];
  findings: AdverseMediaFinding[];
  summary: {
    high_count: number;
    medium_count: number;
    low_count: number;
    overall_status: string;
  };
  status: string;
  source: string;
  ai_confidence: number;
  ai_notes: string;
  screened_at: string;
}

export interface BankFinding {
  severity: 'high' | 'medium' | 'low';
  code: string;
  message: string;
  evidence: Record<string, unknown>;
}

export interface BankVerification {
  id: number;
  org_id: number;
  org_name: string;
  bank_name: string | null;
  bank_country: string | null;
  swift_bic: string | null;
  iban: string | null;
  currency: string | null;
  account_number_last4: string | null;
  findings: BankFinding[];
  risk_score: number;
  status: 'verified' | 'review' | 'flagged' | 'pending' | 'error';
  verified_at: string;
}

export interface CapacityPassport {
  id: number;
  org_id: number;
  org_name: string;
  slug: string;
  share_token?: string;
  share_url?: string;
  snapshot: TrustProfile & { passport_meta?: Record<string, unknown> };
  snapshot_hash: string;
  status: 'draft' | 'active' | 'revoked' | 'expired';
  is_active: boolean;
  expires_at: string | null;
  revoked_at: string | null;
  revoked_reason: string | null;
  verification_count: number;
  last_verified_at: string | null;
  published_at: string | null;
}

export const trustApi = {
  getProfile: (orgId: number) =>
    api.get<{ profile: TrustProfile }>(`/api/trust-profile/${orgId}`),

  listAdverseMedia: (orgId: number) =>
    api.get<{ screenings: AdverseMediaScreening[]; latest: AdverseMediaScreening | null }>(
      `/api/adverse-media/${orgId}`,
    ),

  runAdverseMedia: (params: {
    org_id: number;
    leadership?: string[];
    lookback_months?: number;
    sector?: string;
  }) =>
    api.post<{ screening: AdverseMediaScreening }>(
      '/api/adverse-media/screen',
      params,
    ),

  listBankVerifications: (orgId: number) =>
    api.get<{ verifications: BankVerification[]; latest: BankVerification | null }>(
      `/api/bank-verification/${orgId}`,
    ),

  runBankVerification: (params: {
    org_id: number;
    bank_name?: string;
    bank_country?: string;
    swift_bic?: string;
    iban?: string;
    currency?: string;
    account_number?: string;
  }) =>
    api.post<{ verification: BankVerification }>(
      '/api/bank-verification/verify',
      params,
    ),

  listPassports: (orgId: number) =>
    api.get<{ passports: CapacityPassport[] }>(`/api/passport/${orgId}`),

  publishPassport: (params: { org_id: number; expires_at?: string }) =>
    api.post<{ passport: CapacityPassport }>('/api/passport/publish', params),

  revokePassport: (passportId: number, reason?: string) =>
    api.post<{ passport: CapacityPassport }>(
      `/api/passport/${passportId}/revoke`,
      { reason },
    ),
};
