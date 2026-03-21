'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { useReviews, useApplications, useGrants } from '@/lib/hooks/use-api';
import { StatusBadge } from '@/components/shared/status-badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  ClipboardCheck, FileText, Star, Eye, Filter,
} from 'lucide-react';
import type { Review, Application } from '@/lib/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '--';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ---------------------------------------------------------------------------
// Reviewer View
// ---------------------------------------------------------------------------

function ReviewerView() {
  const router = useRouter();
  const { data, isLoading } = useReviews();

  const pending = (data?.pending ?? []) as Review[];
  const completed = (data?.completed ?? []) as Review[];

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <Tabs defaultValue="pending">
      <TabsList>
        <TabsTrigger value="pending">
          Pending ({pending.length})
        </TabsTrigger>
        <TabsTrigger value="completed">
          Completed ({completed.length})
        </TabsTrigger>
      </TabsList>

      {/* Pending Tab */}
      <TabsContent value="pending">
        {pending.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <ClipboardCheck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-medium">No pending assignments</p>
              <p className="text-sm text-slate-400 mt-1">You have no applications to review right now.</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Applicant</TableHead>
                  <TableHead>Grant</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.map((review) => (
                  <TableRow key={review.id}>
                    <TableCell className="font-medium text-slate-900">
                      {review.ngo_org_name || `Application #${review.application_id}`}
                    </TableCell>
                    <TableCell className="text-slate-600">
                      {review.grant_title || '--'}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={review.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        className="gap-1 bg-brand-600 hover:bg-brand-700 h-7 text-xs"
                        onClick={() => router.push(`/reviews/${review.application_id}`)}
                      >
                        <Star className="w-3 h-3" /> Start Review
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </TabsContent>

      {/* Completed Tab */}
      <TabsContent value="completed">
        {completed.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-medium">No completed reviews</p>
              <p className="text-sm text-slate-400 mt-1">Reviews you complete will appear here.</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Applicant</TableHead>
                  <TableHead>Grant</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                  <TableHead>Completed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {completed.map((review) => (
                  <TableRow key={review.id}>
                    <TableCell className="font-medium text-slate-900">
                      {review.ngo_org_name || `Application #${review.application_id}`}
                    </TableCell>
                    <TableCell className="text-slate-600">
                      {review.grant_title || '--'}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={`font-semibold ${
                        (review.overall_score ?? 0) >= 80 ? 'text-emerald-600' :
                        (review.overall_score ?? 0) >= 60 ? 'text-amber-600' : 'text-rose-600'
                      }`}>
                        {review.overall_score ?? '--'}%
                      </span>
                    </TableCell>
                    <TableCell className="text-slate-500 text-sm">
                      {formatDate(review.completed_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </TabsContent>
    </Tabs>
  );
}

// ---------------------------------------------------------------------------
// Donor View
// ---------------------------------------------------------------------------

function DonorView() {
  const router = useRouter();
  const { data: appsData, isLoading: appsLoading } = useApplications();
  const { data: grantsData, isLoading: grantsLoading } = useGrants();
  const [grantFilter, setGrantFilter] = useState<string>('all');

  const isLoading = appsLoading || grantsLoading;
  const applications = appsData?.applications ?? [];
  const grants = grantsData?.grants ?? [];

  const filtered = useMemo(() => {
    if (grantFilter === 'all') return applications;
    return applications.filter((a) => String(a.grant_id) === grantFilter);
  }, [applications, grantFilter]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Grant Filter */}
      <div className="flex items-center gap-3">
        <Filter className="w-4 h-4 text-slate-400" />
        <select
          value={grantFilter}
          onChange={(e) => setGrantFilter(e.target.value)}
          className="h-9 px-3 rounded-lg border border-input bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="all">All Grants ({applications.length})</option>
          {grants.map((g) => (
            <option key={g.id} value={String(g.id)}>
              {g.title} ({applications.filter((a) => a.grant_id === g.id).length})
            </option>
          ))}
        </select>
      </div>

      {/* Applications Table */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No applications found</p>
            <p className="text-sm text-slate-400 mt-1">Applications for your grants will appear here.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Applicant</TableHead>
                <TableHead>Grant</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">AI Score</TableHead>
                <TableHead className="text-right">Human Score</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((app) => (
                <TableRow key={app.id}>
                  <TableCell className="font-medium text-slate-900">
                    {app.ngo_org_name || app.org_name || `Org #${app.ngo_org_id}`}
                  </TableCell>
                  <TableCell className="text-slate-600">
                    {app.grant_title || `Grant #${app.grant_id}`}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={app.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    {app.ai_score != null ? (
                      <span className={`font-semibold ${
                        app.ai_score >= 80 ? 'text-emerald-600' :
                        app.ai_score >= 60 ? 'text-amber-600' : 'text-rose-600'
                      }`}>
                        {app.ai_score}%
                      </span>
                    ) : (
                      <span className="text-slate-400">--</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {app.human_score != null ? (
                      <span className={`font-semibold ${
                        app.human_score >= 80 ? 'text-emerald-600' :
                        app.human_score >= 60 ? 'text-amber-600' : 'text-rose-600'
                      }`}>
                        {app.human_score}%
                      </span>
                    ) : (
                      <span className="text-slate-400">--</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1 h-7 text-xs"
                        onClick={() => router.push(`/reviews/${app.id}`)}
                      >
                        <Star className="w-3 h-3" /> Score
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1 h-7 text-xs"
                        onClick={() => router.push(`/applications/${app.id}`)}
                      >
                        <Eye className="w-3 h-3" /> View
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function ReviewsPage() {
  const user = useAuthStore((s) => s.user);

  const isReviewer = user?.role === 'reviewer';
  const isDonor = user?.role === 'donor';

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          {isReviewer ? 'My Review Assignments' : 'Review Applications'}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          {isReviewer
            ? 'Review and score assigned applications'
            : 'View and score applications for your grants'}
        </p>
      </div>

      {/* Role-specific views */}
      {isReviewer && <ReviewerView />}
      {isDonor && <DonorView />}
      {!isReviewer && !isDonor && (
        <Card>
          <CardContent className="py-12 text-center">
            <ClipboardCheck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">Access Restricted</p>
            <p className="text-sm text-slate-400 mt-1">This page is available for Donor and Reviewer roles.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
