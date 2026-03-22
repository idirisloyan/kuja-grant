'use client';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { useGrant } from '@/lib/hooks/use-api';
import { StatusBadge } from '@/components/shared/status-badge';

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
import Avatar from '@mui/material/Avatar';

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

const TAB_ITEMS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'eligibility', label: 'Eligibility' },
  { id: 'criteria', label: 'Criteria' },
  { id: 'documents', label: 'Documents' },
  { id: 'applications', label: 'Applications' },
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
      <Stack spacing={3}>
        <Skeleton variant="text" width={200} height={32} />
        <Skeleton variant="text" width={400} height={24} />
        <Skeleton variant="rounded" height={48} sx={{ borderRadius: 2 }} />
        <Skeleton variant="rounded" height={260} sx={{ borderRadius: 2 }} />
      </Stack>
    );
  }

  if (!grant) {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <AlertCircle size={48} color="#CBD5E1" style={{ margin: '0 auto 12px' }} />
        <Typography variant="body1" sx={{ fontWeight: 500, color: 'text.secondary' }}>Grant not found</Typography>
        <Button
          variant="outlined"
          size="small"
          startIcon={<ArrowLeft size={16} />}
          onClick={() => router.push('/grants')}
          sx={{ mt: 2 }}
        >
          Back to Grants
        </Button>
      </Box>
    );
  }

  // Determine which tabs to show based on role
  const visibleTabs = TAB_ITEMS.filter((t) => {
    if (t.id === 'applications') return isDonor;
    return true;
  });

  return (
    <Stack spacing={3}>
      {/* Back button */}
      <Button
        size="small"
        startIcon={<ArrowLeft size={16} />}
        onClick={() => router.push('/grants')}
        sx={{ alignSelf: 'flex-start', color: 'text.secondary' }}
      >
        Back to Grants
      </Button>

      {/* Grant Header */}
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', lg: 'row' }, alignItems: { lg: 'flex-start' }, justifyContent: 'space-between', gap: 2 }}>
        <Box sx={{ flex: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
            <Typography variant="h2" sx={{ color: 'text.primary' }}>
              {grant.title}
            </Typography>
            <StatusBadge status={grant.status} />
          </Box>
          {grant.donor_org_name && (
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>{grant.donor_org_name}</Typography>
          )}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2.5, mt: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <DollarSign size={16} color="#059669" />
              <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                {formatFunding(grant.total_funding, grant.currency)}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Calendar size={16} color="#94A3B8" />
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>{formatDate(grant.deadline)}</Typography>
            </Box>
            {grant.countries && grant.countries.length > 0 && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <MapPin size={16} color="#94A3B8" />
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>{grant.countries.join(', ')}</Typography>
              </Box>
            )}
          </Box>
        </Box>
        {isNgo && grant.status === 'open' && !grant.user_application_status && (
          <Button
            variant="contained"
            startIcon={<FileText size={16} />}
            onClick={() => router.push(`/apply/${grant.id}`)}
          >
            Apply Now
          </Button>
        )}
        {isNgo && grant.user_application_status && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>Your application:</Typography>
            <StatusBadge status={grant.user_application_status} />
          </Box>
        )}
      </Box>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onChange={(_, newVal) => setActiveTab(newVal as TabId)}
        sx={{ borderBottom: 1, borderColor: 'divider' }}
      >
        {visibleTabs.map((tab) => (
          <Tab key={tab.id} value={tab.id} label={tab.label} sx={{ textTransform: 'none', fontWeight: 500 }} />
        ))}
      </Tabs>

      {/* Tab Content */}
      {activeTab === 'overview' && <OverviewTab grant={grant} />}
      {activeTab === 'eligibility' && <EligibilityTab requirements={grant.eligibility ?? []} />}
      {activeTab === 'criteria' && <CriteriaTab criteria={grant.criteria ?? []} />}
      {activeTab === 'documents' && <DocumentsTab requirements={grant.doc_requirements ?? []} />}
      {activeTab === 'applications' && <ApplicationsTab grantId={grant.id} />}
    </Stack>
  );
}

function OverviewTab({ grant }: { grant: NonNullable<ReturnType<typeof useGrant>['data']>['grant'] }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' }, gap: 3 }}>
      <Stack spacing={3}>
        <Card>
          <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
            <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', mb: 1.5 }}>
              Description
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
              {grant.description || 'No description provided.'}
            </Typography>
          </CardContent>
        </Card>

        {grant.reporting_requirements && grant.reporting_requirements.length > 0 && (
          <Card>
            <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
              <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', mb: 1.5 }}>
                Reporting Requirements
              </Typography>
              <Stack spacing={1.5}>
                {grant.reporting_requirements.map((r, i) => (
                  <Box key={i} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, p: 1.5, bgcolor: 'action.hover', borderRadius: 2 }}>
                    <FileText size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.primary' }}>{r.title}</Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary', mt: 0.25, display: 'block' }}>
                        {r.type} &middot; {r.frequency} &middot; Due {r.due_days_after_period} days after period
                      </Typography>
                      {r.description && (
                        <Typography variant="caption" sx={{ color: 'text.secondary', mt: 0.5, display: 'block' }}>
                          {r.description}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                ))}
              </Stack>
            </CardContent>
          </Card>
        )}
      </Stack>

      <Stack spacing={2}>
        <Card>
          <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
            <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', mb: 1.5 }}>
              Quick Facts
            </Typography>
            <Stack spacing={1.5}>
              <Box>
                <Typography variant="caption" sx={{ color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Funding
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', mt: 0.25 }}>
                  {formatFunding(grant.total_funding, grant.currency)}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" sx={{ color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Deadline
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.primary', mt: 0.25 }}>
                  {formatDate(grant.deadline)}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" sx={{ color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Status
                </Typography>
                <Box sx={{ mt: 0.5 }}>
                  <StatusBadge status={grant.status} />
                </Box>
              </Box>
              {grant.application_count !== undefined && (
                <Box>
                  <Typography variant="caption" sx={{ color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Applications
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.primary', mt: 0.25 }}>
                    {grant.application_count}
                  </Typography>
                </Box>
              )}
            </Stack>
          </CardContent>
        </Card>

        {grant.sectors && grant.sectors.length > 0 && (
          <Card>
            <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
              <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', mb: 1.5 }}>
                Sectors
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                {grant.sectors.map((s) => (
                  <Chip
                    key={s}
                    label={s}
                    size="small"
                    variant="outlined"
                    color="primary"
                    sx={{ fontSize: '0.6875rem' }}
                  />
                ))}
              </Box>
            </CardContent>
          </Card>
        )}

        {grant.countries && grant.countries.length > 0 && (
          <Card>
            <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
              <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', mb: 1.5 }}>
                Countries
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                {grant.countries.map((c) => (
                  <Chip
                    key={c}
                    label={c}
                    size="small"
                    variant="outlined"
                    sx={{ fontSize: '0.6875rem', borderColor: 'divider' }}
                  />
                ))}
              </Box>
            </CardContent>
          </Card>
        )}
      </Stack>
    </Box>
  );
}

function EligibilityTab({ requirements }: { requirements: EligibilityRequirement[] }) {
  if (requirements.length === 0) {
    return (
      <Card>
        <CardContent sx={{ py: 6, textAlign: 'center' }}>
          <ClipboardList size={40} color="#CBD5E1" style={{ margin: '0 auto 8px' }} />
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>No eligibility requirements specified</Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Stack spacing={1.5}>
      {requirements.map((req, i) => (
        <Card key={req.key || i}>
          <CardContent sx={{ py: 2, px: 2.5, '&:last-child': { pb: 2 } }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
              <Avatar
                sx={{
                  width: 32,
                  height: 32,
                  bgcolor: '#EEF2FF',
                  flexShrink: 0,
                  mt: 0.25,
                }}
              >
                <CheckCircle size={16} color="#4F46E5" />
              </Avatar>
              <Box sx={{ flex: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.primary' }}>{req.label}</Typography>
                  {req.required && (
                    <Chip
                      label="Required"
                      size="small"
                      variant="outlined"
                      color="error"
                      sx={{ height: 20, fontSize: '0.625rem' }}
                    />
                  )}
                  {req.weight && (
                    <Chip
                      label={`Weight: ${req.weight}`}
                      size="small"
                      variant="outlined"
                      sx={{ height: 20, fontSize: '0.625rem', borderColor: 'divider' }}
                    />
                  )}
                </Box>
                {req.details && (
                  <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>{req.details}</Typography>
                )}
              </Box>
            </Box>
          </CardContent>
        </Card>
      ))}
    </Stack>
  );
}

function CriteriaTab({ criteria }: { criteria: Criterion[] }) {
  if (criteria.length === 0) {
    return (
      <Card>
        <CardContent sx={{ py: 6, textAlign: 'center' }}>
          <Target size={40} color="#CBD5E1" style={{ margin: '0 auto 8px' }} />
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>No scoring criteria specified</Typography>
        </CardContent>
      </Card>
    );
  }

  const totalWeight = criteria.reduce((sum, c) => sum + c.weight, 0);

  return (
    <Stack spacing={1.5}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        <Target size={16} color="#94A3B8" />
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>Total weight: {totalWeight}</Typography>
      </Box>
      {criteria.map((c, i) => (
        <Card key={c.key || i}>
          <CardContent sx={{ py: 2, px: 2.5, '&:last-child': { pb: 2 } }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
              <Box sx={{ flex: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.primary' }}>{c.label}</Typography>
                {c.description && (
                  <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>{c.description}</Typography>
                )}
                {c.instructions && (
                  <Typography variant="caption" sx={{ color: 'text.disabled', mt: 1, display: 'block', fontStyle: 'italic' }}>
                    {c.instructions}
                  </Typography>
                )}
                {c.max_words && (
                  <Typography variant="caption" sx={{ color: 'text.disabled', mt: 0.5, display: 'block' }}>
                    Max words: {c.max_words}
                  </Typography>
                )}
              </Box>
              <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                <Typography variant="h6" sx={{ fontWeight: 700, color: 'primary.main' }}>{c.weight}</Typography>
                <Typography variant="caption" sx={{ color: 'text.disabled', textTransform: 'uppercase', fontSize: '0.625rem' }}>
                  weight
                </Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>
      ))}
    </Stack>
  );
}

function DocumentsTab({ requirements }: { requirements: DocRequirement[] }) {
  if (requirements.length === 0) {
    return (
      <Card>
        <CardContent sx={{ py: 6, textAlign: 'center' }}>
          <Upload size={40} color="#CBD5E1" style={{ margin: '0 auto 8px' }} />
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>No document requirements specified</Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Stack spacing={1.5}>
      {requirements.map((doc, i) => (
        <Card key={doc.key || i}>
          <CardContent sx={{ py: 2, px: 2.5, '&:last-child': { pb: 2 } }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
              <Avatar
                variant="rounded"
                sx={{
                  width: 32,
                  height: 32,
                  bgcolor: doc.required ? '#FFF1F2' : 'action.hover',
                  borderRadius: 2,
                  flexShrink: 0,
                }}
              >
                <Upload size={16} color={doc.required ? '#E11D48' : '#94A3B8'} />
              </Avatar>
              <Box sx={{ flex: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.primary' }}>{doc.label}</Typography>
                  {doc.required && (
                    <Chip
                      label="Required"
                      size="small"
                      variant="outlined"
                      color="error"
                      sx={{ height: 20, fontSize: '0.625rem' }}
                    />
                  )}
                  {doc.ai_review && (
                    <Chip
                      label="AI Reviewed"
                      size="small"
                      variant="outlined"
                      sx={{ height: 20, fontSize: '0.625rem', color: '#7C3AED', borderColor: '#DDD6FE', bgcolor: '#F5F3FF' }}
                    />
                  )}
                </Box>
                {doc.specific_requirements && (
                  <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>{doc.specific_requirements}</Typography>
                )}
                {doc.ai_criteria && (
                  <Typography variant="caption" sx={{ color: 'text.disabled', mt: 0.5, display: 'block' }}>
                    AI criteria: {doc.ai_criteria}
                  </Typography>
                )}
              </Box>
            </Box>
          </CardContent>
        </Card>
      ))}
    </Stack>
  );
}

function ApplicationsTab({ grantId }: { grantId: number }) {
  const router = useRouter();
  return (
    <Card>
      <CardContent sx={{ py: 6, textAlign: 'center' }}>
        <Users size={40} color="#CBD5E1" style={{ margin: '0 auto 8px' }} />
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
          View and manage applications for this grant
        </Typography>
        <Button
          variant="outlined"
          startIcon={<Users size={16} />}
          onClick={() => router.push(`/applications?grant_id=${grantId}`)}
        >
          View Applications
        </Button>
      </CardContent>
    </Card>
  );
}
