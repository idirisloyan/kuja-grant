'use client';

import { useState, useMemo, useCallback } from 'react';
import { useVerifications, useRegistries } from '@/lib/hooks/use-api';
import { api } from '@/lib/api';
import { StatCard } from '@/components/shared/stat-card';
import { StatusBadge } from '@/components/shared/status-badge';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Skeleton from '@mui/material/Skeleton';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import InputAdornment from '@mui/material/InputAdornment';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';

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
  if (confidence == null) return 'text.disabled';
  if (confidence >= 80) return 'success.main';
  if (confidence >= 60) return 'warning.main';
  return 'error.main';
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
    <Box sx={{ px: 3, py: 2.5, bgcolor: 'action.hover', borderTop: '1px solid', borderColor: 'divider' }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
        {/* AI Analysis */}
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <Cpu size={14} style={{ color: '#4F46E5' }} />
            <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
              AI Analysis
            </Typography>
          </Box>
          {findings && findings.length > 0 ? (
            <Stack spacing={0.5}>
              {findings.map((f, i) => (
                <Typography key={i} variant="body2" sx={{ color: 'text.secondary', display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                  <Box component="span" sx={{ color: 'text.disabled', mt: 0.25 }}>-</Box>
                  {f}
                </Typography>
              ))}
            </Stack>
          ) : (
            <Typography variant="body2" sx={{ color: 'text.disabled' }}>No AI findings available.</Typography>
          )}
        </Box>

        {/* Recommendations */}
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <CheckCircle size={14} style={{ color: '#059669' }} />
            <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
              Recommendations
            </Typography>
          </Box>
          {recommendations && recommendations.length > 0 ? (
            <Stack spacing={0.5}>
              {recommendations.map((r, i) => (
                <Typography key={i} variant="body2" sx={{ color: 'text.secondary', display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                  <Box component="span" sx={{ color: 'text.disabled', mt: 0.25 }}>-</Box>
                  {r}
                </Typography>
              ))}
            </Stack>
          ) : (
            <Typography variant="body2" sx={{ color: 'text.disabled' }}>No recommendations available.</Typography>
          )}
        </Box>
      </Box>

      {/* Registry Check */}
      {registryResult && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', mb: 1 }}>
            Registry Check Result
          </Typography>
          <Box
            sx={{
              fontSize: '0.75rem',
              color: 'text.secondary',
              bgcolor: 'background.paper',
              p: 1.5,
              borderRadius: 1,
              border: '1px solid',
              borderColor: 'divider',
              fontFamily: 'monospace',
              overflow: 'auto',
            }}
          >
            {JSON.stringify(registryResult, null, 2)}
          </Box>
        </Box>
      )}

      {/* Metadata */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mt: 2 }}>
        {verification.registry_url && (
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Registry:{' '}
            <Box
              component="a"
              href={verification.registry_url}
              target="_blank"
              rel="noreferrer"
              sx={{ color: 'primary.main', textDecoration: 'underline' }}
            >
              {verification.registry_url}
            </Box>
          </Typography>
        )}
        {verification.verified_by_name && (
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Verified by: {verification.verified_by_name}
          </Typography>
        )}
        {verification.verified_at && (
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Verified: {formatDate(verification.verified_at)}
          </Typography>
        )}
        {verification.notes && (
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Notes: {verification.notes}
          </Typography>
        )}
      </Box>
    </Box>
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
      <TableRow
        hover
        onClick={onToggle}
        sx={{ cursor: 'pointer' }}
      >
        <TableCell sx={{ width: 40 }}>
          {isExpanded ? (
            <ChevronDown size={16} style={{ color: '#94A3B8' }} />
          ) : (
            <ChevronRight size={16} style={{ color: '#94A3B8' }} />
          )}
        </TableCell>
        <TableCell>
          <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.primary' }}>
            {verification.org_name || `Org #${verification.org_id}`}
          </Typography>
        </TableCell>
        <TableCell>
          <Chip label={verification.country} size="small" variant="outlined" sx={{ fontSize: '0.6875rem' }} />
        </TableCell>
        <TableCell>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'monospace' }}>
            {verification.registration_number || '--'}
          </Typography>
        </TableCell>
        <TableCell>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {verification.registration_authority || '--'}
          </Typography>
        </TableCell>
        <TableCell>
          <StatusBadge status={verification.status} />
        </TableCell>
        <TableCell align="right">
          {verification.ai_confidence != null ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'flex-end' }}>
              <Box sx={{ width: 48, height: 6, borderRadius: 3, bgcolor: 'action.hover', overflow: 'hidden' }}>
                <Box sx={{
                  width: `${Math.min(verification.ai_confidence, 100)}%`,
                  height: '100%',
                  borderRadius: 3,
                  bgcolor: confidenceColor(verification.ai_confidence),
                  transition: 'width 0.3s ease',
                }} />
              </Box>
              <Typography variant="body2" sx={{ fontWeight: 600, color: confidenceColor(verification.ai_confidence), minWidth: 32, textAlign: 'right' }}>
                {verification.ai_confidence}%
              </Typography>
            </Box>
          ) : (
            <Typography variant="body2" sx={{ color: 'text.disabled' }}>--</Typography>
          )}
        </TableCell>
        <TableCell align="right">
          <Button
            variant="outlined"
            size="small"
            disabled={isRunning}
            startIcon={
              isRunning
                ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                : <RefreshCw size={14} />
            }
            onClick={(e) => {
              e.stopPropagation();
              onRun();
            }}
            sx={{ fontSize: '0.75rem', height: 28 }}
          >
            {isRunning ? 'Running...' : 'Verify'}
          </Button>
        </TableCell>
      </TableRow>

      {isExpanded && (
        <TableRow>
          <TableCell colSpan={8} sx={{ p: 0 }}>
            <VerificationDetail verification={verification} />
          </TableCell>
        </TableRow>
      )}
    </>
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

  // Map API response fields to what the page expects
  // API returns: verification_status, org_id; Page expects: status, id
  const verifications = useMemo(() => {
    const orgs = (data?.organizations ?? []) as unknown as Array<Record<string, unknown>>;
    return orgs.map((o) => ({
      ...o,
      id: (o.org_id ?? o.id) as number,
      status: ((o.verification_status ?? o.status) || 'unverified') as string,
      ai_confidence: (o.ai_confidence ?? null) as number | null,
      org_name: (o.org_name ?? '') as string,
      country: (o.country ?? '') as string,
      registration_number: (o.registration_number ?? '') as string,
      registration_authority: (o.registration_authority ?? o.registry_authority ?? '') as string,
    })) as unknown as RegistrationVerification[];
  }, [data]);

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
      const org = verifications.find(v => (v as unknown as Record<string, unknown>).org_id === orgId || v.id === orgId);
      await api.post('/verification/verify', {
        org_id: orgId,
        country: org?.country || '',
      });
      await mutate();
    } catch {
      // Errors are handled by the API layer
    } finally {
      setRunningId(null);
    }
  }, [mutate, verifications]);

  if (isLoading) {
    return (
      <Stack spacing={3}>
        <Skeleton variant="text" width={260} height={36} />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(5, 1fr)' }, gap: 2 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} variant="rounded" height={112} sx={{ borderRadius: 2 }} />
          ))}
        </Box>
        <Skeleton variant="rounded" height={384} sx={{ borderRadius: 2 }} />
      </Stack>
    );
  }

  return (
    <Stack spacing={3}>
      {/* Header */}
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary' }}>
          Registration Verification
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
          Verify organization registrations across {Object.keys(registriesData?.registries ?? {}).length} supported countries
        </Typography>
      </Box>

      {/* Summary Stats */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)', lg: 'repeat(5, 1fr)' }, gap: 2 }}>
        <StatCard icon={ShieldCheck} label="Verified" value={statCounts.verified} color="emerald" />
        <StatCard icon={Cpu} label="AI Reviewed" value={statCounts.ai_reviewed} color="violet" />
        <StatCard icon={Clock} label="Pending" value={statCounts.pending} color="amber" />
        <StatCard icon={AlertTriangle} label="Flagged" value={statCounts.flagged} color="rose" />
        <StatCard icon={XCircle} label="Unverified" value={statCounts.unverified} color="blue" />
      </Box>

      {/* Search */}
      <TextField
        placeholder="Search by org, country, reg number..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        size="small"
        sx={{ maxWidth: 400 }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <Search size={16} style={{ color: '#94A3B8' }} />
            </InputAdornment>
          ),
        }}
      />

      {/* Table */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent sx={{ py: 8, textAlign: 'center' }}>
            <Eye size={48} style={{ color: '#CBD5E1', margin: '0 auto 12px' }} />
            <Typography variant="body1" sx={{ fontWeight: 500, color: 'text.secondary' }}>
              No verifications found
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.disabled', mt: 0.5 }}>
              {searchQuery ? 'Try a different search term.' : 'No organization verifications available.'}
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 40 }} />
                <TableCell>Organization</TableCell>
                <TableCell>Country</TableCell>
                <TableCell>Reg Number</TableCell>
                <TableCell>Authority</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">AI Confidence</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
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
    </Stack>
  );
}
