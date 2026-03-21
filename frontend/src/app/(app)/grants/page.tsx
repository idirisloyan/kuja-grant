'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { useGrants } from '@/lib/hooks/use-api';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Search } from 'lucide-react';
import type { Grant } from '@/lib/types';

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
  if (!dateStr) return { label: 'No deadline', color: 'text-slate-400' };
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return { label: 'Expired', color: 'text-red-600' };
  if (diffDays === 0) return { label: 'Due today', color: 'text-red-600' };
  if (diffDays <= 7) return { label: `${diffDays}d left`, color: 'text-red-600' };
  if (diffDays <= 30) return { label: `${diffDays}d left`, color: 'text-amber-600' };
  return { label: `${diffDays}d left`, color: 'text-slate-500' };
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
// Status dot
// ---------------------------------------------------------------------------

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    open: 'bg-emerald-500',
    draft: 'bg-slate-300',
    review: 'bg-amber-400',
    closed: 'bg-slate-400',
    awarded: 'bg-brand-500',
  };

  const labels: Record<string, string> = {
    open: 'Open',
    draft: 'Draft',
    review: 'Review',
    closed: 'Closed',
    awarded: 'Awarded',
  };

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
      <span className={`w-1.5 h-1.5 rounded-full ${colors[status] ?? 'bg-slate-300'}`} />
      {labels[status] ?? status}
    </span>
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
      <div className="space-y-6 max-w-5xl">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full max-w-lg" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-48 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const sortLabels: Record<SortOption, string> = {
    deadline: 'Deadline',
    funding: 'Funding',
    recent: 'Recent',
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            {isNgo ? 'Browse Grants' : 'My Grants'}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {filteredGrants.length} grant{filteredGrants.length !== 1 ? 's' : ''} found
          </p>
        </div>
        {!isNgo && (
          <Button
            onClick={() => router.push('/grants/new')}
            className="bg-brand-600 hover:bg-brand-700 text-white"
            size="sm"
          >
            Create Grant
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="relative max-w-lg">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          placeholder="Search by title, donor, or keyword..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 h-10 border-slate-200 bg-white"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
          >
            Clear
          </button>
        )}
      </div>

      {/* Filters + Sort */}
      <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
        {SECTOR_OPTIONS.map((sector) => {
          const isActive = activeSectors.has(sector);
          return (
            <button
              key={sector}
              onClick={() => toggleSector(sector)}
              className={`px-2.5 py-1 text-xs rounded transition-colors ${
                isActive
                  ? 'text-brand-600 font-semibold bg-brand-50'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              {sector}
            </button>
          );
        })}
        {activeSectors.size > 0 && (
          <button
            onClick={() => setActiveSectors(new Set())}
            className="px-2.5 py-1 text-xs text-red-500 hover:text-red-600"
          >
            Clear filters
          </button>
        )}
        <span className="mx-2 text-slate-200">|</span>
        {(['deadline', 'funding', 'recent'] as SortOption[]).map((opt) => (
          <button
            key={opt}
            onClick={() => setSortBy(opt)}
            className={`px-2.5 py-1 text-xs rounded transition-colors ${
              sortBy === opt
                ? 'text-slate-900 font-semibold'
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            {sortLabels[opt]}
          </button>
        ))}
      </div>

      {/* Grant Cards */}
      {filteredGrants.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm text-slate-500">No grants found</p>
          {(searchQuery || activeSectors.size > 0) && (
            <p className="text-xs text-slate-400 mt-1">
              Try adjusting your search or clearing filters.
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredGrants.map((grant) => (
            <GrantCard
              key={grant.id}
              grant={grant}
              isNgo={isNgo}
              onView={() => router.push(`/grants/${grant.id}`)}
              onApply={() => router.push(`/apply/${grant.id}`)}
            />
          ))}
        </div>
      )}
    </div>
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
    <div
      className="bg-white rounded-lg border border-slate-200 p-5 hover:border-slate-300 transition-colors cursor-pointer"
      onClick={onView}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <StatusDot status={grant.status} />
        <span className={`text-xs ${deadline.color}`}>{deadline.label}</span>
      </div>

      <h3 className="text-sm font-semibold text-slate-900 leading-snug line-clamp-2 mb-1">
        {grant.title}
      </h3>

      {grant.donor_org_name && (
        <p className="text-sm text-slate-500 mb-3">{grant.donor_org_name}</p>
      )}

      <p className="text-lg font-semibold text-slate-900 mb-3">
        {formatFunding(grant.total_funding, grant.currency)}
      </p>

      {/* Sectors as plain text */}
      {grant.sectors && grant.sectors.length > 0 && (
        <p className="text-xs text-slate-400 mb-3">
          {grant.sectors.join(', ')}
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
        <button
          onClick={(e) => { e.stopPropagation(); onView(); }}
          className="text-xs text-brand-600 hover:text-brand-700 font-medium"
        >
          View details
        </button>
        {isNgo && grant.status === 'open' && !grant.user_application_status && (
          <Button
            size="sm"
            className="ml-auto bg-brand-600 hover:bg-brand-700 text-white text-xs h-8"
            onClick={(e) => { e.stopPropagation(); onApply(); }}
          >
            Apply
          </Button>
        )}
        {isNgo && grant.user_application_status && (
          <div className="ml-auto" onClick={(e) => e.stopPropagation()}>
            <StatusBadge status={grant.user_application_status} />
          </div>
        )}
      </div>
    </div>
  );
}
