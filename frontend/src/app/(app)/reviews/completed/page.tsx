'use client';

import { useRouter } from 'next/navigation';
import { useReviews } from '@/lib/hooks/use-api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { FileText, Eye, CheckCircle } from 'lucide-react';
import type { Review } from '@/lib/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '--';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function CompletedReviewsPage() {
  const router = useRouter();
  const { data, isLoading } = useReviews();

  const completed = (data?.completed ?? []) as Review[];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Completed Reviews</h1>
        <p className="text-sm text-slate-500 mt-1">
          {completed.length} review{completed.length !== 1 ? 's' : ''} completed
        </p>
      </div>

      {/* Table */}
      {completed.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No completed reviews yet</p>
            <p className="text-sm text-slate-400 mt-1">
              Reviews you complete will be listed here for reference.
            </p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => router.push('/reviews')}
            >
              View Pending Assignments
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Application</TableHead>
                <TableHead>Grant</TableHead>
                <TableHead className="text-right">Score</TableHead>
                <TableHead>Completed</TableHead>
                <TableHead className="text-right">Actions</TableHead>
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
                    <span
                      className={`text-sm font-semibold ${
                        (review.overall_score ?? 0) >= 80
                          ? 'text-emerald-600'
                          : (review.overall_score ?? 0) >= 60
                            ? 'text-amber-600'
                            : 'text-rose-600'
                      }`}
                    >
                      {review.overall_score != null ? `${review.overall_score}%` : '--'}
                    </span>
                  </TableCell>
                  <TableCell className="text-slate-500 text-sm">
                    {formatDate(review.completed_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1 h-7 text-xs"
                      onClick={() => router.push(`/reviews/${review.application_id}`)}
                    >
                      <Eye className="w-3 h-3" /> View
                    </Button>
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
