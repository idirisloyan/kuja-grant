'use client';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useApplication } from '@/lib/hooks/use-api';
import { StatusBadge } from '@/components/shared/status-badge';
import { ScoreRing } from '@/components/shared/score-ring';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowLeft, FileText, Upload, BarChart3, MessageSquare,
  AlertCircle, CheckCircle,
} from 'lucide-react';
import type { Application } from '@/lib/types';

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

type TabId = 'responses' | 'documents' | 'scores' | 'reviews';

const TAB_ITEMS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'responses', label: 'Responses', icon: FileText },
  { id: 'documents', label: 'Documents', icon: Upload },
  { id: 'scores', label: 'Scores', icon: BarChart3 },
  { id: 'reviews', label: 'Reviews', icon: MessageSquare },
];

export default function ApplicationDetailClient() {
  const params = useParams();
  const id = Number(params.id);
  const router = useRouter();
  const { data, isLoading } = useApplication(id || null);
  const [activeTab, setActiveTab] = useState<TabId>('responses');

  const application = data?.application;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-6 w-96" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!application) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-500 font-medium">Application not found</p>
        <Button variant="outline" className="mt-4 gap-2" onClick={() => router.push('/applications')}>
          <ArrowLeft className="w-4 h-4" /> Back to Applications
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Back button */}
      <Button variant="ghost" size="sm" className="gap-1 -ml-2 text-slate-500" onClick={() => router.push('/applications')}>
        <ArrowLeft className="w-4 h-4" /> Back to Applications
      </Button>

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold text-slate-900">
              {application.grant_title || `Application #${application.id}`}
            </h1>
            <StatusBadge status={application.status} />
          </div>
          {application.ngo_org_name && (
            <p className="text-sm text-slate-500">{application.ngo_org_name}</p>
          )}
          <div className="flex flex-wrap gap-4 mt-2 text-sm text-slate-500">
            <span>Submitted: {formatDate(application.submitted_at)}</span>
            {application.final_score !== null && application.final_score !== undefined && (
              <span>Final Score: {application.final_score}%</span>
            )}
          </div>
        </div>
        {application.ai_score !== null && application.ai_score !== undefined && (
          <div className="flex items-center gap-3">
            <ScoreRing score={Math.round(application.ai_score)} size={64} label="AI" />
            {application.human_score !== null && application.human_score !== undefined && (
              <ScoreRing score={Math.round(application.human_score)} size={64} label="Human" />
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <nav className="flex gap-1 -mb-px">
          {TAB_ITEMS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-brand-600 text-brand-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'responses' && <ResponsesTab application={application} />}
      {activeTab === 'documents' && <DocumentsTab applicationId={application.id} />}
      {activeTab === 'scores' && <ScoresTab application={application} />}
      {activeTab === 'reviews' && <ReviewsTab applicationId={application.id} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Responses Tab
// ---------------------------------------------------------------------------

function ResponsesTab({ application }: { application: Application }) {
  const responses = application.responses ?? {};
  const entries = Object.entries(responses);

  if (entries.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">No responses submitted</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {entries.map(([key, value]) => {
        const wordCount = value.trim() ? value.trim().split(/\s+/).length : 0;
        return (
          <Card key={key}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base capitalize">
                  {key.replace(/_/g, ' ')}
                </CardTitle>
                <Badge variant="outline" className="text-xs bg-slate-50 text-slate-500 border-slate-200">
                  {wordCount} words
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{value}</p>
            </CardContent>
          </Card>
        );
      })}

      {/* Eligibility Responses */}
      {application.eligibility_responses && Object.keys(application.eligibility_responses).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Eligibility Responses</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(application.eligibility_responses).map(([key, val]) => {
              const item = val as Record<string, unknown>;
              return (
                <div key={key} className="flex items-center gap-2 text-sm">
                  {item.met ? (
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-slate-300 shrink-0" />
                  )}
                  <span className="text-slate-700 capitalize">{key.replace(/_/g, ' ')}</span>
                  {item.evidence ? (
                    <span className="text-xs text-slate-400 ml-auto truncate max-w-xs">{String(item.evidence)}</span>
                  ) : null}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Documents Tab
// ---------------------------------------------------------------------------

function DocumentsTab({ applicationId }: { applicationId: number }) {
  // Documents would be fetched with a dedicated hook in a full implementation
  // For now, show a placeholder
  return (
    <Card>
      <CardContent className="py-8 text-center">
        <Upload className="w-10 h-10 text-slate-300 mx-auto mb-2" />
        <p className="text-sm text-slate-500">
          Documents uploaded with this application will appear here
        </p>
        <p className="text-xs text-slate-400 mt-1">Application ID: {applicationId}</p>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Scores Tab
// ---------------------------------------------------------------------------

function ScoresTab({ application }: { application: Application }) {
  const hasScores = application.ai_score !== null || application.human_score !== null || application.final_score !== null;

  if (!hasScores) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <BarChart3 className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">No scores available yet</p>
          <p className="text-xs text-slate-400 mt-1">Scores will appear after AI and reviewer evaluation</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Score Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Score Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center gap-8">
            {application.ai_score !== null && application.ai_score !== undefined && (
              <div className="text-center">
                <ScoreRing score={Math.round(application.ai_score)} size={100} label="AI Score" />
              </div>
            )}
            {application.human_score !== null && application.human_score !== undefined && (
              <div className="text-center">
                <ScoreRing score={Math.round(application.human_score)} size={100} label="Human" />
              </div>
            )}
            {application.final_score !== null && application.final_score !== undefined && (
              <div className="text-center">
                <ScoreRing score={Math.round(application.final_score)} size={100} label="Final" />
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reviews Tab
// ---------------------------------------------------------------------------

function ReviewsTab({ applicationId }: { applicationId: number }) {
  // Reviews would be fetched with a dedicated hook
  return (
    <Card>
      <CardContent className="py-8 text-center">
        <MessageSquare className="w-10 h-10 text-slate-300 mx-auto mb-2" />
        <p className="text-sm text-slate-500">
          Reviewer scores and comments will appear here
        </p>
        <p className="text-xs text-slate-400 mt-1">Application ID: {applicationId}</p>
      </CardContent>
    </Card>
  );
}
