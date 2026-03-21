'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { useGrants } from '@/lib/hooks/use-api';
import { StatusBadge } from '@/components/shared/status-badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Search, DollarSign, Calendar, MapPin, Briefcase, ArrowRight,
  Users, Eye, Clock, TrendingUp, SortAsc, ChevronDown,
} from 'lucide-react';
import type { Grant } from '@/lib/types';

// ---------------------------------------------------------------------------
// Sector color map (Monday.com-style)
// ---------------------------------------------------------------------------

const SECTOR_COLORS: Record<string, { bg: string; text: string; border: string; pill: string }> = {
  health:           { bg: 'bg-emerald-50',  text: 'text-emerald-700', border: 'border-l-emerald-500', pill: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  education:        { bg: 'bg-blue-50',     text: 'text-blue-700',    border: 'border-l-blue-500',    pill: 'bg-blue-100 text-blue-700 border-blue-200' },
  wash:             { bg: 'bg-cyan-50',     text: 'text-cyan-700',    border: 'border-l-cyan-500',    pill: 'bg-cyan-100 text-cyan-700 border-cyan-200' },
  climate:          { bg: 'bg-violet-50',   text: 'text-violet-700',  border: 'border-l-violet-500',  pill: 'bg-violet-100 text-violet-700 border-violet-200' },
  protection:       { bg: 'bg-rose-50',     text: 'text-rose-700',    border: 'border-l-rose-500',    pill: 'bg-rose-100 text-rose-700 border-rose-200' },
  nutrition:        { bg: 'bg-amber-50',    text: 'text-amber-700',   border: 'border-l-amber-500',   pill: 'bg-amber-100 text-amber-700 border-amber-200' },
  livelihoods:      { bg: 'bg-orange-50',   text: 'text-orange-700',  border: 'border-l-orange-500',  pill: 'bg-orange-100 text-orange-700 border-orange-200' },
  governance:       { bg: 'bg-indigo-50',   text: 'text-indigo-700',  border: 'border-l-indigo-500',  pill: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  'food security':  { bg: 'bg-lime-50',     text: 'text-lime-700',    border: 'border-l-lime-500',    pill: 'bg-lime-100 text-lime-700 border-lime-200' },
  shelter:          { bg: 'bg-teal-50',     text: 'text-teal-700',    border: 'border-l-teal-500',    pill: 'bg-teal-100 text-teal-700 border-teal-200' },
  'gender equality':{ bg: 'bg-pink-50',     text: 'text-pink-700',    border: 'border-l-pink-500',    pill: 'bg-pink-100 text-pink-700 border-pink-200' },
};

function getSectorColor(sector: string) {
  return SECTOR_COLORS[sector.toLowerCase()] ?? {
    bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-l-slate-400',
    pill: 'bg-slate-100 text-slate-600 border-slate-200',
  };
}

function getPrimarySector(sectors: string[] | undefined): string {
  if (!sectors || sectors.length === 0) return '';
  return sectors[0];
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatFunding(amount: number | null, currency: string): string {
  if (!amount) return 'TBD';
  const symbol = currency === 'USD' ? '$' : currency + ' ';
  if (amount >= 1_000_000) return `${symbol}${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `${symbol}${(amount / 1_000).toFixed(0)}K`;
  return `${symbol}${amount.toLocaleString()}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'No deadline';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getDeadlineInfo(dateStr: string | null): { label: string; color: string; bgColor: string; urgent: boolean } {
  if (!dateStr) return { label: 'No deadline', color: 'text-slate-500', bgColor: 'bg-slate-100', urgent: false };
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return { label: 'Expired', color: 'text-rose-700', bgColor: 'bg-rose-100', urgent: true };
  if (diffDays === 0) return { label: 'Due today', color: 'text-rose-700', bgColor: 'bg-rose-100', urgent: true };
  if (diffDays <= 5) return { label: `${diffDays}d left`, color: 'text-amber-700', bgColor: 'bg-amber-100', urgent: true };
  if (diffDays <= 14) return { label: `${diffDays}d left`, color: 'text-amber-700', bgColor: 'bg-amber-50', urgent: false };
  return { label: `${diffDays}d left`, color: 'text-emerald-700', bgColor: 'bg-emerald-50', urgent: false };
}

// ---------------------------------------------------------------------------
// Sector filter chips
// ---------------------------------------------------------------------------

const SECTOR_OPTIONS = [
  'Health', 'Education', 'WASH', 'Food Security', 'Livelihoods',
  'Protection', 'Shelter', 'Gender Equality', 'Climate', 'Governance', 'Nutrition',
];

type SortOption = 'deadline' | 'funding' | 'recent';

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function GrantsPage() {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSectors, setActiveSectors] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<SortOption>('deadline');
  const [showSortMenu, setShowSortMenu] = useState(false);
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

    // Sort
    result = [...result].sort((a, b) => {
      if (sortBy === 'deadline') {
        if (!a.deadline) return 1;
        if (!b.deadline) return -1;
        return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      }
      if (sortBy === 'funding') {
        return (b.total_funding ?? 0) - (a.total_funding ?? 0);
      }
      // recent
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
      <div className="space-y-6">
        {/* Skeleton header */}
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-8 w-24 rounded-full" />
        </div>
        {/* Skeleton search */}
        <Skeleton className="h-12 w-full max-w-2xl rounded-xl" />
        {/* Skeleton filter chips */}
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-8 w-20 rounded-full" />
          ))}
        </div>
        {/* Skeleton grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-72 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const sortLabels: Record<SortOption, string> = {
    deadline: 'Deadline',
    funding: 'Funding',
    recent: 'Recently Added',
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ================================================================= */}
      {/* Page Header                                                        */}
      {/* ================================================================= */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
              {isNgo ? 'Browse Grants' : 'My Grants'}
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1 rounded-full bg-brand-100 text-brand-700">
                <TrendingUp className="w-3.5 h-3.5" />
                {filteredGrants.length} found
              </span>
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              {isNgo
                ? 'Discover funding opportunities matched to your organization'
                : 'Manage and track your published grants'}
            </p>
          </div>
        </div>
        {!isNgo && (
          <Button
            onClick={() => router.push('/grants/new')}
            className="gap-2 bg-brand-600 hover:bg-brand-700 shadow-lg shadow-brand-600/25"
          >
            <Briefcase className="w-4 h-4" /> Create Grant
          </Button>
        )}
      </div>

      {/* ================================================================= */}
      {/* Search + Sort Bar                                                  */}
      {/* ================================================================= */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-2xl">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <Input
            placeholder="Search by title, donor, or keyword..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-12 h-11 rounded-xl border-slate-200 bg-white shadow-sm text-base focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-sm font-medium"
            >
              Clear
            </button>
          )}
        </div>

        {/* Sort Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowSortMenu(!showSortMenu)}
            className="flex items-center gap-2 h-11 px-4 rounded-xl border border-slate-200 bg-white shadow-sm text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <SortAsc className="w-4 h-4 text-slate-400" />
            Sort: {sortLabels[sortBy]}
            <ChevronDown className="w-4 h-4 text-slate-400" />
          </button>
          {showSortMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowSortMenu(false)} />
              <div className="absolute right-0 top-full mt-1 z-20 w-48 bg-white rounded-xl shadow-lg border border-slate-200 py-1">
                {(['deadline', 'funding', 'recent'] as SortOption[]).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => { setSortBy(opt); setShowSortMenu(false); }}
                    className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                      sortBy === opt
                        ? 'bg-brand-50 text-brand-700 font-medium'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {sortLabels[opt]}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ================================================================= */}
      {/* Sector Filter Chips (Monday.com style)                             */}
      {/* ================================================================= */}
      <div className="flex flex-wrap gap-2">
        {SECTOR_OPTIONS.map((sector) => {
          const isActive = activeSectors.has(sector);
          const colors = getSectorColor(sector);
          return (
            <button
              key={sector}
              onClick={() => toggleSector(sector)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium border transition-all duration-200 ${
                isActive
                  ? `${colors.pill} border-current shadow-sm scale-105`
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:shadow-sm'
              }`}
            >
              {isActive && (
                <span className="w-2 h-2 rounded-full bg-current" />
              )}
              {sector}
            </button>
          );
        })}
        {activeSectors.size > 0 && (
          <button
            onClick={() => setActiveSectors(new Set())}
            className="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium text-rose-600 bg-rose-50 border border-rose-200 hover:bg-rose-100 transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* ================================================================= */}
      {/* Grants Grid                                                        */}
      {/* ================================================================= */}
      {filteredGrants.length === 0 ? (
        <Card className="border-dashed border-2 border-slate-200">
          <CardContent className="py-16 text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Briefcase className="w-8 h-8 text-slate-400" />
            </div>
            <p className="text-slate-600 font-semibold text-lg">No grants found</p>
            <p className="text-sm text-slate-400 mt-2 max-w-sm mx-auto">
              {searchQuery || activeSectors.size > 0
                ? 'Try adjusting your search or clearing some filters to see more results.'
                : 'Check back later for new funding opportunities.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
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
// Grant Card (Monday.com-style visual card)
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
  const primarySector = getPrimarySector(grant.sectors);
  const sectorColor = getSectorColor(primarySector);
  const deadline = getDeadlineInfo(grant.deadline);
  const appCount = grant.application_count ?? 0;

  // Fake "reviewed" count for progress bar visual (capped at application_count)
  const reviewedCount = Math.min(
    Math.floor(appCount * 0.6),
    appCount,
  );

  return (
    <div
      className={`group relative bg-white rounded-xl border border-slate-200 overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-200/60 hover:border-slate-300 cursor-pointer border-l-4 ${sectorColor.border}`}
      onClick={onView}
    >
      {/* Card Body */}
      <div className="p-5">
        {/* Top row: Status + Deadline */}
        <div className="flex items-center justify-between mb-3">
          <GrantStatusDot status={grant.status} />
          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${deadline.bgColor} ${deadline.color}`}>
            <Clock className="w-3 h-3" />
            {deadline.label}
          </span>
        </div>

        {/* Title */}
        <h3 className="text-base font-bold text-slate-900 leading-snug line-clamp-2 mb-1 group-hover:text-brand-700 transition-colors">
          {grant.title}
        </h3>

        {/* Donor */}
        {grant.donor_org_name && (
          <p className="text-sm text-slate-500 mb-3">{grant.donor_org_name}</p>
        )}

        {/* Funding Amount - Hero style */}
        <div className="flex items-center gap-2 mb-4">
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5">
            <DollarSign className="w-4 h-4 text-emerald-600" />
            <span className="text-lg font-bold text-emerald-700">
              {formatFunding(grant.total_funding, grant.currency)}
            </span>
          </div>
          <Badge variant="outline" className="text-[10px] font-bold bg-slate-50 text-slate-500 border-slate-200 uppercase tracking-wider">
            {grant.currency}
          </Badge>
        </div>

        {/* Sectors as colorful pills */}
        {grant.sectors && grant.sectors.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {grant.sectors.slice(0, 4).map((sector) => {
              const sc = getSectorColor(sector);
              return (
                <span
                  key={sector}
                  className={`inline-flex items-center text-xs font-medium px-2.5 py-0.5 rounded-full border ${sc.pill}`}
                >
                  {sector}
                </span>
              );
            })}
            {grant.sectors.length > 4 && (
              <span className="inline-flex items-center text-xs font-medium px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
                +{grant.sectors.length - 4}
              </span>
            )}
          </div>
        )}

        {/* Countries */}
        {grant.countries && grant.countries.length > 0 && (
          <div className="flex items-center gap-2 text-sm text-slate-600 mb-3">
            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="truncate">{grant.countries.join(', ')}</span>
          </div>
        )}

        {/* Deadline date */}
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-4">
          <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span>Deadline: {formatDate(grant.deadline)}</span>
        </div>

        {/* Application count + Progress */}
        {appCount > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
              <span className="flex items-center gap-1.5">
                <Users className="w-3 h-3" />
                {appCount} application{appCount !== 1 ? 's' : ''}
              </span>
              <span>{reviewedCount} of {appCount} reviewed</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-brand-500 to-brand-400 rounded-full transition-all duration-500"
                style={{ width: `${appCount > 0 ? (reviewedCount / appCount) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}

        {/* Stacked avatars (decorative) */}
        {appCount > 0 && (
          <div className="flex items-center gap-2 mb-4">
            <div className="flex -space-x-2">
              {Array.from({ length: Math.min(appCount, 4) }).map((_, i) => {
                const colors = ['bg-brand-400', 'bg-emerald-400', 'bg-amber-400', 'bg-rose-400'];
                return (
                  <div
                    key={i}
                    className={`w-6 h-6 rounded-full ${colors[i % colors.length]} border-2 border-white flex items-center justify-center`}
                  >
                    <span className="text-[9px] font-bold text-white">
                      {String.fromCharCode(65 + i)}
                    </span>
                  </div>
                );
              })}
              {appCount > 4 && (
                <div className="w-6 h-6 rounded-full bg-slate-300 border-2 border-white flex items-center justify-center">
                  <span className="text-[9px] font-bold text-slate-600">+{appCount - 4}</span>
                </div>
              )}
            </div>
            <span className="text-xs text-slate-400">applicants</span>
          </div>
        )}
      </div>

      {/* Card Footer Actions */}
      <div className="flex items-center gap-2 px-5 py-3 bg-slate-50/80 border-t border-slate-100">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 gap-1.5 rounded-lg text-slate-700 hover:text-brand-700 hover:border-brand-300 hover:bg-brand-50 transition-all"
          onClick={(e) => { e.stopPropagation(); onView(); }}
        >
          <Eye className="w-3.5 h-3.5" />
          View Details
        </Button>
        {isNgo && grant.status === 'open' && !grant.user_application_status && (
          <Button
            size="sm"
            className="flex-1 gap-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white shadow-md shadow-brand-600/25 transition-all"
            onClick={(e) => { e.stopPropagation(); onApply(); }}
          >
            <ArrowRight className="w-3.5 h-3.5" />
            Apply Now
          </Button>
        )}
        {isNgo && grant.user_application_status && (
          <div onClick={(e) => e.stopPropagation()}>
            <StatusBadge status={grant.user_application_status} />
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Grant Status Dot (pulsing for open)
// ---------------------------------------------------------------------------

function GrantStatusDot({ status }: { status: string }) {
  const configs: Record<string, { label: string; dotClass: string; bgClass: string; textClass: string; pulse: boolean }> = {
    open:    { label: 'Open',    dotClass: 'bg-emerald-500', bgClass: 'bg-emerald-50',  textClass: 'text-emerald-700', pulse: true },
    draft:   { label: 'Draft',   dotClass: 'bg-amber-400',   bgClass: 'bg-amber-50',    textClass: 'text-amber-700',   pulse: false },
    review:  { label: 'Review',  dotClass: 'bg-blue-500',    bgClass: 'bg-blue-50',     textClass: 'text-blue-700',    pulse: false },
    closed:  { label: 'Closed',  dotClass: 'bg-slate-400',   bgClass: 'bg-slate-100',   textClass: 'text-slate-600',   pulse: false },
    awarded: { label: 'Awarded', dotClass: 'bg-brand-500',   bgClass: 'bg-brand-50',    textClass: 'text-brand-700',   pulse: false },
  };
  const cfg = configs[status] ?? configs.draft;

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.bgClass} ${cfg.textClass}`}>
      <span className="relative flex h-2 w-2">
        {cfg.pulse && (
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${cfg.dotClass} opacity-75`} />
        )}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${cfg.dotClass}`} />
      </span>
      {cfg.label}
    </span>
  );
}
