'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Search, Building2, Eye, ShieldCheck, MapPin, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Organization } from '@/lib/types';

export default function OrgSearchPage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Organization[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setSearching(true);
    setHasSearched(true);
    try {
      const res = await api.get<{ organizations: Organization[] }>(
        `/organizations/?search=${encodeURIComponent(query.trim())}`,
      );
      setResults(res.organizations ?? []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [query]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="kuja-display text-3xl">Organization search</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Find organizations in the Kuja Grant system
        </p>
      </div>

      {/* Search bar */}
      <div className="flex gap-2 max-w-xl">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search by name, country, or type…"
            className="w-full h-10 pl-9 pr-3 text-sm rounded-md border border-input bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--kuja-clay))]"
          />
        </div>
        <button
          type="button"
          onClick={handleSearch}
          disabled={searching || !query.trim()}
          className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--kuja-clay))] hover:bg-[hsl(var(--kuja-clay-dark))] text-white text-sm font-medium px-4 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Search
        </button>
      </div>

      {/* Results */}
      {searching && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="kuja-shimmer h-16 rounded-xl" />)}
        </div>
      )}

      {!searching && hasSearched && results.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-background px-6 py-14 text-center">
          <Building2 className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
          <p className="kuja-display text-xl">No organizations found</p>
          <p className="text-sm text-muted-foreground mt-1">Try a different search term.</p>
        </div>
      )}

      {!searching && results.length > 0 && (
        <div className="rounded-xl border border-border bg-background overflow-hidden">
          <div className="px-4 py-2 border-b border-border bg-muted/20 text-sm text-muted-foreground">
            {results.length} result{results.length !== 1 ? 's' : ''} found
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/30 border-b border-border text-left">
                  <th className="px-4 py-3 font-medium text-muted-foreground">Organization</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Type</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Country</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Verified</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground text-right">Assessment</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {results.map((org) => (
                  <tr key={org.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span className="font-medium text-foreground">{org.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full border border-border text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-0.5">
                        {org.org_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {org.country ? (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {org.country}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {org.verified ? (
                        <span className="inline-flex items-center gap-1 text-[hsl(var(--kuja-grow))] text-xs font-medium">
                          <ShieldCheck className="h-4 w-4" /> Verified
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Not verified</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {org.assess_score != null ? (
                        <span className={cn(
                          'kuja-numeric font-semibold',
                          org.assess_score >= 80 ? 'text-[hsl(var(--kuja-grow))]' :
                          org.assess_score >= 60 ? 'text-[hsl(var(--kuja-sun))]' : 'text-[hsl(var(--kuja-flag))]',
                        )}>
                          {org.assess_score}%
                        </span>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => router.push(`/organizations/profile?id=${org.id}`)}
                        className="inline-flex items-center gap-1.5 rounded border border-border hover:border-[hsl(var(--kuja-clay))] text-xs font-medium px-2.5 py-1"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!hasSearched && (
        <div className="rounded-xl border border-dashed border-border bg-background px-6 py-14 text-center">
          <Search className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
          <p className="kuja-display text-xl">Search for organizations</p>
          <p className="text-sm text-muted-foreground mt-1">
            Enter a name, country, or type to get started.
          </p>
        </div>
      )}
    </div>
  );
}
