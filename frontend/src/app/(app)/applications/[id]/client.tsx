'use client';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useApplication } from '@/lib/hooks/use-api';
import { StatusBadge } from '@/components/shared/status-badge';
import { ScoreRing } from '@/components/shared/score-ring';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';

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

const TAB_ITEMS: { id: TabId; label: string }[] = [
  { id: 'responses', label: 'Responses' },
  { id: 'documents', label: 'Documents' },
  { id: 'scores', label: 'Scores' },
  { id: 'reviews', label: 'Reviews' },
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
      <Stack spacing={3}>
        <Skeleton variant="text" width={200} height={32} />
        <Skeleton variant="text" width={400} height={24} />
        <Skeleton variant="rounded" height={48} sx={{ borderRadius: 2 }} />
        <Skeleton variant="rounded" height={260} sx={{ borderRadius: 2 }} />
      </Stack>
    );
  }

  if (!application) {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <AlertCircle size={48} color="#CBD5E1" style={{ margin: '0 auto 12px' }} />
        <Typography variant="body1" sx={{ fontWeight: 500, color: 'text.secondary' }}>Application not found</Typography>
        <Button
          variant="outlined"
          size="small"
          startIcon={<ArrowLeft size={16} />}
          onClick={() => router.push('/applications')}
          sx={{ mt: 2 }}
        >
          Back to Applications
        </Button>
      </Box>
    );
  }

  return (
    <Stack spacing={3}>
      {/* Back button */}
      <Button
        size="small"
        startIcon={<ArrowLeft size={16} />}
        onClick={() => router.push('/applications')}
        sx={{ alignSelf: 'flex-start', color: 'text.secondary' }}
      >
        Back to Applications
      </Button>

      {/* Header */}
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', lg: 'row' }, alignItems: { lg: 'flex-start' }, justifyContent: 'space-between', gap: 2 }}>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
            <Typography variant="h2" sx={{ color: 'text.primary' }}>
              {application.grant_title || `Application #${application.id}`}
            </Typography>
            <StatusBadge status={application.status} />
          </Box>
          {application.ngo_org_name && (
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>{application.ngo_org_name}</Typography>
          )}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mt: 1 }}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Submitted: {formatDate(application.submitted_at)}
            </Typography>
            {application.final_score !== null && application.final_score !== undefined && (
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                Final Score: {application.final_score}%
              </Typography>
            )}
          </Box>
        </Box>
        {application.ai_score !== null && application.ai_score !== undefined && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <ScoreRing score={Math.round(application.ai_score)} size={64} label="AI" />
            {application.human_score !== null && application.human_score !== undefined && (
              <ScoreRing score={Math.round(application.human_score)} size={64} label="Human" />
            )}
          </Box>
        )}
      </Box>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onChange={(_, newVal) => setActiveTab(newVal as TabId)}
        sx={{ borderBottom: 1, borderColor: 'divider' }}
      >
        {TAB_ITEMS.map((tab) => (
          <Tab key={tab.id} value={tab.id} label={tab.label} sx={{ textTransform: 'none', fontWeight: 500 }} />
        ))}
      </Tabs>

      {/* Tab Content */}
      {activeTab === 'responses' && <ResponsesTab application={application} />}
      {activeTab === 'documents' && <DocumentsTab applicationId={application.id} />}
      {activeTab === 'scores' && <ScoresTab application={application} />}
      {activeTab === 'reviews' && <ReviewsTab applicationId={application.id} />}
    </Stack>
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
        <CardContent sx={{ py: 6, textAlign: 'center' }}>
          <FileText size={40} color="#CBD5E1" style={{ margin: '0 auto 8px' }} />
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>No responses submitted</Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Stack spacing={2}>
      {entries.map(([key, value]) => {
        const wordCount = value.trim() ? value.trim().split(/\s+/).length : 0;
        return (
          <Card key={key}>
            <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', textTransform: 'capitalize' }}>
                  {key.replace(/_/g, ' ')}
                </Typography>
                <Chip
                  label={`${wordCount} words`}
                  size="small"
                  variant="outlined"
                  sx={{ fontSize: '0.6875rem', borderColor: 'divider' }}
                />
              </Box>
              <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                {value}
              </Typography>
            </CardContent>
          </Card>
        );
      })}

      {/* Eligibility Responses */}
      {application.eligibility_responses && Object.keys(application.eligibility_responses).length > 0 && (
        <Card>
          <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
            <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', mb: 2 }}>
              Eligibility Responses
            </Typography>
            <Stack spacing={1}>
              {Object.entries(application.eligibility_responses).map(([key, val]) => {
                const item = val as Record<string, unknown>;
                return (
                  <Box key={key} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {item.met ? (
                      <CheckCircle size={16} color="#059669" />
                    ) : (
                      <AlertCircle size={16} color="#CBD5E1" />
                    )}
                    <Typography variant="body2" sx={{ color: 'text.secondary', textTransform: 'capitalize', flex: 1 }}>
                      {key.replace(/_/g, ' ')}
                    </Typography>
                    {item.evidence ? (
                      <Typography variant="caption" noWrap sx={{ color: 'text.disabled', maxWidth: 200, ml: 'auto' }}>
                        {String(item.evidence)}
                      </Typography>
                    ) : null}
                  </Box>
                );
              })}
            </Stack>
          </CardContent>
        </Card>
      )}
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Documents Tab
// ---------------------------------------------------------------------------

function DocumentsTab({ applicationId }: { applicationId: number }) {
  return (
    <Card>
      <CardContent sx={{ py: 6, textAlign: 'center' }}>
        <Upload size={40} color="#CBD5E1" style={{ margin: '0 auto 8px' }} />
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          Documents uploaded with this application will appear here
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.disabled', mt: 0.5, display: 'block' }}>
          Application ID: {applicationId}
        </Typography>
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
        <CardContent sx={{ py: 6, textAlign: 'center' }}>
          <BarChart3 size={40} color="#CBD5E1" style={{ margin: '0 auto 8px' }} />
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>No scores available yet</Typography>
          <Typography variant="caption" sx={{ color: 'text.disabled', mt: 0.5, display: 'block' }}>
            Scores will appear after AI and reviewer evaluation
          </Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Stack spacing={2}>
      <Card>
        <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', mb: 2 }}>
            Score Overview
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            {application.ai_score !== null && application.ai_score !== undefined && (
              <Box sx={{ textAlign: 'center' }}>
                <ScoreRing score={Math.round(application.ai_score)} size={100} label="AI Score" />
              </Box>
            )}
            {application.human_score !== null && application.human_score !== undefined && (
              <Box sx={{ textAlign: 'center' }}>
                <ScoreRing score={Math.round(application.human_score)} size={100} label="Human" />
              </Box>
            )}
            {application.final_score !== null && application.final_score !== undefined && (
              <Box sx={{ textAlign: 'center' }}>
                <ScoreRing score={Math.round(application.final_score)} size={100} label="Final" />
              </Box>
            )}
          </Box>
        </CardContent>
      </Card>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Reviews Tab
// ---------------------------------------------------------------------------

function ReviewsTab({ applicationId }: { applicationId: number }) {
  return (
    <Card>
      <CardContent sx={{ py: 6, textAlign: 'center' }}>
        <MessageSquare size={40} color="#CBD5E1" style={{ margin: '0 auto 8px' }} />
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          Reviewer scores and comments will appear here
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.disabled', mt: 0.5, display: 'block' }}>
          Application ID: {applicationId}
        </Typography>
      </CardContent>
    </Card>
  );
}
