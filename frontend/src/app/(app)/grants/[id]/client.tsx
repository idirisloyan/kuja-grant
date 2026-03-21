'use client';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { useGrant } from '@/lib/hooks/use-api';
import { StatusBadge } from '@/components/shared/status-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DollarSign, Calendar, MapPin, FileText, Target, ClipboardList,
  Upload, Users, ArrowLeft, CheckCircle, AlertCircle,
} from 'lucide-react';
import type { EligibilityRequirement, Criterion, DocRequirement } from '@/lib/types';

function formatFunding(amount: number | null, currency: string): string {
  if (!amount) return 'TBD';
  return `${currency === 'USD' ? '$' : currency + ' '}${amount.toLocaleString()}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'No deadline';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

type TabId = 'overview' | 'eligibility' | 'criteria' | 'documents' | 'applications';

const TAB_ITEMS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: 'Overview', icon: FileText },
  { id: 'eligibility', label: 'Eligibility', icon: ClipboardList },
  { id: 'criteria', label: 'Criteria', icon: Target },
  { id: 'documents', label: 'Documents', icon: Upload },
  { id: 'applications', label: 'Applications', icon: Users },
];

export default function GrantDetailClient() {
  const params = useParams();
  const id = Number(params.id);
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { data, isLoading } = useGrant(id || null);
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  const grant = data?.grant;
  const isNgo = user?.role === 'ngo';
  const isDonor = user?.role === 'donor' || user?.role === 'admin';

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

  if (!grant) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-500 font-medium">Grant not found</p>
        <Button variant="outline" className="mt-4 gap-2" onClick={() => router.push('/grants')}>
          <ArrowLeft className="w-4 h-4" /> Back to Grants
        </Button>
      </div>
    );
  }

  // Determine which tabs to show based on role
  const visibleTabs = TAB_ITEMS.filter((t) => {
    if (t.id === 'applications') return isDonor;
    return true;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Back button */}
      <Button variant="ghost" size="sm" className="gap-1 -ml-2 text-slate-500" onClick={() => router.push('/grants')}>
        <ArrowLeft className="w-4 h-4" /> Back to Grants
      </Button>

      {/* Grant Header */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold text-slate-900">{grant.title}</h1>
            <StatusBadge status={grant.status} />
          </div>
          {grant.donor_org_name && (
            <p className="text-sm text-slate-500">{grant.donor_org_name}</p>
          )}
          <div className="flex flex-wrap gap-4 mt-3 text-sm text-slate-600">
            <div className="flex items-center gap-1.5">
              <DollarSign className="w-4 h-4 text-emerald-500" />
              <span className="font-semibold">{formatFunding(grant.total_funding, grant.currency)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-slate-400" />
              <span>{formatDate(grant.deadline)}</span>
            </div>
            {grant.countries && grant.countries.length > 0 && (
              <div className="flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-slate-400" />
                <span>{grant.countries.join(', ')}</span>
              </div>
            )}
          </div>
        </div>
        {isNgo && grant.status === 'open' && !grant.user_application_status && (
          <Button
            className="bg-brand-600 hover:bg-brand-700 gap-2"
            onClick={() => router.push(`/apply/${grant.id}`)}
          >
            <FileText className="w-4 h-4" /> Apply Now
          </Button>
        )}
        {isNgo && grant.user_application_status && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500">Your application:</span>
            <StatusBadge status={grant.user_application_status} />
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <nav className="flex gap-1 -mb-px">
          {visibleTabs.map((tab) => {
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
      {activeTab === 'overview' && <OverviewTab grant={grant} />}
      {activeTab === 'eligibility' && <EligibilityTab requirements={grant.eligibility ?? []} />}
      {activeTab === 'criteria' && <CriteriaTab criteria={grant.criteria ?? []} />}
      {activeTab === 'documents' && <DocumentsTab requirements={grant.doc_requirements ?? []} />}
      {activeTab === 'applications' && <ApplicationsTab grantId={grant.id} />}
    </div>
  );
}

function OverviewTab({ grant }: { grant: NonNullable<ReturnType<typeof useGrant>['data']>['grant'] }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Description</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
              {grant.description || 'No description provided.'}
            </p>
          </CardContent>
        </Card>

        {grant.reporting_requirements && grant.reporting_requirements.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Reporting Requirements</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {grant.reporting_requirements.map((r, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                    <FileText className="w-4 h-4 text-brand-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-slate-900">{r.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {r.type} &middot; {r.frequency} &middot; Due {r.due_days_after_period} days after period
                      </p>
                      {r.description && (
                        <p className="text-xs text-slate-600 mt-1">{r.description}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick Facts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide">Funding</p>
              <p className="text-sm font-semibold text-slate-900 mt-0.5">
                {formatFunding(grant.total_funding, grant.currency)}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide">Deadline</p>
              <p className="text-sm font-medium text-slate-900 mt-0.5">{formatDate(grant.deadline)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide">Status</p>
              <div className="mt-1">
                <StatusBadge status={grant.status} />
              </div>
            </div>
            {grant.application_count !== undefined && (
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Applications</p>
                <p className="text-sm font-medium text-slate-900 mt-0.5">{grant.application_count}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {grant.sectors && grant.sectors.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sectors</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1.5">
                {grant.sectors.map((s) => (
                  <Badge key={s} variant="outline" className="bg-brand-50 text-brand-700 border-brand-200">
                    {s}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {grant.countries && grant.countries.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Countries</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1.5">
                {grant.countries.map((c) => (
                  <Badge key={c} variant="outline" className="bg-slate-50 text-slate-700 border-slate-200">
                    {c}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function EligibilityTab({ requirements }: { requirements: EligibilityRequirement[] }) {
  if (requirements.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <ClipboardList className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">No eligibility requirements specified</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {requirements.map((req, i) => (
        <Card key={req.key || i}>
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-brand-50 flex items-center justify-center shrink-0 mt-0.5">
                <CheckCircle className="w-4 h-4 text-brand-600" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-slate-900">{req.label}</p>
                  {req.required && (
                    <Badge variant="outline" className="text-[10px] bg-rose-50 text-rose-600 border-rose-200">
                      Required
                    </Badge>
                  )}
                  {req.weight && (
                    <Badge variant="outline" className="text-[10px] bg-slate-50 text-slate-500 border-slate-200">
                      Weight: {req.weight}
                    </Badge>
                  )}
                </div>
                {req.details && (
                  <p className="text-sm text-slate-600 mt-1">{req.details}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function CriteriaTab({ criteria }: { criteria: Criterion[] }) {
  if (criteria.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Target className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">No scoring criteria specified</p>
        </CardContent>
      </Card>
    );
  }

  const totalWeight = criteria.reduce((sum, c) => sum + c.weight, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
        <Target className="w-4 h-4" />
        <span>Total weight: {totalWeight}</span>
      </div>
      {criteria.map((c, i) => (
        <Card key={c.key || i}>
          <CardContent className="py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-900">{c.label}</p>
                {c.description && (
                  <p className="text-sm text-slate-600 mt-1">{c.description}</p>
                )}
                {c.instructions && (
                  <p className="text-xs text-slate-500 mt-2 italic">{c.instructions}</p>
                )}
                {c.max_words && (
                  <p className="text-xs text-slate-400 mt-1">Max words: {c.max_words}</p>
                )}
              </div>
              <div className="text-right shrink-0">
                <div className="text-lg font-bold text-brand-600">{c.weight}</div>
                <p className="text-[10px] text-slate-400 uppercase">weight</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function DocumentsTab({ requirements }: { requirements: DocRequirement[] }) {
  if (requirements.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Upload className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">No document requirements specified</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {requirements.map((doc, i) => (
        <Card key={doc.key || i}>
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                doc.required ? 'bg-rose-50' : 'bg-slate-50'
              }`}>
                <Upload className={`w-4 h-4 ${doc.required ? 'text-rose-500' : 'text-slate-400'}`} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-slate-900">{doc.label}</p>
                  {doc.required && (
                    <Badge variant="outline" className="text-[10px] bg-rose-50 text-rose-600 border-rose-200">
                      Required
                    </Badge>
                  )}
                  {doc.ai_review && (
                    <Badge variant="outline" className="text-[10px] bg-violet-50 text-violet-600 border-violet-200">
                      AI Reviewed
                    </Badge>
                  )}
                </div>
                {doc.specific_requirements && (
                  <p className="text-sm text-slate-600 mt-1">{doc.specific_requirements}</p>
                )}
                {doc.ai_criteria && (
                  <p className="text-xs text-slate-500 mt-1">AI criteria: {doc.ai_criteria}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ApplicationsTab({ grantId }: { grantId: number }) {
  const router = useRouter();
  // For donors/admins: we could fetch applications for this grant
  // For now, show a message directing to the applications list
  return (
    <Card>
      <CardContent className="py-8 text-center">
        <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
        <p className="text-sm text-slate-500 mb-3">
          View and manage applications for this grant
        </p>
        <Button
          variant="outline"
          className="gap-2"
          onClick={() => router.push(`/applications?grant_id=${grantId}`)}
        >
          <Users className="w-4 h-4" /> View Applications
        </Button>
      </CardContent>
    </Card>
  );
}
