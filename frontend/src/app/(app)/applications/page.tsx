'use client';

import { useRouter } from 'next/navigation';
import { useApplications } from '@/lib/hooks/use-api';
import { StatusBadge } from '@/components/shared/status-badge';
import { ScoreRing } from '@/components/shared/score-ring';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { FileText, Eye, ArrowRight, Inbox } from 'lucide-react';

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ApplicationsPage() {
  const router = useRouter();
  const { data, isLoading } = useApplications();
  const applications = data?.applications ?? [];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-8 w-full" />
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Applications</h1>
          <p className="text-sm text-slate-500 mt-1">
            {applications.length} application{applications.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button
          className="gap-2 bg-brand-600 hover:bg-brand-700"
          onClick={() => router.push('/grants')}
        >
          <FileText className="w-4 h-4" /> Browse Grants
        </Button>
      </div>

      {/* Applications Table */}
      {applications.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Inbox className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No applications yet</p>
            <p className="text-sm text-slate-400 mt-1">Browse available grants to get started</p>
            <Button
              variant="outline"
              className="mt-4 gap-2"
              onClick={() => router.push('/grants')}
            >
              Browse Grants <ArrowRight className="w-4 h-4" />
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Grant</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">AI Score</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {applications.map((app) => (
                  <TableRow key={app.id} className="cursor-pointer" onClick={() => router.push(`/applications/${app.id}`)}>
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium text-slate-900">
                          {app.grant_title || `Grant #${app.grant_id}`}
                        </p>
                        {app.org_name && (
                          <p className="text-xs text-slate-500 mt-0.5">{app.org_name}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={app.status} />
                    </TableCell>
                    <TableCell className="text-center">
                      {app.ai_score !== null && app.ai_score !== undefined ? (
                        <div className="flex justify-center">
                          <ScoreRing score={Math.round(app.ai_score)} size={40} strokeWidth={3} />
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-slate-600">{formatDate(app.submitted_at)}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1 text-brand-600"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/applications/${app.id}`);
                        }}
                      >
                        <Eye className="w-4 h-4" /> View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
