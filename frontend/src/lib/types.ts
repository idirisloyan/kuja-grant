// ============================================================================
// Kuja Grant Management System - TypeScript Type Definitions
// Mirrors the Flask backend models from server.py
// ============================================================================

// ---------------------------------------------------------------------------
// Enums / Union Types
// ---------------------------------------------------------------------------

export type UserRole = 'ngo' | 'donor' | 'reviewer' | 'admin';

export type GrantStatus = 'draft' | 'open' | 'review' | 'closed' | 'awarded';

export type ApplicationStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'scored'
  | 'awarded'
  | 'rejected';

export type AssessmentFramework = 'kuja' | 'step' | 'un_hact' | 'chs' | 'nupas';

export type ReportStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'accepted'
  | 'revision_requested';

export type ComplianceStatus = 'clear' | 'flagged' | 'pending' | 'error';

export type VerificationStatus =
  | 'unverified'
  | 'pending'
  | 'ai_reviewed'
  | 'verified'
  | 'flagged'
  | 'expired';

// ---------------------------------------------------------------------------
// Core Entities
// ---------------------------------------------------------------------------

export interface User {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  org_id: number | null;
  org_name?: string;
  language: string;
  avatar_url: string | null;
  created_at: string | null;
  is_active: boolean;
}

export interface Organization {
  id: number;
  name: string;
  org_type: 'ngo' | 'donor' | 'ingo' | 'cbo' | 'network';
  country: string | null;
  city: string | null;
  year_established: number | null;
  annual_budget: string | null;
  staff_count: string | null;
  sectors: string[];
  description: string | null;
  mission: string | null;
  registration_status: string;
  registration_number: string | null;
  verified: boolean;
  website: string | null;
  assess_score: number | null;
  assess_date: string | null;
  geographic_areas: string[];
  focus_areas: string[];
  created_at: string | null;
  updated_at: string | null;
}

// ---------------------------------------------------------------------------
// Grant Sub-structures
// ---------------------------------------------------------------------------

export interface EligibilityRequirement {
  key: string;
  label: string;
  details?: string;
  weight?: number;
  required?: boolean;
}

export interface Criterion {
  key: string;
  label: string;
  weight: number;
  description?: string;
  instructions?: string;
  example?: string;
  max_words?: number;
}

export interface DocRequirement {
  key: string;
  label: string;
  required: boolean;
  specific_requirements?: string;
  ai_review?: boolean;
  ai_criteria?: string;
}

export interface ReportingRequirement {
  title: string;
  type: string;
  description: string;
  frequency: string;
  due_days_after_period: number;
}

// ---------------------------------------------------------------------------
// Grant
// ---------------------------------------------------------------------------

export interface Grant {
  id: number;
  donor_org_id: number;
  title: string;
  description: string | null;
  total_funding: number | null;
  currency: string;
  deadline: string | null;
  status: GrantStatus;
  sectors: string[];
  countries: string[];
  created_at: string | null;
  published_at: string | null;
  updated_at: string | null;
  donor_org_name?: string;
  eligibility?: EligibilityRequirement[];
  criteria?: Criterion[];
  doc_requirements?: DocRequirement[];
  reporting_requirements?: ReportingRequirement[];
  grant_document?: string | null;
  report_template?: Record<string, unknown>;
  reporting_frequency?: string | null;
  application_count?: number;
  user_application_status?: string | null;
}

// ---------------------------------------------------------------------------
// Application
// ---------------------------------------------------------------------------

export interface Application {
  id: number;
  grant_id: number;
  ngo_org_id: number;
  status: ApplicationStatus;
  ai_score: number | null;
  human_score: number | null;
  final_score: number | null;
  submitted_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  grant_title?: string;
  ngo_org_name?: string;
  org_name?: string;
  country?: string;
  responses?: Record<string, string>;
  eligibility_responses?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Assessment
// ---------------------------------------------------------------------------

export interface Assessment {
  id: number;
  org_id: number;
  org_name?: string;
  assess_type: 'free' | 'paid';
  framework: AssessmentFramework;
  status: string;
  overall_score: number | null;
  category_scores: Record<string, number>;
  checklist_responses: Record<string, boolean>;
  gaps: string[];
  completed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

export interface Document {
  id: number;
  application_id?: number | null;
  assessment_id?: number | null;
  doc_type: string;
  original_filename: string;
  stored_filename: string;
  file_size: number;
  mime_type: string;
  ai_analysis?: Record<string, unknown> | null;
  score?: number | null;
  uploaded_at: string | null;
}

// ---------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------

export interface Review {
  id: number;
  application_id: number;
  reviewer_user_id: number;
  scores: Record<string, number>;
  comments: Record<string, string>;
  overall_score: number | null;
  status: 'assigned' | 'in_progress' | 'completed';
  completed_at: string | null;
  application?: Application;
  reviewer_name?: string;
  grant_title?: string;
  ngo_org_name?: string;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

export interface Report {
  id: number;
  grant_id: number;
  application_id: number | null;
  submitted_by_org_id: number;
  report_type: string;
  reporting_period: string;
  title: string;
  content: Record<string, string>;
  attachments: string[];
  status: ReportStatus;
  due_date: string | null;
  submitted_at: string | null;
  ai_analysis?: Record<string, unknown> | null;
  grant_title?: string;
  org_name?: string;
  created_at: string | null;
  updated_at: string | null;
}

// ---------------------------------------------------------------------------
// Compliance
// ---------------------------------------------------------------------------

export interface ComplianceCheck {
  id: number;
  org_id: number;
  check_type: string;
  status: ComplianceStatus;
  result: Record<string, unknown>;
  checked_at: string | null;
}

// ---------------------------------------------------------------------------
// Registration Verification
// ---------------------------------------------------------------------------

export interface RegistrationVerification {
  id: number;
  org_id: number;
  org_name?: string;
  org_country?: string;
  status: VerificationStatus;
  registration_number: string | null;
  registration_authority: string | null;
  country: string;
  ai_analysis?: Record<string, unknown> | null;
  ai_confidence?: number | null;
  registry_check_result?: Record<string, unknown> | null;
  registry_url?: string | null;
  verified_by_user_id?: number | null;
  verified_by_name?: string | null;
  verified_at?: string | null;
  notes?: string | null;
  created_at: string | null;
  updated_at: string | null;
}

// ---------------------------------------------------------------------------
// API Response Wrappers
// ---------------------------------------------------------------------------

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pages: number;
}

export interface DashboardStats {
  role: UserRole;
  stats: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// AI-related Response Types
// ---------------------------------------------------------------------------

export interface AIGuidanceResponse {
  guidance: string;
  quality_score: number;
  source: string;
}

export interface AICriterionScore {
  score: number;
  feedback: string;
  sub_scores: {
    completeness: number;
    depth: number;
    relevance: number;
  };
}

export interface AIScoringResponse {
  success: boolean;
  application_id: number;
  scores: {
    overall_score: number;
    criteria_average: number;
    document_average: number;
    criterion_scores: Record<string, AICriterionScore>;
    document_scores: Array<{
      id: number;
      filename: string;
      score: number;
    }>;
  };
  ai_transparency: {
    engine: string;
    disclaimer: string;
  };
}

// ---------------------------------------------------------------------------
// Assessment Framework Metadata
// ---------------------------------------------------------------------------

export interface FrameworkInfo {
  name: string;
  description: string;
  estimated_time: string; // legacy, English. Use estimated_minutes_* for i18n.
  estimated_minutes_min?: number;
  estimated_minutes_max?: number;
  total_items: number;
  categories: string[];
}
