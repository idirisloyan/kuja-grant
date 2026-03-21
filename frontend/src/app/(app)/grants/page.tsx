'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { useGrants } from '@/lib/hooks/use-api';
import { StatusBadge } from '@/components/shared/status-badge';
import type { Grant } from '@/lib/types';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardActions from '@mui/material/CardActions';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Chip from '@mui/material/Chip';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import InputAdornment from '@mui/material/InputAdornment';
import Divider from '@mui/material/Divider';

import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import AddIcon from '@mui/icons-material/Add';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatFunding(amount: number | null, currency: string): string {
  if (!amount) return 'TBD';
  const symbol = currency === 'USD' ? '$' : currency + ' ';
  if (amount >= 1_000_000) return `${symbol}${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `${symbol}${(amount / 1_000).toFixed(0)}K`;
  return `${symbol}${amount.toLocaleString()}`;
}

function getDaysLeft(dateStr: string | null): { label: string; color: string } {
  if (!dateStr) return { label: 'No deadline', color: 'text.secondary' };
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return { label: 'Expired', color: 'error.main' };
  if (diffDays === 0) return { label: 'Due today', color: 'error.main' };
  if (diffDays <= 7) return { label: `${diffDays}d left`, color: 'error.main' };
  if (diffDays <= 30) return { label: `${diffDays}d left`, color: 'warning.main' };
  return { label: `${diffDays}d left`, color: 'text.secondary' };
}

// ---------------------------------------------------------------------------
// Filter sectors
// ---------------------------------------------------------------------------

const SECTOR_OPTIONS = [
  'Health', 'Education', 'WASH', 'Food Security', 'Livelihoods',
  'Protection', 'Shelter', 'Gender Equality', 'Climate', 'Governance', 'Nutrition',
];

type SortOption = 'deadline' | 'funding' | 'recent';

// ---------------------------------------------------------------------------
// Status chip for grant cards
// ---------------------------------------------------------------------------

function GrantStatusChip({ status }: { status: string }) {
  const colorMap: Record<string, 'success' | 'default' | 'warning' | 'info' | 'primary'> = {
    open: 'success',
    draft: 'default',
    review: 'warning',
    closed: 'default',
    awarded: 'primary',
  };

  const labels: Record<string, string> = {
    open: 'Open',
    draft: 'Draft',
    review: 'Review',
    closed: 'Closed',
    awarded: 'Awarded',
  };

  return (
    <Chip
      label={labels[status] ?? status}
      color={colorMap[status] ?? 'default'}
      size="small"
      variant="outlined"
    />
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function GrantsPage() {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSectors, setActiveSectors] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<SortOption>('deadline');
  const { data, isLoading } = useGrants();

  const grants = useMemo(() => data?.grants ?? [], [data]);

  const filteredGrants = useMemo(() => {
    let result = grants;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (g) =>
          g.title.toLowerCase().includes(q) ||
          (g.donor_org_name ?? '').toLowerCase().includes(q) ||
          (g.description ?? '').toLowerCase().includes(q),
      );
    }

    if (activeSectors.size > 0) {
      result = result.filter((g) =>
        g.sectors?.some((s) => activeSectors.has(s)),
      );
    }

    result = [...result].sort((a, b) => {
      if (sortBy === 'deadline') {
        if (!a.deadline) return 1;
        if (!b.deadline) return -1;
        return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      }
      if (sortBy === 'funding') {
        return (b.total_funding ?? 0) - (a.total_funding ?? 0);
      }
      return new Date(b.created_at ?? '').getTime() - new Date(a.created_at ?? '').getTime();
    });

    return result;
  }, [grants, searchQuery, activeSectors, sortBy]);

  const toggleSector = (sector: string) => {
    setActiveSectors((prev) => {
      const next = new Set(prev);
      if (next.has(sector)) next.delete(sector);
      else next.add(sector);
      return next;
    });
  };

  const isNgo = user?.role === 'ngo';

  if (isLoading) {
    return (
      <Stack spacing={3} sx={{ maxWidth: 960 }}>
        <Skeleton variant="text" width={200} height={36} />
        <Skeleton variant="rounded" width={400} height={44} sx={{ borderRadius: 2 }} />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} variant="rounded" height={200} sx={{ borderRadius: 2 }} />
          ))}
        </Box>
      </Stack>
    );
  }

  const sortLabels: Record<SortOption, string> = {
    deadline: 'Deadline',
    funding: 'Funding',
    recent: 'Recent',
  };

  return (
    <Stack spacing={3} sx={{ maxWidth: 960 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h2" sx={{ color: 'text.primary' }}>
            {isNgo ? 'Browse Grants' : 'My Grants'}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            {filteredGrants.length} grant{filteredGrants.length !== 1 ? 's' : ''} found
          </Typography>
        </Box>
        {!isNgo && (
          <Button
            variant="contained"
            size="small"
            startIcon={<AddIcon />}
            onClick={() => router.push('/grants/new')}
          >
            Create Grant
          </Button>
        )}
      </Box>

      {/* Search */}
      <TextField
        placeholder="Search by title, donor, or keyword..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        size="small"
        sx={{ maxWidth: 480 }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
            </InputAdornment>
          ),
          endAdornment: searchQuery ? (
            <InputAdornment position="end">
              <Button
                size="small"
                onClick={() => setSearchQuery('')}
                sx={{ minWidth: 'auto', p: 0.5, fontSize: '0.75rem', color: 'text.secondary' }}
              >
                <ClearIcon sx={{ fontSize: 16 }} />
              </Button>
            </InputAdornment>
          ) : null,
        }}
      />

      {/* Filters + Sort */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.75 }}>
        {SECTOR_OPTIONS.map((sector) => {
          const isActive = activeSectors.has(sector);
          return (
            <Chip
              key={sector}
              label={sector}
              onClick={() => toggleSector(sector)}
              variant={isActive ? 'filled' : 'outlined'}
              color={isActive ? 'primary' : 'default'}
              size="small"
              sx={{
                fontWeight: isActive ? 600 : 400,
                borderColor: isActive ? 'primary.main' : 'divider',
              }}
            />
          );
        })}
        {activeSectors.size > 0 && (
          <Chip
            label="Clear filters"
            onClick={() => setActiveSectors(new Set())}
            size="small"
            color="error"
            variant="outlined"
            sx={{ fontWeight: 500 }}
          />
        )}

        <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />

        {(['deadline', 'funding', 'recent'] as SortOption[]).map((opt) => (
          <Chip
            key={opt}
            label={sortLabels[opt]}
            onClick={() => setSortBy(opt)}
            size="small"
            variant={sortBy === opt ? 'filled' : 'outlined'}
            color={sortBy === opt ? 'default' : 'default'}
            sx={{
              fontWeight: sortBy === opt ? 600 : 400,
              bgcolor: sortBy === opt ? 'action.selected' : 'transparent',
              borderColor: 'divider',
            }}
          />
        ))}
      </Box>

      {/* Grant Cards */}
      {filteredGrants.length === 0 ? (
        <Box sx={{ py: 10, textAlign: 'center' }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            No grants found
          </Typography>
          {(searchQuery || activeSectors.size > 0) && (
            <Typography variant="caption" sx={{ color: 'text.secondary', mt: 0.5 }}>
              Try adjusting your search or clearing filters.
            </Typography>
          )}
        </Box>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
          {filteredGrants.map((grant) => (
            <GrantCard
              key={grant.id}
              grant={grant}
              isNgo={isNgo}
              onView={() => router.push(`/grants/${grant.id}`)}
              onApply={() => router.push(`/apply/${grant.id}`)}
            />
          ))}
        </Box>
      )}
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Grant Card
// ---------------------------------------------------------------------------

function GrantCard({
  grant,
  isNgo,
  onView,
  onApply,
}: {
  grant: Grant;
  isNgo: boolean;
  onView: () => void;
  onApply: () => void;
}) {
  const deadline = getDaysLeft(grant.deadline);

  return (
    <Card
      onClick={onView}
      sx={{
        cursor: 'pointer',
        '&:hover': {
          borderColor: '#CBD5E1',
          boxShadow: '0 4px 12px -2px rgba(0,0,0,0.08)',
        },
        transition: 'all 0.2s',
      }}
    >
      <CardContent sx={{ p: 2.5, '&:last-child': { pb: 0 } }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5, mb: 1.5 }}>
          <GrantStatusChip status={grant.status} />
          <Typography variant="caption" sx={{ color: deadline.color, fontWeight: 500 }}>
            {deadline.label}
          </Typography>
        </Box>

        <Typography
          variant="body1"
          sx={{
            fontWeight: 600,
            color: 'text.primary',
            lineHeight: 1.4,
            mb: 0.5,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {grant.title}
        </Typography>

        {grant.donor_org_name && (
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
            {grant.donor_org_name}
          </Typography>
        )}

        <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary', mb: 1.5 }}>
          {formatFunding(grant.total_funding, grant.currency)}
        </Typography>

        {/* Sectors */}
        {grant.sectors && grant.sectors.length > 0 && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1.5 }}>
            {grant.sectors.slice(0, 3).map((sector) => (
              <Chip
                key={sector}
                label={sector}
                size="small"
                variant="outlined"
                sx={{
                  height: 22,
                  fontSize: '0.6875rem',
                  borderColor: 'divider',
                  color: 'text.secondary',
                }}
              />
            ))}
            {grant.sectors.length > 3 && (
              <Chip
                label={`+${grant.sectors.length - 3}`}
                size="small"
                sx={{
                  height: 22,
                  fontSize: '0.6875rem',
                  bgcolor: 'action.hover',
                  color: 'text.secondary',
                }}
              />
            )}
          </Box>
        )}
      </CardContent>

      {/* Actions */}
      <CardActions sx={{ px: 2.5, py: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
        <Button
          size="small"
          onClick={(e) => { e.stopPropagation(); onView(); }}
          sx={{ fontSize: '0.75rem' }}
        >
          View details
        </Button>
        {isNgo && grant.status === 'open' && !grant.user_application_status && (
          <Button
            size="small"
            variant="contained"
            onClick={(e) => { e.stopPropagation(); onApply(); }}
            sx={{ ml: 'auto', fontSize: '0.75rem' }}
          >
            Apply
          </Button>
        )}
        {isNgo && grant.user_application_status && (
          <Box sx={{ ml: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <StatusBadge status={grant.user_application_status} />
          </Box>
        )}
      </CardActions>
    </Card>
  );
}
