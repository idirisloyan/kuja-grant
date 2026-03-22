'use client';

import { useRouter } from 'next/navigation';
import { useApplications } from '@/lib/hooks/use-api';
import { StatusBadge } from '@/components/shared/status-badge';
import { ScoreRing } from '@/components/shared/score-ring';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';

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
      <Stack spacing={3}>
        <Skeleton variant="text" width={260} height={40} />
        <Skeleton variant="rounded" height={36} sx={{ borderRadius: 2 }} />
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} variant="rounded" height={56} sx={{ borderRadius: 2 }} />
        ))}
      </Stack>
    );
  }

  return (
    <Stack spacing={3}>
      {/* Header */}
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { sm: 'center' }, justifyContent: 'space-between', gap: 2 }}>
        <Box>
          <Typography variant="h2" sx={{ color: 'text.primary' }}>
            My Applications
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            {applications.length} application{applications.length !== 1 ? 's' : ''}
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<FileText size={16} />}
          onClick={() => router.push('/grants')}
        >
          Browse Grants
        </Button>
      </Box>

      {/* Applications Table */}
      {applications.length === 0 ? (
        <Card>
          <CardContent sx={{ py: 8, textAlign: 'center' }}>
            <Inbox size={48} color="#CBD5E1" style={{ margin: '0 auto 12px' }} />
            <Typography variant="body1" sx={{ fontWeight: 500, color: 'text.secondary' }}>No applications yet</Typography>
            <Typography variant="body2" sx={{ color: 'text.disabled', mt: 0.5 }}>Browse available grants to get started</Typography>
            <Button
              variant="outlined"
              size="small"
              endIcon={<ArrowRight size={16} />}
              onClick={() => router.push('/grants')}
              sx={{ mt: 2 }}
            >
              Browse Grants
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Grant</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="center">AI Score</TableCell>
                  <TableCell>Submitted</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {applications.map((app) => (
                  <TableRow
                    key={app.id}
                    hover
                    sx={{ cursor: 'pointer' }}
                    onClick={() => router.push(`/applications/${app.id}`)}
                  >
                    <TableCell>
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.primary' }}>
                          {app.grant_title || `Grant #${app.grant_id}`}
                        </Typography>
                        {app.org_name && (
                          <Typography variant="caption" sx={{ color: 'text.secondary', mt: 0.25, display: 'block' }}>
                            {app.org_name}
                          </Typography>
                        )}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={app.status} />
                    </TableCell>
                    <TableCell align="center">
                      {app.ai_score !== null && app.ai_score !== undefined ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                          <ScoreRing score={Math.round(app.ai_score)} size={40} strokeWidth={3} />
                        </Box>
                      ) : (
                        <Typography variant="caption" sx={{ color: 'text.disabled' }}>-</Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        {formatDate(app.submitted_at)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        startIcon={<Eye size={16} />}
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/applications/${app.id}`);
                        }}
                        sx={{ color: 'primary.main' }}
                      >
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </Stack>
  );
}
