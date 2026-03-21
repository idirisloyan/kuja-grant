'use client';

import { useState, useMemo, useCallback } from 'react';
import { useVerifications, useRegistries } from '@/lib/hooks/use-api';
import { api } from '@/lib/api';
import { StatCard } from '@/components/shared/stat-card';
import { StatusBadge } from '@/components/shared/status-badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  ShieldCheck, AlertTriangle, Clock, Eye, Search, RefreshCw,
  ChevronDown, ChevronRight, Loader2, CheckCircle, XCircle, Cpu,
} from 'lucide-react';
import type { RegistrationVerification } from '@/lib/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '--';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function confidenceColor(confidence: number | null | undefined): string {
  if (confidence == null) return 'text-slate-400';
  if (confidence >= 80) return 'text-emerald-600';
  if (confidence >= 60) return 'text-amber-600';
  return 'text-rose-600';
}

// ---------------------------------------------------------------------------
// Expanded Detail Row
// ---------------------------------------------------------------------------

function VerificationDetail({ verification }: { verification: RegistrationVerification }) {
  const analysis = verification.ai_analysis as Record<string, unknown> | null;
  const findings = analysis?.findings as string[] | undefined;
  const recommendations = analysis?.recommendations as string[] | undefined;
  const registryResult = verification.registry_check_result as Record<string, unknown> | null;

  return (
    <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* AI Analysis */}
        <div>
          <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5 mb-2">
            <Cpu className="w-3.5 h-3.5 text-brand-500" /> AI Analysis
          </h4>
          {findings && findings.length > 0 ? (
            <ul className="space-y-1">
              {findings.map((f, i) => (
                <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                  <span className="text-slate-400 mt-0.5">-</span>
                  {f}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-400">No AI findings available.</p>
          )}
        </div>

        {/* Recommendations */}
        <div>
          <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5 mb-2">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> Recommendations
          </h4>
          {recommendations && recommendations.length > 0 ? (
            <ul className="space-y-1">
              {recommendations.map((r, i) => (
                <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                  <span className="text-slate-400 mt-0.5">-</span>
                  {r}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-400">No recommendations available.</p>
          )}
        </div>
      </div>

      {/* Registry Check */}
      {registryResult && (
        <div>
          <h4 className="text-sm font-semibold text-slate-900 mb-2">Registry Check Result</h4>
          <div className="text-xs text-slate-600 bg-white p-3 rounded-md border border-slate-200 font-mono overflow-x-auto">
            {JSON.stringify(registryResult, null, 2)}
          </div>
        </div>
      )}

      {/* Metadata */}
      <div className="flex flex-wrap gap-4 text-xs text-slate-500">
        {verification.registry_url && (
          <span>Registry: <a href={verification.registry_url} target="_blank" rel="noreferrer" className="text-brand-600 underline">{verification.registry_url}</a></span>
        )}
        {verification.verified_by_name && (
          <span>Verified by: {verification.verified_by_name}</span>
        )}
        {verification.verified_at && (
          <span>Verified: {formatDate(verification.verified_at)}</span>
        )}
        {verification.notes && (
          <span>Notes: {verification.notes}</span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function VerificationPage() {
  const { data, isLoading, mutate } = useVerifications();
  const { data: registriesData } = useRegistries();
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [runningId, setRunningId] = useState<number | null>(null);

  const verifications = data?.verifications ?? [];

  // Summary stats
  const statCounts = useMemo(() => {
    const counts = { verified: 0, ai_reviewed: 0, pending: 0, flagged: 0, unverified: 0 };
    for (const v of verifications) {
      if (v.status in counts) {
        counts[v.status as keyof typeof counts]++;
      }
    }
    return counts;
  }, [verifications]);

  // Filtered list
  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return verifications;
    const q = searchQuery.toLowerCase();
    return verifications.filter(
      (v) =>
        (v.org_name ?? '').toLowerCase().includes(q) ||
        (v.country ?? '').toLowerCase().includes(q) ||
        (v.registration_number ?? '').toLowerCase().includes(q) ||
        (v.registration_authority ?? '').toLowerCase().includes(q),
    );
  }, [verifications, searchQuery]);

  // Run verification
  const runVerification = useCallback(async (orgId: number) => {
    setRunningId(orgId);
    try {
      await api.post(`/verification/${orgId}/check`);
      await mutate();
    } catch {
      // Errors are handled by the API layer
    } finally {
      setRunningId(null);
    }
  }, [mutate]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Registration Verification</h1>
        <p className="text-sm text-slate-500 mt-1">
          Verify organization registrations across {Object.keys(registriesData?.registries ?? {}).length} supported countries
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard icon={ShieldCheck} label="Verified" value={statCounts.verified} color="emerald" />
        <StatCard icon={Cpu} label="AI Reviewed" value={statCounts.ai_reviewed} color="violet" />
        <StatCard icon={Clock} label="Pending" value={statCounts.pending} color="amber" />
        <StatCard icon={AlertTriangle} label="Flagged" value={statCounts.flagged} color="rose" />
        <StatCard icon={XCircle} label="Unverified" value={statCounts.unverified} color="blue" />
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          placeholder="Search by org, country, reg number..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Eye className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No verifications found</p>
            <p className="text-sm text-slate-400 mt-1">
              {searchQuery ? 'Try a different search term.' : 'No organization verifications available.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Organization</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Reg Number</TableHead>
                <TableHead>Authority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">AI Confidence</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((v) => (
                <VerificationRow
                  key={v.id}
                  verification={v}
                  isExpanded={expandedId === v.id}
                  isRunning={runningId === v.org_id}
                  onToggle={() => setExpandedId(expandedId === v.id ? null : v.id)}
                  onRun={() => runVerification(v.org_id)}
                />
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Table Row
// ---------------------------------------------------------------------------

function VerificationRow({
  verification,
  isExpanded,
  isRunning,
  onToggle,
  onRun,
}: {
  verification: RegistrationVerification;
  isExpanded: boolean;
  isRunning: boolean;
  onToggle: () => void;
  onRun: () => void;
}) {
  return (
    <>
      <TableRow className="cursor-pointer" onClick={onToggle}>
        <TableCell>
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-400" />
          )}
        </TableCell>
        <TableCell className="font-medium text-slate-900">
          {verification.org_name || `Org #${verification.org_id}`}
        </TableCell>
        <TableCell>
          <Badge variant="outline" className="text-xs">{verification.country}</Badge>
        </TableCell>
        <TableCell className="text-slate-600 font-mono text-xs">
          {verification.registration_number || '--'}
        </TableCell>
        <TableCell className="text-slate-600 text-xs">
          {verification.registration_authority || '--'}
        </TableCell>
        <TableCell>
          <StatusBadge status={verification.status} />
        </TableCell>
        <TableCell className="text-right">
          <span className={`text-sm font-medium ${confidenceColor(verification.ai_confidence)}`}>
            {verification.ai_confidence != null ? `${verification.ai_confidence}%` : '--'}
          </span>
        </TableCell>
        <TableCell className="text-right">
          <Button
            variant="outline"
            size="sm"
            className="gap-1 h-7 text-xs"
            disabled={isRunning}
            onClick={(e) => {
              e.stopPropagation();
              onRun();
            }}
          >
            {isRunning ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <RefreshCw className="w-3 h-3" />
            )}
            {isRunning ? 'Running...' : 'Verify'}
          </Button>
        </TableCell>
      </TableRow>

      {isExpanded && (
        <TableRow>
          <TableCell colSpan={8} className="p-0">
            <VerificationDetail verification={verification} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
