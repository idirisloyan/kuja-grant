'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { useReviews, useApplications, useGrants } from '@/lib/hooks/use-api';
import { StatusBadge } from '@/components/shared/status-badge';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';

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
  const [tab, setTab] = useState(0);

  const pending = (data?.pending ?? []) as Review[];
  const completed = (data?.completed ?? []) as Review[];

  if (isLoading) {
    return (
      <Stack spacing={2}>
        <Skeleton variant="rounded" height={40} width={200} />
        <Skeleton variant="rounded" height={260} sx={{ borderRadius: 2 }} />
      </Stack>
    );
  }

  return (
    <Box>
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{ mb: 2, borderBottom: '1px solid', borderColor: 'divider' }}
      >
        <Tab label={`Pending (${pending.length})`} />
        <Tab label={`Completed (${completed.length})`} />
      </Tabs>

      {/* Pending Tab */}
      {tab === 0 && (
        <>
          {pending.length === 0 ? (
            <Card>
              <CardContent sx={{ py: 8, textAlign: 'center' }}>
                <ClipboardCheck size={48} style={{ color: '#CBD5E1', margin: '0 auto 12px' }} />
                <Typography variant="body1" sx={{ fontWeight: 500, color: 'text.secondary' }}>
                  No pending assignments
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.disabled', mt: 0.5 }}>
                  You have no applications to review right now.
                </Typography>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Applicant</TableCell>
                    <TableCell>Grant</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {pending.map((review) => (
                    <TableRow key={review.id} hover>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.primary' }}>
                          {review.ngo_org_name || `Application #${review.application_id}`}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                          {review.grant_title || '--'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={review.status} />
                      </TableCell>
                      <TableCell align="right">
                        <Button
                          variant="contained"
                          size="small"
                          startIcon={<Star size={14} />}
                          onClick={() => router.push(`/reviews/${review.application_id}`)}
                          sx={{ fontSize: '0.75rem', height: 28 }}
                        >
                          Start Review
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </>
      )}

      {/* Completed Tab */}
      {tab === 1 && (
        <>
          {completed.length === 0 ? (
            <Card>
              <CardContent sx={{ py: 8, textAlign: 'center' }}>
                <FileText size={48} style={{ color: '#CBD5E1', margin: '0 auto 12px' }} />
                <Typography variant="body1" sx={{ fontWeight: 500, color: 'text.secondary' }}>
                  No completed reviews
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.disabled', mt: 0.5 }}>
                  Reviews you complete will appear here.
                </Typography>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Applicant</TableCell>
                    <TableCell>Grant</TableCell>
                    <TableCell align="right">Score</TableCell>
                    <TableCell>Completed</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {completed.map((review) => (
                    <TableRow key={review.id} hover>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.primary' }}>
                          {review.ngo_org_name || `Application #${review.application_id}`}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                          {review.grant_title || '--'}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: 600,
                            color:
                              (review.overall_score ?? 0) >= 80 ? 'success.main' :
                              (review.overall_score ?? 0) >= 60 ? 'warning.main' : 'error.main',
                          }}
                        >
                          {review.overall_score ?? '--'}%
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                          {formatDate(review.completed_at)}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </>
      )}
    </Box>
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
      <Stack spacing={2}>
        <Skeleton variant="rounded" height={40} width={200} />
        <Skeleton variant="rounded" height={260} sx={{ borderRadius: 2 }} />
      </Stack>
    );
  }

  return (
    <Stack spacing={2}>
      {/* Grant Filter */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Filter size={16} style={{ color: '#94A3B8' }} />
        <FormControl size="small" sx={{ minWidth: 280 }}>
          <InputLabel>Filter by Grant</InputLabel>
          <Select
            label="Filter by Grant"
            value={grantFilter}
            onChange={(e) => setGrantFilter(e.target.value)}
          >
            <MenuItem value="all">All Grants ({applications.length})</MenuItem>
            {grants.map((g) => (
              <MenuItem key={g.id} value={String(g.id)}>
                {g.title} ({applications.filter((a) => a.grant_id === g.id).length})
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {/* Applications Table */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent sx={{ py: 8, textAlign: 'center' }}>
            <FileText size={48} style={{ color: '#CBD5E1', margin: '0 auto 12px' }} />
            <Typography variant="body1" sx={{ fontWeight: 500, color: 'text.secondary' }}>
              No applications found
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.disabled', mt: 0.5 }}>
              Applications for your grants will appear here.
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Applicant</TableCell>
                <TableCell>Grant</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">AI Score</TableCell>
                <TableCell align="right">Human Score</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map((app) => (
                <TableRow key={app.id} hover>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.primary' }}>
                      {app.ngo_org_name || app.org_name || `Org #${app.ngo_org_id}`}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                      {app.grant_title || `Grant #${app.grant_id}`}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={app.status} />
                  </TableCell>
                  <TableCell align="right">
                    {app.ai_score != null ? (
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 600,
                          color:
                            app.ai_score >= 80 ? 'success.main' :
                            app.ai_score >= 60 ? 'warning.main' : 'error.main',
                        }}
                      >
                        {app.ai_score}%
                      </Typography>
                    ) : (
                      <Typography variant="body2" sx={{ color: 'text.disabled' }}>--</Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    {app.human_score != null ? (
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 600,
                          color:
                            app.human_score >= 80 ? 'success.main' :
                            app.human_score >= 60 ? 'warning.main' : 'error.main',
                        }}
                      >
                        {app.human_score}%
                      </Typography>
                    ) : (
                      <Typography variant="body2" sx={{ color: 'text.disabled' }}>--</Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
                      <Button
                        variant="outlined"
                        size="small"
                        startIcon={<Star size={14} />}
                        onClick={() => router.push(`/reviews/${app.id}`)}
                        sx={{ fontSize: '0.75rem', height: 28 }}
                      >
                        Score
                      </Button>
                      <Button
                        size="small"
                        startIcon={<Eye size={14} />}
                        onClick={() => router.push(`/applications/${app.id}`)}
                        sx={{ fontSize: '0.75rem', height: 28, color: 'text.secondary' }}
                      >
                        View
                      </Button>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </Stack>
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
    <Stack spacing={3}>
      {/* Header */}
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary' }}>
          {isReviewer ? 'My Review Assignments' : 'Review Applications'}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
          {isReviewer
            ? 'Review and score assigned applications'
            : 'View and score applications for your grants'}
        </Typography>
      </Box>

      {/* Role-specific views */}
      {isReviewer && <ReviewerView />}
      {isDonor && <DonorView />}
      {!isReviewer && !isDonor && (
        <Card>
          <CardContent sx={{ py: 8, textAlign: 'center' }}>
            <ClipboardCheck size={48} style={{ color: '#CBD5E1', margin: '0 auto 12px' }} />
            <Typography variant="body1" sx={{ fontWeight: 500, color: 'text.secondary' }}>
              Access Restricted
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.disabled', mt: 0.5 }}>
              This page is available for Donor and Reviewer roles.
            </Typography>
          </CardContent>
        </Card>
      )}
    </Stack>
  );
}
