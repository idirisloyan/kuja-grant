'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { useGrants } from '@/lib/hooks/use-api';
import { StatusBadge } from '@/components/shared/status-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Search, DollarSign, Calendar, MapPin, Briefcase, ArrowRight, Filter,
} from 'lucide-react';
import type { Grant } from '@/lib/types';

function formatFunding(amount: number | null, currency: string): string {
  if (!amount) return 'TBD';
  if (amount >= 1_000_000) return `${currency === 'USD' ? '$' : currency}${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `${currency === 'USD' ? '$' : currency}${(amount / 1_000).toFixed(0)}K`;
  return `${currency === 'USD' ? '$' : currency}${amount.toLocaleString()}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'No deadline';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function isDeadlineSoon(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  return diff > 0 && diff < 7 * 24 * 60 * 60 * 1000;
}

const SECTOR_OPTIONS = [
  'All Sectors',
  'Health',
  'Education',
  'WASH',
  'Food Security',
  'Livelihoods',
  'Protection',
  'Shelter',
  'Gender Equality',
  'Climate',
  'Governance',
];

export default function GrantsPage() {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [sectorFilter, setSectorFilter] = useState('All Sectors');
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

    if (sectorFilter !== 'All Sectors') {
      result = result.filter((g) =>
        g.sectors?.some((s) => s.toLowerCase().includes(sectorFilter.toLowerCase())),
      );
    }

    return result;
  }, [grants, searchQuery, sectorFilter]);

  const isNgo = user?.role === 'ngo';

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="flex gap-3">
          <Skeleton className="h-10 flex-1 max-w-md" />
          <Skeleton className="h-10 w-40" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {isNgo ? 'Browse Grants' : 'My Grants'}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {isNgo
              ? `${filteredGrants.length} grants available`
              : `${filteredGrants.length} grants`}
          </p>
        </div>
        {!isNgo && (
          <Button
            onClick={() => router.push('/grants/new')}
            className="gap-2 bg-brand-600 hover:bg-brand-700"
          >
            <Briefcase className="w-4 h-4" /> Create Grant
          </Button>
        )}
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search grants..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none z-10" />
          <select
            value={sectorFilter}
            onChange={(e) => setSectorFilter(e.target.value)}
            className="h-9 pl-9 pr-8 rounded-lg border border-input bg-transparent text-sm appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {SECTOR_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Grants Grid */}
      {filteredGrants.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Briefcase className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No grants found</p>
            <p className="text-sm text-slate-400 mt-1">
              {searchQuery || sectorFilter !== 'All Sectors'
                ? 'Try adjusting your search or filters'
                : 'Check back later for new opportunities'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
  return (
    <Card className="hover:shadow-md transition-shadow flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base font-semibold text-slate-900 line-clamp-2 leading-snug">
            {grant.title}
          </CardTitle>
          <StatusBadge status={grant.status} />
        </div>
        {grant.donor_org_name && (
          <p className="text-sm text-slate-500 mt-1">{grant.donor_org_name}</p>
        )}
      </CardHeader>
      <CardContent className="flex-1 flex flex-col">
        <div className="space-y-2.5 flex-1">
          {/* Funding */}
          <div className="flex items-center gap-2 text-sm">
            <DollarSign className="w-4 h-4 text-emerald-500 shrink-0" />
            <span className="font-semibold text-slate-900">
              {formatFunding(grant.total_funding, grant.currency)}
            </span>
          </div>

          {/* Deadline */}
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
            <span className={isDeadlineSoon(grant.deadline) ? 'text-amber-600 font-medium' : 'text-slate-600'}>
              {formatDate(grant.deadline)}
              {isDeadlineSoon(grant.deadline) && ' (Closing soon)'}
            </span>
          </div>

          {/* Countries */}
          {grant.countries && grant.countries.length > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
              <span className="text-slate-600 truncate">
                {grant.countries.join(', ')}
              </span>
            </div>
          )}

          {/* Sectors */}
          {grant.sectors && grant.sectors.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {grant.sectors.slice(0, 3).map((sector) => (
                <Badge key={sector} variant="outline" className="text-xs bg-slate-50 text-slate-600 border-slate-200">
                  {sector}
                </Badge>
              ))}
              {grant.sectors.length > 3 && (
                <Badge variant="outline" className="text-xs bg-slate-50 text-slate-500 border-slate-200">
                  +{grant.sectors.length - 3}
                </Badge>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 mt-4 pt-3 border-t border-slate-100">
          <Button variant="outline" size="sm" className="flex-1 gap-1" onClick={onView}>
            View Details <ArrowRight className="w-3 h-3" />
          </Button>
          {isNgo && grant.status === 'open' && !grant.user_application_status && (
            <Button size="sm" className="flex-1 bg-brand-600 hover:bg-brand-700" onClick={onApply}>
              Apply
            </Button>
          )}
          {isNgo && grant.user_application_status && (
            <StatusBadge status={grant.user_application_status} className="self-center" />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
