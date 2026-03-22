'use client';

import { useRouter } from 'next/navigation';
import { useReviews } from '@/lib/hooks/use-api';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Skeleton from '@mui/material/Skeleton';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';

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
      <Stack spacing={3}>
        <Skeleton variant="text" width={260} height={36} />
        <Skeleton variant="rounded" height={384} sx={{ borderRadius: 2 }} />
      </Stack>
    );
  }

  return (
    <Stack spacing={3}>
      {/* Header */}
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary' }}>
          Completed Reviews
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
          {completed.length} review{completed.length !== 1 ? 's' : ''} completed
        </Typography>
      </Box>

      {/* Table */}
      {completed.length === 0 ? (
        <Card>
          <CardContent sx={{ py: 8, textAlign: 'center' }}>
            <CheckCircle size={48} style={{ color: '#CBD5E1', margin: '0 auto 12px' }} />
            <Typography variant="body1" sx={{ fontWeight: 500, color: 'text.secondary' }}>
              No completed reviews yet
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.disabled', mt: 0.5 }}>
              Reviews you complete will be listed here for reference.
            </Typography>
            <Button
              variant="outlined"
              onClick={() => router.push('/reviews')}
              sx={{ mt: 2 }}
            >
              View Pending Assignments
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Application</TableCell>
                <TableCell>Grant</TableCell>
                <TableCell align="right">Score</TableCell>
                <TableCell>Completed</TableCell>
                <TableCell align="right">Actions</TableCell>
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
                      {review.overall_score != null ? `${review.overall_score}%` : '--'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                      {formatDate(review.completed_at)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Button
                      size="small"
                      startIcon={<Eye size={14} />}
                      onClick={() => router.push(`/reviews/${review.application_id}`)}
                      sx={{ fontSize: '0.75rem', height: 28, color: 'text.secondary' }}
                    >
                      View
                    </Button>
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
